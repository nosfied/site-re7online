import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { retainConversation, retentionConversationSelect } from "./conversationRetention.js";
import { executePrivacyRetention } from "./privacyRetentionService.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55781"); assert.equal(url.pathname, "/retention_lab");
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", e => queries.push(e.query));
const clients: string[] = [], old = new Date("2020-01-01"), cutoff = new Date("2026-01-01");
const waId = "5581998765432";
async function fixture(config = true) {
  const id = randomUUID(); clients.push(id);
  await db.client.create({ data: { id, clientKey: id, name: "synthetic retention" } });
  if (config) await db.retentionConfig.create({ data: { clientId: id, retentionDays: 90 } });
  const identity = { waId, waIdCanonical: waId, channel: "whatsapp", provider: "meta", channelAccountId: "synthetic", externalUserHash: "synthetic-hash" };
  const c = await db.conversation.create({ data: { clientId: id, ...identity, createdAt: old, updatedAt: old }, select: retentionConversationSelect });
  const runtime = await db.conversationRuntimeState.create({ data: { id: randomUUID(), clientId: id, ...identity, mode: "BOT", status: "CLOSED", createdAt: old, updatedAt: old } });
  const message = await db.message.create({ data: { conversationId: c.id, waId, direction: "OUTBOUND", type: "TEXT", status: "SENT", bodyText: "synthetic body", createdAt: old } });
  const params = { candidate: c, cutoff, storageMode: "postgres", retentionDays: 90, clientKey: id, audit: async (tx: Prisma.TransactionClient, conversationId: string) => {
    await tx.event.create({ data: { clientId: id, conversationId, eventName: "conversation.anonymized", requestId: randomUUID(), payloadJson: { scope: "conversation_retention_only" } } });
  } };
  return { id, c, runtime, message, params };
}
test.after(async () => {
  for (const id of clients) {
    await db.event.deleteMany({ where: { clientId: id } });
    await db.message.deleteMany({ where: { conversation: { clientId: id } } });
    await db.leadNote.deleteMany({ where: { tenantId: id } });
    await db.lead.deleteMany({ where: { tenantId: id } });
    await db.inboundMessage.deleteMany({ where: { clientId: id } });
    await db.outboundMessage.deleteMany({ where: { clientId: id } });
    await db.contact.deleteMany({ where: { clientId: id } });
    await db.conversationRuntimeState.deleteMany({ where: { clientId: id } });
    await db.conversation.deleteMany({ where: { clientId: id } });
    await db.retentionConfig.deleteMany({ where: { clientId: id } });
    await db.queue.deleteMany({ where: { clientId: id } });
    await db.department.deleteMany({ where: { clientId: id } });
    await db.client.delete({ where: { id } });
  }
  await db.$disconnect();
});
test("retention only minimizes owned conversation/message/runtime; preserves identity graph and other tenant; replay is harmless", async () => {
  const f = await fixture(), other = await fixture();
  const lead = await db.lead.create({ data: { tenantId: f.id, waId, name: "preserved", createdAt: old } });
  await db.leadNote.create({ data: { tenantId: f.id, leadId: lead.id, body: "preserved note" } });
  await db.contact.create({ data: { clientId: f.id, waId, name: "preserved" } });
  await db.inboundMessage.create({ data: { clientId: f.id, waId, messageId: randomUUID(), type: "TEXT", allowlistHit: true, bodyText: "preserved" } });
  await db.outboundMessage.create({ data: { clientId: f.id, waId, type: "TEXT", status: "SENT", bodyText: "preserved" } });
  const graph = async () => Promise.all([db.lead.findMany({ where: { tenantId: f.id } }), db.leadNote.findMany({ where: { tenantId: f.id } }), db.contact.findMany({ where: { clientId: f.id } }), db.inboundMessage.findMany({ where: { clientId: f.id } }), db.outboundMessage.findMany({ where: { clientId: f.id } })]);
  const before = await graph(); assert.equal((await retainConversation(db, f.params)).retained, true);
  assert.deepEqual(await graph(), before);
  const c = await db.conversation.findUniqueOrThrow({ where: { id: f.c.id } }); assert.ok(c.deletedAt); assert.equal(c.waId, `anon:retention:${f.c.id}`);
  const state = await db.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } }); assert.equal(state.status, "CLOSED"); assert.equal(state.version, 1);
  const msg = await db.message.findUniqueOrThrow({ where: { id: f.message.id } }); assert.equal(msg.bodyText, "[mensagem anonimizada]"); assert.equal(msg.status, "SENT");
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: other.c.id } })).deletedAt, null);
  assert.equal((await retainConversation(db, f.params)).retained, false);
  assert.equal(await db.event.count({ where: { clientId: f.id } }), 1);
});
test("each human/queue/assignment protection and absent/ambiguous runtime denies", async t => {
  for (const data of [{ mode: "HUMAN" }, { handoffStatus: "ACTIVE" }, { handoffStatus: "PENDING" }, { status: "IN_PROGRESS" }, { assignedTo: "synthetic" }, { queueId: "synthetic" }]) {
    await t.test(JSON.stringify(data), async () => {
      const f = await fixture();
      if ("queueId" in data) {
        const department = await db.department.create({ data: { clientId: f.id, name: "synthetic", slug: "synthetic" } });
        const queue = await db.queue.create({ data: { clientId: f.id, departmentId: department.id, name: "synthetic" } }); data.queueId = queue.id;
      }
      await db.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: data as never });
      const result = await retainConversation(db, f.params); assert.equal(result.retained, false); assert.equal(result.reason, "human_or_queue_protected");
      assert.equal(await db.event.count({ where: { clientId: f.id } }), 0);
    });
  }
  const f = await fixture(); await db.conversationRuntimeState.delete({ where: { id: f.runtime.id } });
  assert.equal((await retainConversation(db, f.params)).reason, "runtime_identity_unproven");
});
test("shared canonical identity, including another recent conversation, is preserved", async () => {
  const f = await fixture(); await db.conversation.create({ data: { clientId: f.id, waId: "558198765432", waIdCanonical: waId } });
  assert.equal((await retainConversation(db, f.params)).reason, "shared_or_ambiguous_conversation_identity");
  assert.equal((await db.message.findUniqueOrThrow({ where: { id: f.message.id } })).bodyText, "synthetic body");
});
test("fresh child activity and stale conversation CAS deny", async () => {
  const f = await fixture(); await db.message.update({ where: { id: f.message.id }, data: { createdAt: new Date() } });
  assert.equal((await retainConversation(db, f.params)).reason, "recent_activity");
  const g = await fixture(); await db.conversation.update({ where: { id: g.c.id }, data: { lastInboundAt: new Date() } });
  assert.equal((await retainConversation(db, g.params)).reason, "concurrent_change");
});
test("claim committed while retention waits cannot be erased", async () => {
  const f = await fixture(); let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => entered = r), hold = new Promise<void>(r => release = r);
  const claim = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ConversationRuntimeState" WHERE id=${f.runtime.id} FOR UPDATE`;
    await tx.conversationRuntimeState.update({ where: { id: f.runtime.id }, data: { mode: "HUMAN", status: "IN_PROGRESS", assignedTo: "synthetic owner" } }); entered(); await hold;
  });
  await ready; const pending = retainConversation(db, f.params); await new Promise(r => setTimeout(r, 80)); release(); await claim;
  assert.equal((await pending).retained, false);
  assert.equal((await db.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } })).assignedTo, "synthetic owner");
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.c.id } })).deletedAt, null);
});
test("audit failure rolls back conversation, messages and runtime together", async () => {
  const f = await fixture(); await assert.rejects(retainConversation(db, { ...f.params, audit: async () => { throw Error("synthetic audit failure"); } }));
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.c.id } })).deletedAt, null);
  assert.equal((await db.conversationRuntimeState.findUniqueOrThrow({ where: { id: f.runtime.id } })).waId, waId);
  assert.equal((await db.message.findUniqueOrThrow({ where: { id: f.message.id } })).bodyText, "synthetic body");
});
test("concurrent retention commits only once without automatic retry", async () => {
  const f = await fixture(); const results = await Promise.all([retainConversation(db, f.params), retainConversation(db, f.params)]);
  assert.equal(results.filter(r => r.retained).length, 1); assert.equal(await db.event.count({ where: { clientId: f.id } }), 1);
});
test("preview with missing config never upserts, audits or mutates", async () => {
  const f = await fixture(false); queries.length = 0;
  const result = await executePrivacyRetention({ prisma: db, clientId: f.id, clientKey: f.id, actorId: "system", requestId: randomUUID(), action: "retention", dryRun: true });
  assert.equal(result.anonymizedConversations, 1);
  assert.ok(!queries.some(q => /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(q)));
  assert.equal(await db.retentionConfig.count({ where: { clientId: f.id } }), 0); assert.equal(await db.event.count({ where: { clientId: f.id } }), 0);
});
test("policy drift, unknown storage and row-lock deadline deny without mutation", async () => {
  const f = await fixture(); await db.retentionConfig.update({ where: { clientId: f.id }, data: { retentionDays: 365 } });
  assert.equal((await retainConversation(db, f.params)).reason, "retention_policy_changed");
  assert.equal((await retainConversation(db, { ...f.params, storageMode: "hybrid" })).reason, "storage_profile_unproven");
  const g = await fixture(); let ready!: () => void, release!: () => void;
  const entered = new Promise<void>(r => ready = r), hold = new Promise<void>(r => release = r);
  const lock = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "ConversationRuntimeState" WHERE id=${g.runtime.id} FOR UPDATE`; ready(); await hold; });
  await entered;
  try { assert.equal((await retainConversation(db, g.params)).reason, "concurrent_change"); }
  finally { release(); await lock; }
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: g.c.id } })).deletedAt, null);
});
test("real retention orchestrator uses narrow transaction and emits truthful aggregate", async () => {
  const f = await fixture();
  const result = await executePrivacyRetention({ prisma: db, clientId: f.id, clientKey: f.id, actorId: "system", requestId: randomUUID(), action: "retention" });
  assert.equal(result.anonymizedConversations, 1); assert.equal(result.softDeletedConversations, 1);
  assert.equal(await db.event.count({ where: { clientId: f.id, eventName: "conversation.anonymized" } }), 1);
  assert.equal(await db.event.count({ where: { clientId: f.id, eventName: "retention.executed" } }), 1);
});
