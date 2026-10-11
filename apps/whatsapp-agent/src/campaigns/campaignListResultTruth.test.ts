import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { setPrismaForTesting } from "../db.js";
import { buildCampaignListPayload, buildCampaignDetailPayload, handleRequest } from "../http/routes.js";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/re7_list_truth_20261011");
assert.equal(process.version, "v20.20.0");
process.env.APP_AUTH_SECRET = "synthetic-list-truth-only";
process.env.CAMPAIGN_SEED_SECRET = "synthetic-list-seed-only";
const cwd = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), "re7-list-truth-"));
process.chdir(temp); fs.mkdirSync(".data"); fs.writeFileSync(".data/tenants.json", "{}");
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", event => queries.push(event.query));
setPrismaForTesting(db);
const tenants: string[] = [];
const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (input, options) => {
  const value = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (value.hostname !== "127.0.0.1") { providerCalls++; throw Error("provider_forbidden"); }
  return originalFetch(input, options);
};
test.after(async () => {
  await db.outboundMessage.deleteMany({ where: { clientId: { in: tenants } } });
  await db.event.deleteMany({ where: { clientId: { in: tenants } } });
  await db.campaignExecutionBatchCampaign.deleteMany({ where: { clientId: { in: tenants } } });
  for (const id of tenants) await db.client.delete({ where: { id } });
  await db.$disconnect(); setPrismaForTesting(undefined); process.chdir(cwd);
  assert.equal(providerCalls, 0);
});
async function fixture() {
  const client = await db.client.create({ data: { clientKey: `list-${crypto.randomUUID()}`, name: "Synthetic list", features: { campaigns: true } } });
  tenants.push(client.id);
  const child = await db.campaign.create({ data: { clientId: client.id, name: "Synthetic child", templateName: "synthetic", status: "sending", totalRecipients: 11, sentCount: 6, createdAt: new Date("2030-01-01T10:00:00Z") } });
  const parent = await db.campaign.create({ data: { clientId: client.id, name: "Synthetic controller", templateName: "synthetic", status: "sending", totalRecipients: 11, blockedCount: 244, createdAt: new Date("2030-01-01T11:00:00Z") } });
  const batch = await db.campaignExecutionBatch.create({ data: { clientId: client.id, name: "Synthetic set", sourceMode: "DYNAMIC_CRM_FILTER", status: "running", idempotencyKey: `dynamic:${parent.id}`, totalRecipients: 11, blockedCount: 244 } });
  await db.campaignExecutionBatchCampaign.create({ data: { clientId: client.id, batchId: batch.id, campaignId: child.id, chunkIndex: 1, recipientCount: 11 } });
  const recipients = Array.from({ length: 11 }, (_, i) => `55419911000${String(i + 1).padStart(2, "0")}`);
  await seed(client.id, child.id, recipients);
  await seed(client.id, parent.id, [], "DYNAMIC_CRM_FILTER");
  await db.outboundMessage.createMany({ data: recipients.slice(0, 6).map((waId, i) => ({ clientId: client.id, waId, type: "TEMPLATE", status: "SENT", messageId: `campaign.${child.id}.${i+1}`, createdAt: new Date("2030-01-01T10:01:00Z"), rawPayload: { campaignId: child.id, metaStatus: { lastStatus: "delivered" } } })) });
  return { client, parent, child, batch, recipients };
}
async function seed(clientId: string, campaignId: string, recipients: string[], selectionMode = "STATIC_RECIPIENTS") {
  await db.event.create({ data: { clientId, messageId: campaignId, eventName: "campaign.seed.saved", payloadJson: { name: "Synthetic", templateName: "synthetic", selectionMode, ...buildPrivateCampaignSeedFields({ clientId, waIds: recipients }) } } });
}
function assertSix(item: any) {
  assert.equal(item.sentCount, 6); assert.equal(item.totalRecipients, 11); assert.equal(item.blockedCount, 0);
  assert.equal(item.metaSummary.totalDelivered, 6); assert.equal(item.metaSummary.totalPending, 5);
  for (const [key, value] of Object.entries({ totalRecipients: 11, sentCount: 6, blockedCount: 0, failedCount: 0, pendingCount: 5 })) assert.equal(item.progress[key], value);
}
test("list / detail / new list: six reported deliveries and five pending, no receipt dependency", async () => {
  const f = await fixture(); const before = queries.length;
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  const listQueries = queries.slice(before);
  assert(listQueries.length <= 8, `bounded bulk query count ${listQueries.length}`);
  assert(!listQueries.some(q => q.includes('"Contact"') || q.includes('"Lead"')));
  for (const id of [f.parent.id, f.child.id]) assertSix(list.items.find(item => item.id === id));
  const detail = await buildCampaignDetailPayload(db, { clientId: f.client.id, campaignId: f.parent.id });
  assert.ok(detail); assertSix({ ...detail.campaign, progress: { totalRecipients: detail.campaign.progress.totalRecipients, sentCount: detail.campaign.progress.sentCount, blockedCount: detail.campaign.progress.blockedCount, failedCount: detail.campaign.progress.failedCount, pendingCount: detail.campaign.progress.pendingCount } });
  assert.equal(detail.campaign.audienceBlockedCount, 244);
  assert.equal(detail.campaign.materializedRecipientCount, 11);
  assert.equal(detail.campaign.plannedRecipientCount, 11);
  assert.deepEqual((await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 })).items, list.items);
  if (process.env.LIST_TRUTH_BROWSER_FIXTURE) fs.writeFileSync(process.env.LIST_TRUTH_BROWSER_FIXTURE, JSON.stringify({ list, detail, parentId: f.parent.id, childId: f.child.id }));
  // Controller is the only paginated row, children must still be aggregated.
  const page = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 1 });
  assert.equal(page.count, 1); assert.equal(page.items[0].id, f.parent.id); assertSix(page.items[0]);
});
test("multiple explicitly related executions count once each, including the same recipient", async () => {
  const f = await fixture();
  const second = await db.campaign.create({ data: { clientId: f.client.id, name: f.child.name, templateName: "synthetic", status: "completed", totalRecipients: 1, sentCount: 1, createdAt: f.child.createdAt } });
  await seed(f.client.id, second.id, [f.recipients[0]]);
  await db.campaignExecutionBatchCampaign.create({ data: { clientId: f.client.id, batchId: f.batch.id, campaignId: second.id, chunkIndex: 2, recipientCount: 1 } });
  await db.outboundMessage.create({ data: { clientId: f.client.id, waId: f.recipients[0], type: "TEMPLATE", status: "SENT", messageId: `campaign.${second.id}.1`, createdAt: new Date("2030-01-01T10:01:00Z"), rawPayload: { campaignId: second.id, metaStatus: { lastStatus: "read" } } } });
  const payload = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  const row = payload.items.find(item => item.id === f.parent.id)!;
  assert.equal(row.sentCount, 7); assert.equal(row.totalRecipients, 12); assert.equal(row.metaSummary.totalDelivered, 6); assert.equal(row.metaSummary.totalRead, 1); assert.equal(row.progress.pendingCount, 5);
  const detail = await buildCampaignDetailPayload(db, { clientId: f.client.id, campaignId: f.parent.id });
  assert.equal(detail!.campaign.sentCount, row.sentCount); assert.deepEqual(detail!.campaign.metaSummary, row.metaSummary);
  assert.equal(payload.count, 3); // Same names are independent IDs, not dedup keys.
});
test("unmaterialized controller retains planned audience, not historic filter exclusions as outcomes", async () => {
  const f = await fixture();
  await db.campaignExecutionBatchCampaign.deleteMany({ where: { batchId: f.batch.id } });
  const row = (await buildCampaignListPayload(db, { clientId: f.client.id, limit: 1 })).items[0];
  assert.equal(row.totalRecipients, 11); assert.equal(row.plannedRecipientCount, 11); assert.equal(row.materializedRecipientCount, 0);
  assert.equal(row.sentCount, 0); assert.equal(row.blockedCount, 0); assert.equal(row.audienceBlockedCount, 244); assert.equal(row.progress.pendingCount, 11);
  const detail = await buildCampaignDetailPayload(db, { clientId: f.client.id, campaignId: f.parent.id });
  assert.equal(detail!.campaign.totalRecipients, row.totalRecipients); assert.equal(detail!.campaign.sentCount, 0); assert.equal(detail!.campaign.progress.pendingCount, 11);
});
test("delivered and FAILED131026 receipts coexist: outcomes, explicit blocks and replay unchanged", async () => {
  const f = await fixture();
  await db.outboundMessage.update({ where: { clientId_messageId: { clientId: f.client.id, messageId: `campaign.${f.child.id}.6` } }, data: { status: "FAILED", errorBody: "131026", rawPayload: { campaignId: f.child.id, metaStatus: { lastStatus: "failed", errors: [{ code: 131026 }] } } } });
  await db.campaign.update({ where: { id: f.child.id }, data: { sentCount: 5, blockedCount: 4 } });
  await db.event.createMany({ data: ["campaign.accepted_failure.reconciled", "campaign.accepted_delivery.reconciled"].flatMap(eventName => [1,2].map(() => ({ clientId: f.client.id, messageId: f.child.id, eventName, payloadJson: { bindings: { campaignId: f.child.id, parentCampaignId: f.parent.id } } }))) });
  await db.event.createMany({ data: [7,8,9,10].map(n => ({ clientId: f.client.id, messageId: f.child.id, eventName: "campaign.recipient.import_blocked", payloadJson: { rowNumber: n, reason: "recipient_anonymized", label: "Blocked before provider" } })) });
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  for (const row of list.items) { assert.equal(row.sentCount, 5); assert.equal(row.metaSummary.totalDelivered, 5); assert.equal(row.metaSummary.totalFailed, 1); assert.equal(row.metaSummary.totalBlocked, 4); assert.equal(row.metaSummary.totalPending, 1); assert.equal(row.progress.pendingCount, 1); }
  await db.event.deleteMany({ where: { clientId: f.client.id, eventName: { in: ["campaign.accepted_failure.reconciled", "campaign.accepted_delivery.reconciled"] } } });
  assert.deepEqual((await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 })).items, list.items);
});
test("tenant isolation: foreign links/results and same names cannot affect scoped page", async () => {
  const f = await fixture(), other = await fixture();
  await db.outboundMessage.create({ data: { clientId: other.client.id, waId: f.recipients[10], type: "TEMPLATE", status: "SENT", messageId: `campaign.${f.child.id}.11`, rawPayload: { campaignId: f.child.id, metaStatus: { lastStatus: "read" } } } });
  await db.campaignExecutionBatchCampaign.deleteMany({ where: { clientId: other.client.id, campaignId: other.child.id } });
  await db.campaignExecutionBatchCampaign.create({ data: { clientId: other.client.id, batchId: f.batch.id, campaignId: other.child.id, chunkIndex: 2, recipientCount: 11 } });
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  assert.equal(list.count, 2); for (const row of list.items) { assert.equal(row.clientId, f.client.id); assertSix(row); }
  assert.equal(await buildCampaignDetailPayload(db, { clientId: other.client.id, campaignId: f.parent.id }), null);
});
test("real HTTP controller: authentication and AGENT deny, ADMIN page scoped to its tenant", async () => {
  const f = await fixture();
  const server = createServer((req, res) => void handleRequest(req, res).catch(() => { res.writeHead(500); res.end('{}'); }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/app/campaigns?limit=1`;
  try {
    assert.equal((await fetch(endpoint)).status, 401);
    for (const role of ["AGENT", "ADMIN"]) {
      const actor = await db.user.create({ data: { clientId: f.client.id, name: "Synthetic", email: `${crypto.randomUUID()}@example.invalid`, role } });
      const session = await db.appAuthSession.create({ data: { clientId: f.client.id, userId: actor.id, expiresAt: buildAppAuthSessionExpiresAt() } });
      const response = await fetch(endpoint, { headers: { authorization: `Bearer ${issueClientAuthToken(actor, session.id)}` } });
      assert.equal(response.status, role === "AGENT" ? 403 : 200);
      if (role === "ADMIN") { const payload = await response.json() as any; assert.equal(payload.count, 1); assertSix(payload.items[0]); }
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("many list rows use bulk sources, no per-row detail or receipt reads", async () => {
  const f = await fixture();
  await db.campaign.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ clientId: f.client.id, name: `Synthetic page ${i}`, templateName: "synthetic", status: "draft", totalRecipients: 2 })) });
  const start = queries.length;
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  const observed = queries.slice(start);
  assert.equal(list.count, 32); assert(observed.length <= 8, String(observed.length));
  assert(!observed.some(query => query.includes('"Contact"') || query.includes('"Lead"')));
});
test("durable statuses override stale success counters in list, detail and aggregate", async () => {
  const f = await fixture();
  await db.campaign.update({ where: { id: f.child.id }, data: { sentCount: 0 } });
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  for (const item of list.items) assertSix(item);
  const detail = await buildCampaignDetailPayload(db, { clientId: f.client.id, campaignId: f.parent.id });
  assert.equal(detail!.campaign.executionBatch!.progress.sentCount, 6);
  assert.equal(detail!.campaign.executionBatch!.progress.pendingCount, 5);
  assertSix(detail!.campaign);
});
test("unmaterialized child has known planned audience without invented results", async () => {
  const f = await fixture();
  await db.outboundMessage.deleteMany({ where: { clientId: f.client.id } });
  await db.campaign.update({ where: { id: f.child.id }, data: { status: "scheduled", totalRecipients: 0, sentCount: 0 } });
  const list = await buildCampaignListPayload(db, { clientId: f.client.id, limit: 100 });
  for (const item of list.items) {
    assert.equal(item.totalRecipients, 11); assert.equal(item.materializedRecipientCount, 0);
    assert.equal(item.progress.pendingCount, 11); assert.equal(item.sentCount, 0);
    assert.equal(item.metaSummary.totalDelivered, 0); assert.equal(item.metaSummary.totalFailed, 0);
  }
  for (const campaignId of [f.child.id, f.parent.id]) {
    const detail = await buildCampaignDetailPayload(db, { clientId: f.client.id, campaignId });
    assert.equal(detail!.campaign.totalRecipients, 11); assert.equal(detail!.campaign.progress.pendingCount, 11);
    assert.equal(detail!.campaign.executionBatch!.chunks[0].totalRecipients, 0);
    assert.equal(detail!.campaign.executionBatch!.chunks[0].recipientCount, 11);
  }
});
