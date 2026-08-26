import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrivateCampaignSeedFields,
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
