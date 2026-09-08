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

test("guided builder renders business stepper and activation review from the same draft", () => {
  const definition = JSON.stringify({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha uma opção:",
        options: [{ label: "1 - Registro", next: "handoff_registro" }],
      },
      handoff_registro: {
        type: "handoff",
        text: "Vou encaminhar para Registro.",
        departmentId: "dep_registro",
        queueId: "queue_registro",
      },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      isActive: true,
      entryPoint: true,
      departments: [{ id: "dep_registro", name: "Registro" }],
      queues: [{ id: "queue_registro", name: "Fila Geral", departmentId: "dep_registro" }],
      advancedEditor: React.createElement("textarea", { defaultValue: definition }),
    })
  );

  assert.match(html, /Passo 1/);
  assert.match(html, /Passo 9/);
  assert.match(html, /O que este fluxo deve fazer/);
  assert.match(html, /Como este fluxo funcionará/);
  assert.match(html, /Poderá escolher entre 1 opção/);
  assert.match(html, /Registro · Fila Geral/);
  assert.match(html, /Pode receber novas conversas/);
});

test("guided builder explains consent, capture and handoff paths without requiring raw ids", () => {
  const definition = JSON.stringify({
    start: "consent",
    nodes: {
      consent: {
        type: "consent",
        purpose: "atendimento",
        textVersion: "2026-09",
        message: "Confirme o consentimento.",
        acceptOption: "1",
        onAccepted: "capture_email",
      },
      capture_email: {
        type: "capture",
        text: "Informe seu e-mail.",
        field: "email",
        validation: "email",
        next: "handoff",
      },
      handoff: {
        type: "handoff",
        departmentId: "dep",
      },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      departments: [{ id: "dep", name: "Dúvidas Gerais" }],
      queues: [],
      advancedEditor: React.createElement("textarea", { defaultValue: definition }),
    })
  );

  assert.match(html, /Solicitar consentimento antes de continuar/);
  assert.match(html, /Confirme o consentimento/);
  assert.match(html, /Informe seu e-mail/);
  assert.match(html, /HUMANO → Dúvidas Gerais · Fila padrão/);
});

test("guided builder surfaces checklist errors and preserved advanced settings", () => {
  const definition = JSON.stringify({
    start: "menu",
    nodes: {
      menu: {
        type: "menu",
        text: "Escolha.",
        options: [{ label: "1 - Financeiro", next: "handoff_inexistente" }],
        context: { area: "financeiro" },
      },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      departments: [],
      queues: [],
      advancedEditor: React.createElement("textarea", { defaultValue: definition }),
    })
  );

  assert.match(html, /Este fluxo possui configurações avançadas preservadas/);
  assert.match(html, /Referências válidas/);
  assert.match(html, /ERROR/);
  assert.match(html, /Revise antes de ativar ou salvar como entrada principal/);
});
