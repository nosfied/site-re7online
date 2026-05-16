import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWhatsAppShadowCompareReport } from "./whatsappShadowCompare.js";
import type { BackfillModelName, WhatsAppBackfillClient } from "./whatsappBackfillDryRun.js";
import type { WhatsAppBackfillExecutableRecord } from "./whatsappBackfillExecute.js";
import { hashWhatsAppExternalUser } from "./whatsappBackfillDryRun.js";

const client: WhatsAppBackfillClient = {
  id: "a2f9681b-5a5e-4945-a03d-2e635c45d071",
  clientKey: "tenant-a",
  phoneNumberIds: ["phone-1"],
};

function emptyRecords(): Record<BackfillModelName, WhatsAppBackfillExecutableRecord[]> {
  return {
    conversations: [],
    runtimeStates: [],
    inboundMessages: [],
    outboundMessages: [],
    leads: [],
    contacts: [],
  };
}

function record(
  patch: Partial<WhatsAppBackfillExecutableRecord> = {}
): WhatsAppBackfillExecutableRecord {
  const waId = "558499999999";
  return {
    model: "inboundMessages",
    id: "record-1",
    clientId: client.id,
    clientKey: client.clientKey,
    waId,
    phoneNumberId: "phone-1",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    externalUserHash: hashWhatsAppExternalUser(waId),
    externalUserRef: null,
    legacyWaId: waId,
    ...patch,
  };
}

test("matched records count as matched", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record());
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    nowIso: "2026-05-15T00:00:00.000Z",
  });

  assert.equal(report.ok, true);
  assert.equal(report.counts.checked, 1);
  assert.equal(report.counts.matched, 1);
  assert.equal(report.byModel.inboundMessages.matched, 1);
});

test("missing fields are reported without failing ok", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record({ channel: null, externalUserHash: null }));
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    includeSamples: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.counts.missing, 1);
  assert.deepEqual(report.samples[0]?.missingFields, ["channel", "externalUserHash"]);
});

test("mismatched fields make report not ok", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record({ provider: "other", channelAccountId: "other-phone" }));
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    includeSamples: true,
  });

  assert.equal(report.ok, false);
  assert.equal(report.counts.mismatched, 1);
  assert.deepEqual(report.samples[0]?.mismatchedFields, ["provider", "channelAccountId"]);
});

test("externalUserRef must remain empty", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record({ externalUserRef: "raw-ref" }));
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    includeSamples: true,
  });

  assert.equal(report.ok, false);
  assert.equal(report.counts.mismatched, 1);
  assert.deepEqual(report.samples[0]?.mismatchedFields, ["externalUserRef"]);
});

test("non-whatsapp records are ignored by whatsapp shadow compare", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record());
  records.inboundMessages.push(
    record({
      id: "messenger-record",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserHash: "messenger-hash",
      externalUserRef: "encrypted-ref",
      legacyWaId: null,
    })
  );
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    includeSamples: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.counts.checked, 1);
  assert.equal(report.counts.matched, 1);
  assert.equal(report.counts.mismatched, 0);
  assert.equal(report.byModel.inboundMessages.checked, 1);
});

test("report samples do not expose raw waId", () => {
  const records = emptyRecords();
  records.inboundMessages.push(record({ legacyWaId: null }));
  const report = buildWhatsAppShadowCompareReport({
    clients: [client],
    records,
    includeSamples: true,
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("558499999999"), false);
  assert.equal(serialized.includes("hash:"), true);
});
