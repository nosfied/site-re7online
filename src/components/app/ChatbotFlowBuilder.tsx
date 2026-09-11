"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ChatbotFlowBuilderDepartment = {
  id: string;
  name: string;
  slug?: string;
  isActive?: boolean;
};

export type ChatbotFlowBuilderQueue = {
  id: string;
  name: string;
  departmentId: string;
};

type FlowDefinition = Record<string, unknown> & {
  start: string;
  nodes: Record<string, Record<string, unknown>>;
};

type ParsedDefinition =
  | { ok: true; definition: FlowDefinition }
  | { ok: false; message: string };

type Props = {
  definitionText: string;
  onDefinitionTextChange: (value: string) => void;
  disabled?: boolean;
  isActive?: boolean;
  entryPoint?: boolean;
  allowObjectiveReset?: boolean;
  departments: ChatbotFlowBuilderDepartment[];
  queues: ChatbotFlowBuilderQueue[];
  advancedEditor: ReactNode;
};

const NODE_TYPES = ["menu", "text", "capture", "consent", "handoff"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseDefinition(text: string): ParsedDefinition {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || typeof parsed.start !== "string" || !isRecord(parsed.nodes)) {
      return { ok: false, message: "A estrutura precisa conter start e nodes." };
    }
    const nodes: Record<string, Record<string, unknown>> = {};
    for (const [nodeId, node] of Object.entries(parsed.nodes)) {
      if (isRecord(node)) nodes[nodeId] = node;
    }
    return { ok: true, definition: { ...parsed, start: parsed.start, nodes } };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "JSON invalido." };
  }
}

function formatDefinition(definition: FlowDefinition) {
  return JSON.stringify(definition, null, 2);
}

function nodeTypeLabel(type: string) {
  if (type === "menu") return "Menu";
  if (type === "text") return "Mensagem";
  if (type === "capture") return "Coleta de resposta";
  if (type === "consent") return "Consentimento";
  if (type === "handoff") return "Atendimento humano";
  return "Tipo desconhecido";
}

