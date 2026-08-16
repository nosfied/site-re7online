"use client";

import { useMemo, useState } from "react";
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
  departments: ChatbotFlowBuilderDepartment[];
  queues: ChatbotFlowBuilderQueue[];
  advancedEditor: ReactNode;
};

const NODE_TYPES = ["menu", "text", "capture", "consent", "handoff"] as const;

const JOURNEY_STEPS = [
  "Informações do fluxo",
  "Início do atendimento",
  "Mensagem de boas-vindas",
  "Menus e respostas",
  "Atendimento humano",
  "Horários e fila",
  "Inatividade",
  "Encerramento",
  "Pesquisa de satisfação",
  "Revisar e publicar",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDefinition(text: string): ParsedDefinition {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || typeof parsed.start !== "string" || !isRecord(parsed.nodes)) {
      return { ok: false, message: "A definição precisa ter início e etapas." };
    }
    const nodes: Record<string, Record<string, unknown>> = {};
    for (const [nodeId, node] of Object.entries(parsed.nodes)) {
      if (isRecord(node)) nodes[nodeId] = node;
    }
    return { ok: true, definition: { ...parsed, start: parsed.start, nodes } };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "JSON inválido." };
  }
}

function formatDefinition(definition: FlowDefinition) {
  return JSON.stringify(definition, null, 2);
}

function nodeTypeLabel(type: string) {
  if (type === "menu") return "Mostrar opções";
  if (type === "text") return "Enviar uma mensagem";
  if (type === "capture") return "Coletar uma resposta";
  if (type === "consent") return "Solicitar autorização";
  if (type === "handoff") return "Encaminhar para atendimento humano";
  return "Etapa não reconhecida";
}

