import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildDirectHandoffFlow,
  buildInformationFlow,
  buildInstitutionalMenuFlow,
  buildPreServiceCaptureFlow,
  buildStandardFlowDefinition,
  cancelWizardSubmenuCreation,
  ChatbotFlowBuilder,
  createDefaultSubmenuDraft,
  createDefaultWizardAnswers,
  createGuidedObjectiveDefinition,
  getChatbotNodeEditorSectionPlan,
  getChatbotNodeIssueSectionKeys,
  getGuidedQueueUxState,
  getStandardFlowWizardStepKeys,
  getGuidedNextTask,
  getWizardExpansionKeyAfterOptionDelete,
  getWizardFocusTargetAfterOptionDelete,
  getWizardDestinationTypeOptions,
  getWizardQuestionChainDepth,
  getWizardQuestionNextTypeOptions,
  getWizardScrollContract,
  removeWizardMenuOption,
  validateWizardStep,
  wizardOptionRequiresDestructiveConfirmation,
  wizardMenuLevelTone,
  wizardSubmenuHasConfiguredChildren,
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

test("existing flow overview keeps editable data behind explicit actions", () => {
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Este fluxo já possui uma estrutura/);
  assert.match(html, /Editar etapas simples/);
  assert.match(html, /Modo avançado/);
  assert.match(html, /Coletar uma informação/);
  assert.doesNotMatch(html, /Passo 1/);
});

test("existing flow guided mode renders a safe summary instead of forcing a template", () => {
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Etapas/);
  assert.match(html, /Menus/);
  assert.match(html, /Encaminhamentos/);
  assert.match(html, /Apresentar um menu de opções/);
  assert.match(html, /Revisar jornada/);
  assert.match(html, /Editar etapas simples/);
  assert.match(html, /Modo avançado/);
  assert.doesNotMatch(html, /O que você quer criar/);
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

test("new flow wizard starts with business templates before asking technical fields", () => {
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

  assert.match(html, /Criador guiado/);
  assert.match(html, /O que você quer criar/);
  assert.match(html, /Atendimento institucional com menu/);
  assert.match(html, /Encaminhamento direto/);
  assert.match(html, /Coleta antes do atendimento/);
  assert.match(html, /Mensagem informativa/);
  assert.match(html, /Fluxo em branco \/ avançado/);
  assert.match(html, /Usar este modelo/);
  assert.match(html, /Abrir editor avançado/);
  assert.doesNotMatch(html, /Escolha o objetivo inicial do fluxo/);
  assert.doesNotMatch(html, /Entrada principal/);
  assert.doesNotMatch(html, />Ativo</);
});

test("institutional menu wizard starts with consent before main menu content", () => {
  const answers = { ...createDefaultWizardAnswers(), template: "institutional_menu" as const };

  assert.deepEqual(getStandardFlowWizardStepKeys(answers).slice(0, 3), ["consent", "initial", "options"]);
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

test("existing flow guided overview does not inject conversion metadata", () => {
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Modo avançado/);
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Encaminhar direto para atendimento humano/);
  assert.match(html, /Encaminhamentos/);
  assert.doesNotMatch(html, /O que você quer criar/);
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Etapas/);
  assert.match(html, /Menus/);
  assert.match(html, /Encaminhamentos/);
  assert.match(html, /Avançada/);
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Solicitar consentimento antes de continuar/);
  assert.match(html, /Encaminhamentos/);
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

  assert.match(html, /Fluxo existente/);
  assert.match(html, /Avançada/);
  assert.match(html, /Modo avançado/);
});

