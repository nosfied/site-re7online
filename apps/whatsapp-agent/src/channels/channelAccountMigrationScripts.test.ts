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

test("atomic batch rolls back tenant one when tenant two fails and remains idempotent after correction", async () => {
  const nonce = crypto.randomUUID().slice(0, 8); const one = `meta-one-${nonce}`; const two = `meta-two-${nonce}`; const web = `web-${nonce}`;
  const clients = await Promise.all([one, two, web].map((clientKey) => prisma.client.create({ data: { clientKey, name: clientKey } })));
  const [c1, c2, c3] = clients; await Promise.all([prisma.waPhoneNumber.create({ data: { clientId: c1.id, phoneNumberId: `phone-one-${nonce}` } }), prisma.waPhoneNumber.create({ data: { clientId: c2.id, phoneNumberId: `phone-two-${nonce}` } })]);
  const unrelated = await prisma.channelAccount.create({ data: { clientId: c1.id, channel: "messenger", provider: "meta", channelAccountId: `page-${nonce}`, enabled: true, automationEnabled: false, runtimeEnabled: false, inboundPersistenceEnabled: true, outboundEnabled: false, aiEnabled: false, handoffEnabled: false, status: "connected", tokenStatus: "configured" } });
  await prisma.channelAccountAlias.create({ data: { channelAccountId: unrelated.id, alias: `unrelated-${nonce}`, aliasType: "externalAccountId" } });
  const sourceTenant = (key: string, phone: string) => ({ id: key, name: key, metaPhoneNumberId: phone, allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" });
  const planned = (key: string, phone: string, aliases: string[]) => ({ provenance: "HISTORICAL_SOURCE", channelAccounts: [{ id: `account-${key}`, tenantKey: key, channel: "whatsapp", provider: "meta", channelAccountId: phone, externalAccountIds: aliases, ...flags }] });
  let current: Awaited<ReturnType<typeof sources>> | undefined;
  try {
    current = await sources({ [one]: sourceTenant(one, `phone-one-${nonce}`), [two]: sourceTenant(two, `phone-two-${nonce}`), [web]: sourceTenant(web, "") }, { [one]: planned(one, `phone-one-${nonce}`, [`alias-one-${nonce}`]), [two]: planned(two, `phone-two-${nonce}`, [`alias-two-${nonce}`]) });
    const args = ["--source", current.file, "--expected-source-sha256", current.sha, "--plan", current.planFile, "--expected-plan-sha256", current.planSha, "--json"];
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "reject_second_${nonce}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."channelAccountId" = 'phone-two-${nonce}' THEN RAISE EXCEPTION 'controlled second tenant failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "reject_second_${nonce}" BEFORE INSERT ON "ChannelAccount" FOR EACH ROW EXECUTE FUNCTION "reject_second_${nonce}"()`);
    const failed = await run("scripts/channel-accounts-backfill.ts", args); assert.notEqual(failed.code, 0);
    assert.equal(await prisma.channelAccount.count({ where: { clientId: { in: [c1.id, c2.id] }, channel: "whatsapp", provider: "meta" } }), 0);
    assert.equal(await prisma.channelAccountAlias.count({ where: { channelAccountId: unrelated.id, alias: `unrelated-${nonce}` } }), 1);
    await prisma.$executeRawUnsafe(`DROP TRIGGER "reject_second_${nonce}" ON "ChannelAccount"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION "reject_second_${nonce}"()`);
    const first = await run("scripts/channel-accounts-backfill.ts", args); assert.equal(first.code, 0, first.stderr);
    const before = await prisma.channelAccount.findMany({ where: { clientId: { in: [c1.id, c2.id] }, channel: "whatsapp", provider: "meta" }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }); assert.equal(before.length, 2);
    const repeated = await run("scripts/channel-accounts-backfill.ts", args); assert.equal(repeated.code, 0, repeated.stderr);
    const after = await prisma.channelAccount.findMany({ where: { clientId: { in: [c1.id, c2.id] }, channel: "whatsapp", provider: "meta" }, select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }); assert.deepEqual(after, before);
    assert.equal(await prisma.channelAccount.count({ where: { clientId: c3.id, channel: "whatsapp", provider: "meta" } }), 0);
    const shadow = await run("scripts/channel-accounts-shadow-compare.ts", args); assert.equal(shadow.code, 0, shadow.stderr); assert.equal(shadow.stdout.includes(`phone-one-${nonce}`), false);
    const firstAccount = await prisma.channelAccount.findFirstOrThrow({ where: { clientId: c1.id, channel: "whatsapp", provider: "meta" } });
    const excess = await prisma.channelAccountAlias.create({ data: { channelAccountId: firstAccount.id, alias: `excess-${nonce}`, aliasType: "externalAccountId" } });
    const shadowDenied = await run("scripts/channel-accounts-shadow-compare.ts", args); assert.notEqual(shadowDenied.code, 0); assert.match(shadowDenied.stdout, /alias_excess/);
    const backfillDenied = await run("scripts/channel-accounts-backfill.ts", args); assert.notEqual(backfillDenied.code, 0); assert.match(backfillDenied.stderr, /CHANNEL_ACCOUNT_ALIAS_DIVERGENCE/);
    await prisma.channelAccountAlias.delete({ where: { id: excess.id } });
    assert.deepEqual(await fs.readFile(current.file), current.sourceBytes);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "reject_second_${nonce}" ON "ChannelAccount"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "reject_second_${nonce}"()`);
    if (current) await fs.rm(current.dir, { recursive: true, force: true });
    await prisma.waPhoneNumber.deleteMany({ where: { clientId: { in: clients.map((item) => item.id) } } });
    await prisma.client.deleteMany({ where: { id: { in: clients.map((item) => item.id) } } });
    await prisma.$disconnect();
  }
});
