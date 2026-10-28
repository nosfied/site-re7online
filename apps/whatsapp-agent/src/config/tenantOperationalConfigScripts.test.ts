import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
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

test("tenant-scoped retirement checks selected ready tenants without writing or inheriting outside debt", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const selectedKeys = [
    `retirement-cra-${nonce}`,
    `retirement-justa-${nonce}`,
    `retirement-tendencia-${nonce}`,
  ];
  const outsideKey = `retirement-outside-incomplete-${nonce}`;
  assert.equal(await prisma.client.count({ where: { clientKey: { in: [...selectedKeys, outsideKey] } } }), 0);
  for (const [index, clientKey] of selectedKeys.entries()) {
    const client = await prisma.client.create({ data: { clientKey, name: `Retirement selected ${index}` } });
    ids.push(client.id);
    const phoneNumberId = `retirement-selected-${index}`;
    await prisma.waPhoneNumber.create({ data: { clientId: client.id, phoneNumberId, display: `masked-${index}` } });
    await prisma.channelAccount.create({
      data: {
        clientId: client.id,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: phoneNumberId,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        automationEnabled: true,
        aiEnabled: false,
        status: "connected",
        tokenStatus: "configured",
      },
    });
    await prisma.tenantOperationalConfig.create({
      data: {
        clientId: client.id,
        config: {
          baseConfig: {
            allowlist: [],
            handoffAttendantWaid: "",
            defaultLanguage: "pt_BR",
            disableAutoReply: false,
          },
          sentinel: { selected: clientKey, unchanged: true },
        },
      },
    });
  }
  const outside = await prisma.client.create({
    data: { clientKey: outsideKey, name: "Retirement outside incomplete" },
  });
  ids.push(outside.id);
  await prisma.waPhoneNumber.create({
    data: { clientId: outside.id, phoneNumberId: "retirement-outside-incomplete", display: "masked-outside" },
  });

  const before = await prisma.tenantOperationalConfig.findMany({
    where: { clientId: { in: ids } },
    orderBy: { clientId: "asc" },
  });
  const output = await runScript(root, "tenants-json-retirement-check.ts", [
    "--tenant", selectedKeys[2],
    "--tenant", selectedKeys[0],
    "--tenant", selectedKeys[1],
  ]);
  const report = JSON.parse(output);
  assert.equal(report.ok, true);
  assert.deepEqual(report.selectedTenants, selectedKeys);
  assert.deepEqual(report.tenants.map((tenant: { clientKey: string }) => tenant.clientKey), selectedKeys);
  assert.equal(report.incompleteTenants.length, 0);
  assert.equal(report.warnings.activeTenantsWithoutChannelAccounts.length, 0);
  assert.equal(JSON.stringify(report).includes("retirement-selected-"), false, "phone identities must be omitted");
  for (const tenant of report.tenants) {
    for (const account of tenant.channelAccounts) {
      assert.equal("channelAccountId" in account, false);
      assert.equal("secretKinds" in account, false);
    }
  }
  assert.deepEqual(await prisma.tenantOperationalConfig.findMany({
    where: { clientId: { in: ids } },
    orderBy: { clientId: "asc" },
  }), before, "retirement check must not write PostgreSQL");

  await assert.rejects(
    runScript(root, "tenants-json-retirement-check.ts", ["--tenant", outsideKey]),
    /synthetic script tenants-json-retirement-check\.ts failed \(1\)/
  );
  await assert.rejects(
    runScript(root, "tenants-json-retirement-check.ts", []),
    /synthetic script tenants-json-retirement-check\.ts failed \(1\)/
  );
  assert.deepEqual(await prisma.tenantOperationalConfig.findMany({
    where: { clientId: { in: ids } },
    orderBy: { clientId: "asc" },
  }), before, "selected denial and global denial must remain read-only");
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

test("backfill accepts an atomic mixed Meta plus Web Session-only batch", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const metaClient = await prisma.client.create({
    data: { clientKey: `backfill-meta-${nonce}`, name: "Synthetic Meta" },
  });
  const webClient = await prisma.client.create({
    data: { clientKey: `backfill-web-${nonce}`, name: "Synthetic Web Session" },
  });
  ids.push(metaClient.id, webClient.id);
  const metaPhoneNumberId = `mixed-meta-${nonce}`;
  await Promise.all([
    prisma.tenantOperationalConfig.create({ data: { clientId: metaClient.id, config: { sentinel: "meta" } } }),
    prisma.tenantOperationalConfig.create({ data: { clientId: webClient.id, config: { sentinel: "web" } } }),
    prisma.waPhoneNumber.create({ data: { clientId: metaClient.id, phoneNumberId: metaPhoneNumberId } }),
    prisma.channelAccount.create({
      data: {
        clientId: metaClient.id,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: metaPhoneNumberId,
      },
    }),
    prisma.channelAccount.create({
      data: {
        clientId: webClient.id,
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: `mixed-web-${nonce}`,
      },
    }),
  ]);
  const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-mixed-"));
  temporaryDirectories.push(cwd);
  const source = path.join(cwd, "tenants.json");
  const bytes = JSON.stringify({
    [metaClient.clientKey]: {
      id: metaClient.clientKey,
      name: "Synthetic Meta",
      metaPhoneNumberId,
      allowlist: [],
      defaultLanguage: "pt_BR",
    },
    [webClient.clientKey]: {
      id: webClient.clientKey,
      name: "Synthetic Web Session",
      allowlist: [],
      defaultLanguage: "pt_BR",
    },
  });
  await writeFile(source, bytes, { mode: 0o600 });
  const output = await runScript(cwd, "backfill-tenant-operational-config.ts", [
    "--source", source,
    "--expected-source-sha256", crypto.createHash("sha256").update(bytes).digest("hex"),
    "--json",
  ]);
  const report = JSON.parse(output);
  assert.equal(report.items.length, 2);
  assert.equal(await prisma.channelAccount.count({
    where: { clientId: webClient.id, channel: "whatsapp", provider: "meta" },
  }), 0);
  for (const clientId of [metaClient.id, webClient.id]) {
    const config = await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId } });
    assert.equal(
      ((config.config as Record<string, unknown>).baseConfig as Record<string, unknown>).defaultLanguage,
      "pt_BR"
    );
  }
});

