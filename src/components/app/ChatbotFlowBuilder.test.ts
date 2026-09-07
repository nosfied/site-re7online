import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatbotFlowBuilder,
  getChatbotNodeEditorSectionPlan,
  getChatbotNodeIssueSectionKeys,
} from "./ChatbotFlowBuilder";

test("menu nodes expose primary sections and keep secondary sections collapsed by default", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("menu"), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "destination", defaultExpanded: false },
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

test("capture nodes keep secondary validation and next-step sections collapsed by default", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("capture"), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "next", defaultExpanded: false },
    { key: "capture", defaultExpanded: false },
  ]);
});

test("issue-bearing nodes expand only the affected sections", () => {
  const issueSections = getChatbotNodeIssueSectionKeys("menu", "menu_principal", [
    'A opção 1 da etapa "menu_principal" precisa de destino.',
  ]);

  assert.deepEqual(issueSections, ["options"]);
  assert.deepEqual(getChatbotNodeEditorSectionPlan("menu", issueSections), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "destination", defaultExpanded: false },
    { key: "options", defaultExpanded: true },
    { key: "fallback", defaultExpanded: false },
  ]);
});

test("node issues map missing destination to the destination section", () => {
  assert.deepEqual(
    getChatbotNodeIssueSectionKeys("handoff", "handoff", ['A etapa "handoff" encaminha para humano sem setor definido.']),
    ["destination"]
  );
});

test("unknown node types preserve the existing text-node editing path", () => {
  assert.deepEqual(getChatbotNodeEditorSectionPlan("unknown"), [
    { key: "identity", defaultExpanded: true },
    { key: "message", defaultExpanded: true },
    { key: "next", defaultExpanded: false },
  ]);
});

test("builder renders collapsed sections with aria state and preserves hidden values", () => {
  const definition = JSON.stringify({
    start: "capture_email",
    nodes: {
      capture_email: {
        type: "capture",
        text: "Informe seu e-mail.",
        field: "email",
        validation: "email",
        next: "",
      },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      departments: [],
      queues: [],
      advancedEditor: React.createElement("textarea"),
    })
  );

  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Coleta e validação/);
  assert.match(html, /email/);
});
