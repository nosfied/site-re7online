import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { withLockedTenantOperationalConfig } from "./tenantOperationalConfigStore.js";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
assert(["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.pathname.startsWith("/re7_config_persistence"), "isolated synthetic DB required");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prisma = new PrismaClient();
const observer = new PrismaClient();
const flag = "allowAgentOwnClosedConversations"; // Sentinel only; SECULT is not implemented.
const ids: string[] = [];
const temporaryDirectories: string[] = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { resolve, promise };
}
function runScript(cwd: string, script: string, args: string[]) {
  // Empty environment and temporary cwd prevent loading private .env or tenants.
  const child = spawn(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, "scripts", script), ...args], {
    cwd,
    env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, DATABASE_URL: url.toString(), NODE_ENV: "test", ENV: "test", ALLOW_TENANTS_JSON_WRITE: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  return new Promise<string>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve(output) : reject(new Error(`synthetic script ${script} failed (${code}): ${output}`)));
  });
}
async function waitForBlockedProcess() {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const rows = await observer.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%TenantOperationalConfig%'`;
    if (Number(rows[0].n) > 0) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error("script did not reach config lock");
}
async function counts(clientId: string) {
  return Promise.all([prisma.client.count({where:{id:clientId}}), prisma.department.count({where:{clientId}}), prisma.queue.count({where:{clientId}}), prisma.lead.count({where:{tenantId:clientId}}), prisma.template.count({where:{clientId}})]);
}
test.after(async () => {
  await prisma.department.updateMany({ where: { clientId: { in: ids } }, data: { operationalQueueId: null } });
  await prisma.lead.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.template.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.waPhoneNumber.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.tenantMetaConfig.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await Promise.all([prisma.$disconnect(), observer.$disconnect()]);
  // Only temporary directories created by this test, containing synthetic files.
  await Promise.all(temporaryDirectories.map(dir => rm(dir, { recursive: true, force: true })));
});

const cases = [
  { script: "backfill-tenant-operational-config.ts", key: "config-script-backfill", apply: ["--tenant", "config-script-backfill", "--json"], dry: ["--tenant", "config-script-backfill", "--dry-run", "--json"] },
  { script: "load-test-tenant-bootstrap.ts", key: "config-script-load", apply: ["bootstrap", "--tenant", "config-script-load", "--execute", "--json"], dry: ["bootstrap", "--tenant", "config-script-load", "--json"] },
  { script: "provision-demo-tenant.ts", key: "demo-converta", apply: ["--apply"], dry: [] },
];
for (const item of cases) {
  test(`${item.script}: independent process waits, preserves revocation/current fields, dry-run does not write`, async () => {
    assert.equal(await prisma.client.count({ where: { clientKey: item.key } }), 0, "reserved synthetic fixture must be absent");
    const client = await prisma.client.create({ data: { clientKey: item.key, name: "Synthetic script" } });
    ids.push(client.id);
    if (item.script === "backfill-tenant-operational-config.ts") {
      await prisma.waPhoneNumber.create({
        data: { clientId: client.id, phoneNumberId: "synthetic", display: "synthetic" },
      });
      await prisma.channelAccount.create({
        data: {
          clientId: client.id,
          channel: "whatsapp",
          provider: "meta",
          channelAccountId: "synthetic",
          enabled: true,
          runtimeEnabled: true,
          inboundPersistenceEnabled: true,
          status: "connected",
        },
      });
    }
    await prisma.tenantOperationalConfig.create({ data: { clientId: client.id, config: { [flag]: true } } });
    const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-scripts-"));
    temporaryDirectories.push(cwd);
    await mkdir(path.join(cwd, ".data"));
    const tenantsPath = path.join(cwd, ".data/tenants.json");
    const tenantsBytes = JSON.stringify({ [item.key]: { id: item.key, name: "Synthetic", metaPhoneNumberId: "synthetic", allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" } });
    await writeFile(tenantsPath, tenantsBytes, { mode: 0o600 });
    const sourceArgs = item.script === "backfill-tenant-operational-config.ts"
      ? ["--source", tenantsPath, "--expected-source-sha256", crypto.createHash("sha256").update(tenantsBytes).digest("hex")]
      : [];
    const entered = deferred(), release = deferred();
    const held = prisma.$transaction(tx => withLockedTenantOperationalConfig(tx, client.id, async locked => {
      await locked.tenantOperationalConfig.update({ where: { clientId: client.id }, data: { config: { [flag]: false, independent: { values: [null, false, "kept"] } } } });
      entered.resolve();
      await release.promise;
    }), { timeout: 15000 });
    await entered.promise;
    const script = runScript(cwd, item.script, [...item.apply, ...sourceArgs]);
    // Attach a rejection handler immediately; finally still propagates its error.
    script.catch(() => undefined);
    try { await waitForBlockedProcess(); } finally { release.resolve(); await held; await script; }
    const after = await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } });
    const config = after.config as Record<string, unknown>;
    assert.equal(config[flag], false);
    assert.deepEqual(config.independent, { values: [null, false, "kept"] });
    const beforeCounts = await counts(client.id);
    if (item.script === "backfill-tenant-operational-config.ts") {
      const repeatedOutput = await runScript(cwd, item.script, [...item.apply, ...sourceArgs]);
      const report = JSON.parse(repeatedOutput);
      assert.equal(report.source, tenantsPath);
      assert.equal(report.sourceSha256, crypto.createHash("sha256").update(tenantsBytes).digest("hex"));
      assert.equal(report.unchanged, 1);
      assert(report.items[0].fieldsChanged.length === 0);
      assert(Object.values(report.deltaCounts).every((count) => count === 0));
      assert.deepEqual(await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }), after);
    }
    await runScript(cwd, item.script, [...item.dry, ...sourceArgs]);
    assert.deepEqual(await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }), after);
    assert.deepEqual(await counts(client.id), beforeCounts);
  });
}

