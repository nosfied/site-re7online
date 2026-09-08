import assert from "node:assert/strict";
import test from "node:test";
import {
  getExistingFlowDefaultExpanded,
  getFlowNodeCountFromDefinitionText,
  getNewFlowDefaultExpanded,
} from "./appChatbotFlowAccordion";

test("new flow starts collapsed when existing flows are available", () => {
  assert.equal(getNewFlowDefaultExpanded(2), false);
});

test("new flow starts expanded when no flow exists", () => {
  assert.equal(getNewFlowDefaultExpanded(0), true);
});

test("entrypoint or active existing flows start expanded", () => {
  assert.equal(getExistingFlowDefaultExpanded({ isActive: false, entryPoint: true }), true);
  assert.equal(getExistingFlowDefaultExpanded({ isActive: true, entryPoint: false }), true);
});

test("inactive non-entrypoint existing flows start collapsed", () => {
  assert.equal(getExistingFlowDefaultExpanded({ isActive: false, entryPoint: false }), false);
});

test("counts nodes from valid flow definition text", () => {
  assert.equal(getFlowNodeCountFromDefinitionText(JSON.stringify({ nodes: { start: {}, handoff: {} } })), 2);
});

test("returns null for invalid flow definition text", () => {
  assert.equal(getFlowNodeCountFromDefinitionText("{"), null);
  assert.equal(getFlowNodeCountFromDefinitionText(JSON.stringify({ nodes: [] })), null);
});
