"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppAutomationSettings,
  AppChatbotFlowItem,
  AppSession,
  clearAppSession,
  createAppChatbotFlow,
  fetchAppChatbotFlows,
  fetchAppChatbotSettings,
  loadAppSession,
  saveAppSession,
  updateAppChatbotFlow,
  updateAppChatbotSettings,
} from "@/lib/appClientApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";

const DEFAULT_DEFINITION_TEXT = JSON.stringify(
  {
    start: "menu_principal",
    nodes: {
      menu_principal: {
        type: "menu",
        text: "Escolha uma opcao:",
        options: [
          { label: "Atendimento", next: "atendimento" },
          { label: "Falar com humano", next: "handoff" },
        ],
      },
      atendimento: {
        type: "text",
        text: "Certo. Vou seguir com voce por aqui.",
      },
      handoff: {
        type: "handoff",
      },
    },
  },
  null,
  2
);

function canAccessChatbot(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function canManageChatbot(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function normalizeChatbotError(error: AppApiError, fallback: string) {
  if (error.errorCode === "invalid_chatbot_definition") {
    return error.message || "JSON invalido para o flow.";
  }
  if (error.errorCode === "ai_context_missing") {
    return error.message || "IA automatica exige configuracao previa do tenant.";
  }
  if (error.errorCode === "chatbot_locked_by_admin") {
    return error.message || "Fluxo configuravel esta desativado no console interno.";
  }
  if (error.errorCode === "ai_locked_by_admin") {
    return error.message || "IA conversacional esta desativada no console interno.";
  }
  if (error.status === 403) {
    return "Sem permissao para gerenciar flows do chatbot.";
  }
  return error.message || fallback;
}

function formatDefinitionText(definition: unknown) {
  return JSON.stringify(definition, null, 2);
}

function parseDefinitionText(definitionText: string) {
  const definition = JSON.parse(definitionText) as {
    start: string;
    nodes: Record<string, unknown>;
  };
  return {
    definition,
    formatted: formatDefinitionText(definition),
  };
}

function getJsonSyntaxError(definitionText: string) {
  try {
    JSON.parse(definitionText);
    return null;
  } catch (error) {
    return (error as Error).message || "JSON invalido.";
  }
}

function countOccurrences(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  let total = 0;
  let cursor = 0;
  const normalizedText = text.toLowerCase();
  while (cursor < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) break;
    total += 1;
    cursor = index + normalizedQuery.length;
  }
  return total;
}

function buildHighlightedJsonParts(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [{ text, highlighted: false }];

  const normalizedText = text.toLowerCase();
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) {
      parts.push({ text: text.slice(cursor), highlighted: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), highlighted: false });
    }
    parts.push({
      text: text.slice(index, index + normalizedQuery.length),
      highlighted: true,
    });
    cursor = index + normalizedQuery.length;
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

function selectJsonOccurrence(textareaId: string, text: string, query: string, backwards = false) {
  const textarea = document.getElementById(textareaId);
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return;
  const normalizedText = text.toLowerCase();
  const currentCursor = backwards ? textarea.selectionStart - 1 : textarea.selectionEnd;
  let index = backwards
    ? normalizedText.lastIndexOf(normalizedQuery, Math.max(currentCursor, 0))
    : normalizedText.indexOf(normalizedQuery, currentCursor);
  if (index < 0) {
    index = backwards
      ? normalizedText.lastIndexOf(normalizedQuery)
      : normalizedText.indexOf(normalizedQuery);
  }
  if (index < 0) return;
  textarea.focus();
  textarea.setSelectionRange(index, index + normalizedQuery.length);
}