test("standard institutional menu generator creates one real menu path per business option", () => {
  const definition = buildInstitutionalMenuFlow({
    template: "institutional_menu",
    initialMessage: "Escolha uma área.",
    consentEnabled: true,
    consentMessage: "Aceite o atendimento.",
    consentAcceptOption: "1",
    consentDeclineMessage: "Encerrado.",
    menuOptions: ["Registro", "Fiscalização"],
    destinations: {
      0: { type: "department", departmentId: "dep_registro", queueId: "queue_registro" },
      1: { type: "message", message: "Procure a fiscalização." },
    },
    submenus: {},
    invalidOptionText: "Opção inválida.",
    businessHoursEnabled: "later",
    handoffMessageMode: "standard",
    handoffMessage: "Vou transferir.",
    captureQuestions: ["Informe o protocolo."],
    informationNext: "end",
    followupMessage: "Obrigado.",
  });

  assert.equal(definition.start, "consentimento");
  assert.equal(definition.nodes.consentimento.type, "consent");
  assert.equal(definition.nodes.consentimento.onAccepted, "menu_principal");
  assert.equal(definition.nodes.menu_principal.type, "menu");
  assert.equal(definition.nodes.menu_principal.text, "Escolha uma área.");
  assert.equal(definition.nodes.menu_principal.fallbackText, "Opção inválida.");
  assert.deepEqual(definition.nodes.menu_principal.options, [
    { label: "1 - Registro", next: "atendimento_registro" },
    { label: "2 - Fiscalização", next: "mensagem_fiscalizacao" },
  ]);
  assert.equal(definition.nodes.atendimento_registro.type, "handoff");
  assert.equal(definition.nodes.atendimento_registro.departmentId, "dep_registro");
  assert.equal(definition.nodes.atendimento_registro.queueId, "queue_registro");
  assert.equal(definition.nodes.mensagem_fiscalizacao.text, "Procure a fiscalização.");
});

test("standard institutional menu generator creates nested submenus with navigation options", () => {
  const definition = buildInstitutionalMenuFlow({
    template: "institutional_menu",
    initialMessage: "Menu principal",
    consentEnabled: false,
    consentMessage: "",
    consentAcceptOption: "1",
    consentDeclineMessage: "",
    menuOptions: ["Registro", "Financeiro", "Suporte"],
    destinations: {
      0: { type: "submenu", submenuKey: "0" },
      1: { type: "department", departmentId: "dep_financeiro" },
      2: { type: "department", departmentId: "dep_suporte" },
    },
    submenus: {
      "0": {
        title: "Registro",
        options: ["Registro PF", "Registro PJ"],
        destinations: {
          0: { type: "submenu", submenuKey: "0.0" },
          1: { type: "department", departmentId: "dep_registro" },
        },
        enablePreviousMenu: true,
        enableMainMenu: true,
      },
      "0.0": {
        title: "Registro PF",
        options: ["Novo Registro", "Cancelamento"],
        destinations: {
          0: { type: "department", departmentId: "dep_registro" },
          1: { type: "message", message: "Oriente o cancelamento." },
        },
        enablePreviousMenu: true,
        enableMainMenu: true,
      },
    },
    invalidOptionText: "Opção inválida.",
    businessHoursEnabled: "later",
    handoffMessageMode: "standard",
    handoffMessage: "",
    captureQuestions: [],
    informationNext: "end",
    followupMessage: "",
  });

  assert.equal(definition.nodes.menu_principal.type, "menu");
  assert.deepEqual(definition.nodes.menu_principal.options, [
    { label: "1 - Registro", next: "submenu_registro" },
    { label: "2 - Financeiro", next: "atendimento_financeiro" },
    { label: "3 - Suporte", next: "atendimento_suporte" },
  ]);
  assert.equal(definition.nodes.submenu_registro.type, "menu");
  assert.deepEqual(definition.nodes.submenu_registro.options, [
    { label: "1 - Registro PF", next: "submenu_registro_pf" },
    { label: "2 - Registro PJ", next: "atendimento_registro_pj" },
    { label: "9 - Voltar ao Menu Anterior", next: "menu_principal" },
    { label: "0 - Voltar ao Menu Principal", next: "menu_principal" },
  ]);
  assert.deepEqual(definition.nodes.submenu_registro_pf.options, [
    { label: "1 - Novo Registro", next: "atendimento_novo_registro" },
    { label: "2 - Cancelamento", next: "mensagem_cancelamento" },
    { label: "9 - Voltar ao Menu Anterior", next: "submenu_registro" },
    { label: "0 - Voltar ao Menu Principal", next: "menu_principal" },
  ]);
});

