import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChannelPersistencePlan,
  summarizeChannelPersistencePlan,
} from "./channelPersistencePlan.js";
import { buildChannelRuntimeShadowPlan } from "./channelRuntimeShadowPlan.js";

test("WhatsApp persistence plan uses legacy strategy and is safe now", () => {
  const plan = buildChannelPersistencePlan(
    {
      tenantKey: "tenant-a",
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "phone-1",
      externalUserId: "558499999999",
      text: "mensagem nao deve aparecer",
      raw: { sensitive: true },
    },
    { id: "tenant-a" },
    { nowIso: "2026-01-01T12:00:00.000Z" }
  );

  assert.equal(plan.strategy, "legacy_whatsapp");
  assert.equal(plan.safeToPersistNow, true);
  assert.equal(plan.target.legacyWaId, "558499999999");
  assert.equal(plan.target.externalUserHash.length, 16);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.requiredSchemaChanges, undefined);
  assert.deepEqual(plan.wouldCreateOrUpdate, [
    "conversation",
    "runtime_state",
    "inbound_message",
    "lead",
    "contact",
  ]);
});

test("Messenger persistence plan requires multichannel schema before persistence", () => {
  const plan = buildChannelPersistencePlan(
    {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserId: "psid-user-1",
      text: "quero atendimento",
      raw: { object: "page" },
    },
    { id: "tenant-a" },
    { nowIso: "2026-01-01T12:00:00.000Z" }
  );

  assert.equal(plan.strategy, "new_multichannel_required");
  assert.equal(plan.safeToPersistNow, false);
  assert.equal("legacyWaId" in plan.target, false);
  assert.equal(plan.requiredSchemaChanges?.length, 6);
  assert.equal(plan.blockers.includes("schema_migration_required"), true);
  assert.equal(plan.blockers.includes("multichannel_persistence_not_implemented"), true);
  assert.equal(plan.requiredSchemaChanges?.some((item) => item.model === "Conversation"), true);
  assert.equal(plan.requiredSchemaChanges?.some((item) => item.model === "InboundMessage"), true);
  assert.equal(plan.requiredSchemaChanges?.some((item) => item.model === "ContactChannelIdentity"), true);
});

test("persistence plan does not leak external user id, text or raw payload for new channels", () => {
  const plan = buildChannelPersistencePlan(
    {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserId: "psid-sensitive-user",
      text: "texto bruto sensivel",
      raw: { psid: "psid-sensitive-user" },
    },
    { id: "tenant-a" }
  );
  const serialized = JSON.stringify(plan);

  assert.equal(serialized.includes("psid-sensitive-user"), false);
  assert.equal(serialized.includes("texto bruto sensivel"), false);
  assert.equal(serialized.includes("\"raw\""), false);
  assert.equal(serialized.includes("conversationKey"), false);
  assert.equal(plan.target.externalUserHash.length, 16);
});

test("persistence summary can be embedded in shadow plan without PII", () => {
  const persistencePlan = buildChannelPersistencePlan(
    {
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserId: "psid-user-2",
      text: "catalogo",
      raw: { raw: true },
    },
    { id: "tenant-a" }
  );
  const shadowPlan = buildChannelRuntimeShadowPlan({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    externalUserHash: persistencePlan.target.externalUserHash,
    resolution: "matched_enabled",
    gate: {
      allowed: true,
      reason: "runtime_allowed",
      outboundAllowed: false,
      aiAllowed: true,
      handoffAllowed: true,
    },
    qualificationEnabled: true,
    persistencePlanSummary: summarizeChannelPersistencePlan(persistencePlan),
  });
  const serialized = JSON.stringify(shadowPlan);

  assert.equal(shadowPlan.persistencePlanSummary?.strategy, "new_multichannel_required");
  assert.equal(shadowPlan.persistencePlanSummary?.safeToPersistNow, false);
  assert.equal(shadowPlan.persistencePlanSummary?.requiredSchemaChangeCount, 6);
  assert.equal(serialized.includes("psid-user-2"), false);
  assert.equal(serialized.includes("catalogo"), false);
  assert.equal(serialized.includes("\"raw\""), false);
  assert.equal(serialized.includes("conversationKey"), false);
});
