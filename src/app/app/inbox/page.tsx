"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app/AppShell";
import {
  AppSession,
  clearAppSession,
  fetchAppConversation,
  fetchAppConversations,
  loadAppSession,
  saveAppSession,
  sendAppConversationMessage,
} from "@/lib/appClientApi";
import { formatDateTime, InboxConversationItem, InboxMessageItem } from "@/lib/whatsappAdminApi";

function getConversationLabel(item: InboxConversationItem) {
  return item.leadName || item.leadPhone || item.waId;
}

export default function AppInboxPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<InboxConversationItem[]>([]);
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    setSession(stored);
    saveAppSession(stored);
  }, [router]);

  const refreshConversationList = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppConversations(activeSession, { limit: 100 });
    setConversations(response.items);
    if (response.items.length === 0) {
      setSelectedWaId(null);
      setMessages([]);
      return;
    }
    setSelectedWaId((prev) => (prev && response.items.some((item) => item.waId === prev) ? prev : response.items[0].waId));
  }, []);

  const refreshSelectedTimeline = useCallback(async (activeSession: AppSession, waId: string) => {
    const response = await fetchAppConversation(activeSession, waId, { order: "asc", limit: 300 });
    setMessages(response.items);
    setConversations((prev) =>
      prev.map((item) =>
        item.waId === waId
          ? {
              ...item,
              mode: response.mode,
              assignedUserId: response.assignedUserId,
              assignedTo: response.assignedTo,
              assignedUserName: response.assignedUserName,
              assignedAt: response.assignedAt,
            }
          : item
      )
    );
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingConversations(true);
    setError(null);

    refreshConversationList(session)
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Falha ao carregar conversas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, refreshConversationList, session]);

  useEffect(() => {
    if (!session || !selectedWaId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setError(null);

    fetchAppConversation(session, selectedWaId, { order: "asc", limit: 300 })
      .then((response) => {
        if (cancelled) return;
        setMessages(response.items);
        setConversations((prev) =>
          prev.map((item) =>
            item.waId === selectedWaId
              ? {
                  ...item,
                  mode: response.mode,
                  assignedUserId: response.assignedUserId,
                  assignedTo: response.assignedTo,
                  assignedUserName: response.assignedUserName,
                  assignedAt: response.assignedAt,
                }
              : item
          )
        );
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(err.message || "Falha ao carregar timeline.");
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized, selectedWaId, session]);

  useEffect(() => {
    if (!session) return;
    let polling = false;
    const interval = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await refreshConversationList(session);
        if (selectedWaId) {
          await refreshSelectedTimeline(session, selectedWaId);
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          handleUnauthorized();
        }
      } finally {
        polling = false;
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [handleUnauthorized, refreshConversationList, refreshSelectedTimeline, selectedWaId, session]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.waId === selectedWaId) ?? null,
    [conversations, selectedWaId]
  );

  const handleSendMessage = async () => {
    if (!session || !selectedWaId) return;
    const text = messageDraft.trim();
    if (!text) return;
    setSendingMessage(true);
    setError(null);
    try {
      const response = await sendAppConversationMessage(session, selectedWaId, text);
      setMessageDraft("");
      await refreshSelectedTimeline(session, selectedWaId);
      setConversations((prev) =>
        prev.map((item) =>
          item.waId === selectedWaId
            ? {
                ...item,
                lastMessage: {
                  direction: "OUTBOUND",
                  type: "TEXT",
                  status: response.message.status,
                  bodyText: text,
                  templateName: null,
                  createdAt: response.message.createdAt,
                },
                updatedAt: response.message.createdAt,
              }
            : item
        )
      );
    } catch (err) {
      const typed = err as { status?: number; message?: string };
      if (typed.status === 401) {
        handleUnauthorized();
        return;
      }
      if (typed.status === 409) {
        setError("Janela de conversa fechada para envio manual.");
        return;
      }
      setError(typed.message || "Falha ao enviar mensagem.");
    } finally {
      setSendingMessage(false);
    }
  };

  if (!session) {
    return <main className="min-h-screen bg-re7-navy" />;
  }

  return (
    <AppShell session={session} title="Inbox" subtitle="Conversas do seu cliente, sem selecao manual de tenant.">
      {error ? (
        <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[300px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Conversas</h2>
            <button
              type="button"
              onClick={() => session && refreshConversationList(session)}
              className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              Atualizar
            </button>
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {loadingConversations ? (
              <p className="px-4 py-3 text-sm text-white/70">Carregando conversas...</p>
            ) : null}
            {!loadingConversations && conversations.length === 0 ? (
              <p className="px-4 py-3 text-sm text-white/70">Nenhuma conversa encontrada.</p>
            ) : null}
            {conversations.map((item) => {
              const isActive = item.waId === selectedWaId;
              return (
                <button
                  key={item.waId}
                  type="button"
                  onClick={() => setSelectedWaId(item.waId)}
                  className={`w-full border-b border-white/10 px-4 py-3 text-left transition ${
                    isActive ? "bg-re7-sky/20" : "hover:bg-white/10"
                  }`}
                >
                  <p className="text-sm font-medium">{getConversationLabel(item)}</p>
                  <p className="mt-1 text-xs text-white/70">
                    {item.mode} • {item.leadStatus || "sem status"} • {formatDateTime(item.updatedAt)}
                  </p>
                  {item.lastMessage?.bodyText ? (
                    <p className="mt-2 line-clamp-2 text-xs text-white/60">{item.lastMessage.bodyText}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">
              Timeline {selectedConversation ? `• ${selectedConversation.waId}` : ""}
            </h2>
            {selectedConversation ? (
              <p className="mt-1 text-xs text-white/70">
                modo: {selectedConversation.mode}
                {selectedConversation.assignedTo ? ` • atendente: ${selectedConversation.assignedTo}` : ""}
              </p>
            ) : null}
          </div>
          <div className="max-h-[72vh] overflow-y-auto p-4">
            {!selectedWaId ? (
              <p className="text-sm text-white/70">Selecione uma conversa para ver a timeline.</p>
            ) : null}
            {selectedWaId && loadingMessages ? (
              <p className="text-sm text-white/70">Carregando mensagens...</p>
            ) : null}
            {selectedWaId && !loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-white/70">Sem mensagens para esta conversa.</p>
            ) : null}
            <div className="space-y-3">
              {messages.map((item, index) => (
                <article
                  key={`${item.createdAt}-${item.direction}-${item.messageId ?? "noid"}-${index}`}
                  className={`rounded-md border p-3 ${
                    item.direction === "INBOUND"
                      ? "border-re7-sky/40 bg-re7-sky/10"
                      : "border-white/20 bg-white/10"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="font-semibold text-white">{item.direction}</span>
                    <span>{item.type}</span>
                    <span>{item.status}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                  </div>
                  {item.bodyText ? <p className="text-sm text-white">{item.bodyText}</p> : null}
                  {item.templateName ? (
                    <p className="mt-1 text-xs text-white/70">template: {item.templateName}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 p-4">
            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Responder conversa</span>
              <textarea
                className="min-h-24 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder="Digite a mensagem para enviar manualmente..."
                disabled={!selectedWaId || sendingMessage}
              />
            </label>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={!selectedWaId || !messageDraft.trim() || sendingMessage}
                onClick={handleSendMessage}
                className="rounded-md bg-re7-orange px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingMessage ? "Enviando..." : "Enviar mensagem"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