test("direct handoff generator keeps one configured human destination", () => {
  const definition = buildDirectHandoffFlow({
    template: "direct_handoff",
    initialMessage: "Vamos encaminhar você.",
    consentEnabled: false,
    consentMessage: "",
    consentAcceptOption: "1",
    consentDeclineMessage: "",
    menuOptions: [],
    destinations: { 0: { type: "queue", departmentId: "dep", queueId: "queue" } },
    submenus: {},
    invalidOptionText: "",
    businessHoursEnabled: "later",
    handoffMessageMode: "custom",
    handoffMessage: "Transferindo.",
    captureQuestions: [],
    informationNext: "end",
    followupMessage: "",
  });

  assert.equal(definition.start, "atendimento_humano");
  assert.equal(definition.nodes.atendimento_humano.type, "handoff");
  assert.equal(definition.nodes.atendimento_humano.text, "Vamos encaminhar você.");
  assert.equal(definition.nodes.atendimento_humano.departmentId, "dep");
  assert.equal(definition.nodes.atendimento_humano.queueId, "queue");
});

test("guided destination validation resolves only the explicit internal queue projection", () => {
  const answers = {
    ...createDefaultWizardAnswers(),
    template: "direct_handoff" as const,
    destinations: { 0: { type: "department" as const, departmentId: "dep_syer" } },
  };

  assert.deepEqual(
    validateWizardStep(answers, "destination", [{ id: "queue_geral", name: "Fila Geral", departmentId: "dep_syer" }]),
    []
  );
  assert.deepEqual(
    validateWizardStep(answers, "destination", [
      { id: "queue_geral", name: "Fila Geral", departmentId: "dep_syer" },
      { id: "queue_atendimento", name: "Fila Atendimento", departmentId: "dep_syer" },
    ]),
    ["Este setor ainda não está disponível para receber atendimentos."]
  );
  assert.deepEqual(
    validateWizardStep({ ...answers, destinations: { 0: { ...answers.destinations[0], queueId: "queue_geral" } } }, "destination", [
      { id: "queue_geral", name: "Fila Geral", departmentId: "dep_syer" },
    ]),
    []
  );
  assert.deepEqual(
    validateWizardStep(answers, "destination", []),
    ["Este setor ainda não está disponível para receber atendimentos."]
  );
});

test("pre-service capture generator chains questions before human routing", () => {
  const definition = buildPreServiceCaptureFlow({
    template: "pre_service_collection",
    initialMessage: "Informe seu nome.",
    consentEnabled: false,
    consentMessage: "",
    consentAcceptOption: "1",
    consentDeclineMessage: "",
    menuOptions: [],
    destinations: { 0: { type: "department", departmentId: "dep" } },
    submenus: {},
    invalidOptionText: "",
    businessHoursEnabled: "later",
    handoffMessageMode: "none",
    handoffMessage: "",
    captureQuestions: ["Informe seu nome.", "Informe seu protocolo."],
    informationNext: "end",
    followupMessage: "",
  });

  assert.equal(definition.start, "pergunta_1");
  assert.equal(definition.nodes.pergunta_1.type, "capture");
  assert.equal(definition.nodes.pergunta_1.next, "pergunta_2");
  assert.equal(definition.nodes.pergunta_2.next, "atendimento_humano");
  assert.equal(definition.nodes.atendimento_humano.type, "handoff");
  assert.equal(definition.nodes.atendimento_humano.sendFeedback, false);
  assert.equal(definition.nodes.atendimento_humano.departmentId, "dep");
});

test("information generator can continue to another message without menu semantics", () => {
  const definition = buildInformationFlow({
    template: "information",
    initialMessage: "Documentos necessários.",
    consentEnabled: false,
    consentMessage: "",
    consentAcceptOption: "1",
    consentDeclineMessage: "",
    menuOptions: [],
    destinations: {},
    submenus: {},
    invalidOptionText: "",
    businessHoursEnabled: "later",
    handoffMessageMode: "standard",
    handoffMessage: "",
    captureQuestions: [],
    informationNext: "message",
    followupMessage: "Volte quando precisar.",
  });

  assert.equal(definition.start, "mensagem_inicial");
  assert.equal(definition.nodes.mensagem_inicial.type, "text");
  assert.equal(definition.nodes.mensagem_inicial.next, "mensagem_complementar");
  assert.equal(definition.nodes.mensagem_complementar.type, "text");
  assert.equal(definition.nodes.mensagem_complementar.text, "Volte quando precisar.");
});

