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

const NODE_TYPES = ["menu", "text", "capture", "handoff"] as const;

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

export function ChatbotFlowBuilder({
  definitionText,
  onDefinitionTextChange,
  disabled,
  departments,
  queues,
  advancedEditor,
}: Props) {
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const parsed = useMemo(() => parseDefinition(definitionText), [definitionText]);
  const issues = useMemo(
    () => (parsed.ok ? buildIssues(parsed.definition, queues) : [parsed.message]),
    [parsed, queues]
  );

  const commit = (definition: FlowDefinition) => onDefinitionTextChange(formatDefinition(definition));

  if (!parsed.ok) {
    return (
      <div className="grid gap-3">
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
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
          <section className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3 sm:grid-cols-4">
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
              Setores usados: {departmentIds.size || "nenhum"}. O transporte usado pelo canal não altera esta configuração.
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
            <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Revise antes de salvar</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
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
              return (
                <article key={nodeId} className="rounded-xl border border-white/10 bg-re7-navy/40 p-3">
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

                    {type !== "handoff" ? (
                      <label className="grid gap-1 text-sm text-white/70">
                        Mensagem
                        <textarea
                          value={stringValue(node.text)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, nodeId, "text", event.target.value))}
                          className="min-h-24 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                        />
                        <span className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65 whitespace-pre-wrap">
                          {stringValue(node.text) || "Prévia da mensagem"}
                        </span>
                      </label>
                    ) : (
                      <label className="grid gap-1 text-sm text-white/70">
                        Mensagem antes de encaminhar
                        <textarea
                          value={stringValue(node.text)}
                          disabled={disabled}
                          onChange={(event) => commit(setNodeField(definition, nodeId, "text", event.target.value))}
                          className="min-h-20 rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-white"
                        />
                      </label>
                    )}

                    {(type === "text" || type === "capture") ? (
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
                    ) : null}

                    {type === "capture" ? (
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
                    ) : null}

                    {(type === "menu" || type === "handoff") ? (
                      <div className="grid gap-2 rounded-lg border border-white/10 bg-black/10 p-3">
                        <p className="text-sm font-semibold text-white">Destino de atendimento</p>
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
                      </div>
                    ) : null}

                    {type === "menu" ? (
                      <div className="grid gap-2 rounded-lg border border-white/10 bg-black/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">Opções do menu</p>
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
                            <div key={optionIndex} className="grid gap-2 rounded-md border border-white/10 p-2">
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
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