test("mixed batch with ambiguous Meta evidence leaves Meta and Web Session tenants unchanged", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const metaClient = await prisma.client.create({
    data: { clientKey: `backfill-ambiguous-meta-${nonce}`, name: "Synthetic Meta ambiguous" },
  });
  const webClient = await prisma.client.create({
    data: { clientKey: `backfill-ambiguous-web-${nonce}`, name: "Synthetic Web Session" },
  });
  ids.push(metaClient.id, webClient.id);
  const metaPhoneNumberId = `ambiguous-meta-${nonce}`;
  await Promise.all([
    prisma.tenantOperationalConfig.create({ data: { clientId: metaClient.id, config: { sentinel: ["meta", false] } } }),
    prisma.tenantOperationalConfig.create({ data: { clientId: webClient.id, config: { sentinel: ["web", false] } } }),
    prisma.waPhoneNumber.create({ data: { clientId: metaClient.id, phoneNumberId: metaPhoneNumberId } }),
    prisma.channelAccount.create({
      data: { clientId: metaClient.id, channel: "whatsapp", provider: "meta", channelAccountId: metaPhoneNumberId },
    }),
    prisma.channelAccount.create({
      data: { clientId: webClient.id, channel: "whatsapp", provider: "web_session", channelAccountId: `ambiguous-web-${nonce}` },
    }),
  ]);
  const before = new Map(await Promise.all([metaClient, webClient].map(async (client) => [
    client.id,
    await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
  ] as const)));
  const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-ambiguous-"));
  temporaryDirectories.push(cwd);
  const source = path.join(cwd, "tenants.json");
  const bytes = JSON.stringify({
    [metaClient.clientKey]: { id: metaClient.clientKey, name: "Meta without source identity", allowlist: [] },
    [webClient.clientKey]: { id: webClient.clientKey, name: "Web Session", allowlist: [] },
  });
  await writeFile(source, bytes, { mode: 0o600 });
  await assert.rejects(runScript(cwd, "backfill-tenant-operational-config.ts", [
    "--source", source,
    "--expected-source-sha256", crypto.createHash("sha256").update(bytes).digest("hex"),
    "--json",
  ]), /source_tenant_meta_identity_ambiguous/);
  for (const client of [metaClient, webClient]) {
    assert.deepEqual(
      await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
      before.get(client.id)
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

test("selected Tendencia, Justa and owner-authorized CRA are one atomic batch", async () => {
  const tenantKeys = ["tendencia-modas", "justa-advocacia", "cra-pr"] as const;
  const created = await Promise.all(tenantKeys.map(async (tenantKey) => {
    const client = await prisma.client.create({ data: { clientKey: tenantKey, name: `Synthetic ${tenantKey}` } });
    ids.push(client.id);
    const phoneNumberId = `selected-${tenantKey}-${process.pid}`;
    await prisma.tenantOperationalConfig.create({
      data: {
        clientId: client.id,
        config: {
          sentinel: { tenantKey, values: [false, null, "preserve"] },
          aiAssistantConfig: tenantKey === "cra-pr" ? { legacy: true, enabled: false } : { legacy: true },
          unrelatedPolicy: { active: true },
        },
      },
    });
    await prisma.waPhoneNumber.create({ data: { clientId: client.id, phoneNumberId } });
    await prisma.tenantMetaConfig.create({
      data: { clientId: client.id, phoneNumberId, businessToken: `synthetic-${tenantKey}`, rawPayload: {} },
    });
    await prisma.channelAccount.create({
      data: {
        clientId: client.id,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: phoneNumberId,
        aiEnabled: tenantKey !== "cra-pr",
      },
    });
    return { tenantKey, client, phoneNumberId };
  }));
  const cwd = await mkdtemp(path.join(os.tmpdir(), "re7-config-selected-batch-"));
  temporaryDirectories.push(cwd);
  const source = path.join(cwd, "tenants.json");
  const planPath = path.join(cwd, "tenant-operational-plan.private.json");
  const sourceValue = Object.fromEntries(created.filter((entry) => entry.tenantKey !== "cra-pr").map((entry) => [
    entry.tenantKey,
    {
      id: entry.tenantKey,
      name: entry.tenantKey,
      metaPhoneNumberId: entry.phoneNumberId,
      allowlist: [],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
      disableAutoReply: false,
      crmBusinessStatuses: [{ id: "novo", label: "Novo" }],
      aiAssistantEnabled: true,
      aiAssistantFallbackToHandoff: true,
      aiBusinessContext: `Contexto ${entry.tenantKey}`,
      aiAssistantSystemPrompt: `Prompt ${entry.tenantKey}`,
    },
  ]));
  const sourceBytes = JSON.stringify(sourceValue);
  const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");
  const planValue = {
    schemaVersion: 1,
    sourceSha256,
    tenants: {
      "cra-pr": {
        provenance: "OWNER_AUTHORIZED_DB_IDENTITY",
        baseConfig: {
          allowlist: [],
          handoffAttendantWaid: "",
          defaultLanguage: "pt_BR",
          disableAutoReply: true,
        },
      },
    },
  };
  const planBytes = JSON.stringify(planValue);
  const planSha256 = crypto.createHash("sha256").update(planBytes).digest("hex");
  await Promise.all([
    writeFile(source, sourceBytes, { mode: 0o600 }),
    writeFile(planPath, planBytes, { mode: 0o600 }),
  ]);
  const args = [
    "--source", source,
    "--expected-source-sha256", sourceSha256,
    "--plan", planPath,
    "--expected-plan-sha256", planSha256,
    "--tenant", "tendencia-modas",
    "--tenant", "justa-advocacia",
    "--tenant", "cra-pr",
    "--json",
  ];

  const beforeDryRun = new Map(await Promise.all(created.map(async ({ client }) => [
    client.id,
    await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
  ] as const)));
  const dryReport = JSON.parse(await runScript(cwd, "backfill-tenant-operational-config.ts", [...args, "--dry-run"]));
  assert.deepEqual(dryReport.selectedTenants, ["cra-pr", "justa-advocacia", "tendencia-modas"]);
  assert.equal(dryReport.wouldUpsert, 3);
  assert.equal(dryReport.items.find((item: { tenantKey: string }) => item.tenantKey === "cra-pr").provenance, "OWNER_AUTHORIZED_DB_IDENTITY");
  for (const { client } of created) {
    assert.deepEqual(await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }), beforeDryRun.get(client.id));
  }
  assert.equal(await readFile(source, "utf8"), sourceBytes);

  const applyReport = JSON.parse(await runScript(cwd, "backfill-tenant-operational-config.ts", args));
  assert.equal(applyReport.upserted, 3);
  for (const { tenantKey, client } of created) {
    const row = await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } });
    const config = row.config as Record<string, unknown>;
    assert.deepEqual(config.sentinel, { tenantKey, values: [false, null, "preserve"] });
    assert.deepEqual(config.unrelatedPolicy, { active: true });
    if (tenantKey === "cra-pr") {
      assert.deepEqual(config.aiAssistantConfig, { legacy: true, enabled: false });
      assert.equal((config.baseConfig as Record<string, unknown>).disableAutoReply, true);
      assert.equal(config.crmBusinessStatuses, undefined);
      assert.equal(config.templates, undefined);
      assert.equal(config.followUp, undefined);
    } else {
      assert.equal(((config.aiAssistantConfig as Record<string, unknown>).aiAssistantEnabled), true);
      assert(Array.isArray(config.crmBusinessStatuses));
    }
  }

  const omittedReport = JSON.parse(await runScript(cwd, "backfill-tenant-operational-config.ts", [
    "--source", source,
    "--expected-source-sha256", sourceSha256,
    "--plan", planPath,
    "--expected-plan-sha256", planSha256,
    "--tenant", "tendencia-modas",
    "--dry-run",
    "--json",
  ]));
  assert.deepEqual(omittedReport.selectedTenants, ["tendencia-modas"]);
  assert.equal(omittedReport.processed, 1);

  const changedSourceValue = structuredClone(sourceValue);
  for (const tenant of Object.values(changedSourceValue)) tenant.disableAutoReply = true;
  const changedSourceBytes = JSON.stringify(changedSourceValue);
  const changedSourceSha256 = crypto.createHash("sha256").update(changedSourceBytes).digest("hex");
  const changedPlanValue = structuredClone(planValue);
  changedPlanValue.sourceSha256 = changedSourceSha256;
  changedPlanValue.tenants["cra-pr"].baseConfig.disableAutoReply = false;
  const changedPlanBytes = JSON.stringify(changedPlanValue);
  const changedPlanSha256 = crypto.createHash("sha256").update(changedPlanBytes).digest("hex");
  await Promise.all([
    writeFile(source, changedSourceBytes, { mode: 0o600 }),
    writeFile(planPath, changedPlanBytes, { mode: 0o600 }),
  ]);
  const beforeFailure = new Map(await Promise.all(created.map(async ({ client }) => [
    client.id,
    await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }),
  ] as const)));
  const thirdClientId = [...created].sort((left, right) => left.client.id.localeCompare(right.client.id))[2].client.id;
  const functionName = `selected_batch_third_fail_${process.pid}_${Date.now()}`;
  const triggerName = `${functionName}_trigger`;
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."clientId" = '${thirdClientId}'::uuid THEN RAISE EXCEPTION 'synthetic_third_tenant_failure'; END IF;
      RETURN NEW;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}" BEFORE INSERT OR UPDATE ON "TenantOperationalConfig"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);
  try {
    await assert.rejects(runScript(cwd, "backfill-tenant-operational-config.ts", [
      "--source", source,
      "--expected-source-sha256", changedSourceSha256,
      "--plan", planPath,
      "--expected-plan-sha256", changedPlanSha256,
      "--tenant", "tendencia-modas",
      "--tenant", "justa-advocacia",
      "--tenant", "cra-pr",
      "--json",
    ]), /synthetic_third_tenant_failure/);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "TenantOperationalConfig"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
  for (const { client } of created) {
    assert.deepEqual(await prisma.tenantOperationalConfig.findUniqueOrThrow({ where: { clientId: client.id } }), beforeFailure.get(client.id));
  }
  assert.equal(await readFile(source, "utf8"), changedSourceBytes);
});