test("wizard validation checks only the current business step", () => {
  const base = {
    template: "institutional_menu",
    initialMessage: "Olá.",
    consentEnabled: false,
    consentMessage: "",
    consentAcceptOption: "1",
    consentDeclineMessage: "",
    menuOptions: ["Registro"],
    destinations: {},
    submenus: {},
    invalidOptionText: "Opção inválida.",
    businessHoursEnabled: "later",
    handoffMessageMode: "standard",
    handoffMessage: "",
    captureQuestions: ["Informe seu protocolo."],
    informationNext: "end",
    followupMessage: "",
  };

  assert.deepEqual(validateWizardStep({ ...base, initialMessage: "" }, "initial"), [
    "Escreva a mensagem inicial que o cidadão verá.",
  ]);
  assert.deepEqual(validateWizardStep({ ...base, initialMessage: "" }, "options"), [
    "A opção Registro ainda não possui destino.",
  ]);
  assert.deepEqual(validateWizardStep(base, "options"), [
    "A opção Registro ainda não possui destino.",
  ]);
  assert.deepEqual(
    validateWizardStep(
      { ...base, destinations: { 0: { type: "department", departmentId: "dep", queueId: "queue" } } },
      "options",
      [{ id: "queue", name: "Fila Geral", departmentId: "dep" }]
    ),
    []
  );
});

test("wizard validation rejects duplicate menu option labels in business language", () => {
  const errors = validateWizardStep(
    {
      template: "institutional_menu",
      initialMessage: "Olá.",
      consentEnabled: false,
      consentMessage: "",
      consentAcceptOption: "1",
      consentDeclineMessage: "",
      menuOptions: ["Registro", " registro "],
      destinations: {},
      submenus: {},
      invalidOptionText: "Opção inválida.",
      businessHoursEnabled: "later",
      handoffMessageMode: "standard",
      handoffMessage: "",
      captureQuestions: ["Informe seu protocolo."],
      informationNext: "end",
      followupMessage: "",
    },
    "options"
  );

  assert.deepEqual(errors, [
    "As opções do menu precisam ter nomes diferentes.",
    "A opção Registro ainda não possui destino.",
    "A opção registro ainda não possui destino.",
  ]);
});

test("wizard validation requires configured destinations inside submenus", () => {
  const errors = validateWizardStep(
    {
      template: "institutional_menu",
      initialMessage: "Olá.",
      consentEnabled: false,
      consentMessage: "",
      consentAcceptOption: "1",
      consentDeclineMessage: "",
      menuOptions: ["Registro"],
      destinations: { 0: { type: "submenu", submenuKey: "0" } },
      submenus: {
        "0": {
          title: "Registro",
          options: ["Registro PF"],
          destinations: {},
          enablePreviousMenu: true,
          enableMainMenu: true,
        },
      },
      invalidOptionText: "Opção inválida.",
      businessHoursEnabled: "later",
      handoffMessageMode: "standard",
      handoffMessage: "",
      captureQuestions: [],
      informationNext: "end",
      followupMessage: "",
    },
    "destinations"
  );

  assert.deepEqual(errors, ["A opção Registro PF ainda não possui destino."]);
});

