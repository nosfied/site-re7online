import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = path.resolve(process.cwd());
const flags = { enabled: true, automationEnabled: true, runtimeEnabled: true, inboundPersistenceEnabled: true, outboundEnabled: true, aiEnabled: false, handoffEnabled: true, status: "connected", tokenStatus: "configured" };
function run(script: string, args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { cwd: root, env: process.env }); let stdout = ""; let stderr = "";
    child.stdout.on("data", (value) => { stdout += value; }); child.stderr.on("data", (value) => { stderr += value; }); child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
async function sources(source: unknown, planTenants: Record<string, unknown>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "channel-account-plan-")); const file = path.join(dir, "tenants.json"); const sourceBytes = Buffer.from(JSON.stringify(source)); const sha = crypto.createHash("sha256").update(sourceBytes).digest("hex"); const planFile = path.join(dir, "channel-account-plan.json"); const planBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, sourceSha256: sha, tenants: planTenants })); const planSha = crypto.createHash("sha256").update(planBytes).digest("hex"); await fs.writeFile(file, sourceBytes, { mode: 0o600 }); await fs.writeFile(planFile, planBytes, { mode: 0o600 }); return { dir, file, sha, sourceBytes, planFile, planSha };
}

test("selected Tendencia, Justa and CRA share one atomic batch while omitted tenants preserve the full-batch contract", async () => {
  const nonce = crypto.randomUUID().slice(0, 8);
  const tendencia = "tendencia-modas"; const justa = "justa-advocacia"; const cra = "cra-pr"; const omitted = `omitted-meta-${nonce}`; const web = `web-${nonce}`;
  const clients = await Promise.all([tendencia, justa, cra, omitted, web].map((clientKey) => prisma.client.create({ data: { clientKey, name: clientKey } })));
  const [tendenciaClient, justaClient, craClient, omittedClient, webClient] = clients;
  const identities = new Map([
    [tendencia, `phone-tendencia-${nonce}`],
    [justa, `phone-justa-${nonce}`],
    [cra, `phone-cra-${nonce}`],
    [omitted, `phone-omitted-${nonce}`],
  ]);
  await Promise.all([...identities].map(([key, phoneNumberId]) => prisma.waPhoneNumber.create({ data: { clientId: clients.find((client) => client.clientKey === key)!.id, phoneNumberId } })));
  const unrelated = await prisma.channelAccount.create({ data: { clientId: justaClient.id, channel: "messenger", provider: "meta", channelAccountId: `page-${nonce}`, enabled: true, automationEnabled: false, runtimeEnabled: false, inboundPersistenceEnabled: true, outboundEnabled: false, aiEnabled: false, handoffEnabled: false, status: "connected", tokenStatus: "configured" } });
  await prisma.channelAccountAlias.create({ data: { channelAccountId: unrelated.id, alias: `unrelated-${nonce}`, aliasType: "externalAccountId" } });
  const sourceTenant = (key: string, phone: string) => ({ id: key, name: key, metaPhoneNumberId: phone, allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" });
  const planned = (key: string, phone: string, aliases: string[], provenance = "HISTORICAL_SOURCE") => ({ provenance, channelAccounts: [{ id: `account-${key}`, tenantKey: key, channel: "whatsapp", provider: "meta", channelAccountId: phone, externalAccountIds: aliases, ...flags }] });
  let current: Awaited<ReturnType<typeof sources>> | undefined;
  try {
    current = await sources({
      [tendencia]: sourceTenant(tendencia, identities.get(tendencia)!),
      [justa]: sourceTenant(justa, identities.get(justa)!),
      [omitted]: sourceTenant(omitted, identities.get(omitted)!),
      [web]: sourceTenant(web, ""),
    }, {
      [tendencia]: planned(tendencia, identities.get(tendencia)!, [`alias-tendencia-${nonce}`]),
      [justa]: planned(justa, identities.get(justa)!, [`alias-justa-${nonce}`]),
      [cra]: planned(cra, identities.get(cra)!, [`alias-cra-${nonce}`], "OWNER_AUTHORIZED_DB_IDENTITY"),
    });
    const baseArgs = ["--source", current.file, "--expected-source-sha256", current.sha, "--plan", current.planFile, "--expected-plan-sha256", current.planSha, "--json"];
    const selectedArgs = [...baseArgs, "--tenant", tendencia, "--tenant", justa, "--tenant", cra];
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "reject_third_${nonce}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."channelAccountId" = 'phone-tendencia-${nonce}' THEN RAISE EXCEPTION 'controlled third tenant failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "reject_third_${nonce}" BEFORE INSERT ON "ChannelAccount" FOR EACH ROW EXECUTE FUNCTION "reject_third_${nonce}"()`);
    const failed = await run("scripts/channel-accounts-backfill.ts", selectedArgs); assert.notEqual(failed.code, 0);
    assert.equal(await prisma.channelAccount.count({ where: { clientId: { in: [craClient.id, justaClient.id, tendenciaClient.id] }, channel: "whatsapp", provider: "meta" } }), 0);
    assert.equal(await prisma.channelAccountAlias.count({ where: { channelAccountId: unrelated.id, alias: `unrelated-${nonce}` } }), 1);
    await prisma.$executeRawUnsafe(`DROP TRIGGER "reject_third_${nonce}" ON "ChannelAccount"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION "reject_third_${nonce}"()`);
    const fullBatch = await run("scripts/channel-accounts-backfill.ts", baseArgs); assert.notEqual(fullBatch.code, 0); assert.match(fullBatch.stderr, new RegExp(`CHANNEL_ACCOUNT_PLAN_INCOMPLETE:${omitted}`));
    const first = await run("scripts/channel-accounts-backfill.ts", selectedArgs); assert.equal(first.code, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout); assert.deepEqual(firstReport.selectedTenants, [cra, justa, tendencia]); assert.equal(firstReport.metaTenantCount, 3);
    const before = await prisma.channelAccount.findMany({ where: { clientId: { in: [craClient.id, justaClient.id, tendenciaClient.id] }, channel: "whatsapp", provider: "meta" }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }); assert.equal(before.length, 3);
    const repeated = await run("scripts/channel-accounts-backfill.ts", selectedArgs); assert.equal(repeated.code, 0, repeated.stderr);
    const after = await prisma.channelAccount.findMany({ where: { clientId: { in: [craClient.id, justaClient.id, tendenciaClient.id] }, channel: "whatsapp", provider: "meta" }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }); assert.deepEqual(after, before);
    assert.equal(await prisma.channelAccount.count({ where: { clientId: { in: [omittedClient.id, webClient.id] }, channel: "whatsapp", provider: "meta" } }), 0);
    const shadow = await run("scripts/channel-accounts-shadow-compare.ts", selectedArgs); assert.equal(shadow.code, 0, shadow.stderr); const shadowReport = JSON.parse(shadow.stdout); assert.deepEqual(shadowReport.selectedTenants, [cra, justa, tendencia]); assert.equal(shadowReport.metaTenants, 3); assert.equal(shadow.stdout.includes(`phone-tendencia-${nonce}`), false);
    const firstAccount = await prisma.channelAccount.findFirstOrThrow({ where: { clientId: justaClient.id, channel: "whatsapp", provider: "meta" } });
    const excess = await prisma.channelAccountAlias.create({ data: { channelAccountId: firstAccount.id, alias: `excess-${nonce}`, aliasType: "externalAccountId" } });
    const shadowDenied = await run("scripts/channel-accounts-shadow-compare.ts", selectedArgs); assert.notEqual(shadowDenied.code, 0); assert.match(shadowDenied.stdout, /alias_excess/);
    const backfillDenied = await run("scripts/channel-accounts-backfill.ts", selectedArgs); assert.notEqual(backfillDenied.code, 0); assert.match(backfillDenied.stderr, /CHANNEL_ACCOUNT_ALIAS_DIVERGENCE/);
    await prisma.channelAccountAlias.delete({ where: { id: excess.id } });
    assert.deepEqual(await fs.readFile(current.file), current.sourceBytes);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "reject_third_${nonce}" ON "ChannelAccount"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "reject_third_${nonce}"()`);
    if (current) await fs.rm(current.dir, { recursive: true, force: true });
    await prisma.waPhoneNumber.deleteMany({ where: { clientId: { in: clients.map((item) => item.id) } } });
    await prisma.client.deleteMany({ where: { id: { in: clients.map((item) => item.id) } } });
    await prisma.$disconnect();
  }
});
