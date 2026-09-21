import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrivateCampaignSeedFields,
  removeCampaignSeedSubjectReferences,
  readPrivateCampaignSeedFields,
} from "./campaignSeedPrivacy.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaign-seed-privacy-test-secret";

test("campaign seed stores recipients privately and rehydrates runtime data", () => {
  const clientId = "0f4f074d-4ffd-41f5-ae3f-8cd8bc67d100";
  const waId = "5541991100002";
  const fields = buildPrivateCampaignSeedFields({
    clientId,
    waIds: ["5541991100001", waId],
    componentsByWaId: {
      [waId]: [{ type: "body", parameters: [{ type: "text", text: "Maria" }] }],
    },
  });

  assert.deepEqual(fields.recipients, []);
  assert.equal(JSON.stringify(fields).includes("5541991100001"), false);
  assert.equal(JSON.stringify(fields).includes(waId), false);
  assert.equal(fields.recipientCount, 2);
  assert.ok(fields.recipientsCiphertext);
  assert.ok(fields.componentsByWaIdCiphertext);

  const parsed = readPrivateCampaignSeedFields(fields);
  assert.deepEqual(parsed.recipients, ["5541991100001", waId]);
  assert.deepEqual(parsed.componentsByWaId?.[waId], [
    { type: "body", parameters: [{ type: "text", text: "Maria" }] },
  ]);
});

test("campaign seed parser remains compatible with legacy raw seed events", () => {
  const parsed = readPrivateCampaignSeedFields({
    recipients: ["5541991100001"],
    componentsByWaId: {
      "5541991100001": [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }],
    },
  });

  assert.deepEqual(parsed.recipients, ["5541991100001"]);
  assert.deepEqual(parsed.componentsByWaId?.["5541991100001"], [
    { type: "body", parameters: [{ type: "text", text: "Ana" }] },
  ]);
});

test("campaign seed subject unlinking removes only matching recipient private references", () => {
  const clientId = "0f4f074d-4ffd-41f5-ae3f-8cd8bc67d100";
  const subject = "558494784366";
  const unrelated = "558499990001";
  const fields = buildPrivateCampaignSeedFields({
    clientId,
    waIds: [subject, unrelated],
    componentsByWaId: {
      [subject]: [{ type: "body", parameters: [{ type: "text", text: "Titular" }] }],
      [unrelated]: [{ type: "body", parameters: [{ type: "text", text: "Outro" }] }],
    },
  });
  const result = removeCampaignSeedSubjectReferences({
    clientId,
    payload: {
      campaignId: "campaign-1",
      leadIds: ["lead-subject", "lead-other"],
      ...fields,
    },
    identityCandidates: [subject],
    leadIds: ["lead-subject"],
  });

  assert.equal(result.changed, true);
  assert.equal(result.removedRecipients, 1);
  assert.equal(result.removedRecipientRefs, 1);
  assert.equal(result.removedComponents, 1);
  assert.equal(result.removedLeadIds, 1);
  assert.equal(JSON.stringify(result.payload).includes(subject), false);
  assert.equal(JSON.stringify(result.payload).includes("lead-subject"), false);
  const parsed = readPrivateCampaignSeedFields(result.payload);
  assert.deepEqual(parsed.recipients, [unrelated]);
  assert.deepEqual(parsed.componentsByWaId?.[unrelated], [
    { type: "body", parameters: [{ type: "text", text: "Outro" }] },
  ]);
  assert.deepEqual((result.payload as { leadIds?: string[] }).leadIds, ["lead-other"]);
});