test("wizard submenu cancellation removes nested draft state without touching other answers", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro", "Financeiro"];
  answers.destinations = { 0: { type: "submenu", submenuKey: "0" }, 1: { type: "department", departmentId: "dep_financeiro" } };
  answers.submenus = {
    "0": {
      title: "Registro",
      options: ["Pessoa Física"],
      destinations: { 0: { type: "submenu", submenuKey: "0.0" } },
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
    "0.0": {
      title: "Pessoa Física",
      options: ["Novo registro"],
      destinations: { 0: { type: "department", departmentId: "dep_registro" } },
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
  };

  const next = cancelWizardSubmenuCreation(answers, "0");

  assert.deepEqual(next.destinations, { 1: { type: "department", departmentId: "dep_financeiro" } });
  assert.deepEqual(next.submenus, {});
  assert.deepEqual(next.menuOptions, ["Registro", "Financeiro"]);
});

test("wizard option removal deletes a created submenu tree and preserves siblings", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro", "Financeiro", "Suporte"];
  answers.destinations = {
    0: { type: "submenu", submenuKey: "0" },
    1: { type: "department", departmentId: "dep_financeiro" },
    2: { type: "message", message: "Fale com suporte." },
  };
  answers.submenus = {
    "0": {
      title: "Registro",
      options: ["Pessoa Física"],
      destinations: { 0: { type: "submenu", submenuKey: "0.0" } },
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
    "0.0": {
      title: "Pessoa Física",
      options: ["Novo registro"],
      destinations: { 0: { type: "department", departmentId: "dep_registro" } },
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
  };

  const next = removeWizardMenuOption(answers, "", 0);

  assert.deepEqual(next.menuOptions, ["Financeiro", "Suporte"]);
  assert.deepEqual(next.destinations, {
    0: { type: "department", departmentId: "dep_financeiro" },
    1: { type: "message", message: "Fale com suporte." },
  });
  assert.deepEqual(next.submenus, {});
});

test("wizard delete keeps next sibling collapsed and returns focus to parent context", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro", "Financeiro", "Suporte"];
  answers.destinations = {
    0: { type: "message", message: "Registro." },
    1: { type: "message", message: "Financeiro." },
    2: { type: "message", message: "Suporte." },
  };

  const next = removeWizardMenuOption(answers, "", 0);

  assert.deepEqual(next.menuOptions, ["Financeiro", "Suporte"]);
  assert.equal(getWizardExpansionKeyAfterOptionDelete(""), null);
  assert.deepEqual(getWizardFocusTargetAfterOptionDelete(""), { kind: "section" });
  assert.notEqual(getWizardExpansionKeyAfterOptionDelete(""), "root:0");
});

test("wizard nested delete returns to parent option without auto-opening sibling", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro"];
  answers.destinations = { 0: { type: "submenu", submenuKey: "0" } };
  answers.submenus = {
    "0": {
      title: "Registro",
      options: ["Pessoa Física", "Pessoa Jurídica"],
      destinations: {
        0: { type: "message", message: "PF." },
        1: { type: "message", message: "PJ." },
      },
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
  };

  const next = removeWizardMenuOption(answers, "0", 0);

  assert.deepEqual(next.submenus["0"].options, ["Pessoa Jurídica"]);
  assert.equal(getWizardExpansionKeyAfterOptionDelete("0"), "root:0");
  assert.deepEqual(getWizardFocusTargetAfterOptionDelete("0"), { kind: "option", menuKey: "", optionIndex: 0 });
  assert.notEqual(getWizardExpansionKeyAfterOptionDelete("0"), "0:0");
});

test("wizard destructive confirmation is required only for configured submenu children", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro"];
  answers.destinations = { 0: { type: "submenu", submenuKey: "0" } };
  answers.submenus = {
    "0": createDefaultSubmenuDraft("Registro"),
  };

  assert.equal(wizardSubmenuHasConfiguredChildren(answers, "0"), false);
  assert.equal(wizardOptionRequiresDestructiveConfirmation(answers, "", 0), false);

  answers.submenus["0"] = {
    ...answers.submenus["0"],
    destinations: { 0: { type: "department", departmentId: "dep_registro" } },
  };

  assert.equal(wizardSubmenuHasConfiguredChildren(answers, "0"), true);
  assert.equal(wizardOptionRequiresDestructiveConfirmation(answers, "", 0), true);
});

test("wizard destructive confirmation detects configured nested submenu descendants", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Registro"];
  answers.destinations = { 0: { type: "submenu", submenuKey: "0" } };
  answers.submenus = {
    "0": createDefaultSubmenuDraft("Registro"),
    "0.0": {
      title: "Pessoa Física",
      options: ["Novo registro"],
      destinations: {},
      enablePreviousMenu: true,
      enableMainMenu: true,
    },
  };

  assert.equal(wizardSubmenuHasConfiguredChildren(answers, "0"), true);
  assert.equal(wizardOptionRequiresDestructiveConfirmation(answers, "", 0), true);
});

