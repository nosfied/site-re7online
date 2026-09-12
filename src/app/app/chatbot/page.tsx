"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  ChatbotFlowBuilder,
  ChatbotFlowBuilderDepartment,
  ChatbotFlowBuilderQueue,
} from "@/components/app/ChatbotFlowBuilder";
import {
  AppApiError,
  AppAutomationSettings,
  AppChatbotFlowItem,
  AppSession,
  clearAppSession,
  createAppChatbotFlow,
  fetchAppChatbotFlows,
  fetchAppChatbotResources,
  fetchAppChatbotSettings,
  loadAppSession,
  saveAppSession,
  updateAppChatbotSettings,
  updateAppChatbotFlow,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";
import { getAppChatbotAiMissingLabels } from "@/lib/appChatbotAiStatus";
import { DEFAULT_NEW_CHATBOT_FLOW_ENTRY_POINT } from "@/lib/chatbotFlowCreationDefaults";
import {
  getExistingFlowDefaultExpanded,
  getFlowNodeCountFromDefinitionText,
  getNewFlowDefaultExpanded,
} from "@/lib/appChatbotFlowAccordion";
import { formatDateTime } from "@/lib/whatsappAdminApi";

const DEFAULT_DEFINITION_TEXT = JSON.stringify(
  {
    start: "menu_principal",
    nodes: {
      menu_principal: {
        type: "menu",
        text: "Escolha uma opcao:",
        options: [
          { label: "Informacoes", next: "informacoes" },
          { label: "Falar com humano", next: "handoff" },
        ],
      },
      informacoes: {
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

function canManageNotificationSettings(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeChatbotError(error: AppApiError, fallback: string) {
  if (error.errorCode === "invalid_chatbot_definition") {
    return "JSON inválido para o fluxo.";
  }
  if (error.errorCode === "ai_context_missing") {
    return "IA automática exige configuração prévia da organização.";
  }
  if (error.errorCode === "chatbot_locked_by_admin") {
    return "Fluxo configurável está desativado no console interno.";
  }
  if (error.errorCode === "chatbot_flow_editing_locked_by_admin") {
    return "Criação e edição de fluxos estão bloqueadas no console interno.";
  }
  if (error.errorCode === "ai_locked_by_admin") {
    return "IA conversacional está desativada no console interno.";
  }
  if (error.errorCode === "intent_classifier_locked_by_admin") {
    return "Classificação por mensagem livre está desativada no console interno.";
  }
  if (error.errorCode === "intent_classifier_globally_disabled") {
    return "Classificação por mensagem livre está desativada no ambiente.";
  }
  if (error.errorCode === "managed_by_internal_admin") {
    return "Estas configurações são gerenciadas no console interno.";
  }
  if (error.status === 403) {
    return "Sem permissão para gerenciar fluxos de automação.";
  }
  return getAppErrorUxMessage({ status: error.status, errorCode: error.errorCode, message: error.message, fallback });
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
    return (error as Error).message || "JSON inválido.";
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOccurrenceRanges(text: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const matcher = new RegExp(escapeRegExp(normalizedQuery), "gi");
  return Array.from(text.matchAll(matcher)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function getLineHeightPx(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(computed.lineHeight);
  const fontSize = Number.parseFloat(computed.fontSize);
  return Number.isFinite(lineHeight) ? lineHeight : Number.isFinite(fontSize) ? fontSize * 1.4 : 20;
}

function scrollTextareaToSelection(textarea: HTMLTextAreaElement, index: number) {
  const lineHeight = getLineHeightPx(textarea);
  const linesBeforeMatch = textarea.value.slice(0, index).split("\n").length - 1;
  const targetTop = Math.max(0, linesBeforeMatch * lineHeight - textarea.clientHeight * 0.35);
  textarea.scrollTop = targetTop;
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
  scrollTextareaToSelection(textarea, index);
}

function JsonEditorWithSearch({
  id,
  value,
  onChange,
  disabled,
  search,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  search: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const highlightedParts = useMemo(() => buildHighlightedJsonParts(value, search), [search, value]);

  return (
    <div className="relative min-h-[14rem] sm:min-h-[18rem]">
      <pre
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 min-h-[14rem] overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 font-mono text-sm leading-normal text-transparent sm:min-h-[18rem]"
        style={{ transform: `translateY(-${scrollTop}px)` }}
      >
        {highlightedParts.map((part, index) =>
          part.highlighted ? (
            <mark key={index} className="rounded bg-re7-orange/90 px-0.5 text-transparent">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          )
        )}
      </pre>
      <textarea
        id={id}
        className="relative min-h-[14rem] w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-sm leading-normal text-white/95 caret-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[18rem]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        spellCheck={false}
        disabled={disabled}
      />
    </div>
  );
}

function JsonSearchPreview({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  const occurrences = getOccurrenceRanges(text, trimmedQuery).length;
  if (occurrences === 0) {
    return (
      <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Nenhuma ocorrencia encontrada para &quot;{trimmedQuery}&quot;.
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
      ? "border-emerald-700 bg-emerald-600 text-white"
      : tone === "warning"
        ? "border-amber-700 bg-amber-500 text-slate-950"
        : "border-slate-600 bg-slate-500 text-white";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function FlowAccordionCard({
  id,
  title,
  description,
  expanded,
  onToggle,
  badges,
  actions,
  hasIssue,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  badges?: ReactNode;
  actions?: ReactNode;
  hasIssue?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      data-chatbot-flow-container
      className={`chatbot-flow-card min-w-0 overflow-hidden rounded-2xl border transition ${
        expanded
          ? "border-re7-sky/40 bg-re7-navy/45 shadow-lg shadow-black/15"
          : "border-white/10 bg-re7-navy/30 hover:border-white/20"
      }`}
    >
      <div
        data-chatbot-flow-header
        className={`flex flex-wrap items-center gap-3 p-3 transition sm:p-4 ${
          expanded ? "bg-white/[0.045]" : "bg-white/[0.035]"
        }`}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={`${expanded ? "Recolher" : "Expandir"} ${title}`}
          onClick={onToggle}
          className="group flex min-w-[220px] flex-1 items-center gap-3 text-left focus:outline-none"
        >
          <span
            aria-hidden="true"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-2xl leading-none text-white/80 transition group-focus-visible:ring-2 group-focus-visible:ring-re7-sky/70 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-re7-navy ${
              expanded ? "rotate-90 text-re7-sky" : ""
            }`}
          >
            ›
          </span>
          <span className="min-w-0 py-1">
            <span className="block text-base font-semibold text-white sm:text-lg">{title}</span>
            {description ? <span className="mt-1 block text-sm text-white/60">{description}</span> : null}
            <span className="mt-2 flex flex-wrap items-center gap-2">
              {badges}
              {hasIssue ? <FlowBadge label="Revisar" tone="warning" /> : null}
            </span>
          </span>
        </button>
        {actions ? (
          <div
            data-chatbot-flow-actions
            className="flex w-full max-w-full flex-wrap items-center gap-3 border-t border-white/10 pt-3 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0"
          >
            {actions}
          </div>
        ) : null}
      </div>
      <div
        id={id}
        hidden={!expanded}
        data-chatbot-flow-content
        className={expanded ? "grid gap-4 border-t border-re7-sky/20 bg-re7-navy/55 p-3 sm:p-4" : "hidden"}
      >
        {children}
      </div>
    </article>
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
          ? "border-emerald-700 bg-emerald-600 text-white"
          : "border-slate-600 bg-slate-500 text-white"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

type HandoffNotificationRecipient = NonNullable<
  AppAutomationSettings["handoffLeadNotificationRecipients"]
>[number];

function createHandoffNotificationRecipient(): HandoffNotificationRecipient {
  return {
    id: `recipient_${Date.now()}`,
    label: "",
    waId: "",
    isActive: true,
  };
}

export default function AppChatbotPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [flows, setFlows] = useState<AppChatbotFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingNotificationSettings, setSavingNotificationSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppAutomationSettings | null>(null);
  const [builderResources, setBuilderResources] = useState<{
    departments: ChatbotFlowBuilderDepartment[];
    queues: ChatbotFlowBuilderQueue[];
  }>({ departments: [], queues: [] });
  const [notificationSettingsDirty, setNotificationSettingsDirty] = useState(false);
  const [newName, setNewName] = useState("Fluxo principal");
  const [newDefinition, setNewDefinition] = useState(DEFAULT_DEFINITION_TEXT);
  const [newSearch, setNewSearch] = useState("");
  const [newIsActive, setNewIsActive] = useState(false);
  const [newEntryPoint, setNewEntryPoint] = useState(DEFAULT_NEW_CHATBOT_FLOW_ENTRY_POINT);
  const [newFlowBuilderVersion, setNewFlowBuilderVersion] = useState(0);
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
  const [newFlowExpanded, setNewFlowExpanded] = useState(getNewFlowDefaultExpanded());
  const [flowExpanded, setFlowExpanded] = useState<Record<string, boolean>>({});

  const updateHandoffNotificationRecipient = (
    index: number,
    patch: Partial<HandoffNotificationRecipient>
  ) => {
    setNotificationSettingsDirty(true);
    setSettings((current) => {
      if (!current) return current;
      const recipients = [...(current.handoffLeadNotificationRecipients ?? [])];
      recipients[index] = {
        ...recipients[index],
        ...patch,
      };
      return {
        ...current,
        handoffLeadNotificationRecipients: recipients,
      };
    });
  };

  const removeHandoffNotificationRecipient = (index: number) => {
    setNotificationSettingsDirty(true);
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        handoffLeadNotificationRecipients: (current.handoffLeadNotificationRecipients ?? []).filter(
          (_, itemIndex) => itemIndex !== index
        ),
      };
    });
  };

  const handleSaveHandoffNotificationSettings = async () => {
    if (!session || !settings) return;
    const recipients = (settings.handoffLeadNotificationRecipients ?? []).map((recipient) => ({
      ...recipient,
      waId: recipient.waId.replace(/\D/g, ""),
      label: recipient.label?.trim() || undefined,
    }));
    if (
      settings.handoffLeadNotificationEnabled &&
      recipients.filter((recipient) => recipient.isActive && /^\d{8,20}$/.test(recipient.waId)).length === 0
    ) {
      setError("Informe pelo menos um número ativo para receber notificações de novos contatos.");
      return;
    }
    setSavingNotificationSettings(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAppChatbotSettings(session, {
        handoffLeadNotificationEnabled: settings.handoffLeadNotificationEnabled === true,
        handoffLeadNotificationRecipients: recipients,
      });
      setSettings(response.settings);
      setNotificationSettingsDirty(false);
      setSuccess("Notificações internas de novo contato atualizadas.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeChatbotError(typed, "Não foi possível salvar notificações de novo contato."));
    } finally {
      setSavingNotificationSettings(false);
    }
  };

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
      const [flowResponse, settingsResponse, resourcesResponse] = await Promise.all([
        fetchAppChatbotFlows(activeSession),
        fetchAppChatbotSettings(activeSession),
        fetchAppChatbotResources(activeSession),
      ]);
      hydrateFlows(flowResponse.items);
      setSettings(settingsResponse.settings);
      setBuilderResources({
        departments: resourcesResponse.departments,
        queues: resourcesResponse.queues,
      });
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
        setError(getAppErrorUxMessage({ status: typed.status, errorCode: typed.errorCode, message: typed.message, fallback: "Não foi possível carregar os fluxos de automação." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, loadFlows, router, session]);

  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
      setError(null);
      setSuccess(null);
    }, 3500);

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

  useEffect(() => {
    setFlowExpanded((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const flow of sortedFlows) {
        if (Object.prototype.hasOwnProperty.call(current, flow.id)) {
          next[flow.id] = current[flow.id];
        } else {
          next[flow.id] = getExistingFlowDefaultExpanded();
          changed = true;
        }
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [sortedFlows]);

  const handleCreate = async () => {
    if (!session) return;
    if (!canManageChatbot(session.user.role)) {
      setError("Somente administrador pode alterar fluxos de automação.");
      return;
    }
    if (flowEditingLocked) {
      setError("Criação e edição de fluxos estão bloqueadas no console interno.");
      return;
    }
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Informe o nome do fluxo.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(newDefinition);
    } catch {
      setError("JSON inválido no novo fluxo.");
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
      setNewName("Fluxo principal");
      setNewDefinition(DEFAULT_DEFINITION_TEXT);
      setNewSearch("");
      setNewIsActive(false);
      setNewEntryPoint(DEFAULT_NEW_CHATBOT_FLOW_ENTRY_POINT);
      setNewFlowBuilderVersion((current) => current + 1);
      setSuccess("Flow criado com sucesso.");
    } catch (err) {
      const typed = err as AppApiError;
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(normalizeChatbotError(typed, "Não foi possível criar o fluxo."));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (flow: AppChatbotFlowItem) => {
    if (!session) return;
    if (flowEditingLocked) {
      setError("Criação e edição de fluxos estão bloqueadas no console interno.");
      return;
    }
    const draft = drafts[flow.id];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError("Informe o nome do fluxo.");
      return;
    }
    let parsedDefinition;
    try {
      parsedDefinition = parseDefinitionText(draft.definitionText);
    } catch {
      setError("JSON inválido no fluxo selecionado.");
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
      setError(normalizeChatbotError(typed, "Não foi possível atualizar o fluxo."));
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
  const notificationReadOnly = !canManageNotificationSettings(session.user.role);

  const automationDraft = settings ?? {
    disableAutoReply: false,
    disableChatbot: false,
    disableAiFallback: false,
    disableIntentClassifier: true,
    aiAssistantEnabled: false,
    aiAssistantMaxReplies: 2,
    aiAssistantProfile: "business" as const,
    aiAssistantFallbackToHandoff: false,
    aiAssistantAllowedTopics: [],
    aiAssistantSecondaryTopics: [],
    aiAssistantBlockedTerms: [],
    aiAssistantHandoffKeywords: [],
    aiAssistantFallbackMessage: "",
    aiAssistantHandoffPrompt: "",
    handoffLeadNotificationEnabled: false,
    handoffLeadNotificationRecipients: [],
    aiConfigured: false,
    chatbotLocked: false,
    flowEditingLocked: false,
    aiLocked: false,
    aiAssistantLocked: true,
    intentClassifierLocked: true,
  };
  const flowEditingLocked = Boolean(automationDraft.flowEditingLocked);
  const automationReadOnly = true;
  const flowReadOnly = readOnly || flowEditingLocked;
  const aiConfigStatus = automationDraft.aiAssistantConfigurationStatus ?? {
    ready: Boolean(automationDraft.aiConfigured),
    missing: [],
    warnings: [],
    score: automationDraft.aiConfigured ? 100 : 0,
  };
  const aiMissingLabels = getAppChatbotAiMissingLabels(aiConfigStatus.missing);

  return (
    <AppShell
      session={session}
      title="Chatbot"
      subtitle="Ajuste os fluxos de atendimento automatico sem sair do portal."
    >
      <FeedbackToast message={success} {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />

      <div className="chatbot-theme grid gap-4">
      <section className="chatbot-section rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Recursos e estado operacional</h2>
            <p className="mt-1 text-sm text-white/65">
              Acompanhe o que esta liberado para a organizacao e o estado atual da automacao.
            </p>
            <p className="mt-1 text-xs text-white/50">
              Configuração da IA {aiConfigStatus.ready ? "pronta" : "incompleta"} · {aiConfigStatus.score}%.
              {!aiConfigStatus.ready ? " Sem isso, a IA conversacional fica indisponivel." : ""}
            </p>
            {!aiConfigStatus.ready && aiMissingLabels.length ? (
              <div className="mt-2 rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <p className="font-semibold">Configurações pendentes no console interno:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {aiMissingLabels.map((label, index) => (
                    <li key={`${label}-${index}`}>{label}</li>
                  ))}
                </ul>
                <p className="mt-2 text-amber-100/80">
                  Essas configurações são gerenciadas no console interno.
                </p>
              </div>
            ) : null}
          </div>
          <span className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Controles seguros
          </span>
        </div>

        {settings ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {[
              {
                key: "disableChatbot" as const,
                title: "Executar chatbot configuravel",
                help: automationDraft.chatbotLocked
                  ? "Bloqueado pelo console interno. A organização não pode reativar esta camada no app."
                  : "Quando desativado, mensagens recebidas não iniciam nem continuam os fluxos configuráveis. Se o atendimento humano depender do fluxo, a conversa pode não ser direcionada automaticamente.",
              },
              {
                key: "disableAiFallback" as const,
                title: "Base de IA da organização",
                help: automationDraft.aiLocked
                  ? "Bloqueado pelo console interno. A organização não pode reativar esta camada no app."
                  : automationDraft.aiConfigured
                  ? "Ativa os recursos de IA configurados para esta organização."
                  : "Indisponível até existir configuração prévia de contexto para esta organização.",
              },
              {
                key: "disableIntentClassifier" as const,
                title: "Classificacao de intencao",
                help: automationDraft.intentClassifierLocked
                  ? "Bloqueado pelo console interno ou desativado no ambiente."
                  : "On tenta direcionar mensagens livres iniciais para o ponto correto do fluxo.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="chatbot-setting-card flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-re7-navy/40 p-3 text-sm sm:p-4"
              >
                <span className="space-y-1">
                  <span className="block font-medium text-white">{item.title}</span>
                  <span className="block text-white/60">{item.help}</span>
                </span>
                <TogglePill
                  checked={!automationDraft[item.key]}
                  disabled={
                    automationReadOnly ||
                    (item.key === "disableChatbot" && automationDraft.chatbotLocked) ||
                    (item.key === "disableAiFallback" &&
                      (automationDraft.aiLocked ||
                        (!automationDraft.aiConfigured && automationDraft.disableAiFallback))) ||
                    (item.key === "disableIntentClassifier" && automationDraft.intentClassifierLocked)
                  }
                  onToggle={() => undefined}
                />
              </div>
            ))}
            <div className="chatbot-setting-card flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-re7-navy/40 p-3 text-sm sm:p-4">
              <span className="space-y-1">
                <span className="block font-medium text-white">IA controlada</span>
                <span className="block text-white/60">
                  Recurso operacional liberado apenas pelo console interno. Responde perguntas simples quando o fluxo e o atendimento humano não estiverem ativos.
                </span>
              </span>
              <TogglePill
                checked={automationDraft.aiAssistantEnabled === true}
                disabled={automationReadOnly || automationDraft.aiAssistantLocked}
                onToggle={() => undefined}
              />
              <label className="flex w-full max-w-xs flex-col gap-1 text-xs text-white/60">
                  Máximo por conversa
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={automationDraft.aiAssistantMaxReplies ?? 2}
                  disabled={automationReadOnly || automationDraft.aiAssistantLocked}
                  onChange={() => undefined}
                  className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                />
              </label>
            </div>
            <div className="chatbot-setting-card md:col-span-2 rounded-xl border border-white/10 bg-re7-navy/40 p-3 text-sm sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                <span className="block font-medium text-white">Notificação interna de novo contato</span>
                  <span className="mt-1 block text-white/60">
                    Envia um aviso privado para a equipe quando o bot encaminhar um lead ao atendimento humano.
                    A mensagem não aparece para o cliente nem entra no histórico.
                  </span>
                </div>
                <TogglePill
                  checked={automationDraft.handoffLeadNotificationEnabled === true}
                  disabled={notificationReadOnly || savingNotificationSettings}
                  onToggle={() =>
                    (setNotificationSettingsDirty(true),
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            handoffLeadNotificationEnabled: !current.handoffLeadNotificationEnabled,
                          }
                        : current
                    ))
                  }
                />
              </div>
              {notificationSettingsDirty ? (
                <p className="mt-3 rounded-md border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Alterações pendentes. Clique em Salvar notificações para aplicar.
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                {(automationDraft.handoffLeadNotificationRecipients ?? []).map((recipient, index) => (
                  <div key={recipient.id || index} className="chatbot-field-group grid gap-2 rounded-lg border border-white/10 bg-black/10 p-2 md:grid-cols-[1fr_1fr_auto_auto]">
                    <input
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                      value={recipient.label ?? ""}
                      disabled={notificationReadOnly || savingNotificationSettings}
                      onChange={(event) => updateHandoffNotificationRecipient(index, { label: event.target.value })}
                      placeholder="Nome interno"
                    />
                    <input
                      className="rounded-md border border-white/15 bg-re7-navy/80 px-3 py-2 text-sm text-white outline-none focus:border-re7-sky disabled:opacity-50"
                      value={recipient.waId}
                      disabled={notificationReadOnly || savingNotificationSettings}
                      onChange={(event) =>
                        updateHandoffNotificationRecipient(index, {
                          waId: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="558499999999"
                    />
                    <TogglePill
                      checked={recipient.isActive !== false}
                      disabled={notificationReadOnly || savingNotificationSettings}
                      onToggle={() =>
                        updateHandoffNotificationRecipient(index, {
                          isActive: recipient.isActive === false,
                        })
                      }
                    />
                    <button
                      type="button"
                      disabled={notificationReadOnly || savingNotificationSettings}
                      onClick={() => removeHandoffNotificationRecipient(index)}
                      className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={notificationReadOnly || savingNotificationSettings}
                    onClick={() =>
                      (setNotificationSettingsDirty(true),
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              handoffLeadNotificationEnabled: true,
                              handoffLeadNotificationRecipients: [
                                ...(current.handoffLeadNotificationRecipients ?? []),
                                createHandoffNotificationRecipient(),
                              ],
                            }
                          : current
                      ))
                    }
                    className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    Adicionar número
                  </button>
                  <button
                    type="button"
                    disabled={notificationReadOnly || savingNotificationSettings}
                    onClick={handleSaveHandoffNotificationSettings}
                    className="rounded-md bg-re7-orange px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 disabled:opacity-50"
                  >
                    {savingNotificationSettings ? "Salvando..." : "Salvar notificações"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
            <p className="text-sm text-white/70">Carregando configurações...</p>
        )}
      </section>

      <section className="chatbot-section rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-4 space-y-2">
          <span className="w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
            Conteudo do fluxo
          </span>
          <p className="text-sm text-white/65">
            Crie ou edite mensagens, menus, encaminhamentos e destinos. Apenas um fluxo deve ser marcado como entrada principal.
          </p>
          {flowEditingLocked || flowReadOnly ? (
            <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Criação e edição de fluxos bloqueadas no app. Use o console interno para alterar.
            </p>
          ) : null}
        </div>
        <FlowAccordionCard
          id="new-chatbot-flow-panel"
          title="Criar novo fluxo"
          description="Rascunho local para cadastrar uma nova automação."
          expanded={newFlowExpanded}
          onToggle={() => setNewFlowExpanded((current) => !current)}
          hasIssue={Boolean(newJsonError)}
          badges={
            <>
              <FlowBadge label={`${getFlowNodeCountFromDefinitionText(newDefinition) ?? "-"} nó(s)`} />
              {newJsonError ? <FlowBadge label="JSON inválido" tone="warning" /> : <FlowBadge label="JSON válido" tone="success" />}
            </>
          }
        >
          <div className="grid gap-3">
            <input
              className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:cursor-not-allowed disabled:opacity-60"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Fluxo principal"
              disabled={flowReadOnly || creating}
            />
            {loading ? (
              <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/65">
                Carregando setores e filas...
              </p>
            ) : (
              <ChatbotFlowBuilder
                key={`new-flow-builder-${newFlowBuilderVersion}`}
                definitionText={newDefinition}
                onDefinitionTextChange={setNewDefinition}
                disabled={flowReadOnly || creating}
                isActive={newIsActive}
                entryPoint={newEntryPoint}
                allowObjectiveReset
                departments={builderResources.departments}
                queues={builderResources.queues}
                resourcesLoading={loading}
                advancedEditor={
                <>
                  <JsonEditorWithSearch
                    id="new-flow-definition"
                    value={newDefinition}
                    onChange={setNewDefinition}
                    search={newSearch}
                    disabled={flowReadOnly || creating}
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
                      Próximo
                    </button>
                    <span className="text-xs text-white/50">{countOccurrences(newDefinition, newSearch)} ocorrência(s)</span>
                  </div>
                  <JsonSearchPreview text={newDefinition} query={newSearch} />
                </>
                }
              />
            )}
            {newJsonError ? (
              <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                JSON inválido: {newJsonError}
              </p>
            ) : null}
            <div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={flowReadOnly || creating}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Criando..." : "Criar fluxo"}
              </button>
            </div>
          </div>
        </FlowAccordionCard>
      </section>

      <section className="chatbot-section rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Fluxos cadastrados</h2>
            <p className="mt-1 text-sm text-white/65">
              {flowEditingLocked
                ? "Edicao bloqueada pelo console interno. Visualizacao liberada."
                : readOnly
                ? "Visualizacao somente para leitura."
                : "Edite nome, ativacao, entrada principal e nos do fluxo sem sair do portal. A mensagem de encaminhamento humano fica no nó Atendimento humano."}
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
              const flowPanelId = `chatbot-flow-panel-${flow.id}`;
              const isExpanded = flowExpanded[flow.id] ?? getExistingFlowDefaultExpanded();
              const flowNodeCount = getFlowNodeCountFromDefinitionText(draft.definitionText);
              const flowHasIssue = Boolean(draftJsonErrors[flow.id]);
              return (
                <FlowAccordionCard
                  key={flow.id}
                  id={flowPanelId}
                  title={draft.name || flow.name}
                  description={`Atualizado em ${formatDateTime(flow.updatedAt)}`}
                  expanded={isExpanded}
                  onToggle={() =>
                    setFlowExpanded((current) => ({
                      ...current,
                      [flow.id]: !isExpanded,
                    }))
                  }
                  hasIssue={flowHasIssue}
                  badges={
                    <>
                      <FlowBadge label={draft.isActive ? "Ativo" : "Inativo"} tone={draft.isActive ? "success" : "warning"} />
                      {draft.entryPoint ? <FlowBadge label="Entrada principal" /> : null}
                      <FlowBadge label={`${flowNodeCount ?? "-"} nó(s)`} />
                      {flowHasIssue ? <FlowBadge label="JSON inválido" tone="warning" /> : <FlowBadge label="JSON válido" tone="success" />}
                    </>
                  }
                  actions={
                    <>
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
                          disabled={flowReadOnly}
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
                          disabled={flowReadOnly}
                        />
                        Entrada principal
                      </label>
                      {!flowReadOnly ? (
                        <button
                          type="button"
                          onClick={() => void handleSave(flow)}
                          disabled={savingId === flow.id}
                          className="rounded-md border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingId === flow.id ? "Salvando..." : "Salvar"}
                        </button>
                      ) : null}
                    </>
                  }
                >
                  <div className="mt-4 grid gap-3">
                    {flowHasIssue ? (
                      <p className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        JSON inválido: {draftJsonErrors[flow.id]}
                      </p>
                    ) : null}
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
                      disabled={flowReadOnly}
                    />
                    {loading ? (
                      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/65">
                        Carregando setores e filas...
                      </p>
                    ) : (
                      <ChatbotFlowBuilder
                        definitionText={draft.definitionText}
                        onDefinitionTextChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [flow.id]: {
                              ...draft,
                              definitionText: value,
                            },
                          }))
                        }
                        disabled={flowReadOnly}
                        isActive={draft.isActive}
                        entryPoint={draft.entryPoint}
                        allowObjectiveReset={false}
                        departments={builderResources.departments}
                        queues={builderResources.queues}
                        resourcesLoading={loading}
                        advancedEditor={
                        <>
                          <JsonEditorWithSearch
                            id={`flow-definition-${flow.id}`}
                            value={draft.definitionText}
                            onChange={(value) =>
                              setDrafts((current) => ({
                                ...current,
                                [flow.id]: {
                                  ...draft,
                                  definitionText: value,
                                },
                              }))
                            }
                            search={draftSearches[flow.id] ?? ""}
                            disabled={flowReadOnly}
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
                              {countOccurrences(draft.definitionText, draftSearches[flow.id] ?? "")} ocorrência(s)
                            </span>
                          </div>
                          <JsonSearchPreview text={draft.definitionText} query={draftSearches[flow.id] ?? ""} />
                        </>
                        }
                      />
                    )}
                  </div>
                </FlowAccordionCard>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </AppShell>
  );
}