function nodeTypeTone(type: string) {
  if (type === "menu") return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  if (type === "text") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (type === "consent") return "border-violet-300/25 bg-violet-500/10 text-violet-100";
  if (type === "handoff") return "border-orange-300/25 bg-orange-500/10 text-orange-100";
  if (type === "capture") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-white/15 bg-white/5 text-white/70";
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

function stepName(nodeId: string, node?: Record<string, unknown>) {
  const label = stringValue(node?.label || node?.title || node?.name);
  if (label.trim()) return label.trim();
  const text = stringValue(node?.text || node?.message).trim().replace(/\s+/g, " ");
  if (text) return text.slice(0, 58);
  return nodeId.replace(/[_-]+/g, " ");
}

function targetLabel(definition: FlowDefinition, nodeId: string) {
  const node = definition.nodes[nodeId];
  return node ? stepName(nodeId, node) : "Etapa não encontrada";
}

function getBackCommand(definition: FlowDefinition) {
  const commands = Array.isArray(definition.globalCommands) ? definition.globalCommands : [];
  const command = commands.find((item) => isRecord(item) && item.action === "BACK");
  return isRecord(command) && typeof command.command === "string" ? command.command : "";
}

function getCloseCommand(definition: FlowDefinition) {
  const commands = Array.isArray(definition.globalCommands) ? definition.globalCommands : [];
  const command = commands.find((item) => isRecord(item) && item.action === "CLOSE");
  return isRecord(command) && typeof command.command === "string" ? command.command : "";
}

function getResetAfterMinutes(definition: FlowDefinition) {
  const policy = isRecord(definition.inactivityPolicy) ? definition.inactivityPolicy : null;
  return numberValue(policy?.resetAfterMinutes)?.toString() ?? "";
}

function getInactivityAction(definition: FlowDefinition) {
  const policy = isRecord(definition.inactivityPolicy) ? definition.inactivityPolicy : null;
  return stringValue(policy?.action || policy?.behavior || (policy?.resetAfterMinutes ? "RESET_TO_START" : ""));
}

function getClosedHandoffPolicy(definition: FlowDefinition) {
  return isRecord(definition.closedHandoffPolicy) ? definition.closedHandoffPolicy : {};
}

function getSatisfactionPolicy(definition: FlowDefinition) {
  return isRecord(definition.satisfactionPolicy) ? definition.satisfactionPolicy : {};
}

function getMediaPolicy(definition: FlowDefinition) {
  return isRecord(definition.whatsappMediaPolicy) ? definition.whatsappMediaPolicy : {};
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

function updateOption(definition: FlowDefinition, nodeId: string, optionIndex: number, patch: Record<string, unknown>) {
  const node = definition.nodes[nodeId] ?? {};
  const options = getOptions(node).map((option, index) => (index === optionIndex ? { ...option, ...patch } : option));
  return setNodeField(definition, nodeId, "options", options);
}

function removeEmptyFields(value: Record<string, unknown>) {
  const next = { ...value };
  for (const [key, item] of Object.entries(next)) {
    if (item === "" || item === null || item === undefined) delete next[key];
  }
  return next;
}

function buildIssues(definition: FlowDefinition, queues: ChatbotFlowBuilderQueue[]) {
  const issues: string[] = [];
  const warnings: string[] = [];
  const nodeIds = Object.keys(definition.nodes);
  if (!definition.nodes[definition.start]) {
    issues.push("O início do atendimento aponta para uma etapa que não existe.");
  }
  const inbound = new Set<string>([definition.start]);
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    const type = stringValue(node.type);
    if (!NODE_TYPES.includes(type as (typeof NODE_TYPES)[number])) {
      issues.push(`A etapa "${stepName(nodeId, node)}" usa um tipo que este editor não reconhece.`);
      continue;
    }
    if ((type === "menu" || type === "text" || type === "capture") && !stringValue(node.text).trim()) {
      issues.push(`A etapa "${stepName(nodeId, node)}" precisa de uma mensagem.`);
    }
    if (type === "consent") {
      if (!stringValue(node.purpose).trim()) issues.push(`A autorização "${stepName(nodeId, node)}" precisa de finalidade.`);
      if (!stringValue(node.textVersion).trim()) issues.push(`A autorização "${stepName(nodeId, node)}" precisa de versão do texto.`);
      if (!stringValue(node.message).trim()) issues.push(`A autorização "${stepName(nodeId, node)}" precisa da mensagem ao cliente.`);
      if (!stringValue(node.acceptOption).trim()) issues.push(`A autorização "${stepName(nodeId, node)}" precisa da opção de aceite.`);
      if (!stringValue(node.onAccepted).trim()) issues.push(`A autorização "${stepName(nodeId, node)}" precisa do próximo passo ao aceitar.`);
      if (stringValue(node.onAccepted) && !definition.nodes[stringValue(node.onAccepted)]) {
        issues.push(`Ao aceitar em "${stepName(nodeId, node)}", o destino não existe.`);
      }
      if (stringValue(node.onDeclined) && !definition.nodes[stringValue(node.onDeclined)]) {
        issues.push(`Ao recusar em "${stepName(nodeId, node)}", o destino não existe.`);
      }
      if (stringValue(node.onAccepted)) inbound.add(stringValue(node.onAccepted));
      if (stringValue(node.onDeclined)) inbound.add(stringValue(node.onDeclined));
    }
    if (type === "menu") {
      const seenKeys = new Set<string>();
      getOptions(node).forEach((option, index) => {
        const label = stringValue(option.label);
        const key = parseExplicitNumber(label) ?? label.trim().toLowerCase();
        if (!label.trim()) issues.push(`A opção ${index + 1} de "${stepName(nodeId, node)}" precisa de texto.`);
        if (!stringValue(option.next).trim()) issues.push(`A opção "${label || index + 1}" precisa de próximo passo.`);
        if (key && seenKeys.has(key)) issues.push(`A opção "${label}" está duplicada em "${stepName(nodeId, node)}".`);
        if (key) seenKeys.add(key);
        if (stringValue(option.next) && !definition.nodes[stringValue(option.next)]) {
          issues.push(`A opção "${label || index + 1}" aponta para uma etapa que não existe.`);
        }
        if (stringValue(option.next)) inbound.add(stringValue(option.next));
        const queue = queues.find((item) => item.id === option.queueId);
        if (queue && option.departmentId && queue.departmentId !== option.departmentId) {
          issues.push(`A opção "${label || index + 1}" usa uma fila de outro setor.`);
        }
      });
      if (getOptions(node).length === 0) warnings.push(`O menu "${stepName(nodeId, node)}" ainda não possui opções.`);
    }
    if ((type === "text" || type === "capture") && stringValue(node.next)) {
      const next = stringValue(node.next);
      if (!definition.nodes[next]) issues.push(`Depois de "${stepName(nodeId, node)}", o destino não existe.`);
      inbound.add(next);
    }
    if (type === "capture" && !stringValue(node.field).trim()) {
      issues.push(`A etapa "${stepName(nodeId, node)}" precisa informar onde a resposta será salva.`);
    }
    if (type === "handoff" && !stringValue(node.departmentId).trim()) {
      issues.push(`A etapa "${stepName(nodeId, node)}" encaminha para atendimento humano sem setor.`);
    }
    const queue = queues.find((item) => item.id === node.queueId);
    if (queue && node.departmentId && queue.departmentId !== node.departmentId) {
      issues.push(`A etapa "${stepName(nodeId, node)}" usa uma fila que não pertence ao setor selecionado.`);
    }
  }
  nodeIds.forEach((nodeId) => {
    if (!inbound.has(nodeId)) warnings.push(`A etapa "${stepName(nodeId, definition.nodes[nodeId])}" não é alcançada pela jornada principal.`);
  });
  if (!isRecord(definition.satisfactionPolicy)) warnings.push("Nenhuma pesquisa de satisfação foi configurada neste fluxo.");
  return { issues, warnings };
}

function buildSkeleton(kind: "menu" | "simple" | "consent" | "blank"): FlowDefinition {
  if (kind === "blank") {
    return {
      start: "inicio",
      nodes: {
        inicio: {
          type: "text",
          text: "Mensagem inicial do atendimento.",
        },
      },
    };
  }
  if (kind === "simple") {
    return {
      start: "boas_vindas",
      nodes: {
        boas_vindas: {
          type: "text",
          text: "Olá. Como podemos ajudar?",
          next: "atendimento_humano",
        },
        atendimento_humano: {
          type: "handoff",
          text: "Vou encaminhar para uma pessoa da equipe.",
        },
      },
    };
  }
  if (kind === "consent") {
    return {
      start: "consentimento",
      nodes: {
        consentimento: {
          type: "consent",
          purpose: "atendimento",
          textVersion: "v1",
          message: "Antes de continuar, precisamos da sua autorização para atendimento por este canal.\n\n1 - Sim, autorizo.\n2 - Não autorizo.",
          acceptOption: "1",
          declineOption: "2",
          invalidText: "Opção inválida. Responda apenas com 1 ou 2.",
          onAccepted: "boas_vindas",
          onDeclined: "encerramento",
        },
        boas_vindas: {
          type: "text",
          text: "Obrigado. Vamos iniciar o atendimento.",
          next: "menu_principal",
        },
        menu_principal: {
          type: "menu",
          text: "Escolha uma opção:",
          options: [{ label: "1 - Falar com atendimento", next: "atendimento_humano" }],
        },
        atendimento_humano: {
          type: "handoff",
          text: "Vou encaminhar para uma pessoa da equipe.",
        },
        encerramento: {
          type: "text",
          text: "Tudo bem. Atendimento encerrado por este canal.",
        },
      },
    };
  }
  return {
    start: "boas_vindas",
    nodes: {
      boas_vindas: {
        type: "text",
        text: "Olá. Boas-vindas ao atendimento.",
        next: "menu_principal",
      },
      menu_principal: {
        type: "menu",
        text: "Digite o número da opção desejada:",
        options: [
          { label: "1 - Informações", next: "informacoes" },
          { label: "2 - Atendimento humano", next: "atendimento_humano" },
        ],
      },
      informacoes: {
        type: "text",
        text: "Aqui você pode informar orientações ou links úteis.",
        next: "menu_principal",
      },
      atendimento_humano: {
        type: "handoff",
        text: "Vou encaminhar para uma pessoa da equipe.",
      },
    },
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
  };
}

function updateGlobalCommand(definition: FlowDefinition, action: string, command: string, allowedModes: string[]) {
  const commands = Array.isArray(definition.globalCommands)
    ? definition.globalCommands.filter((item) => !(isRecord(item) && item.action === action))
    : [];
  if (command.trim()) commands.push({ command: command.trim(), action, allowedModes });
  return setDefinitionField(definition, "globalCommands", commands.length ? commands : undefined);
}

function NodeSelect({
  value,
  onChange,
  definition,
  disabled,
  allowEmpty = true,
}: {
  value: string;
  onChange: (value: string) => void;
  definition: FlowDefinition;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
    >
      {allowEmpty ? <option value="">Encerrar neste ponto</option> : null}
      {Object.keys(definition.nodes).map((nodeId) => (
        <option key={nodeId} value={nodeId}>{targetLabel(definition, nodeId)}</option>
      ))}
    </select>
  );
}

function BuilderField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm text-white/75">
      <span className="font-medium text-white/85">{label}</span>
      {children}
      {help ? <span className="text-xs leading-relaxed text-white/45">{help}</span> : null}
    </label>
  );
}