test("create-only provisioning preserves config; concurrent empty upsert may reject P2002 without overwriting", async () => {
  const client = await prisma.client.create({ data: { clientKey: `config-create-only-${Date.now()}`, name: "Synthetic" } });
  ids.push(client.id);
  const attempts = await Promise.allSettled(Array.from({ length: 3 }, () => prisma.tenantOperationalConfig.upsert({ where: { clientId: client.id }, create: { clientId: client.id, config: {} }, update: {} })));
  assert(attempts.some(result => result.status === "fulfilled"));
  // Existing Prisma create-only behavior: a loser can receive P2002. This is
  // not an overwrite and is not silently retried/changed by this prerequisite.
  for (const result of attempts) if (result.status === "rejected") assert.equal(result.reason.code, "P2002");
  await prisma.tenantOperationalConfig.update({ where: { clientId: client.id }, data: { config: { [flag]: false, independent: [] } } });
  const before = await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } });
  await prisma.tenantOperationalConfig.upsert({ where: { clientId: client.id }, create: { clientId: client.id, config: {} }, update: {} });
  assert.deepEqual(await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }), before);
  assert.equal(await prisma.tenantOperationalConfig.count({ where: { clientId: client.id } }), 1);
});

test("backfill denies a source tenant without Client before any write", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-missing-client-"));
  temporaryDirectories.push(cwd);
  const source = path.join(cwd, "tenants.json");
  const tenantKey = `missing-client-${Date.now()}`;
  const bytes = JSON.stringify({
    [tenantKey]: {
      id: tenantKey,
      name: "Synthetic missing client",
      metaPhoneNumberId: "missing",
      allowlist: [],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
    },
  });
  await writeFile(source, bytes, { mode: 0o600 });
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(
    runScript(cwd, "backfill-tenant-operational-config.ts", [
      "--source", source,
      "--expected-source-sha256", sha256,
      "--json",
    ]),
    /source_tenant_missing_client/
  );
  assert.equal(await prisma.client.count({ where: { clientKey: tenantKey } }), 0);
});