test("wizard hierarchy tones are based on menu nesting level", () => {
  assert.match(wizardMenuLevelTone(""), /sky/);
  assert.match(wizardMenuLevelTone("0"), /indigo/);
  assert.match(wizardMenuLevelTone("0.1"), /violet/);
  assert.match(wizardMenuLevelTone("0.1.2"), /emerald/);
  assert.equal(wizardMenuLevelTone("0.1.2.3"), wizardMenuLevelTone("0.1.2"));
});

test("wizard destination options expose only the human department choice", () => {
  const labels = getWizardDestinationTypeOptions("").map((option) => option.label);
  const values = getWizardDestinationTypeOptions("").map((option) => option.value);

  assert.ok(labels.includes("Encaminhar para atendimento humano"));
  assert.equal(labels.includes("Encaminhar para uma fila"), false);
  assert.equal(values.includes("queue"), false);
  assert.equal(getWizardDestinationTypeOptions("0").some((option) => option.value === "previous_menu"), true);
});

test("wizard scroll contracts distinguish navigation expansion and parent recovery", () => {
  assert.equal(getWizardScrollContract("model_select"), "preserve_scroll");
  assert.equal(getWizardScrollContract("continue"), "preserve_scroll");
  assert.equal(getWizardScrollContract("back"), "preserve_scroll");
  assert.equal(getWizardScrollContract("expand_row"), "scroll_to_row_header");
  assert.equal(getWizardScrollContract("return_parent"), "focus_context_prevent_scroll");
  assert.equal(getWizardScrollContract("new_flow_reset"), "focus_context_prevent_scroll");
});

test("question destination requires a defined next behavior", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.destinations = {
    0: { type: "question", question: "Qual é o seu CPF?", responseType: "text" },
  };

  assert.ok(validateWizardStep(answers, "destinations", []).includes("Ainda falta definir o que deve acontecer depois desta resposta."));
});

test("question destination can continue to message question menu human and end", () => {
  const base = createDefaultWizardAnswers();
  base.template = "institutional_menu";
  base.menuOptions = ["CPF"];

  const cases = [
    { type: "message" as const, expectedType: "text" },
    { type: "question" as const, question: "Qual é o protocolo?", responseType: "text" as const, next: { type: "end" as const }, expectedType: "capture" },
    { type: "main_menu" as const, expectedNext: "menu_principal" },
    { type: "department" as const, departmentId: "dep", queueId: "queue", expectedType: "handoff" },
    { type: "end" as const, expectedType: "text" },
  ];

  for (const next of cases) {
    const answers = {
      ...base,
      destinations: {
        0: {
          type: "question" as const,
          question: "Qual é o seu CPF?",
          responseType: "text" as const,
          next,
        },
      },
    };
    const definition = buildInstitutionalMenuFlow(answers);
    const question = definition.nodes.pergunta_cpf;
    assert.equal(question.type, "capture");
    assert.ok(question.next);
    if ("expectedNext" in next) assert.equal(question.next, next.expectedNext);
    if ("expectedType" in next && next.expectedType) assert.equal(definition.nodes[String(question.next)]?.type, next.expectedType);
  }
});

test("question chain allows Q1 to Q2 to Q3 and blocks Q4", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Dados"];
  answers.destinations = {
    0: {
      type: "question",
      question: "Pergunta 1",
      responseType: "text",
      next: {
        type: "question",
        question: "Pergunta 2",
        responseType: "text",
        next: {
          type: "question",
          question: "Pergunta 3",
          responseType: "text",
          next: { type: "end" },
        },
      },
    },
  };

  assert.deepEqual(validateWizardStep(answers, "destinations", []), []);
  assert.equal(getWizardQuestionChainDepth(answers.destinations[0]), 3);
  assert.equal(getWizardQuestionNextTypeOptions("", 3).some((option) => option.value === "question"), false);

  answers.destinations[0].next!.next!.next = {
    type: "question",
    question: "Pergunta 4",
    responseType: "text",
    next: { type: "end" },
  };

  assert.ok(
    validateWizardStep(answers, "destinations", []).includes("O assistente permite no máximo 3 perguntas seguidas antes de outro próximo passo.")
  );
});

