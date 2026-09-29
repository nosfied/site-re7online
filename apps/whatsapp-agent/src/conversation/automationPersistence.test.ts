import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getPrisma } from "../db.js";
import { createDualWriteStorage } from "../storage/dualWriteStorage.js";
import type { Storage } from "../storage/storage.js";
import type { ConversationState } from "./conversation.types.js";
import { captureRuntimeWriteToken, updateRuntimeIfUnchanged } from "./runtimeWriteFence.js";

const prisma = getPrisma();
const prefix = `automation-fence-${process.pid}-${Date.now()}`;
const primary = new Proxy({} as Storage, { get() { return () => { throw new Error("JSON/provider must not be used"); }; } });
const storage = createDualWriteStorage(primary, { readSource: "postgres", jsonWriteEnabled: false });
const noopLogger = { info() {} };
const metaSource = fs.readFileSync(new URL("../whatsapp/webhook.controller.ts", import.meta.url), "utf8");
const webSource = fs.readFileSync(new URL("../web-session/webSessionInbound.ts", import.meta.url), "utf8");
function extract(source: string, start: string, end: string, name: string, context: Record<string, unknown>) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a);
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source.slice(a, b) + `\nmodule.exports=${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, Date, ...context });
  return module.exports as (params: any) => Promise<any>;
}
function defer() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { resolve, promise }; }
async function fixture(suffix: string) {
  const client = await prisma.client.create({ data: { clientKey: `${prefix}-${suffix}`, name: "Synthetic automation fence" } });
  const department = await prisma.department.create({ data: { clientId: client.id, name: "Synthetic destination", slug: "synthetic-destination" } });
  const queue = await prisma.queue.create({ data: { clientId: client.id, departmentId: department.id, name: "Synthetic queue" } });
  const row = await prisma.conversationRuntimeState.create({ data: {
    clientId: client.id, waId: `synthetic-${suffix}`, mode: "BOT", handoffStatus: "NONE",
    status: "WAITING", firstSeenAt: new Date("2026-09-29T10:00:00Z"), lastInboundAt: new Date("2026-09-29T10:00:00Z"), answers: { synthetic: true },
  } });
  const state = await storage.getConversation(row.waId, client.clientKey);
  assert(state?.runtimeWriteToken);
  return { client, row, state, department, queue };
}
function writer(path: "meta" | "web_session", f: Awaited<ReturnType<typeof fixture>>) {
  if (path === "meta") return extract(metaSource, "  const upsertConversationSafe = async", "  const persistOutboundConversation = async", "upsertConversationSafe", {
    storage, tenantClientId: f.client.id, tenantClientKey: f.client.clientKey, logger: noopLogger,
    resolveRuntimeDepartmentId: async (id: unknown) => id, isWhatsAppMultichannelShadowWriteEnabled: () => false,
  });
  const persist = extract(webSource, "async function persistWebSessionRuntimeState(", "async function shouldReopenClosedConversationWindow", "persistWebSessionRuntimeState", {
    updateRuntimeIfUnchanged, logger: noopLogger,
  });
  return (state: ConversationState) => persist({ prisma, clientId: f.client.id, waId: f.row.waId, state });
}
test.before(() => { assert.match(process.env.DATABASE_URL ?? "", /127\.0\.0\.1:55432\/re7_config_persistence_20260928/); });
test.after(async () => {
  const clients = await prisma.client.findMany({ where: { clientKey: { startsWith: prefix } }, select: { id: true } });
  const ids = clients.map(c => c.id);
  await prisma.outboundMessage.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.conversationRuntimeState.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
for (const path of ["meta", "web_session"] as const) {
  for (const intervention of ["claim", "active_handoff_bot", "pending_handoff", "closed", "new_inbound", "transfer", "new_cycle"] as const) {
    test(`${path}: pending automation completion preserves concurrent ${intervention}`, async () => {
      const f = await fixture(`${path}-${intervention}`), save = writer(path, f);
      const entered = defer(), release = defer();
      const pending = (async () => {
        entered.resolve(); await release.promise;
        // Simulated accepted response is durably persisted before runtime completion.
        await prisma.outboundMessage.create({ data: { clientId: f.client.id, waId: f.row.waId,
          messageId: `accepted-${intervention}`, type: "TEXT", status: "SENT", bodyText: "Synthetic accepted reply" } });
        return save({ ...f.state, lastOutboundAt: "2026-09-29T10:01:00Z", answers: { flowTags: ["stale-automation"] } });
      })();
      await entered.promise;
      const changes = intervention === "claim" ? { mode: "HUMAN", status: "IN_PROGRESS" as const, assignedUserId: "synthetic-agent" }
        : intervention === "active_handoff_bot" ? { updatedAt: f.row.updatedAt, mode: "BOT", handoffStatus: "ACTIVE" as const, assignedUserId: "synthetic-agent", status: "IN_PROGRESS" as const }
        : intervention === "pending_handoff" ? { handoffStatus: "PENDING" as const }
        : intervention === "closed" ? { status: "CLOSED" as const, closedAt: new Date() }
        : intervention === "transfer" ? { mode: "HUMAN", handoffStatus: "ACTIVE" as const, status: "IN_PROGRESS" as const,
          assignedUserId: "synthetic-transfer-agent", departmentId: f.department.id, queueId: f.queue.id, updatedAt: f.row.updatedAt }
        : intervention === "new_cycle" ? { answers: { operationalProtocol: { protocol: "CVT-123456789ABC", cycleId: "synthetic-new-cycle",
          issuedAt: "2026-09-29T10:02:00Z", source: "synthetic-reentry" }, lastClosedServiceCycle: { cycleId: "synthetic-old-cycle" } }, version: { increment: 1 }, updatedAt: f.row.updatedAt }
        : { lastInboundAt: new Date("2026-09-29T10:02:00Z"), version: { increment: 1 } };
      const actual = await prisma.conversationRuntimeState.update({ where: { id: f.row.id }, data: changes });
      release.resolve(); await pending;
      assert.deepEqual(await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.row.id } }), actual);
      assert.equal(await prisma.outboundMessage.count({ where: { clientId: f.client.id } }), 1);
    });
  }
  test(`${path}: unchanged automation and legitimate new handoff persist`, async () => {
    const f = await fixture(`${path}-valid`), save = writer(path, f);
    const next = { ...f.state, mode: "HUMAN" as const, handoff: { status: "active" as const }, status: "WAITING" as const };
    await save(next);
    const actual = await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.row.id } });
    assert.equal(actual.mode, "HUMAN"); assert.equal(actual.handoffStatus, "ACTIVE");
  });
}
test("conditional runtime write cannot cross tenant and never retries an obsolete document", async () => {
  const a = await fixture("tenant-a"), b = await fixture("tenant-b");
  const result = await updateRuntimeIfUnchanged({ prisma, clientId: b.client.id, waId: a.row.waId,
    expected: captureRuntimeWriteToken(a.row), data: { mode: "HUMAN" } });
  assert.equal(result, null);
  assert.equal((await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: a.row.id } })).mode, "BOT");
});

test("conditional runtime DB failure propagates without fallback or retry", async () => {
  const f = await fixture("db-error");
  let calls = 0;
  const failedPrisma = { conversationRuntimeState: { updateManyAndReturn: async () => {
    calls++; throw new Error("synthetic-db-failure");
  } } } as unknown as Parameters<typeof updateRuntimeIfUnchanged>[0]["prisma"];
  await assert.rejects(updateRuntimeIfUnchanged({ prisma: failedPrisma, clientId: f.client.id,
    waId: f.row.waId, expected: captureRuntimeWriteToken(f.row), data: { mode: "HUMAN" } }), /synthetic-db-failure/);
  assert.equal(calls, 1);
  assert.deepEqual(await prisma.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.row.id } }), f.row);
});
