import test from "node:test";
import assert from "node:assert/strict";
import { resolveMessagesArea } from "./messagesInformationArchitecture";

test("messages area defaults to canned replies when both features are enabled", () => {
  assert.equal(resolveMessagesArea(null, { cannedReplies: true, templates: true }), "canned-replies");
});

test("messages area renders the only enabled feature without a disabled default", () => {
  assert.equal(resolveMessagesArea(null, { cannedReplies: true, templates: false }), "canned-replies");
  assert.equal(resolveMessagesArea(null, { cannedReplies: false, templates: true }), "meta-templates");
});

test("messages area preserves valid deep links and falls back from disabled tabs", () => {
  assert.equal(resolveMessagesArea("meta-templates", { cannedReplies: true, templates: true }), "meta-templates");
  assert.equal(resolveMessagesArea("canned-replies", { cannedReplies: false, templates: true }), "meta-templates");
  assert.equal(resolveMessagesArea("meta-templates", { cannedReplies: true, templates: false }), "canned-replies");
});

test("messages area returns unavailable when both features are disabled", () => {
  assert.equal(resolveMessagesArea(null, { cannedReplies: false, templates: false }), null);
  assert.equal(resolveMessagesArea("meta-templates", { cannedReplies: false, templates: false }), null);
});