test("question chain builds three sequential capture nodes before the next action", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.menuOptions = ["Dados"];
  answers.destinations = {
    0: {
      type: "question",
      question: "Pergunta 1",
      responseType: "text",
      next: {
        type: "question",
        question: "Pergunta 2",
        responseType: "email",
        next: {
          type: "question",
          question: "Pergunta 3",
          responseType: "phone",
          next: { type: "message", message: "Obrigado." },
        },
      },
    },
  };

  const definition = buildInstitutionalMenuFlow(answers);
  assert.equal(definition.nodes.pergunta_dados.type, "capture");
  assert.equal(definition.nodes.pergunta_dados.next, "pergunta_dados_depois");
  assert.equal(definition.nodes.pergunta_dados_depois.type, "capture");
  assert.equal(definition.nodes.pergunta_dados_depois.next, "pergunta_dados_depois_depois");
  assert.equal(definition.nodes.pergunta_dados_depois_depois.type, "capture");
  assert.equal(definition.nodes.mensagem_dados_depois_depois_depois?.type, "text");
});

test("human handoff contract hides the internal queue and blocks unavailable mappings", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "direct_handoff";
  answers.destinations = { 0: { type: "department", departmentId: "dep" } };

  assert.ok(validateWizardStep(answers, "destination", []).includes("Este setor ainda não está disponível para receber atendimentos."));
  assert.deepEqual(validateWizardStep(answers, "destination", [{ id: "queue_a", name: "Fila A", departmentId: "dep" }]), []);
  assert.equal(buildDirectHandoffFlow(answers, [{ id: "queue_a", name: "Fila A", departmentId: "dep" }]).nodes.atendimento_humano.queueId, "queue_a");
  assert.ok(validateWizardStep(answers, "destination", [
    { id: "queue_a", name: "Fila A", departmentId: "dep" },
    { id: "queue_b", name: "Fila B", departmentId: "dep" },
  ]).includes("Este setor ainda não está disponível para receber atendimentos."));

  const fixed = { ...answers, destinations: { 0: { type: "department" as const, departmentId: "dep", queueId: "queue_a" } } };
  assert.deepEqual(validateWizardStep(fixed, "destination", [
    { id: "queue_a", name: "Fila A", departmentId: "dep" },
    { id: "queue_b", name: "Fila B", departmentId: "dep" },
  ]), []);
  assert.equal(buildDirectHandoffFlow(fixed).nodes.atendimento_humano.queueId, "queue_a");
});

test("guided queue UX hides the internal queue and never exposes a multi-queue selector", () => {
  assert.equal(getGuidedQueueUxState([], "dep"), "blocked");
  assert.equal(getGuidedQueueUxState([{ id: "queue", name: "Fila Geral", departmentId: "dep" }], "dep"), "hidden_single_queue");
  assert.equal(getGuidedQueueUxState([
    { id: "queue_a", name: "Fila A", departmentId: "dep" },
    { id: "queue_b", name: "Fila B", departmentId: "dep" },
  ], "dep"), "blocked");
});