test("backfill dry-run denies missing phone mapping and ChannelAccount before any write", async () => {
  for (const missing of ["phone", "channel"] as const) {
    const suffix = `${missing}-${Date.now()}`;
    const client = await prisma.client.create({
      data: { clientKey: `backfill-missing-${suffix}`, name: "Synthetic preflight" },
    });
    ids.push(client.id);
    await prisma.tenantOperationalConfig.create({
      data: { clientId: client.id, config: { sentinel: { unchanged: true } } },
    });
    const phoneNumberId = `synthetic-${suffix}`;
    if (missing !== "phone") {
      await prisma.waPhoneNumber.create({ data: { clientId: client.id, phoneNumberId } });
    }
    if (missing !== "channel") {
      await prisma.channelAccount.create({
        data: {
          clientId: client.id,
          channel: "whatsapp",
          provider: "meta",
          channelAccountId: phoneNumberId,
        },
      });
    }
    const before = await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } });
    const cwd = await mkdtemp(path.join(os.tmpdir(), `re7-config-missing-${missing}-`));
    temporaryDirectories.push(cwd);
    const source = path.join(cwd, "tenants.json");
    const bytes = JSON.stringify({
      [client.clientKey]: {
        id: client.clientKey,
        name: "Synthetic",
        metaPhoneNumberId: phoneNumberId,
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
      },
    });
    await writeFile(source, bytes, { mode: 0o600 });
    await assert.rejects(
      runScript(cwd, "backfill-tenant-operational-config.ts", [
        "--source", source,
        "--expected-source-sha256", crypto.createHash("sha256").update(bytes).digest("hex"),
        "--dry-run",
        "--json",
      ]),
      missing === "phone" ? /source_tenant_missing_phone_mapping/ : /source_tenant_missing_channel_account/
    );
    assert.deepEqual(
      await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
      before
    );
  }
});

test("backfill is atomic when the second deterministically locked tenant fails", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const created = await Promise.all(["a", "b"].map(async (label) => {
    const client = await prisma.client.create({
      data: { clientKey: `backfill-atomic-${label}-${nonce}`, name: `Synthetic ${label}` },
    });
    ids.push(client.id);
    const phoneNumberId = `atomic-${label}-${nonce}`;
    await prisma.tenantOperationalConfig.create({
      data: { clientId: client.id, config: { sentinel: label, nested: [false, null, label] } },
    });
    await prisma.waPhoneNumber.create({ data: { clientId: client.id, phoneNumberId } });
    await prisma.channelAccount.create({
      data: { clientId: client.id, channel: "whatsapp", provider: "meta", channelAccountId: phoneNumberId },
    });
    return { client, phoneNumberId };
  }));
  const ordered = [...created].sort((left, right) => left.client.id.localeCompare(right.client.id));
  const failingClientId = ordered[1].client.id;
  const before = new Map(await Promise.all(created.map(async ({ client }) => [
    client.id,
    await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
  ] as const)));
  const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-atomic-"));
  temporaryDirectories.push(cwd);
  const source = path.join(cwd, "tenants.json");
  const sourceValue = Object.fromEntries(created.map(({ client, phoneNumberId }, index) => [
    client.clientKey,
    {
      id: client.clientKey,
      name: `Synthetic atomic ${index}`,
      metaPhoneNumberId: phoneNumberId,
      allowlist: [`55849900000${index}`],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
      disableAutoReply: false,
    },
  ]));
  const bytes = JSON.stringify(sourceValue);
  await writeFile(source, bytes, { mode: 0o600 });
  const functionName = `backfill_atomic_fail_${process.pid}_${Date.now()}`;
  const triggerName = `${functionName}_trigger`;
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."clientId" = '${failingClientId}'::uuid THEN
        RAISE EXCEPTION 'synthetic_second_tenant_failure';
      END IF;
      RETURN NEW;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT OR UPDATE ON "TenantOperationalConfig"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);
  try {
    await assert.rejects(
      runScript(cwd, "backfill-tenant-operational-config.ts", [
        "--source", source,
        "--expected-source-sha256", crypto.createHash("sha256").update(bytes).digest("hex"),
        "--json",
      ]),
      /synthetic_second_tenant_failure/
    );
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "TenantOperationalConfig"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
  for (const { client } of created) {
    assert.deepEqual(
      await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
      before.get(client.id)
    );
  }
});
