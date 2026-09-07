import assert from "node:assert/strict";
import test from "node:test";
import { getChatbotNodeEditorSectionPlan } from "./ChatbotFlowBuilder";

test("menu nodes expose primary sections and keep fallback collapsed by default", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("menu"), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "destination", defaultExpanded: true },
    { key: "options", defaultExpanded: true },
    { key: "fallback", defaultExpanded: false },
  ]);
});

test("handoff nodes keep routing and feedback visible by default", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("handoff"), [
    { key: "identity", defaultExpanded: true },
    { key: "handoffMessage", defaultExpanded: true },
    { key: "destination", defaultExpanded: true },
  ]);
});

test("issue-bearing nodes expand every section so validation remains visible", () => {
  assert.equal(
    getChatbotNodeEditorSectionPlan("menu", true).every((section) => section.defaultExpanded),
    true
  );
});

test("unknown node types preserve the existing text-node editing path", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("unknown"), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "next", defaultExpanded: true },
  ]);
});
