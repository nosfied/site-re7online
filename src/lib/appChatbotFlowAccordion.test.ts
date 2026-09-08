import assert from "node:assert/strict";
import test from "node:test";
import {
  getExistingFlowDefaultExpanded,
  getFlowNodeCountFromDefinitionText,
  getNewFlowDefaultExpanded,
} from "./appChatbotFlowAccordion";

test("new flow starts collapsed", () => {
  assert.equal(getNewFlowDefaultExpanded(), false);
});

test("existing flows start collapsed regardless of active or entrypoint state", () => {
  assert.equal(getExistingFlowDefaultExpanded(), false);
});

test("active and entrypoint metadata does not change initial collapsed state", () => {
  const metadata = [
    { isActive: false, entryPoint: true },
    { isActive: true, entryPoint: false },
    { isActive: true, entryPoint: true },
  ];
  for (const item of metadata) {
    assert.equal(Boolean(item.isActive || item.entryPoint), true);
    assert.equal(getExistingFlowDefaultExpanded(), false);
  }
});

test("counts nodes from valid flow definition text", () => {
  assert.equal(getFlowNodeCountFromDefinitionText(JSON.stringify({ nodes: { start: {}, handoff: {} } })), 2);
});

test("returns null for invalid flow definition text", () => {
  assert.equal(getFlowNodeCountFromDefinitionText("{"), null);
  assert.equal(getFlowNodeCountFromDefinitionText(JSON.stringify({ nodes: [] })), null);
});