test("guided handoff editor does not render redundant sector instruction block", () => {
  const source = readFileSync(new URL("./ChatbotFlowBuilder.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Escolha o setor que receberá o atendimento/);
});

test("legacy existing null-queue handoff opens with warning and without auto mutation", () => {
  const definition = JSON.stringify({
    start: "handoff",
    nodes: {
      handoff: {
        type: "handoff",
        text: "Encaminhando.",
        departmentId: "dep",
      },
    },
  });
  let changed = false;
  const html = renderToStaticMarkup(
    React.createElement(ChatbotFlowBuilder, {
      definitionText: definition,
      onDefinitionTextChange: () => {
        changed = true;
      },
      departments: [{ id: "dep", name: "Registro" }],
      queues: [{ id: "queue", name: "Fila Geral", departmentId: "dep" }],
      advancedEditor: React.createElement("textarea"),
    })
  );

  assert.equal(changed, false);
  assert.match(html, /Este setor ainda não está disponível para receber atendimentos/);
});

test("wizard default submenu labels use the parent option name and sequential option label", () => {
  const submenu = createDefaultSubmenuDraft("Registro");

  assert.equal(submenu.title, "Submenu Registro");
  assert.deepEqual(submenu.options, ["Opção 1"]);
});

test("wizard generated definition preserves custom user text and emoji", () => {
  const answers = createDefaultWizardAnswers();
  answers.template = "institutional_menu";
  answers.initialMessage = "1️⃣ Menu inicial 🔗";
  answers.consentEnabled = true;
  answers.consentMessage = "2️⃣ Confirme para continuar 📌";
  answers.consentAcceptOption = "✅";
  answers.consentDeclineMessage = "0️⃣ Atendimento encerrado.";
  answers.menuOptions = ["9️⃣ Registro 🔄", "0️⃣ Sair ✅"];
  answers.destinations = {
    0: { type: "question", question: "📌 Qual protocolo?" },
    1: { type: "message", message: "🔗 Consulte o portal." },
  };
  answers.invalidOptionText = "Opção inválida 1️⃣ 2️⃣ 9️⃣ 0️⃣";
  answers.handoffMessageMode = "custom";
  answers.handoffMessage = "🔄 Encaminhando.";

  const definitionText = JSON.stringify(buildStandardFlowDefinition(answers));

  for (const token of ["1️⃣", "2️⃣", "9️⃣", "0️⃣", "🔗", "📌", "🔄", "✅"]) {
    assert.match(definitionText, new RegExp(token));
  }
});

test("wizard default answers are isolated between sequential flow creations", () => {
  const first = createDefaultWizardAnswers();
  const second = createDefaultWizardAnswers();

  first.menuOptions.push("Jurídico");
  first.destinations[0] = { type: "department", departmentId: "dep_a" };
  first.submenus["0"] = {
    title: "Registro",
    options: ["Pessoa Física"],
    destinations: { 0: { type: "department", departmentId: "dep_b" } },
    enablePreviousMenu: true,
    enableMainMenu: true,
  };
  first.captureQuestions.push("Informe o protocolo.");

  assert.deepEqual(second.menuOptions, ["Registro", "Financeiro", "Suporte"]);
  assert.deepEqual(second.destinations, {});
  assert.deepEqual(second.submenus, {});
  assert.deepEqual(second.captureQuestions, ["Informe seu nome completo."]);
});

test("Syer-like existing flow does not contaminate first, second or third generated flow JSON", () => {
  const syerExistingFlow = {
    start: "menu_principal",
    nodes: {
      menu_principal: {
        type: "handoff",
        text: "Vamos atender você.",
        departmentId: "dep_syer",
      },
    },
  };
  const existingText = JSON.stringify(syerExistingFlow, null, 2);
  assert.doesNotThrow(() => JSON.parse(existingText));

  const first = createDefaultWizardAnswers();
  first.template = "direct_handoff";
  first.initialMessage = "Vamos encaminhar você.";
  first.destinations = { 0: { type: "department", departmentId: "dep_syer", queueId: "queue_syer" } };

  const second = createDefaultWizardAnswers();
  second.template = "institutional_menu";
  second.initialMessage = "Escolha uma opção.";
  second.menuOptions = ["Dúvidas", "Financeiro"];
  second.destinations = {
    0: { type: "department", departmentId: "dep_duvidas", queueId: "queue_duvidas" },
    1: { type: "department", departmentId: "dep_financeiro", queueId: "queue_financeiro" },
  };

  const third = createDefaultWizardAnswers();
  third.template = "pre_service_collection";
  third.initialMessage = "Informe seu nome.";
  third.captureQuestions = ["Informe seu nome.", "Informe o assunto."];
  third.destinations = { 0: { type: "department", departmentId: "dep_syer", queueId: "queue_syer" } };

  const queues = [
    { id: "queue_syer", name: "Fila Geral", departmentId: "dep_syer" },
    { id: "queue_duvidas", name: "Fila Dúvidas", departmentId: "dep_duvidas" },
    { id: "queue_financeiro", name: "Fila Financeiro", departmentId: "dep_financeiro" },
  ];

  for (const answers of [first, second, third]) {
    const definition = buildStandardFlowDefinition(answers);
    const text = JSON.stringify(definition, null, 2);
    assert.doesNotThrow(() => JSON.parse(text));
    assert.equal(typeof definition.start, "string");
    assert.equal(typeof definition.nodes[definition.start], "object");
    assert.deepEqual(validateWizardStep(answers, answers.template === "institutional_menu" ? "destinations" : "destination", queues), []);
  }
});