function buildNodeId(nodes: Record<string, unknown>, type: string) {
  const base = `${type || "etapa"}_${Object.keys(nodes).length + 1}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  let candidate = base;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(nodes, candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function getOptions(node: Record<string, unknown>) {
  return Array.isArray(node.options)
    ? node.options.filter((option): option is Record<string, unknown> => isRecord(option))
    : [];
}

function parseExplicitNumber(label: string) {
  const match = label.trim().match(/^(\d+)\s*([.)-])\s*(.+)$/);
  return match ? match[1] : null;
}

function buildIssues(definition: FlowDefinition, queues: ChatbotFlowBuilderQueue[]) {
  const issues: string[] = [];
  const nodeIds = Object.keys(definition.nodes);
  if (!definition.nodes[definition.start]) {
    issues.push("A etapa inicial aponta para uma etapa inexistente.");
  }
  const inbound = new Set<string>([definition.start]);
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    const type = stringValue(node.type);
    if (!NODE_TYPES.includes(type as (typeof NODE_TYPES)[number])) {
      issues.push(`A etapa "${nodeId}" tem tipo desconhecido.`);
      continue;
    }
    if ((type === "menu" || type === "text" || type === "capture") && !stringValue(node.text).trim()) {
      issues.push(`A etapa "${nodeId}" precisa de mensagem.`);
    }
    if (type === "consent") {
      if (!stringValue(node.purpose).trim()) issues.push(`A etapa "${nodeId}" precisa de finalidade.`);
      if (!stringValue(node.textVersion).trim()) issues.push(`A etapa "${nodeId}" precisa de versão do texto.`);
      if (!stringValue(node.message).trim()) issues.push(`A etapa "${nodeId}" precisa da mensagem de consentimento.`);
      if (!stringValue(node.acceptOption).trim()) issues.push(`A etapa "${nodeId}" precisa da opção de aceite.`);
      if (!stringValue(node.onAccepted).trim()) issues.push(`A etapa "${nodeId}" precisa do destino ao aceitar.`);
      if (stringValue(node.onAccepted) && !definition.nodes[stringValue(node.onAccepted)]) {
        issues.push(`A etapa "${nodeId}" aceita e aponta para etapa inexistente.`);
      }
      if (stringValue(node.onDeclined) && !definition.nodes[stringValue(node.onDeclined)]) {
        issues.push(`A etapa "${nodeId}" recusa e aponta para etapa inexistente.`);
      }
      if (stringValue(node.onAccepted)) inbound.add(stringValue(node.onAccepted));
      if (stringValue(node.onDeclined)) inbound.add(stringValue(node.onDeclined));
    }
    if (type === "menu") {
      const seenKeys = new Set<string>();
      getOptions(node).forEach((option, index) => {
        const label = stringValue(option.label);
        const key = parseExplicitNumber(label) ?? label.trim().toLowerCase();
        if (!label.trim()) issues.push(`A opção ${index + 1} da etapa "${nodeId}" precisa de título.`);
        if (!stringValue(option.next).trim()) issues.push(`A opção ${index + 1} da etapa "${nodeId}" precisa de destino.`);
        if (key && seenKeys.has(key)) issues.push(`A etapa "${nodeId}" tem opção duplicada: ${label}.`);
        if (key) seenKeys.add(key);
        if (stringValue(option.next) && !definition.nodes[stringValue(option.next)]) {
          issues.push(`A opção "${label || index + 1}" aponta para etapa inexistente.`);
        }
        if (stringValue(option.next)) inbound.add(stringValue(option.next));
        const queue = queues.find((item) => item.id === option.queueId);
        if (queue && option.departmentId && queue.departmentId !== option.departmentId) {
          issues.push(`A opção "${label || index + 1}" usa fila de outro setor.`);
        }
      });
    }
    if ((type === "text" || type === "capture") && stringValue(node.next)) {
      const next = stringValue(node.next);
      if (!definition.nodes[next]) issues.push(`A etapa "${nodeId}" aponta para etapa inexistente.`);
      inbound.add(next);
    }
    if (type === "capture" && !stringValue(node.field).trim()) {
      issues.push(`A etapa "${nodeId}" precisa do campo que será salvo.`);
    }
    if (type === "handoff" && !stringValue(node.departmentId).trim()) {
      issues.push(`A etapa "${nodeId}" encaminha para humano sem setor definido.`);
    }
    const queue = queues.find((item) => item.id === node.queueId);
    if (queue && node.departmentId && queue.departmentId !== node.departmentId) {
      issues.push(`A etapa "${nodeId}" usa fila de outro setor.`);
    }
  }
  nodeIds.forEach((nodeId) => {
    if (!inbound.has(nodeId)) issues.push(`A etapa "${nodeId}" não é alcançada pelo fluxo.`);
  });
  return issues;
}

function setNodeField(definition: FlowDefinition, nodeId: string, key: string, value: unknown) {
  const node = definition.nodes[nodeId] ?? {};
  const nextNode = { ...node };
  if (value === "" || value === null || value === undefined) {
    delete nextNode[key];
  } else {
    nextNode[key] = value;
  }
  return {
    ...definition,
    nodes: {
      ...definition.nodes,
      [nodeId]: nextNode,
    },
  };
}

function setDefinitionField(definition: FlowDefinition, key: string, value: unknown) {
  const next = { ...definition };
  if (value === "" || value === null || value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

function getBackCommand(definition: FlowDefinition) {
  const commands = Array.isArray(definition.globalCommands) ? definition.globalCommands : [];
  const command = commands.find((item) => isRecord(item) && item.action === "BACK");
  return isRecord(command) && typeof command.command === "string" ? command.command : "";
}

function getResetAfterMinutes(definition: FlowDefinition) {
  const policy = isRecord(definition.inactivityPolicy) ? definition.inactivityPolicy : null;
  return typeof policy?.resetAfterMinutes === "number" && Number.isFinite(policy.resetAfterMinutes)
    ? String(policy.resetAfterMinutes)
    : "";
}

type NodeEditorSectionKey =
  | "identity"
  | "message"
  | "handoffMessage"
  | "next"
  | "capture"
  | "consent"
  | "destination"
  | "options"
  | "fallback";

type NodeEditorSectionPlan = {
  key: NodeEditorSectionKey;
  defaultExpanded: boolean;
};

export function getChatbotNodeIssueSectionKeys(type: string, nodeId: string, nodeIssues: string[]) {
  const issueKeys = new Set<NodeEditorSectionKey>();
  for (const issue of nodeIssues) {
    if (!issue.includes(`"${nodeId}"`)) continue;
    if (issue.includes("tipo desconhecido") || issue.includes("não é alcançada")) {
      issueKeys.add("identity");
    }
    if (issue.includes("precisa de mensagem")) {
      issueKeys.add(type === "handoff" ? "handoffMessage" : type === "consent" ? "consent" : "message");
    }
    if (
      issue.includes("precisa de finalidade") ||
      issue.includes("precisa de versão do texto") ||
      issue.includes("precisa da mensagem de consentimento") ||
      issue.includes("precisa da opção de aceite") ||
      issue.includes("precisa do destino ao aceitar") ||
      issue.includes("aceita e aponta") ||
      issue.includes("recusa e aponta")
    ) {
      issueKeys.add("consent");
    }
    if (issue.includes("precisa do campo que será salvo")) {
      issueKeys.add("capture");
    }
    if (issue.includes("opção") || issue.includes("opção duplicada")) {
      issueKeys.add("options");
    }
    if (issue.includes("aponta para etapa inexistente") && !issue.includes("opção")) {
      issueKeys.add(type === "consent" ? "consent" : "next");
    }
    if (issue.includes("encaminha para humano sem setor definido") || issue.includes("usa fila de outro setor")) {
      issueKeys.add(type === "menu" && issue.includes("opção") ? "options" : "destination");
    }
  }
  return [...issueKeys];
}

export function getChatbotNodeEditorSectionPlan(
  type: string,
  issueSectionKeys: NodeEditorSectionKey[] = []
): NodeEditorSectionPlan[] {
  const issues = new Set(issueSectionKeys);
  const section = (key: NodeEditorSectionKey, defaultExpanded: boolean) => ({
    key,
    defaultExpanded: defaultExpanded || issues.has(key),
  });

  if (type === "menu") {
    return [
      section("identity", true),
      section("message", true),
      section("destination", false),
      section("options", true),
      section("fallback", false),
    ];
  }
  if (type === "handoff") {
    return [
      section("identity", true),
      section("handoffMessage", true),
      section("destination", true),
    ];
  }
  if (type === "capture") {
    return [
      section("identity", true),
      section("message", true),
      section("next", false),
      section("capture", false),
    ];
  }
  if (type === "consent") {
    return [
      section("identity", true),
      section("consent", true),
    ];
  }
  return [
    section("identity", true),
    section("message", true),
    section("next", false),
  ];
}

type GuidedStepKey =
  | "objective"
  | "start"
  | "main"
  | "questions"
  | "handoff"
  | "exceptions"
  | "preview"
  | "checklist"
  | "activation";

type GuidedStepStatus = "complete" | "incomplete" | "not_applicable" | "warning" | "error";

type GuidedStep = {
  key: GuidedStepKey;
  number: number;
  title: string;
  summary: string;
  status: GuidedStepStatus;
  targetId: string;
};

type GuidedObjective = "handoff" | "menu" | "consent" | "capture" | "text" | "custom";

type StandardFlowTemplate = "institutional_menu" | "direct_handoff" | "pre_service_collection" | "information" | "advanced";

type WizardDestinationType = "department" | "queue" | "message" | "question" | "submenu" | "end" | "main_menu" | "previous_menu";

type WizardDestination = {
  type: WizardDestinationType;
  departmentId?: string;
  queueId?: string;
  message?: string;
  question?: string;
  submenuKey?: string;
};

type WizardMenuDraft = {
  title: string;
  options: string[];
  destinations: Record<number, WizardDestination>;
  enablePreviousMenu: boolean;
  enableMainMenu: boolean;
};

type StandardFlowWizardAnswers = {
  template: StandardFlowTemplate | null;
  initialMessage: string;
  consentEnabled: boolean;
  consentMessage: string;
  consentAcceptOption: string;
  consentDeclineMessage: string;
  menuOptions: string[];
  destinations: Record<number, WizardDestination>;
  submenus: Record<string, WizardMenuDraft>;
  invalidOptionText: string;
  businessHoursEnabled: "later" | "yes" | "no";
  handoffMessageMode: "standard" | "custom" | "none";
  handoffMessage: string;
  captureQuestions: string[];
  informationNext: "end" | "message" | "menu" | "human" | "question";
  followupMessage: string;
};

type GuidedTask =
  | { kind: "objective"; title: string; summary: string }
  | { kind: "start_content"; nodeId: string; title: string; summary: string }
  | { kind: "menu_option"; nodeId: string; title: string; summary: string }
  | { kind: "menu_option_destination"; nodeId: string; optionIndex: number; title: string; summary: string }
  | { kind: "handoff_destination"; nodeId: string; title: string; summary: string }
  | { kind: "consent_destination"; nodeId: string; title: string; summary: string }
  | { kind: "capture_field"; nodeId: string; title: string; summary: string }
  | { kind: "capture_next"; nodeId: string; title: string; summary: string }
  | { kind: "broken_reference"; nodeId: string; title: string; summary: string }
  | { kind: "orphan"; nodeId: string; title: string; summary: string }
  | { kind: "review"; title: string; summary: string };

const OBJECTIVE_OPTIONS: Array<{ value: GuidedObjective; label: string; summary: string }> = [
  {
    value: "handoff",
    label: "Atendimento humano direto",
    summary: "A primeira mensagem encaminha o cidadão para um setor.",
  },
  {
    value: "menu",
    label: "Menu de opções",
    summary: "O cidadão escolhe entre caminhos de atendimento.",
  },
  {
    value: "consent",
    label: "Consentimento antes de continuar",
    summary: "O fluxo começa confirmando aceite e segue para o próximo passo.",
  },
  {
    value: "capture",
    label: "Perguntar uma informação",
    summary: "O fluxo coleta uma resposta antes de continuar.",
  },
  {
    value: "text",
    label: "Enviar uma mensagem",
    summary: "O fluxo mostra uma mensagem simples.",
  },
  {
    value: "custom",
    label: "Personalizado / avançado",
    summary: "Mantém o fluxo como está e abre a edição avançada.",
  },
];

const STANDARD_FLOW_TEMPLATES: Array<{
  id: StandardFlowTemplate;
  title: string;
  summary: string;
  example: string[];
  action: string;
}> = [
  {
    id: "institutional_menu",
    title: "Atendimento institucional com menu",
    summary: "Apresente opções ao cidadão e encaminhe cada assunto para o setor responsável.",
    example: ["Registro", "Financeiro", "Suporte"],
    action: "Usar este modelo",
  },
  {
    id: "direct_handoff",
    title: "Encaminhamento direto",
    summary: "Receba a primeira mensagem e envie o cidadão para um setor ou fila.",
    example: ["Atendimento geral"],
    action: "Usar este modelo",
  },
  {
    id: "pre_service_collection",
    title: "Coleta antes do atendimento",
    summary: "Faça uma ou mais perguntas simples antes de transferir para a equipe.",
    example: ["Nome", "Número do protocolo", "Assunto"],
    action: "Usar este modelo",
  },
  {
    id: "information",
    title: "Mensagem informativa",
    summary: "Envie uma orientação automática e defina se o fluxo termina ou continua.",
    example: ["Horários", "Documentos necessários"],
    action: "Usar este modelo",
  },
  {
    id: "advanced",
    title: "Fluxo em branco / avançado",
    summary: "Use quando precisar criar uma estrutura personalizada ou editar detalhes técnicos.",
    example: ["Estrutura personalizada"],
    action: "Abrir editor avançado",
  },
];

const DEFAULT_WIZARD_ANSWERS: StandardFlowWizardAnswers = {
  template: null,
  initialMessage: "Olá! Como podemos ajudar?",
  consentEnabled: false,
  consentMessage: "Para prosseguir, confirme que leu e aceita o atendimento por este canal.",
  consentAcceptOption: "1",
  consentDeclineMessage: "Atendimento encerrado. Caso precise, envie uma nova mensagem para começar novamente.",
  menuOptions: ["Registro", "Financeiro", "Suporte"],
  destinations: {},
  submenus: {},
  invalidOptionText: "Não consegui identificar essa opção. Escolha uma das opções do menu.",
  businessHoursEnabled: "later",
  handoffMessageMode: "standard",
  handoffMessage: "Vou encaminhar seu atendimento para a equipe responsável.",
  captureQuestions: ["Informe seu nome completo."],
  informationNext: "end",
  followupMessage: "Obrigado pelo contato.",
};

function sanitizeLabel(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

function nodeSuffix(value: string, fallback: string) {
  return sanitizeLabel(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || fallback;
}

function numberedOptionLabel(index: number, label: string) {
  return `${index + 1} - ${sanitizeLabel(label, `Opção ${index + 1}`)}`;
}

function submenuKeyForOption(parentKey: string, optionIndex: number) {
  return parentKey ? `${parentKey}.${optionIndex}` : `${optionIndex}`;
}

function parentMenuKey(menuKey: string) {
  const parts = menuKey.split(".");
  parts.pop();
  return parts.join(".");
}

function getMenuDraftForKey(answers: StandardFlowWizardAnswers, menuKey: string): WizardMenuDraft {
  if (!menuKey) {
    return {
      title: "Menu principal",
      options: answers.menuOptions,
      destinations: answers.destinations,
      enablePreviousMenu: false,
      enableMainMenu: false,
    };
  }
  return answers.submenus[menuKey] ?? {
    title: "Novo submenu",
    options: ["Nova opção"],
    destinations: {},
    enablePreviousMenu: true,
    enableMainMenu: true,
  };
}

function createDefaultSubmenuDraft(optionLabel: string): WizardMenuDraft {
  return {
    title: sanitizeLabel(optionLabel, "Novo submenu"),
    options: ["Nova opção"],
    destinations: {},
    enablePreviousMenu: true,
    enableMainMenu: true,
  };
}

function buildHandoffText(answers: StandardFlowWizardAnswers) {
  if (answers.handoffMessageMode === "none") return "";
  if (answers.handoffMessageMode === "custom") return answers.handoffMessage.trim();
  return DEFAULT_WIZARD_ANSWERS.handoffMessage;
}

function withOptionalConsent(definition: FlowDefinition, answers: StandardFlowWizardAnswers, acceptedNodeId: string) {
  if (!answers.consentEnabled) return definition;
  const declinedId = "consentimento_recusado";
  return {
    ...definition,
    start: "consentimento",
    nodes: {
      consentimento: {
        type: "consent",
        purpose: "atendimento",
        textVersion: "draft",
        message: answers.consentMessage.trim() || DEFAULT_WIZARD_ANSWERS.consentMessage,
        acceptOption: answers.consentAcceptOption.trim() || DEFAULT_WIZARD_ANSWERS.consentAcceptOption,
        onAccepted: acceptedNodeId,
        onDeclined: declinedId,
      },
      ...definition.nodes,
      [declinedId]: {
        type: "text",
        text: answers.consentDeclineMessage.trim() || DEFAULT_WIZARD_ANSWERS.consentDeclineMessage,
      },
    },
  };
}

function buildDestinationNode(index: number, optionLabel: string, destination: WizardDestination, answers: StandardFlowWizardAnswers) {
  const suffix = nodeSuffix(optionLabel, `opcao_${index + 1}`);
  if (destination.type === "message") {
    return {
      nodeId: `mensagem_${suffix}`,
      node: { type: "text", text: destination.message?.trim() || `Informações sobre ${sanitizeLabel(optionLabel, "esta opção")}.` },
    };
  }
  if (destination.type === "question") {
    return {
      nodeId: `pergunta_${suffix}`,
      node: {
        type: "capture",
        text: destination.question?.trim() || `Informe os dados para ${sanitizeLabel(optionLabel, "este atendimento")}.`,
        field: `resposta_${suffix}`,
        validation: "non_empty",
      },
    };
  }
  if (destination.type === "end") {
    return {
      nodeId: `encerrar_${suffix}`,
      node: { type: "text", text: destination.message?.trim() || "Atendimento encerrado. Caso precise, envie uma nova mensagem." },
    };
  }
  if (destination.type === "main_menu") {
    return {
      nodeId: "menu_principal",
      node: null,
    };
  }
  if (destination.type === "previous_menu") {
    return {
      nodeId: "",
      node: null,
    };
  }
  return {
    nodeId: `atendimento_${suffix}`,
    node: {
      type: "handoff",
      ...(buildHandoffText(answers) ? { text: buildHandoffText(answers) } : { sendFeedback: false }),
      ...(destination.departmentId ? { departmentId: destination.departmentId } : {}),
      ...(destination.queueId ? { queueId: destination.queueId } : {}),
    },
  };
}

export function buildInstitutionalMenuFlow(answers: StandardFlowWizardAnswers): FlowDefinition {
  const nodes: FlowDefinition["nodes"] = {};
  const nodeIdsByMenuKey = new Map<string, string>([["", "menu_principal"]]);

  const resolveMenuNodeId = (menuKey: string, draft: WizardMenuDraft) => {
    const existing = nodeIdsByMenuKey.get(menuKey);
    if (existing) return existing;
    const base = `submenu_${nodeSuffix(draft.title, `submenu_${menuKey.replace(/\./g, "_") || "menu"}`)}`;
    let candidate = base;
    let suffix = 2;
    while ([...nodeIdsByMenuKey.values()].includes(candidate) || Object.prototype.hasOwnProperty.call(nodes, candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    nodeIdsByMenuKey.set(menuKey, candidate);
    return candidate;
  };

  const buildMenu = (menuKey: string, parentKeyForNavigation: string | null) => {
    const draft = getMenuDraftForKey(answers, menuKey);
    const menuId = resolveMenuNodeId(menuKey, draft);
    const optionRows = draft.options.map((label, index) => {
      const destination = draft.destinations[index] ?? { type: "department" as const };
      if (destination.type === "submenu") {
        const submenuKey = destination.submenuKey || submenuKeyForOption(menuKey, index);
        const submenuDraft = getMenuDraftForKey(answers, submenuKey);
        const submenuNodeId = resolveMenuNodeId(submenuKey, submenuDraft);
        buildMenu(submenuKey, menuKey);
        return { label: numberedOptionLabel(index, label), next: submenuNodeId };
      }
      if (destination.type === "previous_menu" && parentKeyForNavigation !== null) {
        return { label: numberedOptionLabel(index, label), next: resolveMenuNodeId(parentKeyForNavigation, getMenuDraftForKey(answers, parentKeyForNavigation)) };
      }
      const built = buildDestinationNode(index, label, destination, answers);
      if (built.node && built.nodeId !== "menu_principal") nodes[built.nodeId] = built.node;
      return { label: numberedOptionLabel(index, label), next: built.nodeId || "menu_principal" };
    });
    if (menuKey && draft.enablePreviousMenu && parentKeyForNavigation !== null) {
      optionRows.push({ label: "9 - Voltar ao Menu Anterior", next: resolveMenuNodeId(parentKeyForNavigation, getMenuDraftForKey(answers, parentKeyForNavigation)) });
    }
    if (menuKey && draft.enableMainMenu) {
      optionRows.push({ label: "0 - Voltar ao Menu Principal", next: "menu_principal" });
    }
    nodes[menuId] = {
      type: "menu",
      text: menuKey ? draft.title : answers.initialMessage.trim() || DEFAULT_WIZARD_ANSWERS.initialMessage,
      fallbackText: answers.invalidOptionText.trim() || DEFAULT_WIZARD_ANSWERS.invalidOptionText,
      options: optionRows,
    };
  };

  buildMenu("", null);
  return withOptionalConsent({ start: "menu_principal", nodes }, answers, "menu_principal");
}

export function buildDirectHandoffFlow(answers: StandardFlowWizardAnswers): FlowDefinition {
  const destination = answers.destinations[0] ?? { type: "department" as const };
  return {
    start: "atendimento_humano",
    nodes: {
      atendimento_humano: {
        type: "handoff",
        ...(buildHandoffText(answers) ? { text: answers.initialMessage.trim() || buildHandoffText(answers) } : { sendFeedback: false }),
        ...(destination.departmentId ? { departmentId: destination.departmentId } : {}),
        ...(destination.queueId ? { queueId: destination.queueId } : {}),
      },
    },
  };
}

export function buildPreServiceCaptureFlow(answers: StandardFlowWizardAnswers): FlowDefinition {
  const questions = answers.captureQuestions.filter((question) => question.trim());
  const destination = answers.destinations[0] ?? { type: "department" as const };
  const nodes: FlowDefinition["nodes"] = {};
  const handoffId = "atendimento_humano";
  questions.forEach((question, index) => {
    const nodeId = `pergunta_${index + 1}`;
    nodes[nodeId] = {
      type: "capture",
      text: index === 0 ? answers.initialMessage.trim() || question.trim() : question.trim(),
      field: `resposta_${index + 1}`,
      validation: "non_empty",
      next: index < questions.length - 1 ? `pergunta_${index + 2}` : handoffId,
    };
  });
  nodes[handoffId] = {
    type: "handoff",
    ...(buildHandoffText(answers) ? { text: buildHandoffText(answers) } : { sendFeedback: false }),
    ...(destination.departmentId ? { departmentId: destination.departmentId } : {}),
    ...(destination.queueId ? { queueId: destination.queueId } : {}),
  };
  return { start: questions.length > 0 ? "pergunta_1" : handoffId, nodes };
}

export function buildInformationFlow(answers: StandardFlowWizardAnswers): FlowDefinition {
  const nodes: FlowDefinition["nodes"] = {
    mensagem_inicial: {
      type: "text",
      text: answers.initialMessage.trim() || "Mensagem informativa.",
    },
  };
  if (answers.informationNext === "message") {
    nodes.mensagem_inicial.next = "mensagem_complementar";
    nodes.mensagem_complementar = { type: "text", text: answers.followupMessage.trim() || DEFAULT_WIZARD_ANSWERS.followupMessage };
  } else if (answers.informationNext === "human") {
    const destination = answers.destinations[0] ?? { type: "department" as const };
    nodes.mensagem_inicial.next = "atendimento_humano";
    nodes.atendimento_humano = {
      type: "handoff",
      ...(buildHandoffText(answers) ? { text: buildHandoffText(answers) } : { sendFeedback: false }),
      ...(destination.departmentId ? { departmentId: destination.departmentId } : {}),
      ...(destination.queueId ? { queueId: destination.queueId } : {}),
    };
  } else if (answers.informationNext === "question") {
    nodes.mensagem_inicial.next = "pergunta_1";
    nodes.pergunta_1 = {
      type: "capture",
      text: answers.captureQuestions[0]?.trim() || "Informe sua resposta.",
      field: "resposta_1",
      validation: "non_empty",
    };
  } else if (answers.informationNext === "menu") {
    const menuFlow = buildInstitutionalMenuFlow({ ...answers, consentEnabled: false });
    nodes.mensagem_inicial.next = menuFlow.start;
    Object.assign(nodes, menuFlow.nodes);
  }
  return { start: "mensagem_inicial", nodes };
}

export function buildStandardFlowDefinition(answers: StandardFlowWizardAnswers): FlowDefinition {
  if (answers.template === "direct_handoff") return buildDirectHandoffFlow(answers);
  if (answers.template === "pre_service_collection") return buildPreServiceCaptureFlow(answers);
  if (answers.template === "information") return buildInformationFlow(answers);
  return buildInstitutionalMenuFlow(answers);
}

export function validateWizardStep(answers: StandardFlowWizardAnswers, step: string) {
  const errors: string[] = [];
  if (step === "initial" && !answers.initialMessage.trim()) {
    errors.push("Escreva a mensagem inicial que o cidadão verá.");
  }
  if (step === "consent" && answers.consentEnabled && !answers.consentMessage.trim()) {
    errors.push("Escreva a mensagem de consentimento.");
  }
  if (step === "options") {
    const filled = answers.menuOptions.filter((option) => option.trim());
    if (filled.length === 0) errors.push("Adicione pelo menos uma opção ao menu.");
    const normalized = filled.map((option) => option.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) errors.push("As opções do menu precisam ter nomes diferentes.");
  }
  if (step === "destinations") {
    const visit = (menuKey: string) => {
      const menu = getMenuDraftForKey(answers, menuKey);
      menu.options.forEach((option, index) => {
        const destination = menu.destinations[index];
        const label = sanitizeLabel(option, `Opção ${index + 1}`);
        if (!destination) errors.push(`A opção ${label} ainda não possui destino.`);
        if ((destination?.type === "department" || destination?.type === "queue") && !destination.departmentId) {
          errors.push(`Escolha o setor que receberá ${label}.`);
        }
        if (destination?.type === "submenu") {
          const submenuKey = destination.submenuKey || submenuKeyForOption(menuKey, index);
          const submenu = getMenuDraftForKey(answers, submenuKey);
          if (!submenu.title.trim()) errors.push(`Informe o nome do submenu de ${label}.`);
          if (submenu.options.filter((item) => item.trim()).length === 0) errors.push(`Adicione pelo menos uma opção no submenu ${label}.`);
          visit(submenuKey);
        }
      });
    };
    visit("");
  }
  if (step === "destination") {
    const destination = answers.destinations[0];
    if (!destination?.departmentId) errors.push("Escolha o setor que receberá este atendimento.");
  }
  if (step === "capture") {
    if (answers.captureQuestions.filter((question) => question.trim()).length === 0) {
      errors.push("Adicione pelo menos uma pergunta.");
    }
  }
  return errors;
}

function makeNodeId(existingNodes: Record<string, Record<string, unknown>>, type: string) {
  return buildNodeId(existingNodes, type);
}

const GUIDED_STATUS_LABELS: Record<GuidedStepStatus, string> = {
  complete: "Completo",
  incomplete: "Incompleto",
  not_applicable: "Não aplicável",
  warning: "Atenção",
  error: "Erro",
};

function truncateText(value: string, maxLength = 120) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function getDepartmentName(departments: ChatbotFlowBuilderDepartment[], id: unknown) {
  if (typeof id !== "string" || !id.trim()) return "";
  return departments.find((department) => department.id === id)?.name ?? "Setor não encontrado";
}

function getQueueName(queues: ChatbotFlowBuilderQueue[], id: unknown) {
  if (typeof id !== "string" || !id.trim()) return "";
  return queues.find((queue) => queue.id === id)?.name ?? "Fila não encontrada";
}

function describeDestination(
  destination: Record<string, unknown>,
  departments: ChatbotFlowBuilderDepartment[],
  queues: ChatbotFlowBuilderQueue[]
) {
  const department = getDepartmentName(departments, destination.departmentId);
  const queue = getQueueName(queues, destination.queueId);
  if (!department && !queue) return "Destino ainda não configurado.";
  return [department || "Setor não configurado", queue || "Fila padrão"].join(" · ");
}

function describeNodeForCitizen(nodeId: string, node: Record<string, unknown> | undefined) {
  if (!node) return "Etapa inicial não configurada.";
  const type = stringValue(node.type);
  if (type === "menu") return truncateText(stringValue(node.text) || "Menu sem mensagem.");
  if (type === "text") return truncateText(stringValue(node.text) || "Mensagem sem texto.");
  if (type === "capture") return truncateText(stringValue(node.text) || "Pergunta sem texto.");
  if (type === "consent") return truncateText(stringValue(node.message) || "Consentimento sem mensagem.");
  if (type === "handoff") return stringValue(node.text) ? truncateText(stringValue(node.text)) : "Encaminhamento para atendimento humano.";
  return `Etapa avançada preservada (${nodeId}).`;
}

function getClosestPattern(definition: FlowDefinition) {
  const nodes = Object.values(definition.nodes);
  const startNode = definition.nodes[definition.start];
  if (startNode?.type === "consent") return "Solicitar consentimento antes de continuar";
  if (startNode?.type === "handoff") return "Encaminhar direto para atendimento humano";
  if (startNode?.type === "capture") return "Coletar uma informação";
  if (startNode?.type === "text" && !stringValue(startNode.next)) return "Exibir uma mensagem informativa";
  if (nodes.some((node) => node.type === "menu")) return "Apresentar um menu de opções";
  return "Personalizado / avançado";
}

function getPrimaryMenuEntry(definition: FlowDefinition) {
  if (definition.nodes[definition.start]?.type === "menu") {
    return { id: definition.start, node: definition.nodes[definition.start] };
  }
  const entry = Object.entries(definition.nodes).find(([, node]) => node.type === "menu");
  return entry ? { id: entry[0], node: entry[1] } : null;
}

function getMenuEntries(definition: FlowDefinition) {
  return Object.entries(definition.nodes)
    .filter(([, node]) => node.type === "menu")
    .map(([id, node]) => ({ id, node }));
}

function getHandoffEntries(definition: FlowDefinition) {
  const entries: Array<{ source: string; nodeId: string; node: Record<string, unknown> }> = [];
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type === "handoff") entries.push({ source: "Etapa de atendimento humano", nodeId, node });
    if (node.type !== "menu") continue;
    for (const option of getOptions(node)) {
      const target = definition.nodes[stringValue(option.next)];
      if (target?.type === "handoff") {
        entries.push({ source: stringValue(option.label) || "Opção do menu", nodeId: stringValue(option.next), node: target });
      }
    }
  }
  return entries;
}

function getMenuParentMap(definition: FlowDefinition) {
  const parents = new Map<string, { nodeId: string; optionLabel: string }>();
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type !== "menu") continue;
    for (const option of getOptions(node)) {
      const targetId = stringValue(option.next);
      const target = definition.nodes[targetId];
      if (target?.type === "menu" && !parents.has(targetId)) {
        parents.set(targetId, { nodeId, optionLabel: stringValue(option.label) || targetId });
      }
    }
  }
  return parents;
}

function getMenuBreadcrumb(definition: FlowDefinition, nodeId: string) {
  const parents = getMenuParentMap(definition);
  const items: string[] = [];
  let current = nodeId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = definition.nodes[current];
    items.unshift(current === getPrimaryMenuEntry(definition)?.id ? "Menu principal" : truncateText(stringValue(node?.text) || current, 42));
    const parent = parents.get(current);
    if (!parent) break;
    current = parent.nodeId;
  }
  return items;
}

function getQuestionEntries(definition: FlowDefinition) {
  return Object.entries(definition.nodes).filter(([, node]) => node.type === "capture" || node.type === "text" || node.type === "menu");
}

function hasAdvancedFields(definition: FlowDefinition) {
  const simpleTopLevelFields = new Set(["start", "nodes", "globalCommands", "inactivityPolicy"]);
  const simpleFields = new Set([
    "type",
    "text",
    "options",
    "next",
    "field",
    "validation",
    "errorText",
    "purpose",
    "textVersion",
    "message",
    "acceptOption",
    "declineOption",
    "invalidText",
    "onAccepted",
    "onDeclined",
    "departmentId",
    "queueId",
    "sendFeedback",
    "handoffSummary",
    "closedText",
  ]);
  if (Object.keys(definition).some((key) => !simpleTopLevelFields.has(key))) return true;
  return Object.values(definition.nodes).some((node) => Object.keys(node).some((key) => !simpleFields.has(key)));
}

function describeRoutedHandoff(
  target: Record<string, unknown>,
  option: Record<string, unknown>,
  departments: ChatbotFlowBuilderDepartment[],
  queues: ChatbotFlowBuilderQueue[]
) {
  return describeDestination(
    {
      ...target,
      departmentId: option.departmentId ?? target.departmentId,
      queueId: option.queueId ?? target.queueId,
    },
    departments,
    queues
  );
}

function buildJourneyLines(
  definition: FlowDefinition,
  departments: ChatbotFlowBuilderDepartment[],
  queues: ChatbotFlowBuilderQueue[]
) {
  const lines: string[] = [];
  const visited = new Set<string>();
  const walk = (nodeId: string, depth: number) => {
    const node = definition.nodes[nodeId];
    const prefix = depth === 0 ? "INÍCIO" : `${"  ".repeat(depth)}↳`;
    if (!node) {
      lines.push(`${prefix} Destino ainda não configurado.`);
      return;
    }
    if (visited.has(nodeId)) {
      lines.push(`${prefix} Retorna para etapa já apresentada.`);
      return;
    }
    visited.add(nodeId);
    const type = stringValue(node.type);
    if (type === "handoff") {
      lines.push(`${prefix} HUMANO → ${describeDestination(node, departments, queues)}`);
      return;
    }
    if (type === "menu") {
      lines.push(`${prefix} MENU → ${describeNodeForCitizen(nodeId, node)}`);
      getOptions(node).forEach((option) => {
        const target = definition.nodes[stringValue(option.next)];
        const label = stringValue(option.label) || "Opção sem título";
        if (target?.type === "handoff") {
          lines.push(`${"  ".repeat(depth + 1)}├─ ${label} → HUMANO → ${describeRoutedHandoff(target, option, departments, queues)}`);
        } else {
          lines.push(`${"  ".repeat(depth + 1)}├─ ${label} → ${target ? nodeTypeLabel(stringValue(target.type)) : "Destino ainda não configurado"}`);
        }
      });
      return;
    }
    lines.push(`${prefix} ${nodeTypeLabel(type).toUpperCase()} → ${describeNodeForCitizen(nodeId, node)}`);
    const next = type === "consent" ? stringValue(node.onAccepted) : stringValue(node.next);
    if (next) walk(next, depth + 1);
  };
  walk(definition.start, 0);
  return lines.slice(0, 24);
}

function buildExpectedResultLines(
  definition: FlowDefinition,
  departments: ChatbotFlowBuilderDepartment[],
  queues: ChatbotFlowBuilderQueue[]
) {
  const startNode = definition.nodes[definition.start];
  const primaryMenu = getPrimaryMenuEntry(definition);
  const handoffs = getHandoffEntries(definition);
  const lines = [`Quando o cidadão enviar a primeira mensagem, verá: "${describeNodeForCitizen(definition.start, startNode)}"`];
  if (primaryMenu) {
    lines.push(`Poderá escolher entre ${getOptions(primaryMenu.node).length} opção(ões).`);
    getOptions(primaryMenu.node).slice(0, 5).forEach((option) => {
      const target = definition.nodes[stringValue(option.next)];
      if (target?.type === "handoff") {
        lines.push(`Se escolher ${stringValue(option.label)}, será encaminhado para ${describeRoutedHandoff(target, option, departments, queues)}`);
      }
    });
  }
  if (handoffs.length > 0) {
    lines.push(handoffs.some((entry) => entry.node.sendFeedback === false)
      ? "Alguns encaminhamentos humanos estão sem mensagem automática antes da transferência."
      : "No encaminhamento humano, a mensagem automática está ativa quando configurada.");
  }
  if (hasAdvancedFields(definition)) {
    lines.push("Este fluxo possui configurações avançadas preservadas.");
  }
  return lines;
}

function buildChecklist(definition: FlowDefinition, issues: string[]) {
  const hasStart = Boolean(definition.nodes[definition.start]);
  const hasRequiredMessages = !issues.some((issue) => issue.includes("precisa de mensagem") || issue.includes("precisa da mensagem"));
  const hasMenuOptions = !issues.some((issue) => issue.includes("precisa de título") || issue.includes("precisa de destino"));
  const hasValidRoutes = !issues.some((issue) => issue.includes("aponta para etapa inexistente") || issue.includes("etapa inexistente"));
  const hasHandoffDepartments = !issues.some((issue) => issue.includes("encaminha para humano sem setor definido"));
  const hasCompatibleQueues = !issues.some((issue) => issue.includes("usa fila de outro setor"));
  return [
    { group: "Estrutura", label: "Etapa inicial definida", status: hasStart ? "PASS" : "ERROR" },
    { group: "Estrutura", label: "Referências válidas", status: hasValidRoutes ? "PASS" : "ERROR" },
    { group: "Conteúdo", label: "Mensagens obrigatórias preenchidas", status: hasRequiredMessages ? "PASS" : "ERROR" },
    { group: "Conteúdo", label: "Menus possuem opções válidas", status: hasMenuOptions ? "PASS" : "ERROR" },
    { group: "Roteamento", label: "Atendimentos humanos possuem setor", status: hasHandoffDepartments ? "PASS" : "WARNING" },
    { group: "Roteamento", label: "Filas compatíveis com setores", status: hasCompatibleQueues ? "PASS" : "ERROR" },
  ];
}

function buildGuidedSteps(params: {
  definition: FlowDefinition;
  issues: string[];
  active?: boolean;
  entryPoint?: boolean;
}) {
  const { definition, issues, active, entryPoint } = params;
  const startNode = definition.nodes[definition.start];
  const primaryMenu = getPrimaryMenuEntry(definition);
  const handoffs = getHandoffEntries(definition);
  const questionCount = getQuestionEntries(definition).filter(([nodeId]) => nodeId !== primaryMenu?.id).length;
  const hasErrors = issues.length > 0;
  return [
    { key: "objective", number: 1, title: "Objetivo", summary: getClosestPattern(definition), status: "complete", targetId: "guided-step-objective" },
    { key: "start", number: 2, title: "Início do atendimento", summary: describeNodeForCitizen(definition.start, startNode), status: startNode ? "complete" : "error", targetId: "guided-step-start" },
    { key: "main", number: 3, title: "Menu / interação principal", summary: primaryMenu ? `${getOptions(primaryMenu.node).length} opção(ões)` : "Sem menu principal.", status: primaryMenu ? "complete" : "not_applicable", targetId: "guided-step-main" },
    { key: "questions", number: 4, title: "Submenus e perguntas", summary: questionCount > 0 ? `${questionCount} etapa(s) de apoio` : "Nenhuma etapa adicional.", status: questionCount > 0 ? "complete" : "not_applicable", targetId: "guided-step-questions" },
    { key: "handoff", number: 5, title: "Destinos humanos", summary: handoffs.length > 0 ? `${handoffs.length} destino(s)` : "Sem encaminhamento humano.", status: handoffs.length > 0 ? "complete" : "not_applicable", targetId: "guided-step-handoff" },
    { key: "exceptions", number: 6, title: "Exceções", summary: "Opção inválida, voltar, inatividade e horários.", status: "complete", targetId: "guided-step-exceptions" },
    { key: "preview", number: 7, title: "Prévia da jornada", summary: "Caminho legível do cidadão.", status: "complete", targetId: "guided-step-preview" },
    { key: "checklist", number: 8, title: "Checklist", summary: hasErrors ? `${issues.length} pendência(s)` : "Sem pendências críticas.", status: hasErrors ? "error" : "complete", targetId: "guided-step-checklist" },
    { key: "activation", number: 9, title: "Ativação", summary: active && entryPoint ? "Pode receber novas conversas." : "Revise ativo e entrada principal.", status: hasErrors ? "warning" : active && entryPoint ? "complete" : "incomplete", targetId: "guided-step-activation" },
  ] as GuidedStep[];
}

export function createGuidedObjectiveDefinition(definition: FlowDefinition, objective: GuidedObjective): FlowDefinition {
  if (objective === "custom") return definition;
  if (objective === "handoff") {
    const handoffId = "handoff_1";
    return {
      ...definition,
      start: handoffId,
      nodes: {
        [handoffId]: {
          type: "handoff",
          text: "Vou encaminhar para atendimento humano.",
        },
      },
    };
  }
  if (objective === "menu") {
    const menuId = "menu_1";
    return {
      ...definition,
      start: menuId,
      nodes: {
        [menuId]: {
          type: "menu",
          text: "Escolha uma opção:",
          options: [],
        },
      },
    };
  }
  if (objective === "consent") {
    const consentId = "consent_1";
    const handoffId = "handoff_2";
    return {
      ...definition,
      start: consentId,
      nodes: {
        [consentId]: {
          type: "consent",
          purpose: "atendimento",
          textVersion: "draft",
          message: "Para prosseguir, confirme que leu e aceita o atendimento por este canal.",
          acceptOption: "1",
          onAccepted: handoffId,
        },
        [handoffId]: {
          type: "handoff",
          text: "Vou encaminhar para atendimento humano.",
        },
      },
    };
  }
  if (objective === "capture") {
    const captureId = "capture_1";
    const handoffId = "handoff_2";
    return {
      ...definition,
      start: captureId,
      nodes: {
        [captureId]: {
          type: "capture",
          text: "Informe sua resposta:",
          field: "resposta",
          validation: "non_empty",
          next: handoffId,
        },
        [handoffId]: {
          type: "handoff",
          text: "Vou encaminhar para atendimento humano.",
        },
      },
    };
  }
  const textId = "text_1";
  return {
    ...definition,
    start: textId,
    nodes: {
      [textId]: {
        type: "text",
        text: "Mensagem do fluxo.",
      },
    },
  };
}

function getReachableNodeIds(definition: FlowDefinition) {
  const reachable = new Set<string>();
  const visit = (nodeId: string) => {
    const node = definition.nodes[nodeId];
    if (!node || reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const type = stringValue(node.type);
    if (type === "menu") {
      getOptions(node).forEach((option) => visit(stringValue(option.next)));
      return;
    }
    if (type === "consent") {
      visit(stringValue(node.onAccepted));
      visit(stringValue(node.onDeclined));
      return;
    }
    visit(stringValue(node.next));
  };
  visit(definition.start);
  return reachable;
}

function firstBrokenReference(definition: FlowDefinition) {
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    const type = stringValue(node.type);
    if (type === "menu") {
      const broken = getOptions(node).find((option) => stringValue(option.next) && !definition.nodes[stringValue(option.next)]);
      if (broken) return nodeId;
    }
    const next = type === "consent" ? stringValue(node.onAccepted) || stringValue(node.onDeclined) : stringValue(node.next);
    if (next && !definition.nodes[next]) return nodeId;
  }
  return null;
}

export function getGuidedNextTask(definition: FlowDefinition, queues: ChatbotFlowBuilderQueue[]): GuidedTask {
  const startNode = definition.nodes[definition.start];
  if (!startNode) {
    return {
      kind: "objective",
      title: "Escolha o objetivo inicial do fluxo",
      summary: "A etapa inicial ainda não aponta para um passo válido.",
    };
  }

  const startType = stringValue(startNode.type);
  const needsStartContent =
    ((startType === "menu" || startType === "text" || startType === "capture") && !stringValue(startNode.text).trim()) ||
    (startType === "consent" && !stringValue(startNode.message).trim());
  if (needsStartContent) {
    return {
      kind: "start_content",
      nodeId: definition.start,
      title: "Escreva a primeira mensagem",
      summary: "Esta é a primeira resposta automática enviada ao cidadão.",
    };
  }

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type !== "menu") continue;
    const options = getOptions(node);
    if (options.length === 0) {
      return {
        kind: "menu_option",
        nodeId,
        title: "Adicione a primeira opção do menu",
        summary: "Cada opção precisa de um texto e de um destino.",
      };
    }
    const missingDestinationIndex = options.findIndex((option) => !stringValue(option.next).trim());
    if (missingDestinationIndex >= 0) {
      return {
        kind: "menu_option_destination",
        nodeId,
        optionIndex: missingDestinationIndex,
        title: "Escolha o destino da opção",
        summary: stringValue(options[missingDestinationIndex]?.label) || `Opção ${missingDestinationIndex + 1}`,
      };
    }
  }

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type === "handoff" && !stringValue(node.departmentId).trim()) {
      return {
        kind: "handoff_destination",
        nodeId,
        title: "Escolha o setor de atendimento",
        summary: "O encaminhamento humano precisa de um setor.",
      };
    }
    if (node.type === "handoff") {
      const queue = queues.find((item) => item.id === node.queueId);
      if (queue && node.departmentId && queue.departmentId !== node.departmentId) {
        return {
          kind: "handoff_destination",
          nodeId,
          title: "Revise a fila deste atendimento",
          summary: "A fila precisa pertencer ao setor escolhido.",
        };
      }
    }
  }

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type === "consent" && (!stringValue(node.onAccepted).trim() || !definition.nodes[stringValue(node.onAccepted)])) {
      return {
        kind: "consent_destination",
        nodeId,
        title: "Escolha o caminho após o consentimento",
        summary: "Quando o cidadão aceitar, o fluxo precisa continuar para uma etapa válida.",
      };
    }
    if (node.type === "capture" && !stringValue(node.field).trim()) {
      return {
        kind: "capture_field",
        nodeId,
        title: "Defina o campo salvo",
        summary: "A resposta coletada precisa de um nome interno de campo.",
      };
    }
    if (node.type === "capture" && (!stringValue(node.next).trim() || !definition.nodes[stringValue(node.next)])) {
      return {
        kind: "capture_next",
        nodeId,
        title: "Escolha o próximo passo após a resposta",
        summary: "Depois de coletar a informação, o fluxo precisa seguir para outra etapa.",
      };
    }
  }

  const brokenReference = firstBrokenReference(definition);
  if (brokenReference) {
    return {
      kind: "broken_reference",
      nodeId: brokenReference,
      title: "Corrija uma referência quebrada",
      summary: "Há um destino apontando para uma etapa inexistente.",
    };
  }

  const reachable = getReachableNodeIds(definition);
  const orphan = Object.keys(definition.nodes).find((nodeId) => !reachable.has(nodeId));
  if (orphan) {
    return {
      kind: "orphan",
      nodeId: orphan,
      title: "Revise uma etapa fora do caminho principal",
      summary: "A etapa foi preservada, mas nenhum caminho chega nela atualmente.",
    };
  }

  return {
    kind: "review",
    title: "Fluxo pronto para revisão",
    summary: "Revise a prévia e o checklist antes de salvar ou ativar.",
  };
}

function setMenuOption(definition: FlowDefinition, nodeId: string, optionIndex: number, patch: Record<string, unknown>) {
  const node = definition.nodes[nodeId] ?? {};
  const options = getOptions(node).map((option, index) => (index === optionIndex ? { ...option, ...patch } : option));
  return setNodeField(definition, nodeId, "options", options);
}

function appendMenuOption(definition: FlowDefinition, nodeId: string, label: string) {
  const node = definition.nodes[nodeId] ?? {};
  const options = [...getOptions(node), { label, next: "" }];
  return setNodeField(definition, nodeId, "options", options);
}

function attachNewDestination(
  definition: FlowDefinition,
  sourceNodeId: string,
  optionIndex: number,
  type: Exclude<GuidedObjective, "custom" | "menu">
) {
  const nextNodes = { ...definition.nodes };
  const nodeId = makeNodeId(nextNodes, type);
  if (type === "handoff") {
    nextNodes[nodeId] = { type: "handoff", text: "Vou encaminhar para atendimento humano." };
  } else if (type === "capture") {
    nextNodes[nodeId] = { type: "capture", text: "Informe sua resposta:", field: "resposta", validation: "non_empty" };
  } else if (type === "consent") {
    nextNodes[nodeId] = {
      type: "consent",
      purpose: "atendimento",
      textVersion: "draft",
      message: "Para prosseguir, confirme que leu e aceita o atendimento por este canal.",
      acceptOption: "1",
    };
  } else {
    nextNodes[nodeId] = { type: "text", text: "Mensagem do fluxo." };
  }
  return setMenuOption({ ...definition, nodes: nextNodes }, sourceNodeId, optionIndex, { next: nodeId });
}

function guidedStatusClass(status: GuidedStepStatus) {
  if (status === "complete") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "error") return "border-red-300/30 bg-red-500/10 text-red-100";
  if (status === "warning" || status === "incomplete") return "border-amber-300/30 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/60";
}

function checklistStatusClass(status: string) {
  if (status === "PASS") return "text-emerald-100";
  if (status === "WARNING") return "text-amber-100";
  return "text-red-100";
}

type CollapsibleSectionProps = {
  id: string;
  title: string;
  summary?: string;
  defaultExpanded: boolean;
  hasIssue?: boolean;
  children: ReactNode;
};

function CollapsibleSection({
  id,
  title,
  summary,
  defaultExpanded,
  hasIssue,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, id]);

  return (
    <section
      className={`chatbot-field-group overflow-hidden rounded-lg border transition ${
        expanded
          ? "border-re7-sky/35 bg-white/[0.07] shadow-sm shadow-re7-sky/10"
          : "border-white/10 bg-black/15"
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 focus:ring-offset-2 focus:ring-offset-re7-navy"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {summary ? <span className="mt-0.5 block text-xs text-white/50">{summary}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-white/70">
          {hasIssue ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-amber-100">
              Revisar
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={`grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-white/10 text-base leading-none transition ${
              expanded ? "rotate-90 text-re7-sky" : "text-white/75"
            }`}
          >
            ›
          </span>
        </span>
      </button>
      <div id={id} hidden={!expanded} className={expanded ? "grid gap-3 border-t border-white/10 px-3 pb-3 pt-3" : "hidden"}>
        {children}
      </div>
    </section>
  );
}

export function ChatbotFlowBuilder({
  definitionText,
  onDefinitionTextChange,
  disabled,
  isActive,
  entryPoint,
  allowObjectiveReset,
  departments,
  queues,
  advancedEditor,
}: Props) {
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const [activeStep, setActiveStep] = useState<GuidedStepKey>("objective");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [objectiveInitialized, setObjectiveInitialized] = useState(false);
  const [wizardAnswers, setWizardAnswers] = useState<StandardFlowWizardAnswers>(DEFAULT_WIZARD_ANSWERS);
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardErrors, setWizardErrors] = useState<string[]>([]);
  const [wizardMenuKey, setWizardMenuKey] = useState("");
  const [wizardApplyFeedback, setWizardApplyFeedback] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [existingFlowView, setExistingFlowView] = useState<"overview" | "journey" | "simple">("overview");
  const [editingMenuNodeId, setEditingMenuNodeId] = useState<string | null>(null);
  const parsed = useMemo(() => parseDefinition(definitionText), [definitionText]);
  const issues = useMemo(
    () => (parsed.ok ? buildIssues(parsed.definition, queues) : [parsed.message]),
    [parsed, queues]
  );

  const commit = (definition: FlowDefinition) => onDefinitionTextChange(formatDefinition(definition));

  const resetWizardSession = () => {
    setWizardAnswers(DEFAULT_WIZARD_ANSWERS);
    setWizardStepIndex(0);
    setWizardErrors([]);
    setWizardMenuKey("");
    setWizardApplyFeedback(null);
  };

  if (!parsed.ok) {
    return (
      <div className="chatbot-flow-builder grid gap-3">
        <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          O editor guiado precisa de JSON valido para carregar. Corrija no modo avançado.
        </div>
        {advancedEditor}
      </div>
    );
  }

  const definition = parsed.definition;
  const nodeIds = Object.keys(definition.nodes);
  const handoffCount = Object.values(definition.nodes).filter((node) => node.type === "handoff").length;
  const menuCount = Object.values(definition.nodes).filter((node) => node.type === "menu").length;
  const departmentIds = new Set(
    Object.values(definition.nodes)
      .flatMap((node) => [node.departmentId, ...getOptions(node).map((option) => option.departmentId)])
      .filter((value): value is string => typeof value === "string" && Boolean(value))
  );
  const guidedSteps = buildGuidedSteps({ definition, issues, active: isActive, entryPoint });
  const selectedGuidedStep = guidedSteps.find((step) => step.key === activeStep) ?? guidedSteps[0];
  const startNode = definition.nodes[definition.start];
  const closestPattern = getClosestPattern(definition);
  const primaryMenu = getPrimaryMenuEntry(definition);
  const menuEntries = getMenuEntries(definition);
  const handoffEntries = getHandoffEntries(definition);
  const questionEntries = getQuestionEntries(definition).filter(([nodeId]) => nodeId !== primaryMenu?.id);
  const expectedResultLines = buildExpectedResultLines(definition, departments, queues);
  const journeyLines = buildJourneyLines(definition, departments, queues);
  const checklist = buildChecklist(definition, issues);
  const hasBlockingChecklistIssue = checklist.some((item) => item.status === "ERROR");
  const guidedTask = allowObjectiveReset && !objectiveInitialized
    ? {
        kind: "objective" as const,
        title: "Escolha o objetivo inicial do fluxo",
        summary: "Esta escolha monta o primeiro caminho do rascunho atual.",
      }
    : getGuidedNextTask(definition, queues);
  const guidedTaskNode = "nodeId" in guidedTask ? definition.nodes[guidedTask.nodeId] : null;
  const selectedDepartmentQueues = guidedTaskNode
    ? queues.filter((queue) => !guidedTaskNode.departmentId || queue.departmentId === guidedTaskNode.departmentId)
    : queues;
  const activeStepIndex = guidedSteps.findIndex((step) => step.key === selectedGuidedStep.key);
  const goToStep = (step: GuidedStep) => {
    setActiveStep(step.key);
    window.requestAnimationFrame(() => {
      document.getElementById(step.targetId)?.focus();
    });
  };
  const goToRelativeStep = (offset: number) => {
    const nextStep = guidedSteps[Math.min(Math.max(activeStepIndex + offset, 0), guidedSteps.length - 1)];
    if (nextStep) goToStep(nextStep);
  };
  const taskBelongsToCurrentStep =
    (selectedGuidedStep.key === "objective" && guidedTask.kind === "objective") ||
    (selectedGuidedStep.key === "start" && guidedTask.kind === "start_content") ||
    (selectedGuidedStep.key === "main" && (guidedTask.kind === "menu_option" || guidedTask.kind === "menu_option_destination")) ||
    (selectedGuidedStep.key === "handoff" && guidedTask.kind === "handoff_destination") ||
    (selectedGuidedStep.key === "questions" && (guidedTask.kind === "capture_field" || guidedTask.kind === "capture_next" || guidedTask.kind === "consent_destination")) ||
    (selectedGuidedStep.key === "checklist" && (guidedTask.kind === "broken_reference" || guidedTask.kind === "orphan")) ||
    (selectedGuidedStep.key === "activation" && guidedTask.kind === "review");
  const guidedTaskPanel = taskBelongsToCurrentStep ? (
    <section className="rounded-lg border border-re7-sky/30 bg-re7-sky/10 p-3">
      <div>
        <p className="text-xs font-semibold uppercase text-re7-sky/80">Ação deste passo</p>
        <h4 className="mt-1 text-base font-semibold text-white">{guidedTask.title}</h4>
        <p className="mt-1 text-sm text-white/65">{guidedTask.summary}</p>
      </div>

      {guidedTask.kind === "objective" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {OBJECTIVE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled || (!allowObjectiveReset && option.value !== "custom")}
              onClick={() => {
                if (option.value === "custom") {
                  setObjectiveInitialized(true);
                  setMode("advanced");
                  return;
                }
                setObjectiveInitialized(true);
                commit(createGuidedObjectiveDefinition(definition, option.value));
              }}
              className="rounded-md border border-white/15 bg-black/15 px-3 py-2 text-left text-sm text-white/80 transition hover:border-re7-sky/60 hover:bg-re7-sky/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-semibold text-white">{option.label}</span>
              <span className="mt-1 block text-xs text-white/55">{option.summary}</span>
            </button>
          ))}
        </div>
      ) : null}

      {guidedTask.kind === "start_content" && guidedTaskNode ? (
        <label className="mt-3 grid gap-1 text-sm text-white/70">
          Mensagem inicial
          <textarea
            value={stringValue(guidedTaskNode.type === "consent" ? guidedTaskNode.message : guidedTaskNode.text)}
            disabled={disabled}
            onChange={(event) =>
              commit(setNodeField(
                definition,
                guidedTask.nodeId,
                guidedTaskNode.type === "consent" ? "message" : "text",
                event.target.value
              ))
            }
            className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
          />
        </label>
      ) : null}

      {guidedTask.kind === "menu_option" ? (
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-sm text-white/70">
            Texto da opção
            <input
              value={newOptionLabel}
              disabled={disabled}
              onChange={(event) => setNewOptionLabel(event.target.value)}
              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
              placeholder="Ex.: 1 - Falar com atendimento"
            />
          </label>
          <button
            type="button"
            disabled={disabled || !newOptionLabel.trim()}
            onClick={() => {
              commit(appendMenuOption(definition, guidedTask.nodeId, newOptionLabel.trim()));
              setNewOptionLabel("");
            }}
            className="w-fit rounded-md border border-re7-sky/50 bg-re7-sky/15 px-3 py-2 text-sm font-semibold text-white hover:bg-re7-sky/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar opção
          </button>
        </div>
      ) : null}

      {guidedTask.kind === "menu_option_destination" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { label: "Atendimento humano", type: "handoff" as const },
            { label: "Perguntar informação", type: "capture" as const },
            { label: "Enviar mensagem", type: "text" as const },
            { label: "Consentimento", type: "consent" as const },
          ].map((action) => (
            <button
              key={action.type}
              type="button"
              disabled={disabled}
              onClick={() => commit(attachNewDestination(definition, guidedTask.nodeId, guidedTask.optionIndex, action.type))}
              className="rounded-md border border-white/15 bg-black/15 px-3 py-2 text-left text-sm font-semibold text-white/80 hover:border-re7-sky/60 hover:bg-re7-sky/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
          <label className="grid gap-1 text-sm text-white/70 sm:col-span-2">
            Usar etapa existente
            <select
              value=""
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) {
                  commit(setMenuOption(definition, guidedTask.nodeId, guidedTask.optionIndex, { next: event.target.value }));
                }
              }}
              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
            >
              <option value="">Escolha uma etapa</option>
              {nodeIds.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {guidedTask.kind === "handoff_destination" && guidedTaskNode ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-white/70">
            Setor
            <select
              value={stringValue(guidedTaskNode.departmentId)}
              disabled={disabled}
              onChange={(event) => {
                let next = setNodeField(definition, guidedTask.nodeId, "departmentId", event.target.value);
                const currentQueue = queues.find((queue) => queue.id === guidedTaskNode.queueId);
                if (currentQueue && currentQueue.departmentId !== event.target.value) {
                  next = setNodeField(next, guidedTask.nodeId, "queueId", "");
                }
                commit(next);
              }}
              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
            >
              <option value="">Escolha um setor</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-white/70">
            Fila
            <select
              value={stringValue(guidedTaskNode.queueId)}
              disabled={disabled}
              onChange={(event) => commit(setNodeField(definition, guidedTask.nodeId, "queueId", event.target.value))}
              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
            >
              <option value="">Fila padrão do setor</option>
              {selectedDepartmentQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {guidedTask.kind === "consent_destination" && guidedTaskNode ? (
        <label className="mt-3 grid gap-1 text-sm text-white/70">
          Ao aceitar
          <select
            value={stringValue(guidedTaskNode.onAccepted)}
            disabled={disabled}
            onChange={(event) => commit(setNodeField(definition, guidedTask.nodeId, "onAccepted", event.target.value))}
            className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
          >
            <option value="">Escolha uma etapa</option>
            {nodeIds.filter((targetId) => targetId !== guidedTask.nodeId).map((targetId) => (
              <option key={targetId} value={targetId}>{targetId}</option>
            ))}
          </select>
        </label>
      ) : null}

      {guidedTask.kind === "capture_field" && guidedTaskNode ? (
        <label className="mt-3 grid gap-1 text-sm text-white/70">
          Campo que será salvo
          <input
            value={stringValue(guidedTaskNode.field)}
            disabled={disabled}
            onChange={(event) => commit(setNodeField(definition, guidedTask.nodeId, "field", event.target.value))}
            className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
            placeholder="Ex.: protocolo, email, assunto"
          />
        </label>
      ) : null}

      {guidedTask.kind === "capture_next" && guidedTaskNode ? (
        <label className="mt-3 grid gap-1 text-sm text-white/70">
          Próximo passo
          <select
            value={stringValue(guidedTaskNode.next)}
            disabled={disabled}
            onChange={(event) => commit(setNodeField(definition, guidedTask.nodeId, "next", event.target.value))}
            className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
          >
            <option value="">Escolha uma etapa</option>
            {nodeIds.filter((targetId) => targetId !== guidedTask.nodeId).map((targetId) => (
              <option key={targetId} value={targetId}>{targetId}</option>
            ))}
          </select>
        </label>
      ) : null}

      {guidedTask.kind === "broken_reference" || guidedTask.kind === "orphan" ? (
        <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Etapa: {guidedTask.nodeId}. A etapa foi preservada; ajuste o destino no modo avançado se este caminho ainda for necessário.
        </div>
      ) : null}

      {guidedTask.kind === "review" ? (
        <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          A estrutura principal está coerente. O salvamento continua validado pelo servidor.
        </div>
      ) : null}
    </section>
  ) : null;
  const guidedStepPanel = (() => {
    if (selectedGuidedStep.key === "objective") {
      return (
        <section
          id="guided-step-objective"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 1</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Objetivo do atendimento</h4>
            <p className="mt-1 text-sm text-white/65">
              Esta etapa identifica a estrutura principal do fluxo. Em fluxos existentes, a informação abaixo é apenas um diagnóstico e não altera o conteúdo salvo.
            </p>
          </div>
          <div className="rounded-lg border border-re7-sky/35 bg-re7-sky/10 p-3">
            <p className="text-xs font-semibold uppercase text-re7-sky/80">Estrutura detectada</p>
            <p className="mt-1 text-base font-semibold text-white">{closestPattern}</p>
            <p className="mt-1 text-sm text-white/65">
              Para trocar o objetivo inicial de um fluxo existente, crie um novo fluxo guiado ou ajuste a estrutura no modo avançado.
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-semibold uppercase text-white/45">Resumo do rascunho atual</p>
            <ul className="grid gap-1 text-sm text-white/70">
              {expectedResultLines.slice(0, 3).map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
              {hasAdvancedFields(definition) ? <li>Este fluxo possui configurações avançadas preservadas.</li> : null}
            </ul>
          </div>
          {issues.length > 0 ? (
            <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Pendências detectadas</p>
              <div className="mt-2 grid gap-1">
                {checklist.map((item) => (
                  <p key={`${item.group}-${item.label}`}>
                    {item.label}: <span className={checklistStatusClass(item.status)}>{item.status}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {guidedTaskPanel}
        </section>
      );
    }
    if (selectedGuidedStep.key === "start") {
      return (
        <section
          id="guided-step-start"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 2</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Defina a primeira resposta</h4>
            <p className="mt-1 text-sm text-white/65">Esta é a primeira mensagem automática que o cidadão verá quando o fluxo iniciar.</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
            {describeNodeForCitizen(definition.start, startNode)}
          </div>
          {guidedTaskPanel}
        </section>
      );
    }
    if (selectedGuidedStep.key === "main") {
      return (
        <section
          id="guided-step-main"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 3</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Configure a escolha principal</h4>
            <p className="mt-1 text-sm text-white/65">Trate cada opção como uma decisão do cidadão, com texto e próximo destino claros.</p>
          </div>
          {primaryMenu ? (
            <div className="grid gap-2">
              <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
                {describeNodeForCitizen(primaryMenu.id, primaryMenu.node)}
              </p>
              {getOptions(primaryMenu.node).map((option, index) => {
                const target = definition.nodes[stringValue(option.next)];
                return (
                  <div key={`${stringValue(option.label)}-${index}`} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                    <span className="font-semibold text-white">{stringValue(option.label) || `Opção ${index + 1}`}</span>
                    <span className="mt-1 block text-xs text-white/55">
                      {target?.type === "handoff"
                        ? `Atendimento humano · ${describeRoutedHandoff(target, option, departments, queues)}`
                        : target
                          ? nodeTypeLabel(stringValue(target.type))
                          : "Destino ainda não configurado."}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-white/60">Este fluxo não possui menu principal.</p>
          )}
          {guidedTaskPanel}
        </section>
      );
    }
    if (selectedGuidedStep.key === "questions") {
      return (
        <section
          id="guided-step-questions"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 4</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Revise submenus e perguntas</h4>
            <p className="mt-1 text-sm text-white/65">Use este passo para conferir caminhos de apoio sem misturar com o menu principal.</p>
          </div>
          <div className="grid gap-2">
            {questionEntries.length > 0 ? questionEntries.map(([nodeId, node]) => (
              <div key={nodeId} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                <span className="font-semibold text-white">O cidadão vê</span>
                <span className="mt-1 block">{describeNodeForCitizen(nodeId, node)}</span>
                <span className="mt-1 block text-xs text-white/55">
                  Depois: {stringValue(node.next) ? nodeTypeLabel(stringValue(definition.nodes[stringValue(node.next)]?.type)) : "encerra ou aguarda resposta, conforme a etapa."}
                </span>
              </div>
            )) : (
              <p className="text-sm text-white/60">Não há submenus ou perguntas adicionais neste fluxo.</p>
            )}
          </div>
          {guidedTaskPanel}
        </section>
      );
    }
    if (selectedGuidedStep.key === "handoff") {
      return (
        <section
          id="guided-step-handoff"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 5</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Escolha destinos humanos</h4>
            <p className="mt-1 text-sm text-white/65">Defina setor, fila e mensagem automática de encaminhamento quando existir atendimento humano.</p>
          </div>
          <div className="grid gap-2">
            {handoffEntries.length > 0 ? handoffEntries.map((entry, index) => (
              <div key={`${entry.nodeId}-${index}`} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                <span className="font-semibold text-white">{entry.source}</span>
                <span className="mt-1 block">{describeDestination(entry.node, departments, queues)}</span>
                <span className="mt-1 block text-xs text-white/55">
                  Mensagem de encaminhamento: {entry.node.sendFeedback === false ? "desativada" : "ativa quando houver texto configurado"}
                </span>
              </div>
            )) : (
              <p className="text-sm text-white/60">Nenhum destino humano configurado.</p>
            )}
          </div>
          {guidedTaskPanel}
        </section>
      );
    }
    if (selectedGuidedStep.key === "exceptions") {
      return (
        <section
          id="guided-step-exceptions"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 6</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Revise exceções</h4>
            <p className="mt-1 text-sm text-white/65">Exceções continuam configuradas no mesmo rascunho e respeitam a engine atual.</p>
          </div>
          <div className="grid gap-2 text-sm text-white/75">
            <p>Opção inválida: {primaryMenu?.node.fallbackText ? truncateText(stringValue(primaryMenu.node.fallbackText)) : "usa a resposta padrão da automação."}</p>
            <p>Voltar: {getBackCommand(definition) || "não configurado."}</p>
            <p>Inatividade: {getResetAfterMinutes(definition) ? `${getResetAfterMinutes(definition)} minuto(s) para reiniciar.` : "sem reset configurado."}</p>
            <p>Horário de setor: usado somente quando representado no fluxo/destino.</p>
          </div>
        </section>
      );
    }
    if (selectedGuidedStep.key === "preview") {
      return (
        <section
          id="guided-step-preview"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 7</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Veja a experiência final</h4>
            <p className="mt-1 text-sm text-white/65">Esta prévia resume o que o cidadão verá antes de você salvar.</p>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-white/75">
            {expectedResultLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
          </ol>
          <pre className="whitespace-pre-wrap rounded-md border border-white/10 bg-re7-navy/70 px-3 py-2 text-xs leading-relaxed text-white/75">
            {journeyLines.join("\n")}
          </pre>
        </section>
      );
    }
    if (selectedGuidedStep.key === "checklist") {
      return (
        <section
          id="guided-step-checklist"
          tabIndex={-1}
          className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
        >
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">Passo 8</p>
            <h4 className="mt-1 text-lg font-semibold text-white">Confira pendências</h4>
            <p className="mt-1 text-sm text-white/65">O servidor ainda valida o salvamento; este checklist antecipa problemas comuns.</p>
          </div>
          <div className="grid gap-2">
            {checklist.map((item) => (
              <p key={`${item.group}-${item.label}`} className="flex items-start justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span>
                  <span className="block text-xs uppercase text-white/45">{item.group}</span>
                  <span className="text-white/75">{item.label}</span>
                </span>
                <span className={`text-xs font-semibold ${checklistStatusClass(item.status)}`}>{item.status}</span>
              </p>
            ))}
          </div>
          {guidedTaskPanel}
        </section>
      );
    }
    return (
      <section
        id="guided-step-activation"
        tabIndex={-1}
        className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-4 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
      >
        <div>
          <p className="text-xs font-semibold uppercase text-white/45">Passo 9</p>
          <h4 className="mt-1 text-lg font-semibold text-white">Concluir e salvar</h4>
          <p className="mt-1 text-sm text-white/65">
            Ativo permite execução. Entrada principal permite receber novas conversas como fluxo de entrada do tenant.
          </p>
        </div>
        <p className={`rounded-md border px-3 py-2 text-sm ${hasBlockingChecklistIssue ? "border-amber-300/30 bg-amber-500/10 text-amber-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>
          {hasBlockingChecklistIssue
            ? "Existem pendências estruturais. Revise antes de ativar ou salvar como entrada principal."
            : "Checklist pronto para validação final antes de ativar."}
        </p>
        {guidedTaskPanel}
      </section>
    );
  })();
  const updateWizardAnswers = (patch: Partial<StandardFlowWizardAnswers>) => {
    setWizardErrors([]);
    setWizardApplyFeedback(null);
    setWizardAnswers((current) => ({ ...current, ...patch }));
  };
  const updateWizardMenu = (menuKey: string, patch: Partial<WizardMenuDraft>) => {
    setWizardErrors([]);
    setWizardApplyFeedback(null);
    if (!menuKey) {
      setWizardAnswers((current) => ({
        ...current,
        menuOptions: patch.options ?? current.menuOptions,
        destinations: patch.destinations ?? current.destinations,
      }));
      return;
    }
    setWizardAnswers((current) => {
      const currentMenu = getMenuDraftForKey(current, menuKey);
      return {
        ...current,
        submenus: {
          ...current.submenus,
          [menuKey]: { ...currentMenu, ...patch },
        },
      };
    });
  };
  const updateWizardDestination = (index: number, patch: Partial<WizardDestination>, menuKey = wizardMenuKey) => {
    setWizardErrors([]);
    setWizardApplyFeedback(null);
    setWizardAnswers((current) => ({
      ...current,
      ...(menuKey
        ? {
            submenus: {
              ...current.submenus,
              [menuKey]: {
                ...getMenuDraftForKey(current, menuKey),
                destinations: {
                  ...getMenuDraftForKey(current, menuKey).destinations,
                  [index]: { ...getMenuDraftForKey(current, menuKey).destinations[index], type: getMenuDraftForKey(current, menuKey).destinations[index]?.type ?? "department", ...patch },
                },
              },
            },
          }
        : {
            destinations: {
              ...current.destinations,
              [index]: { ...current.destinations[index], type: current.destinations[index]?.type ?? "department", ...patch },
            },
          }),
    }));
  };
  const wizardStepKeys = (() => {
    if (wizardAnswers.template === "institutional_menu") return ["initial", "consent", "options", "destinations", "invalid", "hours", "handoff", "review"];
    if (wizardAnswers.template === "direct_handoff") return ["initial", "destination", "handoff", "review"];
    if (wizardAnswers.template === "pre_service_collection") return ["initial", "capture", "destination", "handoff", "review"];
    if (wizardAnswers.template === "information") return ["initial", "info_next", "review"];
    return ["models"];
  })();
  const currentWizardStep = wizardStepKeys[Math.min(wizardStepIndex, wizardStepKeys.length - 1)] ?? "models";
  const generatedDefinition = wizardAnswers.template && wizardAnswers.template !== "advanced"
    ? buildStandardFlowDefinition(wizardAnswers)
    : definition;
  const generatedIssues = wizardAnswers.template && wizardAnswers.template !== "advanced"
    ? buildIssues(generatedDefinition, queues)
    : [];
  const generatedJourneyLines = buildJourneyLines(generatedDefinition, departments, queues);
  const generatedExpectedLines = buildExpectedResultLines(generatedDefinition, departments, queues);
  const wizardStepTitle =
    currentWizardStep === "initial" ? "Mensagem inicial"
    : currentWizardStep === "consent" ? "Consentimento"
    : currentWizardStep === "options" ? "Opções do menu"
    : currentWizardStep === "destinations" ? "Destino de cada opção"
    : currentWizardStep === "destination" ? "Destino do atendimento"
    : currentWizardStep === "capture" ? "Perguntas antes do atendimento"
    : currentWizardStep === "invalid" ? "Opção inválida"
    : currentWizardStep === "hours" ? "Horário de atendimento"
    : currentWizardStep === "handoff" ? "Mensagem antes da transferência"
    : currentWizardStep === "info_next" ? "Depois da mensagem"
    : currentWizardStep === "review" ? "Revisar antes de aplicar"
    : "Modelo";
  const goToNextWizardStep = () => {
    const errors = validateWizardStep(wizardAnswers, currentWizardStep);
    if (errors.length > 0) {
      setWizardErrors(errors);
      return;
    }
    setWizardErrors([]);
    setWizardStepIndex((current) => Math.min(current + 1, wizardStepKeys.length - 1));
  };
  const applyGeneratedDraft = () => {
    if (!generatedDefinition) {
      setWizardApplyFeedback({ tone: "error", message: "Não foi possível gerar o fluxo com as respostas atuais." });
      return;
    }
    const blockingIssue = generatedIssues.find((issue) => issue.includes("precisa") || issue.includes("sem setor"));
    if (blockingIssue) {
      setWizardApplyFeedback({ tone: "error", message: blockingIssue });
      return;
    }
    const nextText = formatDefinition(generatedDefinition);
    if (nextText === definitionText) {
      setWizardApplyFeedback({ tone: "warning", message: "Nenhuma alteração foi necessária." });
      return;
    }
    onDefinitionTextChange(nextText);
    setWizardApplyFeedback({
      tone: "success",
      message: "Fluxo aplicado ao rascunho. Ele ainda não foi salvo. Revise ou salve quando estiver pronto.",
    });
  };
  const cancelWizard = () => {
    const confirmed = window.confirm("Cancelar a criação guiada? O rascunho desta criação será descartado.");
    if (!confirmed) return;
    resetWizardSession();
  };
  const selectWizardTemplate = (template: StandardFlowTemplate) => {
    if (template === "advanced") {
      setMode("advanced");
      return;
    }
    setWizardAnswers({ ...DEFAULT_WIZARD_ANSWERS, template });
    setWizardStepIndex(0);
    setWizardErrors([]);
    setWizardMenuKey("");
    setWizardApplyFeedback(null);
  };
  const departmentQueues = (departmentId?: string) => queues.filter((queue) => !departmentId || queue.departmentId === departmentId);
  const renderDepartmentQueueFields = (index: number, destination: WizardDestination | undefined) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-sm text-white/70">
        Departamento
        <select
          value={destination?.departmentId ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const departmentId = event.target.value;
            const queue = queues.find((item) => item.id === destination?.queueId);
            updateWizardDestination(index, {
              departmentId,
              queueId: queue && queue.departmentId !== departmentId ? "" : destination?.queueId,
            });
          }}
          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
        >
          <option value="">Escolha o setor</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm text-white/70">
        Fila
        <select
          value={destination?.queueId ?? ""}
          disabled={disabled}
          onChange={(event) => updateWizardDestination(index, { queueId: event.target.value })}
          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
        >
          <option value="">Fila padrão do setor</option>
          {departmentQueues(destination?.departmentId).map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
        </select>
      </label>
    </div>
  );
  const renderWizardStepFields = () => {
    if (!wizardAnswers.template) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {STANDARD_FLOW_TEMPLATES.map((template) => (
            <article key={template.id} className="flex min-h-56 flex-col justify-between rounded-xl border border-white/10 bg-black/10 p-4">
              <div className="grid gap-2">
                <h4 className="text-base font-semibold text-white">{template.title}</h4>
                <p className="text-sm text-white/65">{template.summary}</p>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">
                  {template.example.map((item) => <p key={item}>{item}</p>)}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectWizardTemplate(template.id)}
                className="mt-4 rounded-md border border-re7-sky/60 bg-re7-sky/20 px-3 py-2 text-sm font-semibold text-white hover:bg-re7-sky/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {template.action}
              </button>
            </article>
          ))}
        </div>
      );
    }
    if (currentWizardStep === "initial") {
      return (
        <label className="grid gap-2 text-sm text-white/70">
          Qual mensagem o cidadão verá ao iniciar o atendimento?
          <textarea value={wizardAnswers.initialMessage} disabled={disabled} onChange={(event) => updateWizardAnswers({ initialMessage: event.target.value })} className="min-h-32 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" />
          <span className="text-xs text-white/50">Exemplo: Olá! Como podemos ajudar?</span>
        </label>
      );
    }
    if (currentWizardStep === "consent") {
      return (
        <div className="grid gap-3">
          <p className="text-sm text-white/70">Você precisa solicitar consentimento antes de continuar?</p>
          <div className="flex flex-wrap gap-2">
            {[{ value: false, label: "Não" }, { value: true, label: "Sim" }].map((option) => (
              <button key={String(option.value)} type="button" disabled={disabled} onClick={() => updateWizardAnswers({ consentEnabled: option.value })} className={`rounded-md border px-3 py-2 text-sm ${wizardAnswers.consentEnabled === option.value ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}>
                {option.label}
              </button>
            ))}
          </div>
          {wizardAnswers.consentEnabled ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-white/70">Mensagem de consentimento<textarea value={wizardAnswers.consentMessage} disabled={disabled} onChange={(event) => updateWizardAnswers({ consentMessage: event.target.value })} className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label>
              <label className="grid gap-1 text-sm text-white/70">Resposta que confirma aceite<input value={wizardAnswers.consentAcceptOption} disabled={disabled} onChange={(event) => updateWizardAnswers({ consentAcceptOption: event.target.value })} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label>
              <label className="grid gap-1 text-sm text-white/70">Mensagem para quem não aceitar<textarea value={wizardAnswers.consentDeclineMessage} disabled={disabled} onChange={(event) => updateWizardAnswers({ consentDeclineMessage: event.target.value })} className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label>
            </div>
          ) : null}
        </div>
      );
    }
    if (currentWizardStep === "options") {
      return (
        <div className="grid gap-3">
          <p className="text-sm text-white/70">Quais opções o cidadão poderá escolher?</p>
          {wizardAnswers.menuOptions.map((option, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-black/10 p-3 sm:grid-cols-[auto_1fr_auto]">
              <span className="pt-2 text-sm font-semibold text-white/70">{index + 1}</span>
              <input value={option} disabled={disabled} onChange={(event) => updateWizardAnswers({ menuOptions: wizardAnswers.menuOptions.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" />
              <button type="button" disabled={disabled || wizardAnswers.menuOptions.length <= 1} onClick={() => updateWizardAnswers({ menuOptions: wizardAnswers.menuOptions.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">Excluir</button>
            </div>
          ))}
          <button type="button" disabled={disabled} onClick={() => updateWizardAnswers({ menuOptions: [...wizardAnswers.menuOptions, `Opção ${wizardAnswers.menuOptions.length + 1}`] })} className="w-fit rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10">+ Adicionar opção</button>
        </div>
      );
    }
    if (currentWizardStep === "destinations") {
      const currentMenu = getMenuDraftForKey(wizardAnswers, wizardMenuKey);
      const breadcrumb = wizardMenuKey
        ? ["Menu principal", ...wizardMenuKey.split(".").map((_, index, parts) => {
            const key = parts.slice(0, index + 1).join(".");
            return getMenuDraftForKey(wizardAnswers, key).title;
          })]
        : ["Menu principal"];
      return (
        <div className="grid gap-3">
          <div className="rounded-lg border border-sky-300/25 bg-sky-500/10 p-3">
            <p className="text-xs font-semibold uppercase text-sky-100/80">Nível atual</p>
            <p className="mt-1 text-sm text-white">{breadcrumb.map((item) => sanitizeLabel(item, "Menu")).join(" > ")}</p>
            {wizardMenuKey ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setWizardMenuKey(parentMenuKey(wizardMenuKey))}
                className="mt-3 rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Voltar ao nível anterior
              </button>
            ) : null}
          </div>
          {wizardMenuKey ? (
            <label className="grid gap-1 text-sm text-white/70">
              Nome deste submenu
              <input
                value={currentMenu.title}
                disabled={disabled}
                onChange={(event) => updateWizardMenu(wizardMenuKey, { title: event.target.value })}
                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
              />
            </label>
          ) : null}
          {currentMenu.options.map((option, index) => {
            const destination = currentMenu.destinations[index] ?? { type: "department" as const };
            const submenuKey = destination.submenuKey || submenuKeyForOption(wizardMenuKey, index);
            return (
              <section key={index} className="grid gap-3 rounded-lg border border-sky-300/20 bg-sky-500/10 p-3">
                <h5 className="text-sm font-semibold text-white">{sanitizeLabel(option, `Opção ${index + 1}`)}</h5>
                <label className="grid gap-1 text-sm text-white/70">
                  Texto da opção
                  <input
                    value={option}
                    disabled={disabled}
                    onChange={(event) => updateWizardMenu(wizardMenuKey, { options: currentMenu.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })}
                    className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                  />
                </label>
                <label className="grid gap-1 text-sm text-white/70">Para onde deve ir esta opção?
                  <select value={destination.type} disabled={disabled} onChange={(event) => updateWizardDestination(index, { type: event.target.value as WizardDestinationType })} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white">
                    <option value="department">Encaminhar para um setor</option>
                    <option value="queue">Encaminhar para uma fila</option>
                    <option value="submenu">Abrir submenu</option>
                    <option value="message">Mostrar outra mensagem</option>
                    <option value="question">Fazer uma pergunta</option>
                    <option value="end">Encerrar atendimento</option>
                    <option value="main_menu">Voltar ao menu principal</option>
                    {wizardMenuKey ? <option value="previous_menu">Voltar ao menu anterior</option> : null}
                  </select>
                </label>
                {destination.type === "department" || destination.type === "queue" ? renderDepartmentQueueFields(index, destination) : null}
                {destination.type === "submenu" ? (
                  <div className="grid gap-3 rounded-lg border border-indigo-300/25 bg-indigo-500/10 p-3">
                    <label className="grid gap-1 text-sm text-white/70">
                      Nome do submenu
                      <input
                        value={getMenuDraftForKey(wizardAnswers, submenuKey).title}
                        disabled={disabled}
                        onChange={(event) => {
                          updateWizardDestination(index, { submenuKey });
                          updateWizardMenu(submenuKey, { title: event.target.value });
                        }}
                        className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setWizardAnswers((current) => ({
                          ...current,
                          submenus: {
                            ...current.submenus,
                            [submenuKey]: current.submenus[submenuKey] ?? createDefaultSubmenuDraft(option),
                          },
                        }));
                        updateWizardDestination(index, { type: "submenu", submenuKey });
                        setWizardMenuKey(submenuKey);
                      }}
                      className="w-fit rounded-md border border-indigo-200/40 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-50 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Editar opções deste submenu
                    </button>
                  </div>
                ) : null}
                {destination.type === "message" || destination.type === "end" ? <label className="grid gap-1 text-sm text-white/70">Mensagem<textarea value={destination.message ?? ""} disabled={disabled} onChange={(event) => updateWizardDestination(index, { message: event.target.value })} className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label> : null}
                {destination.type === "question" ? <label className="grid gap-1 text-sm text-white/70">Pergunta<textarea value={destination.question ?? ""} disabled={disabled} onChange={(event) => updateWizardDestination(index, { question: event.target.value })} className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label> : null}
              </section>
            );
          })}
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateWizardMenu(wizardMenuKey, { options: [...currentMenu.options, `Opção ${currentMenu.options.length + 1}`] })}
            className="w-fit rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Adicionar opção neste nível
          </button>
          {wizardMenuKey ? (
            <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm text-white/70">
              <p className="font-semibold text-white">Navegação deste submenu</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={currentMenu.enablePreviousMenu} disabled={disabled} onChange={(event) => updateWizardMenu(wizardMenuKey, { enablePreviousMenu: event.target.checked })} />
                9 - Voltar ao Menu Anterior
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={currentMenu.enableMainMenu} disabled={disabled} onChange={(event) => updateWizardMenu(wizardMenuKey, { enableMainMenu: event.target.checked })} />
                0 - Voltar ao Menu Principal
              </label>
            </div>
          ) : null}
        </div>
      );
    }
    if (currentWizardStep === "destination") {
      return <div className="grid gap-3"><p className="text-sm text-white/70">Escolha para onde este atendimento será enviado.</p>{renderDepartmentQueueFields(0, wizardAnswers.destinations[0] ?? { type: "department" })}</div>;
    }
    if (currentWizardStep === "capture") {
      return (
        <div className="grid gap-3">
          <p className="text-sm text-white/70">O que você precisa perguntar antes de encaminhar?</p>
          {wizardAnswers.captureQuestions.map((question, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-black/10 p-3 sm:grid-cols-[auto_1fr_auto]">
              <span className="pt-2 text-sm font-semibold text-white/70">{index + 1}</span>
              <input value={question} disabled={disabled} onChange={(event) => updateWizardAnswers({ captureQuestions: wizardAnswers.captureQuestions.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" />
              <button type="button" disabled={disabled || wizardAnswers.captureQuestions.length <= 1} onClick={() => updateWizardAnswers({ captureQuestions: wizardAnswers.captureQuestions.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">Excluir</button>
            </div>
          ))}
          <button type="button" disabled={disabled} onClick={() => updateWizardAnswers({ captureQuestions: [...wizardAnswers.captureQuestions, ""] })} className="w-fit rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10">+ Adicionar pergunta</button>
        </div>
      );
    }
    if (currentWizardStep === "invalid") {
      return <label className="grid gap-2 text-sm text-white/70">O que responder se o cidadão enviar uma opção inválida?<textarea value={wizardAnswers.invalidOptionText} disabled={disabled} onChange={(event) => updateWizardAnswers({ invalidOptionText: event.target.value })} className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label>;
    }
    if (currentWizardStep === "hours") {
      return <div className="grid gap-3 rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-100"><p className="font-semibold">Atendimento humano possui horário de funcionamento?</p><p>O autoatendimento pode continuar funcionando normalmente. O horário define apenas quando o cidadão poderá ser encaminhado para atendimento humano.</p><p>Horários de setor são configurados em Configurações &gt; Departamentos. Quando não houver horário salvo para o setor, a regra atual trata como sem agenda específica.</p><p>Este assistente não cria uma regra de horário nova no fluxo.</p></div>;
    }
    if (currentWizardStep === "handoff") {
      return (
        <div className="grid gap-3">
          <p className="text-sm text-white/70">Quer enviar uma mensagem antes de transferir para o atendimento humano?</p>
          <div className="flex flex-wrap gap-2">
            {[{ value: "standard", label: "Usar mensagem padrão" }, { value: "custom", label: "Personalizar" }, { value: "none", label: "Não enviar" }].map((option) => (
              <button key={option.value} type="button" disabled={disabled} onClick={() => updateWizardAnswers({ handoffMessageMode: option.value as StandardFlowWizardAnswers["handoffMessageMode"] })} className={`rounded-md border px-3 py-2 text-sm ${wizardAnswers.handoffMessageMode === option.value ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}>{option.label}</button>
            ))}
          </div>
          {wizardAnswers.handoffMessageMode === "custom" ? <label className="grid gap-1 text-sm text-white/70">Mensagem de transferência<textarea value={wizardAnswers.handoffMessage} disabled={disabled} onChange={(event) => updateWizardAnswers({ handoffMessage: event.target.value })} className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label> : null}
        </div>
      );
    }
    if (currentWizardStep === "info_next") {
      return (
        <label className="grid gap-2 text-sm text-white/70">O que acontece depois da mensagem?
          <select value={wizardAnswers.informationNext} disabled={disabled} onChange={(event) => updateWizardAnswers({ informationNext: event.target.value as StandardFlowWizardAnswers["informationNext"] })} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white">
            <option value="end">Encerrar</option>
            <option value="message">Mostrar outra mensagem</option>
            <option value="menu">Abrir menu</option>
            <option value="human">Encaminhar para atendimento humano</option>
            <option value="question">Fazer uma pergunta</option>
          </select>
        </label>
      );
    }
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-black/10 p-3"><h4 className="text-sm font-semibold text-white">Como o cidadão verá</h4><div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">{generatedExpectedLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></section>
        <section className="rounded-lg border border-white/10 bg-black/10 p-3"><h4 className="text-sm font-semibold text-white">Caminho de atendimento</h4><div className="mt-3 grid gap-1 text-sm text-white/75">{generatedJourneyLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div><div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="text-xs font-semibold uppercase text-white/45">Pendências</p>{generatedIssues.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">{generatedIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-2 text-sm text-emerald-100">Nenhuma pendência crítica detectada.</p>}</div></section>
      </div>
    );
  };
  const renderExistingSimpleEdit = () => {
    const selectedMenuId = editingMenuNodeId;
    const selectedMenu = selectedMenuId ? definition.nodes[selectedMenuId] : null;
    const selectedMenuEntry = selectedMenuId && selectedMenu?.type === "menu" ? { id: selectedMenuId, node: selectedMenu } : null;
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.2fr)]">
        <section className="grid gap-3 rounded-lg border border-sky-300/20 bg-sky-500/10 p-3">
          <div>
            <h4 className="text-sm font-semibold text-white">Estrutura editável</h4>
            <p className="mt-1 text-xs text-white/60">Menus e submenus detectados no fluxo atual.</p>
          </div>
          {menuEntries.length > 0 ? menuEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setEditingMenuNodeId(entry.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${editingMenuNodeId === entry.id ? "border-sky-200/50 bg-sky-400/20 text-white" : "border-white/10 bg-black/10 text-white/75 hover:border-sky-300/40 hover:bg-sky-500/10"}`}
            >
              <span className="block text-xs text-white/50">{getMenuBreadcrumb(definition, entry.id).join(" > ")}</span>
              <span className="mt-1 block font-semibold">{entry.id === primaryMenu?.id ? "Menu principal" : truncateText(stringValue(entry.node.text) || entry.id, 48)}</span>
              <span className="mt-1 block text-xs text-white/55">{getOptions(entry.node).length} opção(ões)</span>
            </button>
          )) : <p className="text-sm text-white/60">Este fluxo não possui menus editáveis pelo assistente.</p>}
        </section>
        <section className="grid gap-3 rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3">
          {selectedMenuEntry ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-emerald-100/70">{getMenuBreadcrumb(definition, selectedMenuEntry.id).join(" > ")}</p>
                  <h4 className="mt-1 text-sm font-semibold text-white">{selectedMenuEntry.id === primaryMenu?.id ? "Editar Menu principal" : "Editar submenu"}</h4>
                </div>
                {selectedMenuEntry.id !== primaryMenu?.id ? (
                  <button type="button" onClick={() => setEditingMenuNodeId(primaryMenu?.id ?? null)} className="rounded-md border border-white/15 px-3 py-2 text-xs text-white/75 hover:bg-white/10">Voltar ao menu principal</button>
                ) : null}
              </div>
              <label className="grid gap-1 text-sm text-white/70">
                Mensagem do menu
                <textarea value={stringValue(selectedMenuEntry.node.text)} disabled={disabled} onChange={(event) => commit(setNodeField(definition, selectedMenuEntry.id, "text", event.target.value))} className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" />
              </label>
              <div className="grid gap-2">
                {getOptions(selectedMenuEntry.node).map((option, index) => {
                  const target = definition.nodes[stringValue(option.next)];
                  return (
                    <div key={`${selectedMenuEntry.id}-${index}`} className="grid gap-2 rounded-md border border-white/10 bg-black/10 p-3">
                      <label className="grid gap-1 text-sm text-white/70">
                        Opção {index + 1}
                        <input value={stringValue(option.label)} disabled={disabled} onChange={(event) => commit(setMenuOption(definition, selectedMenuEntry.id, index, { label: event.target.value }))} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" />
                      </label>
                      <p className="text-xs text-white/55">Destino: {target?.type === "menu" ? `Submenu · ${truncateText(stringValue(target.text) || stringValue(option.next), 64)}` : target?.type === "handoff" ? `Atendimento humano · ${describeRoutedHandoff(target, option, departments, queues)}` : target ? nodeTypeLabel(stringValue(target.type)) : "Destino ainda não configurado."}</p>
                      {target?.type === "menu" ? (
                        <button type="button" onClick={() => setEditingMenuNodeId(stringValue(option.next))} className="w-fit rounded-md border border-sky-300/35 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-50 hover:bg-sky-500/20">Abrir submenu</button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-md border border-white/10 bg-black/10 p-3 text-sm text-white/70">
              Selecione um menu ou submenu à esquerda para editar texto e opções.
            </div>
          )}
        </section>
        <section className="grid gap-3 rounded-lg border border-teal-300/20 bg-teal-500/10 p-3 lg:col-span-2">
          <h4 className="text-sm font-semibold text-white">Destinos humanos</h4>
          {handoffEntries.map((entry) => {
            const nodeQueues = queues.filter((queue) => !entry.node.departmentId || queue.departmentId === entry.node.departmentId);
            return <section key={entry.nodeId} className="grid gap-3 rounded-lg border border-white/10 bg-black/10 p-3"><h5 className="text-sm font-semibold text-white">{entry.source}</h5><label className="grid gap-1 text-sm text-white/70">Mensagem antes da transferência<textarea value={stringValue(entry.node.text)} disabled={disabled} onChange={(event) => commit(setNodeField(definition, entry.nodeId, "text", event.target.value))} className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white" /></label><div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-sm text-white/70">Departamento<select value={stringValue(entry.node.departmentId)} disabled={disabled} onChange={(event) => { let next = setNodeField(definition, entry.nodeId, "departmentId", event.target.value); const currentQueue = queues.find((queue) => queue.id === entry.node.queueId); if (currentQueue && currentQueue.departmentId !== event.target.value) next = setNodeField(next, entry.nodeId, "queueId", ""); commit(next); }} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"><option value="">Escolha o setor</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="grid gap-1 text-sm text-white/70">Fila<select value={stringValue(entry.node.queueId)} disabled={disabled} onChange={(event) => commit(setNodeField(definition, entry.nodeId, "queueId", event.target.value))} className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"><option value="">Fila padrão do setor</option>{nodeQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}</select></label></div></section>;
          })}
        </section>
      </div>
    );
  };

  const renderExistingFlowGuided = () => (
    <section className="chatbot-guided-shell grid gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div><span className="text-xs font-semibold uppercase text-re7-sky/80">Fluxo existente</span><h3 className="mt-1 text-lg font-semibold text-white">Este fluxo já possui uma estrutura</h3><p className="mt-1 text-sm text-white/65">O modo guiado não reconstrói fluxos existentes automaticamente. Use as ações seguras abaixo ou abra o modo avançado.</p></div>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs uppercase text-white/45">Etapas</p><p className="mt-1 text-lg font-semibold text-white">{nodeIds.length}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs uppercase text-white/45">Menus</p><p className="mt-1 text-lg font-semibold text-white">{menuCount}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs uppercase text-white/45">Encaminhamentos</p><p className="mt-1 text-lg font-semibold text-white">{handoffCount}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs uppercase text-white/45">Estrutura</p><p className="mt-1 text-sm font-semibold text-white">{hasAdvancedFields(definition) ? "Avançada" : getClosestPattern(definition)}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setExistingFlowView("journey")} className={`rounded-md border px-3 py-2 text-sm ${existingFlowView === "journey" ? "border-sky-200/50 bg-sky-500/20 text-white" : "border-white/15 text-white/80 hover:bg-white/10"}`}>Revisar jornada</button>
        <button type="button" onClick={() => { setExistingFlowView("simple"); setEditingMenuNodeId(primaryMenu?.id ?? menuEntries[0]?.id ?? null); }} className={`rounded-md border px-3 py-2 text-sm ${existingFlowView === "simple" ? "border-emerald-200/50 bg-emerald-500/20 text-white" : "border-white/15 text-white/80 hover:bg-white/10"}`}>Editar etapas simples</button>
        <button type="button" onClick={() => setMode("advanced")} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10">Abrir modo avançado</button>
      </div>
      {existingFlowView === "journey" ? <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-lg border border-white/10 bg-black/10 p-3"><h4 className="text-sm font-semibold text-white">Como o cidadão verá</h4><div className="mt-3 grid gap-2 text-sm text-white/75">{expectedResultLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></section><section className="rounded-lg border border-white/10 bg-black/10 p-3"><h4 className="text-sm font-semibold text-white">Caminho de atendimento</h4><div className="mt-3 grid gap-1 text-sm text-white/75">{journeyLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></section></div> : null}
      {existingFlowView === "simple" ? renderExistingSimpleEdit() : null}
      <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm text-white/65">Para criar um novo fluxo padrão, use o cartão “Criar novo fluxo”. Este fluxo existente não será refeito automaticamente.</div>
    </section>
  );
  const renderCreationWizard = () => (
    <section className="chatbot-guided-shell grid gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div><span className="text-xs font-semibold uppercase text-re7-sky/80">Criador guiado</span><h3 className="mt-1 text-lg font-semibold text-white">{wizardAnswers.template ? wizardStepTitle : "O que você quer criar?"}</h3><p className="mt-1 text-sm text-white/65">{wizardAnswers.template ? `Etapa ${wizardStepIndex + 1} de ${wizardStepKeys.length}. Responda apenas esta parte para avançar.` : "Escolha um modelo de atendimento. Depois faremos poucas perguntas e geraremos um fluxo real para revisão."}</p></div>
      {wizardAnswers.template ? <div className="h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-re7-sky transition-all" style={{ width: `${Math.round(((wizardStepIndex + 1) / wizardStepKeys.length) * 100)}%` }} /></div> : null}
      {wizardErrors.length > 0 ? <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-100">{wizardErrors.map((error) => <p key={error}>{error}</p>)}</div> : null}
      {wizardApplyFeedback ? <div className={`rounded-lg border p-3 text-sm ${wizardApplyFeedback.tone === "success" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : wizardApplyFeedback.tone === "warning" ? "border-amber-300/25 bg-amber-500/10 text-amber-100" : "border-red-300/30 bg-red-500/10 text-red-100"}`}>{wizardApplyFeedback.message}</div> : null}
      {renderWizardStepFields()}
      {wizardAnswers.template ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-3"><button type="button" disabled={wizardStepIndex <= 0} onClick={() => { setWizardErrors([]); setWizardApplyFeedback(null); setWizardStepIndex((current) => Math.max(current - 1, 0)); }} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45">Voltar</button><button type="button" disabled={disabled} onClick={cancelWizard} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">Cancelar wizard</button>{currentWizardStep === "review" ? <button type="button" disabled={disabled || generatedIssues.some((issue) => issue.includes("precisa") || issue.includes("sem setor"))} onClick={applyGeneratedDraft} className="rounded-md border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50">Aplicar ao rascunho</button> : <button type="button" disabled={disabled} onClick={goToNextWizardStep} className="rounded-md border border-re7-sky/60 bg-re7-sky/20 px-3 py-2 text-sm font-semibold text-white hover:bg-re7-sky/30 disabled:cursor-not-allowed disabled:opacity-45">Continuar</button>}</div> : null}
    </section>
  );

  return (
    <div className="chatbot-flow-builder grid gap-4">
      <div className="chatbot-mode-tabs flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("guided")}
          className={`rounded-md border px-3 py-2 text-sm ${mode === "guided" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}
        >
          <span className="block font-semibold">Assistente guiado</span>
          <span className="block text-xs opacity-75">Crie e edite etapas simples com orientação.</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("advanced")}
          className={`rounded-md border px-3 py-2 text-sm ${mode === "advanced" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}
        >
          <span className="block font-semibold">Modo avançado</span>
          <span className="block text-xs opacity-75">Edite a estrutura completa do fluxo.</span>
        </button>
      </div>

      {mode === "advanced" ? (
        <div className="grid gap-2">
          <p className="rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Use apenas se você conhece a estrutura do fluxo. Campos antigos serão preservados quando o JSON continuar válido.
          </p>
          {advancedEditor}
        </div>
      ) : (
        allowObjectiveReset ? renderCreationWizard() : renderExistingFlowGuided()
      )}
    </div>
  );
}
