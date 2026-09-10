import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatbotFlowBuilder,
  createGuidedObjectiveDefinition,
  getChatbotNodeEditorSectionPlan,
  getChatbotNodeIssueSectionKeys,
  getGuidedNextTask,
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
  assert.match(html, /Próxima ação/);
  assert.match(html, /O que este fluxo deve fazer/);
  assert.match(html, /Como este fluxo funcionará/);
  assert.match(html, /Poderá escolher entre 1 opção/);
  assert.match(html, /Registro · Fila Geral/);
  assert.match(html, /Pode receber novas conversas/);
});

test("guided objective creates a direct human flow in the same definition model", () => {
  const definition = createGuidedObjectiveDefinition({ start: "", nodes: {} }, "handoff");

  assert.equal(definition.start, "handoff_1");
  assert.deepEqual(definition.nodes.handoff_1, {
    type: "handoff",
    text: "Vou encaminhar para atendimento humano.",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(definition, "wizardStep"), false);
});

test("new flow wizard asks for the objective before continuing with the default draft", () => {
  const definition = JSON.stringify({
    start: "menu_principal",
    nodes: {
      menu_principal: { type: "menu", text: "Escolha.", options: [{ label: "1 - Atendimento", next: "handoff" }] },
      handoff: { type: "handoff" },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      allowObjectiveReset: true,
      departments: [],
      queues: [],
      advancedEditor: React.createElement("textarea"),
    })
  );

  assert.match(html, /Escolha o objetivo inicial do fluxo/);
  assert.match(html, /Atendimento humano direto/);
  assert.match(html, /Menu de opções/);
});

test("guided objective creates a menu flow and asks for menu options next", () => {
  const definition = createGuidedObjectiveDefinition({ start: "", nodes: {} }, "menu");

  assert.equal(definition.start, "menu_1");
  assert.equal(definition.nodes.menu_1.type, "menu");
  assert.deepEqual(definition.nodes.menu_1.options, []);
  assert.equal(getGuidedNextTask(definition, []).kind, "menu_option");
});

test("guided next task requires destination for each menu option", () => {
  const task = getGuidedNextTask(
    {
      start: "menu",
      nodes: {
        menu: {
          type: "menu",
          text: "Escolha.",
          options: [
            { label: "1 - Registro", next: "handoff" },
            { label: "2 - Fiscalização", next: "" },
          ],
        },
        handoff: { type: "handoff", departmentId: "dep" },
      },
    },
    []
  );

  assert.equal(task.kind, "menu_option_destination");
  assert.equal("optionIndex" in task ? task.optionIndex : -1, 1);
});

test("guided next task supports menu to submenu to human paths", () => {
  const task = getGuidedNextTask(
    {
      start: "menu",
      nodes: {
        menu: { type: "menu", text: "Escolha.", options: [{ label: "1 - Registro", next: "submenu" }] },
        submenu: { type: "menu", text: "Registro:", options: [{ label: "1 - Pessoa Física", next: "handoff" }] },
        handoff: { type: "handoff", departmentId: "dep" },
      },
    },
    []
  );

  assert.equal(task.kind, "review");
});

test("guided objective creates consent before a human destination", () => {
  const definition = createGuidedObjectiveDefinition({ start: "", nodes: {} }, "consent");

  assert.equal(definition.nodes.consent_1.type, "consent");
  assert.equal(definition.nodes.consent_1.onAccepted, "handoff_2");
  assert.equal(definition.nodes.handoff_2.type, "handoff");
  assert.equal(getGuidedNextTask(definition, []).kind, "handoff_destination");
});

test("guided objective creates capture before a human destination", () => {
  const definition = createGuidedObjectiveDefinition({ start: "", nodes: {} }, "capture");

  assert.equal(definition.nodes.capture_1.type, "capture");
  assert.equal(definition.nodes.capture_1.field, "resposta");
  assert.equal(definition.nodes.capture_1.next, "handoff_2");
});

test("guided objective creates a text message without adding wizard metadata", () => {
  const definition = createGuidedObjectiveDefinition({ start: "", nodes: {} }, "text");

  assert.equal(definition.start, "text_1");
  assert.equal(definition.nodes.text_1.type, "text");
  assert.equal(Object.prototype.hasOwnProperty.call(definition, "objective"), false);
});

test("guided next task preserves changed destinations as orphaned nodes instead of deleting them", () => {
  const task = getGuidedNextTask(
    {
      start: "menu",
      nodes: {
        menu: { type: "menu", text: "Escolha.", options: [{ label: "1 - Novo destino", next: "handoff_new" }] },
        handoff_old: { type: "handoff", departmentId: "dep" },
        handoff_new: { type: "handoff", departmentId: "dep" },
      },
    },
    []
  );

  assert.equal(task.kind, "orphan");
  assert.equal("nodeId" in task ? task.nodeId : "", "handoff_old");
});

test("guided and advanced modes render from the same draft without conversion fields", () => {
  const definition = JSON.stringify({
    start: "handoff",
    nodes: {
      handoff: { type: "handoff", departmentId: "dep" },
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => undefined,
      departments: [{ id: "dep", name: "Geral" }],
      queues: [],
      advancedEditor: React.createElement("textarea", { defaultValue: definition }),
    })
  );

  assert.match(html, /Ajustes avançados do fluxo/);
  assert.doesNotMatch(html, /wizardStep/);
  assert.doesNotMatch(html, /templateType/);
});

test("existing Syer-style direct handoff is interpreted without requiring objective reset", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: JSON.stringify({
        start: "handoff",
        nodes: {
          handoff: { type: "handoff", text: "Vamos atender você.", departmentId: "dep" },
        },
      }),
      onDefinitionTextChange: () => undefined,
      departments: [{ id: "dep", name: "Atendimento" }],
      queues: [],
      advancedEditor: React.createElement("textarea"),
    })
  );

  assert.match(html, /Encaminhar direto para atendimento humano/);
  assert.match(html, /Atendimento · Fila padrão/);
});

test("existing CRA-style complex flow is interpreted with advanced metadata preserved", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: JSON.stringify({
        start: "consent",
        metadata: { source: "customer-validation" },
        nodes: {
          consent: {
            type: "consent",
            purpose: "atendimento",
            textVersion: "v1",
            message: "Para prosseguir, digite 1.",
            acceptOption: "1",
            onAccepted: "menu",
          },
          menu: { type: "menu", text: "Menu principal", options: [{ label: "1 - Registro", next: "registro" }] },
          registro: { type: "menu", text: "Registro", options: [{ label: "1 - Pessoa Física", next: "handoff" }] },
          handoff: { type: "handoff", departmentId: "dep" },
        },
      }),
      onDefinitionTextChange: () => undefined,
      departments: [{ id: "dep", name: "Registro" }],
      queues: [],
      advancedEditor: React.createElement("textarea"),
    })
  );

  assert.match(html, /Solicitar consentimento antes de continuar/);
  assert.match(html, /Registro/);
  assert.match(html, /Este fluxo possui configurações avançadas preservadas/);
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
