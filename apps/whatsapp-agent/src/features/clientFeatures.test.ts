import test from "node:test";
import assert from "node:assert/strict";
import { getFeatures, hasFeature } from "./clientFeatures.js";

test("knowledgeBase is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).knowledgeBase, false);
  assert.equal(getFeatures({ profile: "government" }).knowledgeBase, false);
});

test("scheduling is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).scheduling, false);
  assert.equal(getFeatures({ profile: "government" }).scheduling, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingReminders, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingReminders, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingRemindersShadow, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingRemindersShadow, false);
  assert.equal(getFeatures({ profile: "business" }).schedulingConfirmation, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingConfirmation, false);
});

test("satisfaction is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).satisfaction, false);
  assert.equal(getFeatures({ profile: "government" }).satisfaction, false);
});

test("webchat is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).webchat, false);
  assert.equal(getFeatures({ profile: "government" }).webchat, false);
  assert.equal(getFeatures({ profile: "business" }).webchatOutbound, false);
  assert.equal(getFeatures({ profile: "government" }).webchatOutbound, false);
});

test("webhooks is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).webhooks, false);
  assert.equal(getFeatures({ profile: "government" }).webhooks, false);
  assert.equal(getFeatures({ profile: "business" }).webhookDispatch, false);
  assert.equal(getFeatures({ profile: "government" }).webhookDispatch, false);
  assert.equal(getFeatures({ profile: "business" }).webhookDispatchExecute, false);
  assert.equal(getFeatures({ profile: "government" }).webhookDispatchExecute, false);
});

test("knowledgeBase can be enabled by tenant feature override", () => {
  const client = { profile: "business", features: { knowledgeBase: true } };
  assert.equal(getFeatures(client).knowledgeBase, true);
  assert.equal(hasFeature(client, "knowledgeBase"), true);
});

test("scheduling can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: {
      scheduling: true,
      schedulingReminders: true,
      schedulingRemindersShadow: true,
      schedulingConfirmation: true,
    },
  };
  assert.equal(getFeatures(client).scheduling, true);
  assert.equal(getFeatures(client).schedulingReminders, true);
  assert.equal(getFeatures(client).schedulingRemindersShadow, true);
  assert.equal(getFeatures(client).schedulingConfirmation, true);
  assert.equal(hasFeature(client, "scheduling"), true);
  assert.equal(hasFeature(client, "schedulingReminders"), true);
  assert.equal(hasFeature(client, "schedulingRemindersShadow"), true);
  assert.equal(hasFeature(client, "schedulingConfirmation"), true);
});

test("satisfaction can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { satisfaction: true } };
  assert.equal(getFeatures(client).satisfaction, true);
  assert.equal(hasFeature(client, "satisfaction"), true);
});

test("webchat can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { webchat: true, webchatOutbound: true } };
  assert.equal(getFeatures(client).webchat, true);
  assert.equal(getFeatures(client).webchatOutbound, true);
  assert.equal(hasFeature(client, "webchat"), true);
  assert.equal(hasFeature(client, "webchatOutbound"), true);
});

test("webhooks can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { webhooks: true, webhookDispatch: true, webhookDispatchExecute: true },
  };
  assert.equal(getFeatures(client).webhooks, true);
  assert.equal(getFeatures(client).webhookDispatch, true);
  assert.equal(getFeatures(client).webhookDispatchExecute, true);
  assert.equal(hasFeature(client, "webhooks"), true);
  assert.equal(hasFeature(client, "webhookDispatch"), true);
  assert.equal(hasFeature(client, "webhookDispatchExecute"), true);
});
