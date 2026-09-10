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
  const parsed = useMemo(() => parseDefinition(definitionText), [definitionText]);
  const issues = useMemo(
    () => (parsed.ok ? buildIssues(parsed.definition, queues) : [parsed.message]),
    [parsed, queues]
  );

  const commit = (definition: FlowDefinition) => onDefinitionTextChange(formatDefinition(definition));

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
  const primaryMenu = getPrimaryMenuEntry(definition);
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

  return (
    <div className="chatbot-flow-builder grid gap-4">
      <div className="chatbot-mode-tabs flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("guided")}
          className={`rounded-md border px-3 py-2 text-sm ${mode === "guided" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}
        >
          Editor guiado
        </button>
        <button
          type="button"
          onClick={() => setMode("advanced")}
          className={`rounded-md border px-3 py-2 text-sm ${mode === "advanced" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70"}`}
        >
          Modo avançado
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
        <>
          <section className="chatbot-guided-shell grid gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase text-re7-sky/80">Criação guiada</span>
              <h3 className="text-lg font-semibold text-white">Monte o atendimento pelo que o cidadão vai experimentar</h3>
              <p className="text-sm text-white/65">
                O modo guiado usa o mesmo rascunho do modo avançado. Nenhum campo é convertido ou descartado ao alternar entre os modos.
              </p>
            </div>

            <nav aria-label="Etapas do fluxo guiado" className="grid gap-2 md:grid-cols-3">
              {guidedSteps.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => {
                    setActiveStep(step.key);
                    window.requestAnimationFrame(() => {
                      document.getElementById(step.targetId)?.focus();
                    });
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-re7-sky/70 ${
                    selectedGuidedStep.key === step.key
                      ? "border-re7-sky/70 bg-re7-sky/15"
                      : "border-white/10 bg-black/10"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase text-white/55">Passo {step.number}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${guidedStatusClass(step.status)}`}>
                      {GUIDED_STATUS_LABELS[step.status]}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-white">{step.title}</span>
                  <span className="mt-1 block text-xs text-white/55">{step.summary}</span>
                </button>
              ))}
            </nav>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div className="grid gap-3">
                <section className="rounded-lg border border-re7-sky/30 bg-re7-sky/10 p-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-re7-sky/80">Próxima ação</p>
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

                <section
                  id="guided-step-objective"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 1 — Objetivo</h4>
                  <p className="mt-1 text-sm text-white/65">O que este fluxo deve fazer?</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      "Encaminhar direto para atendimento humano",
                      "Apresentar um menu de opções",
                      "Solicitar consentimento antes de continuar",
                      "Coletar uma informação",
                      "Exibir uma mensagem informativa",
                      "Personalizado / avançado",
                    ].map((pattern) => (
                      <span
                        key={pattern}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          pattern === getClosestPattern(definition)
                            ? "border-re7-sky/50 bg-re7-sky/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-white/65"
                        }`}
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </section>

                <section
                  id="guided-step-start"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 2 — Início do atendimento</h4>
                  <p className="mt-1 text-sm text-white/65">O que o cidadão verá primeiro?</p>
                  <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80">
                    {describeNodeForCitizen(definition.start, startNode)}
                  </div>
                </section>

                <section
                  id="guided-step-main"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 3 — Menu / interação principal</h4>
                  {primaryMenu ? (
                    <div className="mt-3 grid gap-2">
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
                    <p className="mt-2 text-sm text-white/60">Este fluxo não possui menu principal.</p>
                  )}
                </section>

                <section
                  id="guided-step-questions"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 4 — Submenus e perguntas</h4>
                  <div className="mt-3 grid gap-2">
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
                </section>

                <section
                  id="guided-step-handoff"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 5 — Destinos humanos</h4>
                  <p className="mt-1 text-sm text-white/65">
                    Escolha para qual setor e fila o cidadão será enviado quando chegar ao atendimento humano.
                  </p>
                  <div className="mt-3 grid gap-2">
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
                </section>

                <section
                  id="guided-step-exceptions"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Passo 6 — Exceções</h4>
                  <div className="mt-3 grid gap-2 text-sm text-white/75">
                    <p>Opção inválida: {primaryMenu?.node.fallbackText ? truncateText(stringValue(primaryMenu.node.fallbackText)) : "usa a resposta padrão da automação."}</p>
                    <p>Voltar: {getBackCommand(definition) || "não configurado."}</p>
                    <p>Inatividade: {getResetAfterMinutes(definition) ? `${getResetAfterMinutes(definition)} minuto(s) para reiniciar.` : "sem reset configurado."}</p>
                    <p>Horário de setor: usado somente quando representado no fluxo/destino.</p>
                  </div>
                </section>
              </div>

              <aside className="grid content-start gap-3">
                <section
                  id="guided-step-preview"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/15 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Como este fluxo funcionará</h4>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/75">
                    {expectedResultLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
                  </ol>
                </section>

                <section className="rounded-lg border border-white/10 bg-black/15 p-3">
                  <h4 className="text-sm font-semibold text-white">Prévia da jornada</h4>
                  <pre className="mt-3 whitespace-pre-wrap rounded-md border border-white/10 bg-re7-navy/70 px-3 py-2 text-xs leading-relaxed text-white/75">
                    {journeyLines.join("\n")}
                  </pre>
                </section>

                <section
                  id="guided-step-checklist"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/15 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Checklist de conclusão</h4>
                  <div className="mt-3 grid gap-2">
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
                </section>

                <section
                  id="guided-step-activation"
                  tabIndex={-1}
                  className="rounded-lg border border-white/10 bg-black/15 p-3 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
                >
                  <h4 className="text-sm font-semibold text-white">Ativação</h4>
                  <p className="mt-2 text-sm text-white/70">
                    Ativo permite execução. Entrada principal permite receber novas conversas como fluxo de entrada do tenant.
                  </p>
                  <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${hasBlockingChecklistIssue ? "border-amber-300/30 bg-amber-500/10 text-amber-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>
                    {hasBlockingChecklistIssue
                      ? "Existem pendências estruturais. Revise antes de ativar ou salvar como entrada principal."
                      : "Checklist pronto para validação final antes de ativar."}
                  </p>
                </section>
              </aside>
            </div>
          </section>

          <details className="rounded-xl border border-white/10 bg-black/10">
            <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-white hover:bg-white/5">
              Ajustes avançados do fluxo
              <span className="ml-2 text-xs font-normal text-white/50">IDs, comandos, inatividade, nós e referências preservadas</span>
            </summary>
            <div className="grid gap-3 border-t border-white/10 p-3">
          <section className="chatbot-builder-summary grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-white/45">Etapa inicial</p>
              <select
                value={definition.start}
                disabled={disabled}
                onChange={(event) => commit({ ...definition, start: event.target.value })}
                className="mt-1 w-full rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white"
              >
                {nodeIds.map((nodeId) => (
                  <option key={nodeId} value={nodeId}>{nodeId}</option>
                ))}
              </select>
            </div>
            <div><p className="text-xs uppercase text-white/45">Etapas</p><p className="mt-2 text-lg font-semibold">{nodeIds.length}</p></div>
            <div><p className="text-xs uppercase text-white/45">Menus</p><p className="mt-2 text-lg font-semibold">{menuCount}</p></div>
            <div><p className="text-xs uppercase text-white/45">Encaminhamentos</p><p className="mt-2 text-lg font-semibold">{handoffCount}</p></div>
            <p className="text-xs text-white/55 sm:col-span-4">
              Setores usados: {departmentIds.size || "nenhum"}. A conexão usada pelo canal não altera esta configuração.
            </p>
            <div className="grid gap-2 sm:col-span-2">
              <label className="grid gap-1 text-sm text-white/70">
                Comando para voltar
                <input
                  value={getBackCommand(definition)}
                  disabled={disabled}
                  onChange={(event) => {
                    const command = event.target.value.trim();
                    commit(setDefinitionField(
                      definition,
                      "globalCommands",
                      command ? [{ command, action: "BACK", allowedModes: ["BOT"] }] : undefined
                    ));
                  }}
                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                  placeholder="Ex.: #, 0 ou voltar"
                />
              </label>
              <span className="text-xs text-white/50">
                Funciona somente durante a automação. Não retira a conversa de atendimento humano.
              </span>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <label className="grid gap-1 text-sm text-white/70">
                Reiniciar automação após inatividade
                <input
                  type="number"
                  min="1"
                  value={getResetAfterMinutes(definition)}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    commit(setDefinitionField(
                      definition,
                      "inactivityPolicy",
                      Number.isFinite(value) && value > 0 ? { resetAfterMinutes: value } : undefined
                    ));
                  }}
                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                  placeholder="Minutos"
                />
              </label>
              <span className="text-xs text-white/50">
                O reset volta ao menu inicial e preserva dados já salvos da conversa.
              </span>
            </div>
          </section>

          {issues.length > 0 ? (
            <div className="chatbot-alert-panel rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Revise antes de salvar</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            </div>
          ) : (
            <p className="chatbot-success-panel rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Fluxo sem pendências visuais neste editor.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {NODE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const nodeId = buildNodeId(definition.nodes, type);
                  const node =
                    type === "menu"
                      ? { type, text: "Escolha uma opção:", options: [] }
                      : type === "capture"
                        ? { type, text: "Informe sua resposta:", field: "resposta", next: definition.start }
                        : type === "consent"
                          ? {
                              type,
                              purpose: "atendimento",
                              textVersion: "draft",
                              message: "Antes de continuar, confirme que leu e aceita o atendimento por este canal. Responda ACEITO para prosseguir.",
                              acceptOption: "ACEITO",
                              onAccepted: definition.start,
                            }
                        : type === "handoff"
                          ? { type, text: "Vou encaminhar para atendimento humano." }
                          : { type, text: "Mensagem do fluxo." };
                  commit({ ...definition, nodes: { ...definition.nodes, [nodeId]: node } });
                }}
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                Adicionar {nodeTypeLabel(type).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="grid gap-3">
            {nodeIds.map((nodeId) => {
              const node = definition.nodes[nodeId];
              const type = stringValue(node.type);
              const nodeQueues = queues.filter((queue) => !node.departmentId || queue.departmentId === node.departmentId);
              const nodeIssues = issues.filter((issue) => issue.includes(`"${nodeId}"`));
              const hasNodeIssue = nodeIssues.length > 0;
              const issueSectionKeys = new Set(getChatbotNodeIssueSectionKeys(type, nodeId, nodeIssues));
              const sectionPlan = new Map(
                getChatbotNodeEditorSectionPlan(type, [...issueSectionKeys]).map((section) => [
                  section.key,
                  section.defaultExpanded,
                ])
              );
              const sectionDefaultExpanded = (key: NodeEditorSectionKey) => sectionPlan.get(key) ?? issueSectionKeys.has(key);
              const sectionHasIssue = (key: NodeEditorSectionKey) => issueSectionKeys.has(key);
              return (
                <article key={nodeId} className="chatbot-node-card rounded-xl border border-white/10 bg-re7-navy/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-white/45">{nodeId}</p>
                      <h3 className="text-base font-semibold text-white">{nodeTypeLabel(type)}</h3>
                    </div>
                    {definition.start !== nodeId ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          const nextNodes = { ...definition.nodes };
                          delete nextNodes[nodeId];
                          commit({ ...definition, nodes: nextNodes });
                        }}
                        className="rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3">
                    <CollapsibleSection
                      id={`${nodeId}-identity-section`}
                      title="Identificação e tipo"
                      summary={nodeTypeLabel(type)}
                      defaultExpanded={sectionDefaultExpanded("identity")}
                      hasIssue={sectionHasIssue("identity")}
                    >
                      <label className="grid gap-1 text-sm text-white/70">
                        Tipo
                        <select
                          value={type}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, nodeId, "type", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                        >
                          {NODE_TYPES.map((item) => <option key={item} value={item}>{nodeTypeLabel(item)}</option>)}
                        </select>
                      </label>
                    </CollapsibleSection>

                    {type !== "handoff" && type !== "consent" ? (
                      <CollapsibleSection
                        id={`${nodeId}-message-section`}
                        title="Conteúdo da mensagem"
                        summary={stringValue(node.text) ? "Mensagem configurada" : "Sem mensagem"}
                        defaultExpanded={sectionDefaultExpanded("message")}
                        hasIssue={sectionHasIssue("message")}
                      >
                        <label className="grid gap-1 text-sm text-white/70">
                          Mensagem
                          <textarea
                            value={stringValue(node.text)}
                            disabled={disabled}
                            onChange={(event) => commit(setNodeField(definition, nodeId, "text", event.target.value))}
                            className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                          />
                          <span className="chatbot-preview rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65 whitespace-pre-wrap">
                            {stringValue(node.text) || "Prévia da mensagem"}
                          </span>
                        </label>
                      </CollapsibleSection>
                    ) : (
                      type === "handoff" ? (
                      <CollapsibleSection
                        id={`${nodeId}-handoff-message-section`}
                        title="Mensagem de encaminhamento"
                        summary={node.sendFeedback === false ? "Desativada" : "Ativa"}
                        defaultExpanded={sectionDefaultExpanded("handoffMessage")}
                        hasIssue={sectionHasIssue("handoffMessage")}
                      >
                        <div className="grid gap-2">
                          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-white/70">
                            <span>
                              <span className="block font-semibold text-white">Enviar mensagem de encaminhamento humano</span>
                              <span className="mt-0.5 block text-xs text-white/50">
                                Quando desativado, o atendimento humano continua e o texto fica salvo para reativação neste nó.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={node.sendFeedback !== false}
                              disabled={disabled}
                              onChange={(event) =>
                                commit(setNodeField(definition, nodeId, "sendFeedback", event.target.checked))
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Mensagem enviada antes de encaminhar
                            <textarea
                              value={stringValue(node.text)}
                              disabled={disabled || node.sendFeedback === false}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "text", event.target.value))}
                              className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white disabled:opacity-50"
                            />
                          </label>
                        </div>
                      </CollapsibleSection>
                      ) : null
                    )}

                    {(type === "text" || type === "capture") ? (
                      <CollapsibleSection
                        id={`${nodeId}-next-section`}
                        title="Próxima etapa"
                        summary={stringValue(node.next) || "Encerrar neste ponto"}
                        defaultExpanded={sectionDefaultExpanded("next")}
                        hasIssue={sectionHasIssue("next")}
                      >
                        <label className="grid gap-1 text-sm text-white/70">
                          Próxima etapa
                          <select
                            value={stringValue(node.next)}
                            disabled={disabled}
                            onChange={(event) => commit(setNodeField(definition, nodeId, "next", event.target.value))}
                            className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                          >
                            <option value="">Encerrar neste ponto</option>
                            {nodeIds.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
                          </select>
                        </label>
                      </CollapsibleSection>
                    ) : null}

                    {type === "capture" ? (
                      <CollapsibleSection
                        id={`${nodeId}-capture-section`}
                        title="Coleta e validação"
                        summary={stringValue(node.field) || "Campo não definido"}
                        defaultExpanded={sectionDefaultExpanded("capture")}
                        hasIssue={sectionHasIssue("capture")}
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm text-white/70">
                            Campo salvo
                            <input
                              value={stringValue(node.field)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "field", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            />
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Validação
                            <select
                              value={stringValue(node.validation)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "validation", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            >
                              <option value="">Sem validação especial</option>
                              <option value="non_empty">Resposta obrigatória</option>
                              <option value="email">E-mail</option>
                              <option value="phone_br">Telefone brasileiro</option>
                            </select>
                          </label>
                        </div>
                      </CollapsibleSection>
                    ) : null}

                    {type === "consent" ? (
                      <CollapsibleSection
                        id={`${nodeId}-consent-section`}
                        title="Consentimento guiado"
                        summary={stringValue(node.purpose) || "Finalidade não definida"}
                        defaultExpanded={sectionDefaultExpanded("consent")}
                        hasIssue={sectionHasIssue("consent")}
                      >
                        <div>
                          <p className="mt-1 text-xs text-white/55">
                            O sistema consulta e grava o consentimento no servidor. O editor só define a finalidade, versão e caminhos do fluxo.
                          </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm text-white/70">
                            Finalidade
                            <input
                              value={stringValue(node.purpose)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "purpose", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                              placeholder="Ex.: atendimento"
                            />
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Versão do texto
                            <input
                              value={stringValue(node.textVersion)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "textVersion", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                              placeholder="Ex.: 2026-08-draft"
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm text-white/70">
                          Mensagem
                          <textarea
                            value={stringValue(node.message)}
                            disabled={disabled}
                            onChange={(event) => commit(setNodeField(definition, nodeId, "message", event.target.value))}
                            className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                          />
                          <span className="chatbot-preview rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65 whitespace-pre-wrap">
                            {stringValue(node.message) || "Prévia da solicitação de consentimento"}
                          </span>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="grid gap-1 text-sm text-white/70">
                            Opção de aceite
                            <input
                              value={stringValue(node.acceptOption)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "acceptOption", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                              placeholder="Ex.: ACEITO"
                            />
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Ao aceitar
                            <select
                              value={stringValue(node.onAccepted)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "onAccepted", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            >
                              {nodeIds.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Ao recusar
                            <select
                              value={stringValue(node.onDeclined)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "onDeclined", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            >
                              <option value="">Repetir solicitação</option>
                              {nodeIds.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
                            </select>
                          </label>
                        </div>
                      </CollapsibleSection>
                    ) : null}

                    {(type === "menu" || type === "handoff") ? (
                      <CollapsibleSection
                        id={`${nodeId}-destination-section`}
                        title="Destino de atendimento"
                        summary={stringValue(node.departmentId) ? "Setor configurado" : "Sem setor definido"}
                        defaultExpanded={sectionDefaultExpanded("destination")}
                        hasIssue={sectionHasIssue("destination")}
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1 text-sm text-white/70">
                            Setor
                            <select
                              value={stringValue(node.departmentId)}
                              disabled={disabled}
                              onChange={(event) => {
                                let next = setNodeField(definition, nodeId, "departmentId", event.target.value);
                                const currentQueue = queues.find((queue) => queue.id === node.queueId);
                                if (currentQueue && currentQueue.departmentId !== event.target.value) {
                                  next = setNodeField(next, nodeId, "queueId", "");
                                }
                                commit(next);
                              }}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            >
                              <option value="">Sem setor definido</option>
                              {departments.map((department) => (
                                <option key={department.id} value={department.id}>{department.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm text-white/70">
                            Fila
                            <select
                              value={stringValue(node.queueId)}
                              disabled={disabled}
                              onChange={(event) => commit(setNodeField(definition, nodeId, "queueId", event.target.value))}
                              className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                            >
                              <option value="">Fila padrão do setor</option>
                              {nodeQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="grid gap-1 text-sm text-white/70">
                          Mensagem quando o setor estiver fechado
                          <textarea
                            value={stringValue(node.closedText)}
                            disabled={disabled}
                            onChange={(event) => commit(setNodeField(definition, nodeId, "closedText", event.target.value))}
                            className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                          />
                          <span className="text-xs text-white/50">
                            Horários continuam no cadastro do setor. O fluxo apenas define a mensagem alternativa.
                          </span>
                        </label>
                      </CollapsibleSection>
                    ) : null}

                    {type === "menu" ? (
                      <CollapsibleSection
                        id={`${nodeId}-options-section`}
                        title="Opções do menu"
                        summary={`${getOptions(node).length} opção(ões)`}
                        defaultExpanded={sectionDefaultExpanded("options")}
                        hasIssue={sectionHasIssue("options")}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const options = [...getOptions(node), { label: "Nova opção", next: definition.start }];
                              commit(setNodeField(definition, nodeId, "options", options));
                            }}
                            className="rounded-md border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                          >
                            Adicionar opção
                          </button>
                        </div>
                        {getOptions(node).map((option, optionIndex) => {
                          const optionQueues = queues.filter((queue) => !option.departmentId || queue.departmentId === option.departmentId);
                          const updateOption = (patch: Record<string, unknown>) => {
                            const options = getOptions(node).map((item, index) => index === optionIndex ? { ...item, ...patch } : item);
                            commit(setNodeField(definition, nodeId, "options", options));
                          };
                          return (
                            <div key={optionIndex} className="chatbot-option-card grid gap-2 rounded-md border border-white/10 p-2">
                              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <input
                                  value={stringValue(option.label)}
                                  disabled={disabled}
                                  onChange={(event) => updateOption({ label: event.target.value })}
                                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                                  placeholder="Título ou número explícito"
                                />
                                <select
                                  value={stringValue(option.next)}
                                  disabled={disabled}
                                  onChange={(event) => updateOption({ next: event.target.value })}
                                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                                >
                                  {nodeIds.map((targetId) => <option key={targetId} value={targetId}>{targetId}</option>)}
                                </select>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    const options = getOptions(node).filter((_, index) => index !== optionIndex);
                                    commit(setNodeField(definition, nodeId, "options", options));
                                  }}
                                  className="rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  Remover
                                </button>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                  value={stringValue(option.departmentId)}
                                  disabled={disabled}
                                  onChange={(event) => {
                                    const nextDepartmentId = event.target.value;
                                    const currentQueue = queues.find((queue) => queue.id === option.queueId);
                                    updateOption({
                                      departmentId: nextDepartmentId || undefined,
                                      queueId: currentQueue && currentQueue.departmentId !== nextDepartmentId ? undefined : option.queueId,
                                    });
                                  }}
                                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                                >
                                  <option value="">Sem setor nesta opção</option>
                                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                                </select>
                                <select
                                  value={stringValue(option.queueId)}
                                  disabled={disabled}
                                  onChange={(event) => updateOption({ queueId: event.target.value || undefined })}
                                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white"
                                >
                                  <option value="">Fila padrão</option>
                                  {optionQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </CollapsibleSection>
                    ) : null}

                    {type === "menu" ? (
                      <CollapsibleSection
                        id={`${nodeId}-fallback-section`}
                        title="Mensagem de opção inválida"
                        summary={stringValue(node.fallbackText) ? "Configurada" : "Padrão da engine"}
                        defaultExpanded={sectionDefaultExpanded("fallback")}
                        hasIssue={sectionHasIssue("fallback")}
                      >
                        <label className="grid gap-1 text-sm text-white/70">
                          Mensagem para opção inválida
                          <textarea
                            value={stringValue(node.fallbackText)}
                            disabled={disabled}
                            onChange={(event) => commit(setNodeField(definition, nodeId, "fallbackText", event.target.value))}
                            className="min-h-16 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                          />
                          <span className="text-xs text-white/50">
                            Se a engine não usar este campo neste tenant, ele será preservado como metadado compatível.
                          </span>
                        </label>
                      </CollapsibleSection>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