function JsonSearchPreview({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  const occurrences = countOccurrences(text, trimmedQuery);
  if (occurrences === 0) {
    return (
      <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Nenhuma ocorrencia encontrada para "{trimmedQuery}".
      </p>
    );
  }

  return (
    <div className="rounded-md border border-re7-sky/30 bg-re7-navy/70">
      <div className="border-b border-white/10 px-3 py-2 text-xs text-white/65">
        Termos localizados no JSON
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed text-white/75">
        {buildHighlightedJsonParts(text, trimmedQuery).map((part, index) =>
          part.highlighted ? (
            <mark key={index} className="rounded bg-re7-orange px-0.5 text-white">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          )
        )}
      </pre>
    </div>
  );
}

function FlowBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-white/80";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function TogglePill({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
        checked
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
          : "border-white/15 bg-white/5 text-white/70"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

export default function AppChatbotPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [flows, setFlows] = useState<AppChatbotFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppAutomationSettings | null>(null);
  const [newName, setNewName] = useState("Fluxo principal");
  const [newDefinition, setNewDefinition] = useState(DEFAULT_DEFINITION_TEXT);
  const [newSearch, setNewSearch] = useState("");
  const [newIsActive, setNewIsActive] = useState(false);
  const [newEntryPoint, setNewEntryPoint] = useState(true);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        name: string;
        definitionText: string;
        isActive: boolean;
        entryPoint: boolean;
      }
    >
  >({});
  const [draftSearches, setDraftSearches] = useState<Record<string, string>>({});

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const hydrateFlows = useCallback((items: AppChatbotFlowItem[]) => {
    setFlows(items);
    setDrafts(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            name: item.name,
            definitionText: formatDefinitionText(item.definition),
            isActive: item.isActive,
            entryPoint: item.entryPoint,
          },
        ])
      )
    );
  }, []);

  const loadFlows = useCallback(
    async (activeSession: AppSession) => {
      const [flowResponse, settingsResponse] = await Promise.all([
        fetchAppChatbotFlows(activeSession),
        fetchAppChatbotSettings(activeSession),
      ]);
      hydrateFlows(flowResponse.items);
      setSettings(settingsResponse.settings);
    },
    [hydrateFlows]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canAccessChatbot(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadFlows(session)
      .catch((err) => {
        if (cancelled) return;
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        if (typed.status === 403) {
          router.replace("/app/inbox");
          return;
        }
        setError(typed.message || "Falha ao carregar flows do chatbot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadFlows, router, session]);

  useEffect(() => {
    if (!error && !success) return;
    const timer = window.setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [error, success]);

  const sortedFlows = useMemo(
    () =>
      [...flows].sort((a, b) => {
        if (a.entryPoint !== b.entryPoint) return a.entryPoint ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }),
    [flows]
  );

  const newJsonError = useMemo(() => getJsonSyntaxError(newDefinition), [newDefinition]);
  const draftJsonErrors = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drafts).map(([flowId, draft]) => [flowId, getJsonSyntaxError(draft.definitionText)])
      ),
    [drafts]
  );

  const handleCreate = async () => {
    if (!session) return;
    if (!canManageChatbot(session.user.role)) {
      setError("Somente ADMIN pode alterar flows do chatbot.");
      return;
    }
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Informe o nome do flow.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(newDefinition);
    } catch {
      setError("JSON invalido no novo flow.");
      return;
    }
    setNewDefinition(parsedDefinition.formatted);
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await createAppChatbotFlow(session, {
        name: trimmedName,
        isActive: newIsActive,
        entryPoint: newEntryPoint,
        definition: parsedDefinition.definition,
      });
      await loadFlows(session);
      setSuccess("Flow criado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeChatbotError(typed, "Falha ao criar flow."));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (flow: AppChatbotFlowItem) => {
    if (!session) return;
    const draft = drafts[flow.id];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError("Informe o nome do flow.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(draft.definitionText);
    } catch {
      setError("JSON invalido no flow selecionado.");
      return;
    }
    setDrafts((current) => ({
      ...current,
      [flow.id]: {
        ...draft,
        definitionText: parsedDefinition.formatted,
      },
    }));
    setSavingId(flow.id);
    setError(null);
    setSuccess(null);
    try {
      await updateAppChatbotFlow(session, flow.id, {
        name: trimmedName,
        isActive: draft.isActive,
        entryPoint: draft.entryPoint,
        definition: parsedDefinition.definition,
      });
      await loadFlows(session);
      setSuccess("Flow atualizado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeChatbotError(typed, "Falha ao atualizar flow."));
    } finally {
      setSavingId(null);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  const readOnly = !canManageChatbot(session.user.role);

  const automationDraft = settings ?? {
    disableAutoReply: false,
    disableChatbot: false,
    disableAiFallback: false,
    aiConfigured: false,
    chatbotLocked: false,
    aiLocked: false,
  };

  const handleSaveSettings = async () => {
    if (!session || !settings) return;
    if (readOnly) {
      setError("Somente administradores podem alterar essas configuracoes.");
      return;
    }
    setSavingSettings(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppChatbotSettings(session, automationDraft);
      setSettings(response.settings);
      setSuccess("Automacao atualizada com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(typed.message || "Falha ao salvar automacao.");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <AppShell
      session={session}
      title="Chatbot"
      subtitle="Ajuste os fluxos de atendimento automatico sem sair do portal."
    >
      <FeedbackToast message={success} />
      <FeedbackToast message={error} variant="error" />

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Automacao do atendimento</h2>
            <p className="mt-1 text-sm text-white/65">
              Ligue ou desligue os recursos disponiveis para este cliente.
            </p>
            <p className="mt-1 text-xs text-white/50">
              Configuracao de IA: {automationDraft.aiConfigured ? "pronta" : "pendente"}.
              {!automationDraft.aiConfigured ? " Sem isso, a IA conversacional fica indisponivel." : ""}
            </p>
          </div>
          {!readOnly ? (
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings || !settings}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings ? "Salvando..." : "Salvar ajustes"}
            </button>
          ) : null}
        </div>

        {settings ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {[
              {
                key: "disableChatbot" as const,
                title: "Fluxo configuravel",
                help: automationDraft.chatbotLocked
                  ? "Bloqueado pelo console interno. O tenant nao pode reativar esta camada no /app."
                  : "On ativa os flows personalizados criados nesta tela para este tenant.",
              },
              {
                key: "disableAiFallback" as const,
                title: "IA conversacional",
                help: automationDraft.aiLocked
                  ? "Bloqueado pelo console interno. O tenant nao pode reativar esta camada no /app."
                  : automationDraft.aiConfigured
                  ? "On ativa a IA automatica com o contexto configurado para este tenant."
                  : "Indisponivel ate existir configuracao previa de contexto para este tenant.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-re7-navy/40 p-3 text-sm sm:p-4"
              >
                <span className="space-y-1">
                  <span className="block font-medium text-white">{item.title}</span>
                  <span className="block text-white/60">{item.help}</span>
                </span>
                <TogglePill
                  checked={!automationDraft[item.key]}
                  disabled={
                    readOnly ||
                    (item.key === "disableChatbot" && automationDraft.chatbotLocked) ||
                    (item.key === "disableAiFallback" &&
                      (automationDraft.aiLocked ||
                        (!automationDraft.aiConfigured && automationDraft.disableAiFallback)))
                  }
                  onToggle={() =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            [item.key]: !current[item.key],
                          }
                        : current
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : (
            <p className="text-sm text-white/70">Carregando configuracoes...</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-4 space-y-2">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
            Novo flow
          </span>
          <p className="text-sm text-white/65">
            Defina o fluxo em JSON com <code className="rounded bg-white/10 px-1 py-0.5">start</code> e{" "}
            <code className="rounded bg-white/10 px-1 py-0.5">nodes</code>. Supervisores podem acompanhar, mas nao editar.
          </p>
        </div>
        <div className="grid gap-3">
          <input
            className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Fluxo principal"
            disabled={readOnly || creating}
          />
          <textarea
            id="new-flow-definition"
            className="min-h-[14rem] w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-sm text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[18rem]"
            value={newDefinition}
            onChange={(event) => setNewDefinition(event.target.value)}
            disabled={readOnly || creating}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/75">
            <input
              className="min-w-[220px] flex-1 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
              value={newSearch}
              onChange={(event) => setNewSearch(event.target.value)}
              placeholder="Localizar no JSON"
              disabled={readOnly || creating}
            />
            <button
              type="button"
              onClick={() => selectJsonOccurrence("new-flow-definition", newDefinition, newSearch, true)}
              disabled={!newSearch.trim()}
              className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => selectJsonOccurrence("new-flow-definition", newDefinition, newSearch)}
              disabled={!newSearch.trim()}
              className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Proximo
            </button>
            <span className="text-xs text-white/50">{countOccurrences(newDefinition, newSearch)} ocorrencia(s)</span>
          </div>
          <JsonSearchPreview text={newDefinition} query={newSearch} />
          {newJsonError ? (
            <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              JSON invalido: {newJsonError}
            </p>
          ) : (
            <p className="text-xs text-emerald-200/80">JSON valido. Ao salvar, o conteudo sera reindentado automaticamente.</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newIsActive}
                onChange={(event) => setNewIsActive(event.target.checked)}
                disabled={readOnly || creating}
              />
              Ativo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newEntryPoint}
                onChange={(event) => setNewEntryPoint(event.target.checked)}
                disabled={readOnly || creating}
              />
              Entrada principal
            </label>
          </div>
          <div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={readOnly || creating}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Criando..." : "Criar fluxo"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Fluxos cadastrados</h2>
            <p className="mt-1 text-sm text-white/65">
              {readOnly
                ? "Visualizacao somente para leitura."
                : "Edite nome, JSON e ativacao sem sair do portal."}
            </p>
          </div>
          <FlowBadge label={`${flows.length} fluxo(s)`} />
        </div>

        {loading ? (
          <p className="text-sm text-white/70">Carregando fluxos...</p>
        ) : sortedFlows.length === 0 ? (
          <p className="text-sm text-white/70">Nenhum fluxo cadastrado.</p>
        ) : (
          <div className="space-y-4">
            {sortedFlows.map((flow) => {
              const draft = drafts[flow.id];
              if (!draft) return null;
              return (
                <article key={flow.id} className="min-w-0 rounded-xl border border-white/10 bg-re7-navy/40 p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">{flow.name}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <FlowBadge label={flow.isActive ? "Ativo" : "Inativo"} tone={flow.isActive ? "success" : "warning"} />
                        {flow.entryPoint ? <FlowBadge label="Entrada principal" /> : null}
                        <FlowBadge label={`Atualizado em ${formatDateTime(flow.updatedAt)}`} />
                      </div>
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => void handleSave(flow)}
                        disabled={savingId === flow.id}
                        className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === flow.id ? "Salvando..." : "Salvar"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3">
                    <input
                      className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [flow.id]: {
                            ...draft,
                            name: event.target.value,
                          },
                        }))
                      }
                      disabled={readOnly}
                    />
                    <textarea
                      id={`flow-definition-${flow.id}`}
                      className="min-h-[14rem] w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-sm text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[18rem]"
                      value={draft.definitionText}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [flow.id]: {
                            ...draft,
                            definitionText: event.target.value,
                          },
                        }))
                      }
                      disabled={readOnly}
                    />
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/75">
                      <input
                        className="min-w-[220px] flex-1 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
                        value={draftSearches[flow.id] ?? ""}
                        onChange={(event) =>
                          setDraftSearches((current) => ({
                            ...current,
                            [flow.id]: event.target.value,
                          }))
                        }
                        placeholder="Localizar no JSON"
                        disabled={readOnly}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          selectJsonOccurrence(
                            `flow-definition-${flow.id}`,
                            draft.definitionText,
                            draftSearches[flow.id] ?? "",
                            true
                          )
                        }
                        disabled={!(draftSearches[flow.id] ?? "").trim()}
                        className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          selectJsonOccurrence(
                            `flow-definition-${flow.id}`,
                            draft.definitionText,
                            draftSearches[flow.id] ?? ""
                          )
                        }
                        disabled={!(draftSearches[flow.id] ?? "").trim()}
                        className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Proximo
                      </button>
                      <span className="text-xs text-white/50">
                        {countOccurrences(draft.definitionText, draftSearches[flow.id] ?? "")} ocorrencia(s)
                      </span>
                    </div>
                    <JsonSearchPreview text={draft.definitionText} query={draftSearches[flow.id] ?? ""} />
                    {draftJsonErrors[flow.id] ? (
                      <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        JSON invalido: {draftJsonErrors[flow.id]}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-200/80">
                        JSON valido. Ao salvar, o conteudo sera reindentado automaticamente.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.isActive}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [flow.id]: {
                                ...draft,
                                isActive: event.target.checked,
                              },
                            }))
                          }
                          disabled={readOnly}
                        />
                        Ativo
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.entryPoint}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [flow.id]: {
                                ...draft,
                                entryPoint: event.target.checked,
                              },
                            }))
                          }
                          disabled={readOnly}
                        />
                        Entry point
                      </label>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
