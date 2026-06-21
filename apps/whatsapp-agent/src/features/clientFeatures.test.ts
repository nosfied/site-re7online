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
});

test("knowledgeBase can be enabled by tenant feature override", () => {
  const client = { profile: "business", features: { knowledgeBase: true } };
  assert.equal(getFeatures(client).knowledgeBase, true);
  assert.equal(hasFeature(client, "knowledgeBase"), true);
});

test("scheduling can be enabled by tenant feature override", () => {
  const client = { profile: "government", features: { scheduling: true } };
  assert.equal(getFeatures(client).scheduling, true);
  assert.equal(hasFeature(client, "scheduling"), true);
});