function PreviewBubble({ speaker, text }: { speaker: string; text: string }) {
  return (
    <div className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${speaker === "Cliente" ? "ml-auto bg-emerald-500/20 text-emerald-50" : "bg-white/10 text-white/85"}`}>
      <p className="mb-1 text-[0.68rem] font-semibold uppercase text-white/45">{speaker}</p>
      <p className="whitespace-pre-wrap leading-relaxed">{text || "..."}</p>
    </div>
  );
}

function buildStepPaths(definition: FlowDefinition, nodeId: string) {
  const node = definition.nodes[nodeId];
  if (!node) return [];
  const type = stringValue(node.type);
  if (type === "menu") {
    return getOptions(node).map((option, index) => ({
      label: stringValue(option.label) || `Opção ${index + 1}`,
      destination: targetLabel(definition, stringValue(option.next)),
      detail: stringValue(option.departmentId) ? "Pode encaminhar por setor/fila" : "Segue para outra etapa",
    }));
  }
  if (type === "consent") {
    return [
      {
        label: `Aceite: ${stringValue(node.acceptOption) || "não definido"}`,
        destination: targetLabel(definition, stringValue(node.onAccepted)),
        detail: "Quando o cliente autoriza o atendimento",
      },
      {
        label: `Recusa: ${stringValue(node.declineOption) || "não definido"}`,
        destination: stringValue(node.onDeclined) ? targetLabel(definition, stringValue(node.onDeclined)) : "Repetir solicitação",
        detail: "Quando o cliente não autoriza ou encerra",
      },
    ];
  }
  if (type === "text" || type === "capture") {
    return [
      {
        label: "Depois desta mensagem",
        destination: stringValue(node.next) ? targetLabel(definition, stringValue(node.next)) : "Encerrar neste ponto",
        detail: type === "capture" ? "Após salvar a resposta" : "Após enviar a mensagem",
      },
    ];
  }
  if (type === "handoff") {
    return [
      {
        label: "Encaminhamento",
        destination: "Atendimento humano",
        detail: stringValue(node.departmentId) ? "Setor/fila configurados nesta etapa" : "Defina setor e fila antes de ativar",
      },
    ];
  }
  return [];
}

export function ChatbotFlowBuilder({
  definitionText,
  onDefinitionTextChange,
  disabled,
  departments,
  queues,
  advancedEditor,
}: Props) {
  const [mode, setMode] = useState<"guide" | "review" | "advanced">("guide");
  const parsed = useMemo(() => parseDefinition(definitionText), [definitionText]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const validation = useMemo(
    () => (parsed.ok ? buildIssues(parsed.definition, queues) : { issues: [parsed.message], warnings: [] }),
    [parsed, queues]
  );

  const commit = (definition: FlowDefinition) => onDefinitionTextChange(formatDefinition(definition));

  if (!parsed.ok) {
    return (
      <div className="grid gap-3">
        <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          O editor guiado precisa de uma definição válida. Corrija em Configurações avançadas.
        </div>
        {advancedEditor}
      </div>
    );
  }

  const definition = parsed.definition;
  const nodeIds = Object.keys(definition.nodes);
  const activeNodeId = selectedNodeId && definition.nodes[selectedNodeId] ? selectedNodeId : definition.start;
  const activeNode = definition.nodes[activeNodeId];
  const type = stringValue(activeNode.type);
  const activeStepPaths = buildStepPaths(definition, activeNodeId);
  const menuCount = Object.values(definition.nodes).filter((node) => node.type === "menu").length;
  const handoffCount = Object.values(definition.nodes).filter((node) => node.type === "handoff").length;
  const consentCount = Object.values(definition.nodes).filter((node) => node.type === "consent").length;
  const closedPolicy = getClosedHandoffPolicy(definition);
  const satisfactionPolicy = getSatisfactionPolicy(definition);
  const mediaPolicy = getMediaPolicy(definition);
  const departmentIds = new Set(
    Object.values(definition.nodes)
      .flatMap((node) => [node.departmentId, ...getOptions(node).map((option) => option.departmentId)])
      .filter((value): value is string => typeof value === "string" && Boolean(value))
  );
  const activeDepartmentId = stringValue(activeNode.departmentId);
  const nodeQueues = queues.filter((queue) => !activeDepartmentId || queue.departmentId === activeDepartmentId);

  const addNode = (nodeType: (typeof NODE_TYPES)[number], overrides?: Record<string, unknown>) => {
    const nodeId = buildNodeId(definition.nodes, nodeType);
    const node =
      nodeType === "menu"
        ? { type: nodeType, text: "Digite o número da opção desejada:", options: [], ...overrides }
        : nodeType === "capture"
          ? { type: nodeType, text: "Informe sua resposta:", field: "resposta", next: definition.start, ...overrides }
          : nodeType === "consent"
            ? {
                type: nodeType,
                purpose: "atendimento",
                textVersion: "v1",
                message: "Antes de continuar, precisamos da sua autorização.\n\n1 - Sim\n2 - Não",
                acceptOption: "1",
                declineOption: "2",
                onAccepted: definition.start,
                ...overrides,
              }
            : nodeType === "handoff"
              ? { type: nodeType, text: "Vou encaminhar para uma pessoa da equipe.", ...overrides }
              : { type: nodeType, text: "Mensagem do atendimento.", ...overrides };
    commit({ ...definition, nodes: { ...definition.nodes, [nodeId]: node } });
    setSelectedNodeId(nodeId);
  };

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border border-sky-300/30 bg-[#07111f] p-4 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-re7-orange">Construtor de fluxos</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Jornada de atendimento</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65">
              Edite a experiência em linguagem de negócio. A definição técnica original continua preservada no modo avançado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("guide")}
              className={`rounded-md border px-3 py-2 text-sm ${mode === "guide" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`}
            >
              Editar jornada
            </button>
            <button
              type="button"
              onClick={() => setMode("review")}
              className={`rounded-md border px-3 py-2 text-sm ${mode === "review" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`}
            >
              Revisar
            </button>
            <button
              type="button"
              onClick={() => setMode("advanced")}
              className={`rounded-md border px-3 py-2 text-sm ${mode === "advanced" ? "border-re7-sky bg-re7-sky/20 text-white" : "border-white/15 text-white/70 hover:bg-white/10"}`}
            >
              Configurações avançadas
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {[
            ["1", "Escolha a etapa", "Use o mapa da jornada à esquerda."],
            ["2", "Edite o conteúdo", "Mensagem, menu, autorização ou atendimento."],
            ["3", "Defina os caminhos", "Cada opção precisa dizer para onde vai."],
            ["4", "Revise e salve", "Confira erros antes de ativar."],
          ].map(([number, title, description]) => (
            <div key={number} className="rounded-lg border border-sky-200/20 bg-[#0b2035] p-3 shadow-sm shadow-black/20">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-re7-orange text-sm font-bold text-white">
                  {number}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/75">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-white/15 bg-black/25 p-3">
            <p className="text-xs uppercase text-white/60">Status da revisão</p>
            <p className={`mt-2 text-sm font-semibold ${validation.issues.length ? "text-amber-100" : "text-emerald-100"}`}>
              {validation.issues.length ? "Precisa revisar" : "Fluxo válido"}
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/25 p-3">
            <p className="text-xs uppercase text-white/60">Fluxo inicial</p>
            <p className="mt-2 truncate text-sm font-semibold text-white">{targetLabel(definition, definition.start)}</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/25 p-3">
            <p className="text-xs uppercase text-white/60">Etapas</p>
            <p className="mt-2 text-sm font-semibold text-white">{nodeIds.length} etapa(s)</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/25 p-3">
            <p className="text-xs uppercase text-white/60">Menus e atendimento</p>
            <p className="mt-2 text-sm font-semibold text-white">{menuCount} menu(s) • {handoffCount} atendimento(s)</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/25 p-3">
            <p className="text-xs uppercase text-white/60">Setores usados</p>
            <p className="mt-2 text-sm font-semibold text-white">{departmentIds.size || "nenhum"}</p>
          </div>
        </div>
      </section>

      {mode === "guide" ? (
        <section className="rounded-xl border border-amber-300/25 bg-[#211605] p-3 shadow-md shadow-black/20">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[14rem] flex-1">
              <h3 className="text-sm font-semibold text-white">Modelos rápidos (opcional)</h3>
              <p className="mt-1 text-xs leading-relaxed text-amber-50/80">
                Use apenas para começar do zero. Para editar o fluxo atual, siga os passos numerados.
              </p>
            </div>
            <div className="grid flex-[2] gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["menu", "Menu de opções"],
                ["simple", "Atendimento simples"],
                ["consent", "Com consentimento"],
                ["blank", "Em branco"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const skeleton = buildSkeleton(kind as "menu" | "simple" | "consent" | "blank");
                    commit(skeleton);
                    setSelectedNodeId(skeleton.start);
                  }}
                  className="rounded-md border border-amber-100/20 bg-black/25 px-3 py-2 text-left text-sm font-medium text-white hover:border-re7-sky hover:bg-re7-sky/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {mode === "advanced" ? (
        <section className="grid gap-3 rounded-xl border border-amber-300/25 bg-amber-500/10 p-4">
          <div>
            <h3 className="text-base font-semibold text-amber-50">Editar definição JSON</h3>
            <p className="mt-1 text-sm text-amber-100/80">
              Recomendado apenas para usuários técnicos. Campos desconhecidos e configurações avançadas são preservados quando o JSON continua válido.
            </p>
          </div>
          {advancedEditor}
        </section>
      ) : null}

      {mode === "review" ? (
        <section className="grid gap-4 rounded-xl border border-white/15 bg-[#09182b] p-4 shadow-md shadow-black/20">
          <div>
            <h3 className="text-lg font-semibold text-white">Revisar antes de salvar ou ativar</h3>
            <p className="mt-1 text-sm text-white/60">Esta visão mostra se a jornada está compreensível para operação.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {JOURNEY_STEPS.map((item) => (
              <div key={item} className="rounded-lg border border-white/15 bg-black/25 p-3">
                <p className="text-sm font-semibold text-white">{item}</p>
                <p className="mt-1 text-xs text-white/65">
                  {item === "Início do atendimento"
                    ? targetLabel(definition, definition.start)
                    : item === "Menus e respostas"
                      ? `${menuCount} menu(s) configurado(s)`
                      : item === "Atendimento humano"
                        ? `${handoffCount} encaminhamento(s)`
                        : item === "Pesquisa de satisfação"
                          ? isRecord(definition.satisfactionPolicy) ? "Configurada" : "Não configurada"
                          : item === "Inatividade"
                            ? getResetAfterMinutes(definition) ? `${getResetAfterMinutes(definition)} minuto(s)` : "Sem regra configurada"
                            : "Verifique na edição guiada"}
                </p>
              </div>
            ))}
          </div>
          {validation.issues.length ? (
            <div className="rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100">
              <p className="font-semibold">Erros que impedem ativação segura</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validation.issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Sem erros encontrados pela validação visual.
            </p>
          )}
          {validation.warnings.length ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Avisos</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validation.warnings.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "guide" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <aside className="grid content-start gap-4">
            <section className="rounded-xl border border-white/15 bg-[#09182b] p-4 shadow-md shadow-black/20">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-white">1. Escolha a etapa</h3>
                  <p className="mt-1 text-xs text-white/60">Clique em uma etapa para editar.</p>
                </div>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/70">
                  {nodeIds.length} etapa{nodeIds.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {nodeIds.map((nodeId, stepIndex) => {
                  const node = definition.nodes[nodeId];
                  const currentType = stringValue(node.type);
                  const selected = activeNodeId === nodeId;
                  return (
                    <button
                      key={nodeId}
                      type="button"
                      onClick={() => setSelectedNodeId(nodeId)}
                      className={`rounded-lg border p-3 text-left transition ${selected ? "border-re7-sky bg-re7-sky/20 shadow-lg shadow-sky-950/30" : "border-white/15 bg-black/25 hover:border-white/30 hover:bg-white/10"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? "bg-re7-sky text-re7-navy" : "bg-white/15 text-white"}`}>
                          {stepIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{stepName(nodeId, node)}</p>
                          <p className="mt-1 text-xs text-white/65">{nodeTypeLabel(currentType)}</p>
                        </div>
                        {definition.start === nodeId ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[0.65rem] font-semibold text-emerald-100">Início</span> : null}
                      </div>
                      {currentType === "menu" ? (
                        <div className="mt-3 space-y-1 border-l-2 border-re7-sky/40 pl-3 text-xs text-white/70">
                          {getOptions(node).slice(0, 4).map((option, index) => (
                            <p key={`${nodeId}-${index}`} className="truncate">{stringValue(option.label) || `Opção ${index + 1}`} → {targetLabel(definition, stringValue(option.next))}</p>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {NODE_TYPES.map((nodeType) => (
                  <button
                    key={nodeType}
                    type="button"
                    disabled={disabled}
                    onClick={() => addNode(nodeType)}
                    className="rounded-md border border-white/20 bg-white/10 px-2 py-2 text-xs font-medium text-white/85 hover:border-re7-sky hover:bg-re7-sky/15 disabled:opacity-50"
                  >
                    + {nodeTypeLabel(nodeType)}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="grid min-w-0 gap-4">
            <section className="rounded-xl border border-white/15 bg-[#09182b] p-4 shadow-md shadow-black/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${nodeTypeTone(type)}`}>
                    {nodeTypeLabel(type)}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-white">2. Edite o conteúdo desta etapa</h3>
                  <p className="mt-1 text-sm text-white/70">
                    Etapa selecionada: <span className="font-semibold text-white">{stepName(activeNodeId, activeNode)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => commit({ ...definition, start: activeNodeId })}
                    className="rounded-md border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                  >
                    Usar como início
                  </button>
                  {definition.start !== activeNodeId ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const nextNodes = { ...definition.nodes };
                        delete nextNodes[activeNodeId];
                        commit({ ...definition, nodes: nextNodes });
                        setSelectedNodeId(definition.start);
                      }}
                      className="rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Excluir etapa
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-4 rounded-lg border border-white/15 bg-black/25 p-3">
                <BuilderField label="Tipo de etapa">
                  <select
                    value={type}
                    disabled={disabled}
                    onChange={(event) => commit(setNodeField(definition, activeNodeId, "type", event.target.value))}
                    className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                  >
                    {NODE_TYPES.map((item) => <option key={item} value={item}>{nodeTypeLabel(item)}</option>)}
                  </select>
                </BuilderField>

                {type !== "handoff" && type !== "consent" ? (
                  <BuilderField label={type === "menu" ? "Título ou mensagem do menu" : "Mensagem que será enviada"}>
                    <textarea
                      value={stringValue(activeNode.text)}
                      disabled={disabled}
                      onChange={(event) => commit(setNodeField(definition, activeNodeId, "text", event.target.value))}
                      className="min-h-28 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                    />
                  </BuilderField>
                ) : null}

                {(type === "text" || type === "capture") ? (
                  <BuilderField label="Depois desta mensagem">
                    <NodeSelect
                      value={stringValue(activeNode.next)}
                      onChange={(value) => commit(setNodeField(definition, activeNodeId, "next", value))}
                      definition={definition}
                      disabled={disabled}
                    />
                  </BuilderField>
                ) : null}

                {type === "capture" ? (
                  <div className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 sm:grid-cols-2">
                    <BuilderField label="Informação que será salva">
                      <input
                        value={stringValue(activeNode.field)}
                        disabled={disabled}
                        onChange={(event) => commit(setNodeField(definition, activeNodeId, "field", event.target.value))}
                        className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      />
                    </BuilderField>
                    <BuilderField label="Como validar a resposta">
                      <select
                        value={stringValue(activeNode.validation)}
                        disabled={disabled}
                        onChange={(event) => commit(setNodeField(definition, activeNodeId, "validation", event.target.value))}
                        className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      >
                        <option value="">Sem validação especial</option>
                        <option value="non_empty">Resposta obrigatória</option>
                        <option value="email">E-mail</option>
                        <option value="phone_br">Telefone brasileiro</option>
                      </select>
                    </BuilderField>
                  </div>
                ) : null}

                {type === "consent" ? (
                  <div className="grid gap-3 rounded-lg border border-violet-300/20 bg-violet-500/10 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Solicitar autorização</p>
                      <p className="mt-1 text-xs text-white/55">A versão permite pedir nova autorização quando o texto mudar.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <BuilderField label="Para que será solicitado?">
                        <input
                          value={stringValue(activeNode.purpose)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "purpose", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                      <BuilderField label="Versão do texto">
                        <input
                          value={stringValue(activeNode.textVersion)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "textVersion", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                    </div>
                    <BuilderField label="Mensagem apresentada ao cliente">
                      <textarea
                        value={stringValue(activeNode.message)}
                        disabled={disabled}
                        onChange={(event) => commit(setNodeField(definition, activeNodeId, "message", event.target.value))}
                        className="min-h-36 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      />
                    </BuilderField>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <BuilderField label="Qual opção significa aceite?">
                        <input
                          value={stringValue(activeNode.acceptOption)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "acceptOption", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                      <BuilderField label="Qual opção significa recusa?">
                        <input
                          value={stringValue(activeNode.declineOption)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "declineOption", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                      <BuilderField label="Ao aceitar">
                        <NodeSelect
                          value={stringValue(activeNode.onAccepted)}
                          onChange={(value) => commit(setNodeField(definition, activeNodeId, "onAccepted", value))}
                          definition={definition}
                          disabled={disabled}
                          allowEmpty={false}
                        />
                      </BuilderField>
                      <BuilderField label="Ao recusar">
                        <NodeSelect
                          value={stringValue(activeNode.onDeclined)}
                          onChange={(value) => commit(setNodeField(definition, activeNodeId, "onDeclined", value))}
                          definition={definition}
                          disabled={disabled}
                        />
                      </BuilderField>
                    </div>
                    <BuilderField label="Quando a resposta não for reconhecida">
                      <textarea
                        value={stringValue(activeNode.invalidText)}
                        disabled={disabled}
                        onChange={(event) => commit(setNodeField(definition, activeNodeId, "invalidText", event.target.value))}
                        className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      />
                    </BuilderField>
                  </div>
                ) : null}

                {(type === "handoff" || type === "menu") ? (
                  <div className="grid gap-3 rounded-lg border border-orange-300/20 bg-orange-500/10 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Atendimento humano</p>
                      <p className="mt-1 text-xs text-white/55">Escolha o setor e a fila. A lista de filas é filtrada pelo setor selecionado.</p>
                    </div>
                    {type === "handoff" ? (
                      <BuilderField label="Mensagem antes de encaminhar">
                        <textarea
                          value={stringValue(activeNode.text)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "text", event.target.value))}
                          className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <BuilderField label="Setor">
                        <select
                          value={activeDepartmentId}
                          disabled={disabled}
                          onChange={(event) => {
                            const nextDepartmentId = event.target.value;
                            let next = setNodeField(definition, activeNodeId, "departmentId", nextDepartmentId);
                            const currentQueue = queues.find((queue) => queue.id === activeNode.queueId);
                            if (currentQueue && currentQueue.departmentId !== nextDepartmentId) {
                              next = setNodeField(next, activeNodeId, "queueId", "");
                            }
                            commit(next);
                          }}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        >
                          <option value="">Sem setor definido</option>
                          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                        </select>
                      </BuilderField>
                      <BuilderField label="Fila de atendimento">
                        <select
                          value={stringValue(activeNode.queueId)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "queueId", event.target.value))}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        >
                          <option value="">Fila padrão do setor</option>
                          {nodeQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                        </select>
                      </BuilderField>
                    </div>
                    <BuilderField label="Mensagem quando o setor estiver fechado" help="Os horários continuam no cadastro do setor; o fluxo só define a resposta ao cliente.">
                      <textarea
                        value={stringValue(activeNode.closedText)}
                        disabled={disabled}
                        onChange={(event) => commit(setNodeField(definition, activeNodeId, "closedText", event.target.value))}
                        className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      />
                    </BuilderField>
                  </div>
                ) : null}

                {type === "menu" ? (
                  <div className="grid gap-3 rounded-lg border border-sky-300/30 bg-sky-500/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">Opções e caminhos deste menu</p>
                        <p className="mt-1 text-xs text-white/70">Cada opção precisa ter número, texto e próximo passo. Você pode usar números fora de ordem.</p>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          const options = [...getOptions(activeNode), { label: `${getOptions(activeNode).length + 1} - Nova opção`, next: definition.start }];
                          commit(setNodeField(definition, activeNodeId, "options", options));
                        }}
                        className="rounded-md border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                      >
                        Adicionar opção
                      </button>
                    </div>
                    {getOptions(activeNode).map((option, optionIndex) => {
                      const optionDepartmentId = stringValue(option.departmentId);
                      const optionQueues = queues.filter((queue) => !optionDepartmentId || queue.departmentId === optionDepartmentId);
                      return (
                        <div key={optionIndex} className="grid gap-3 rounded-lg border border-white/20 bg-[#061326] p-3">
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-re7-orange text-xs font-bold text-white">
                              {optionIndex + 1}
                            </span>
                            <p className="text-sm font-semibold text-white">Opção do cliente</p>
                          </div>
                          <div className="grid gap-3 lg:grid-cols-[8rem_minmax(0,1fr)]">
                            <BuilderField label="Número">
                              <input
                                value={parseExplicitNumber(stringValue(option.label)) ?? String(optionIndex + 1)}
                                disabled={disabled}
                                onChange={(event) => {
                                  const text = stringValue(option.label).replace(/^(\d+)\s*([.)-])\s*/, "");
                                  commit(updateOption(definition, activeNodeId, optionIndex, { label: `${event.target.value.trim()} - ${text || "Nova opção"}` }));
                                }}
                                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                              />
                            </BuilderField>
                            <BuilderField label="Texto da opção">
                              <input
                                value={stringValue(option.label).replace(/^(\d+)\s*([.)-])\s*/, "")}
                                disabled={disabled}
                                onChange={(event) => {
                                  const number = parseExplicitNumber(stringValue(option.label)) ?? String(optionIndex + 1);
                                  commit(updateOption(definition, activeNodeId, optionIndex, { label: `${number} - ${event.target.value}` }));
                                }}
                                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                              />
                            </BuilderField>
                          </div>
                          <div className="grid gap-3 lg:grid-cols-3">
                            <BuilderField label="Próximo passo">
                              <NodeSelect
                                value={stringValue(option.next)}
                                onChange={(value) => commit(updateOption(definition, activeNodeId, optionIndex, { next: value }))}
                                definition={definition}
                                disabled={disabled}
                                allowEmpty={false}
                              />
                            </BuilderField>
                            <BuilderField label="Setor desta opção">
                              <select
                                value={optionDepartmentId}
                                disabled={disabled}
                                onChange={(event) => {
                                  const nextDepartmentId = event.target.value;
                                  const currentQueue = queues.find((queue) => queue.id === option.queueId);
                                  commit(updateOption(definition, activeNodeId, optionIndex, removeEmptyFields({
                                    departmentId: nextDepartmentId,
                                    queueId: currentQueue && currentQueue.departmentId !== nextDepartmentId ? undefined : option.queueId,
                                  })));
                                }}
                                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                              >
                                <option value="">Sem setor nesta opção</option>
                                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                              </select>
                            </BuilderField>
                            <BuilderField label="Fila desta opção">
                              <select
                                value={stringValue(option.queueId)}
                                disabled={disabled}
                                onChange={(event) => commit(updateOption(definition, activeNodeId, optionIndex, { queueId: event.target.value || undefined }))}
                                className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                              >
                                <option value="">Fila padrão</option>
                                {optionQueues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                              </select>
                            </BuilderField>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-white/75">
                            <input
                              type="checkbox"
                              checked={Boolean(option.requireOpenDepartment)}
                              disabled={disabled}
                              onChange={(event) => commit(updateOption(definition, activeNodeId, optionIndex, { requireOpenDepartment: event.target.checked || undefined }))}
                            />
                            Mostrar esta opção somente quando o setor estiver aberto
                          </label>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const options = getOptions(activeNode).filter((_, index) => index !== optionIndex);
                              commit(setNodeField(definition, activeNodeId, "options", options));
                            }}
                            className="w-fit rounded-md border border-red-300/30 px-3 py-2 text-xs text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Remover opção
                          </button>
                        </div>
                      );
                    })}
                    <div className="grid gap-3 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3">
                      <p className="text-sm font-semibold text-white">Se o cliente digitar uma opção inválida</p>
                      <BuilderField label="Mensagem">
                        <textarea
                          value={stringValue(activeNode.fallbackText)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, activeNodeId, "fallbackText", event.target.value))}
                          className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        />
                      </BuilderField>
                      <BuilderField label="Depois">
                        <select
                          value={isRecord(activeNode.invalidSelectionAction) ? stringValue(activeNode.invalidSelectionAction.action) : ""}
                          disabled={disabled}
                          onChange={(event) => {
                            const action = event.target.value;
                            commit(setNodeField(definition, activeNodeId, "invalidSelectionAction", action ? { ...(isRecord(activeNode.invalidSelectionAction) ? activeNode.invalidSelectionAction : {}), action } : undefined));
                          }}
                          className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        >
                          <option value="">Mostrar o mesmo menu novamente</option>
                          <option value="HANDOFF">Ir para atendimento humano</option>
                          <option value="CLOSE">Encerrar atendimento</option>
                        </select>
                      </BuilderField>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-emerald-300/25 bg-[#082016] p-4 shadow-md shadow-black/20">
              <div>
                <h3 className="text-base font-semibold text-white">3. Caminhos da etapa selecionada</h3>
                <p className="mt-1 text-sm text-white/70">Use esta lista para conferir a sequência antes de salvar.</p>
              </div>
              {activeStepPaths.length ? (
                <div className="grid gap-2">
                  {activeStepPaths.map((path, index) => (
                    <div key={`${path.label}-${index}`} className="grid gap-2 rounded-lg border border-white/15 bg-black/25 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="text-xs uppercase text-white/55">Quando acontecer</p>
                        <p className="truncate text-sm font-semibold text-white">{path.label}</p>
                      </div>
                      <span className="hidden text-xl text-emerald-200 sm:block">→</span>
                      <div className="min-w-0">
                        <p className="text-xs uppercase text-white/55">Próximo passo</p>
                        <p className="truncate text-sm font-semibold text-emerald-100">{path.destination}</p>
                        <p className="mt-1 text-xs text-white/55">{path.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white/70">
                  Esta etapa não possui caminho configurável. Ela encerra ou depende de configuração avançada.
                </p>
              )}
            </section>

            <section className="grid gap-4 rounded-xl border border-white/15 bg-[#09182b] p-4 shadow-md shadow-black/20">
              <h3 className="text-base font-semibold text-white">4. Configurações gerais da jornada</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="grid gap-3 rounded-lg border border-white/15 bg-[#061326] p-3">
                  <p className="text-sm font-semibold text-white">Comandos que o cliente pode digitar</p>
                  <BuilderField label="Voltar ao menu anterior" help="Em submenu, volta para o menu anterior. No menu principal, segue a regra de opção inválida.">
                    <input
                      value={getBackCommand(definition)}
                      disabled={disabled}
                      onChange={(event) => commit(updateGlobalCommand(definition, "BACK", event.target.value, ["BOT"]))}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      placeholder="#"
                    />
                  </BuilderField>
                  <BuilderField label="Encerrar atendimento">
                    <input
                      value={getCloseCommand(definition)}
                      disabled={disabled}
                      onChange={(event) => commit(updateGlobalCommand(definition, "CLOSE", event.target.value, ["BOT", "HUMAN_HANDOFF", "HUMAN"]))}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      placeholder="#ENCERRAR#"
                    />
                  </BuilderField>
                </div>

                <div className="grid gap-3 rounded-lg border border-white/15 bg-[#061326] p-3">
                  <p className="text-sm font-semibold text-white">Se o cliente parar de responder</p>
                  <BuilderField label="Depois de quantos minutos?">
                    <input
                      type="number"
                      min="1"
                      value={getResetAfterMinutes(definition)}
                      disabled={disabled}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        const existing = isRecord(definition.inactivityPolicy) ? definition.inactivityPolicy : {};
                        commit(setDefinitionField(definition, "inactivityPolicy", Number.isFinite(value) && value > 0 ? { ...existing, resetAfterMinutes: value } : undefined));
                      }}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                    />
                  </BuilderField>
                  <BuilderField label="O que fazer depois?">
                    <select
                      value={getInactivityAction(definition)}
                      disabled={disabled}
                      onChange={(event) => {
                        const existing = isRecord(definition.inactivityPolicy) ? definition.inactivityPolicy : {};
                        commit(setDefinitionField(definition, "inactivityPolicy", removeEmptyFields({ ...existing, action: event.target.value })));
                      }}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                    >
                      <option value="">Voltar ao início</option>
                      <option value="HANDOFF">Encaminhar para atendimento humano</option>
                      <option value="CLOSE">Encerrar atendimento</option>
                      <option value="NONE">Não fazer nada</option>
                    </select>
                  </BuilderField>
                  {getInactivityAction(definition) === "HANDOFF" ? (
                    <p className="rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Após esse período, o sistema realizará o encaminhamento automaticamente, mesmo sem nova mensagem do cliente.
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 rounded-lg border border-white/15 bg-[#061326] p-3">
                  <p className="text-sm font-semibold text-white">Quando o atendimento humano estiver fechado</p>
                  <BuilderField label="Comportamento">
                    <select
                      value={stringValue(closedPolicy.mode)}
                      disabled={disabled}
                      onChange={(event) => commit(setDefinitionField(definition, "closedHandoffPolicy", removeEmptyFields({ ...closedPolicy, mode: event.target.value })))}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                    >
                      <option value="">Não colocar na fila</option>
                      <option value="QUEUE_FOR_NEXT_OPEN">Colocar na fila para o próximo expediente</option>
                    </select>
                  </BuilderField>
                  <label className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(closedPolicy.showQueuePosition)}
                      disabled={disabled}
                      onChange={(event) => commit(setDefinitionField(definition, "closedHandoffPolicy", removeEmptyFields({ ...closedPolicy, showQueuePosition: event.target.checked || undefined })))}
                    />
                    Informar posição na fila
                  </label>
                  <BuilderField label="Mensagem com posição" help="Use {position}. A posição é calculada automaticamente pela fila real.">
                    <input
                      value={stringValue(closedPolicy.queuePositionText)}
                      disabled={disabled}
                      onChange={(event) => commit(setDefinitionField(definition, "closedHandoffPolicy", removeEmptyFields({ ...closedPolicy, queuePositionText: event.target.value })))}
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      placeholder="Você é o nº {position} da fila de atendimento."
                    />
                  </BuilderField>
                </div>

                <div className="grid gap-3 rounded-lg border border-white/15 bg-[#061326] p-3">
                  <p className="text-sm font-semibold text-white">Pesquisa após atendimento humano</p>
                  <label className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(satisfactionPolicy.enabled)}
                      disabled={disabled}
                      onChange={(event) => commit(setDefinitionField(definition, "satisfactionPolicy", removeEmptyFields({ ...satisfactionPolicy, enabled: event.target.checked || undefined })))}
                    />
                    Enviar pesquisa de satisfação
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BuilderField label="Tipo">
                      <select
                        value={stringValue(satisfactionPolicy.type)}
                        disabled={disabled}
                        onChange={(event) => commit(setDefinitionField(definition, "satisfactionPolicy", removeEmptyFields({ ...satisfactionPolicy, type: event.target.value })))}
                        className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                      >
                        <option value="">Satisfação de 1 a 5</option>
                        <option value="CSAT">Satisfação de 1 a 5</option>
                        <option value="NPS">NPS de 0 a 10</option>
                      </select>
                    </BuilderField>
                    <BuilderField label="Tempo para resposta">
                      <input
                        type="number"
                        min="1"
                        value={numberValue(satisfactionPolicy.expiresAfterMinutes)?.toString() ?? ""}
                        disabled={disabled}
                        onChange={(event) => commit(setDefinitionField(definition, "satisfactionPolicy", removeEmptyFields({ ...satisfactionPolicy, expiresAfterMinutes: Number.parseInt(event.target.value, 10) || undefined })))}
                        className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
                        placeholder="15"
                      />
                    </BuilderField>
                  </div>
                  <p className="rounded-md border border-white/15 bg-black/25 px-3 py-2 text-xs leading-relaxed text-white/70">
                    Preview: 5 - ⭐⭐⭐⭐⭐ · 4 - ⭐⭐⭐⭐ · 3 - ⭐⭐⭐ · 2 - ⭐⭐ · 1 - ⭐
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-white/15 bg-[#061326] p-3">
                <p className="text-sm font-semibold text-white">Mídias permitidas neste tenant</p>
                <p className="mt-1 text-xs text-white/65">Esta política é governada no canal/admin. Aqui aparece apenas como referência da jornada.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {["image", "audio", "video", "document"].map((item) => (
                    <span key={item} className="rounded-full border border-white/15 bg-black/25 px-2 py-1 text-white/75">
                      {Boolean(mediaPolicy[item]) ? "✓" : "•"} {item === "image" ? "Imagem" : item === "audio" ? "Áudio" : item === "video" ? "Vídeo" : "Documento"}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-3 rounded-xl border border-violet-300/25 bg-[#160f2d] p-4 shadow-md shadow-black/20">
              <div>
                <h3 className="text-base font-semibold text-white">5. Como o cliente verá</h3>
                <p className="mt-1 text-sm text-white/70">Prévia simples da etapa selecionada, sem enviar mensagem real.</p>
              </div>
              <div className="grid gap-2 rounded-lg border border-white/15 bg-black/25 p-3">
                <PreviewBubble speaker="Bot" text={stringValue(activeNode.message || activeNode.text) || nodeTypeLabel(type)} />
                {type === "menu" && getOptions(activeNode)[0] ? (
                  <>
                    <PreviewBubble speaker="Cliente" text={parseExplicitNumber(stringValue(getOptions(activeNode)[0].label)) ?? "1"} />
                    <PreviewBubble speaker="Bot" text={`Próximo passo: ${targetLabel(definition, stringValue(getOptions(activeNode)[0].next))}`} />
                  </>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      ) : null}
    </div>
  );
}
