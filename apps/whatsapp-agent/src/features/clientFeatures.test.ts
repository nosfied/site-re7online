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
  assert.equal(getFeatures({ profile: "business" }).schedulingConfirmation, false);
  assert.equal(getFeatures({ profile: "government" }).schedulingConfirmation, false);
});

test("satisfaction is disabled by default for controlled rollout", () => {
  assert.equal(getFeatures({ profile: "business" }).satisfaction, false);
  assert.equal(getFeatures({ profile: "government" }).satisfaction, false);
});

test("knowledgeBase can be enabled by tenant feature override", () => {
  const client = { profile: "business", features: { knowledgeBase: true } };
  assert.equal(getFeatures(client).knowledgeBase, true);
  assert.equal(hasFeature(client, "knowledgeBase"), true);
});

test("scheduling can be enabled by tenant feature override", () => {
  const client = {
    profile: "government",
    features: { scheduling: true, schedulingReminders: true, schedulingConfirmation: true },
  };
  assert.equal(getFeatures(client).scheduling, true);
  assert.equal(getFeatures(client).schedulingReminders, true);
  assert.equal(getFeatures(client).schedulingConfirmation, true);
  assert.equal(hasFeature(client, "scheduling"), true);
  assert.equal(hasFeature(client, "schedulingReminders"), true);
  assert.equal(hasFeature(client, "schedulingConfirmation"), true);
});

test("satisfaction can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { satisfaction: true } };
  assert.equal(getFeatures(client).satisfaction, true);
  assert.equal(hasFeature(client, "satisfaction"), true);
});
