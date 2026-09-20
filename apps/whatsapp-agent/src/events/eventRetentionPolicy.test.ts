import test from "node:test";
import assert from "node:assert/strict";
import { classifyEventRetentionPolicy } from "./eventRetentionPolicy.js";

test("classifyEventRetentionPolicy preserves privacy and handoff audit events", () => {
  assert.equal(classifyEventRetentionPolicy("conversation.anonymized"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("privacy.subject.anonymized"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("privacy.retention.started"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("retention.executed"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("handoff.lead_notification.sent"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("assignment.changed"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("auth.login"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("auth.logout"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("auth.session_replaced"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("auth.session_renewed"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("auth.session_expired"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("ai.orchestrator.handoff_activated"), "CRITICAL");
  assert.equal(classifyEventRetentionPolicy("events.retention.compacted"), "CRITICAL");
});

test("classifyEventRetentionPolicy separates operational events", () => {
  assert.equal(classifyEventRetentionPolicy("ai.assistant.responded"), "OPERATIONAL");
  assert.equal(classifyEventRetentionPolicy("flow.handoff.summary.created"), "OPERATIONAL");
  assert.equal(classifyEventRetentionPolicy("followup.triggered"), "OPERATIONAL");
  assert.equal(classifyEventRetentionPolicy("campaign.message.sent"), "OPERATIONAL");
  assert.equal(classifyEventRetentionPolicy("template.sent"), "OPERATIONAL");
  assert.equal(classifyEventRetentionPolicy("unknown.business.event"), "OPERATIONAL");
});

test("classifyEventRetentionPolicy identifies repetitive noise events", () => {
  assert.equal(classifyEventRetentionPolicy("webhook.status.received"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("polling.refresh"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("realtime.connected"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("typing.started"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("websocket.ping"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("duplicate.warning"), "NOISE");
  assert.equal(classifyEventRetentionPolicy("allowlist.check"), "NOISE");
});
