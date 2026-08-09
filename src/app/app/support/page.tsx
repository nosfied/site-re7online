"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppSupportConversation,
  AppSupportMessage,
  clearAppSession,
  fetchAppSupportConversation,
  fetchAppSupportConversations,
  loadAppSession,
  openAppSupportConversation,
  saveAppSession,
  sendAppSupportConversationMessage,
} from "@/lib/appClientApi";

function canUseSupport(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERVISOR";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getSupportErrorMessage(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "Apenas administradores e supervisores podem abrir suporte.";
  if (error.errorCode === "support_unavailable") return "O suporte pela plataforma ainda nao esta disponivel.";
  if (error.errorCode === "support_message_required") return "Descreva como podemos ajudar.";
  if (error.errorCode === "support_message_too_long") return "Mensagem muito longa.";
  if (error.errorCode === "support_conversation_closed") return "Este chamado foi encerrado. Abra um novo chamado.";
  return error.message || fallback;
}

function SupportStatusBadge({ conversation }: { conversation: AppSupportConversation }) {
  const isClosed = conversation.status === "closed";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        isClosed
          ? "border-slate-300/30 bg-slate-500/15 text-slate-100"
          : "border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
      }`}
    >
      {isClosed ? "Encerrado" : "Em andamento"}
    </span>
  );
}
function MessageBubble({ item }: { item: AppSupportMessage }) {
  const inbound = item.direction === "INBOUND";
  return (
    <div className={`flex ${inbound ? "justify-end" : "justify-start"}`}>
      <article
        className={`max-w-[78%] rounded-lg border px-3 py-2 text-sm shadow-sm ${
          inbound
            ? "border-re7-orange/35 bg-re7-orange/20 text-white"
            : "border-white/10 bg-white/10 text-white"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-white/60">
          <span>{inbound ? "Voce" : item.actorName || "Suporte"}</span>
          <time>{formatDateTime(item.createdAt)}</time>
        </div>
        <p className="whitespace-pre-wrap leading-6">{item.bodyText || "-"}</p>
      </article>
    </div>
  );
}

export default function SupportPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [conversations, setConversations] = useState<AppSupportConversation[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [messages, setMessages] = useState<AppSupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "warning" } | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.supportRef === selectedRef) ?? null,
    [conversations, selectedRef]
  );

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadConversations = useCallback(async (activeSession: AppSession) => {
    const response = await fetchAppSupportConversations(activeSession);
    setConversations(response.conversations);
    setSelectedRef((current) => current ?? response.conversations[0]?.supportRef ?? null);
  }, []);

  const loadConversation = useCallback(async (activeSession: AppSession, supportRef: string) => {
    const response = await fetchAppSupportConversation(activeSession, supportRef);
    setMessages(response.messages);
    setConversations((current) => {
      const next = current.filter((item) => item.supportRef !== response.conversation.supportRef);
      return [response.conversation, ...next].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      );
    });
  }, []);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored?.token) {
      router.replace("/app/login");
      return;
    }
    if (!canUseSupport(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    loadConversations(stored)
      .catch((error: AppApiError) => {
        if (error.status === 401) {
          handleUnauthorized();
          return;
        }
        setToast({ variant: "error", message: getSupportErrorMessage(error, "Nao foi possivel carregar o suporte.") });
      })
      .finally(() => setLoading(false));
  }, [handleUnauthorized, loadConversations, router]);

  useEffect(() => {
    if (!session || !selectedRef) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    loadConversation(session, selectedRef).catch((error: AppApiError) => {
      if (cancelled) return;
      if (error.status === 401) handleUnauthorized();
      else setToast({ variant: "error", message: getSupportErrorMessage(error, "Nao foi possivel carregar o chamado.") });
    });
    const timer = window.setInterval(() => {
      loadConversation(session, selectedRef).catch(() => null);
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [handleUnauthorized, loadConversation, selectedRef, session]);

  const handleOpenConversation = async () => {
    if (!session || sending) return;
    setSending(true);
    try {
      const response = await openAppSupportConversation(session, newMessage);
      setNewMessage("");
      setSelectedRef(response.conversation.supportRef);
      setConversations((current) => {
        const next = current.filter((item) => item.supportRef !== response.conversation.supportRef);
        return [response.conversation, ...next];
      });
      const detail = await fetchAppSupportConversation(session, response.conversation.supportRef);
      setMessages(detail.messages);
      setToast({ message: response.resumed ? "Chamado ativo retomado." : "Chamado aberto com sucesso." });
    } catch (error) {
      const typed = error as AppApiError;
      if (typed.status === 401) handleUnauthorized();
      else setToast({ variant: "error", message: getSupportErrorMessage(typed, "Nao foi possivel abrir o chamado.") });
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async () => {
    if (!session || !selectedRef || sending) return;
    setSending(true);
    try {
      const response = await sendAppSupportConversationMessage(session, selectedRef, replyDraft);
      setReplyDraft("");
      setMessages(response.messages);
      setConversations((current) => {
        const next = current.filter((item) => item.supportRef !== response.conversation.supportRef);
        return [response.conversation, ...next];
      });
    } catch (error) {
      const typed = error as AppApiError;
      if (typed.status === 401) handleUnauthorized();
      else setToast({ variant: "error", message: getSupportErrorMessage(typed, "Nao foi possivel enviar a mensagem.") });
    } finally {
      setSending(false);
    }
  };

  if (!session) {
    return (
      <main className="theme-bg flex min-h-screen items-center justify-center p-6 text-white">
        Carregando...
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      title="Suporte"
      subtitle="Abra e acompanhe conversas com a equipe da plataforma."
    >
      <FeedbackToast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />

      <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
        <section className="theme-surface-strong rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Chamados</h2>
              <p className="theme-muted mt-1 text-sm">Voce ve apenas os chamados abertos por este usuario.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadConversations(session)}
              className="theme-nav-link rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              Atualizar
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold">
              Novo chamado
              <textarea
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Descreva como podemos ajudar."
                className="theme-input min-h-28 resize-y rounded-lg border px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleOpenConversation}
              disabled={sending || !newMessage.trim()}
              className="rounded-lg bg-re7-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Abrir chamado"}
            </button>
          </div>

          <div className="mt-5 grid gap-2">
            {loading ? <p className="theme-muted text-sm">Carregando chamados...</p> : null}
            {!loading && conversations.length === 0 ? (
              <p className="theme-muted rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm">
                Nenhum chamado aberto por voce.
              </p>
            ) : null}
            {conversations.map((item) => (
              <button
                key={item.supportRef}
                type="button"
                onClick={() => setSelectedRef(item.supportRef)}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  selectedRef === item.supportRef
                    ? "border-re7-sky/70 bg-re7-sky/15"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Protocolo: {item.protocol}</span>
                  <SupportStatusBadge conversation={item} />
                </div>
                <p className="theme-muted mt-1 text-xs">Atualizado em {formatDateTime(item.updatedAt)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="theme-surface-strong grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] rounded-lg border">
          <header className="border-b border-white/10 px-4 py-3">
            {selectedConversation ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="theme-soft text-xs font-semibold uppercase tracking-[0.16em]">Atendimento</p>
                  <h2 className="mt-1 text-lg font-bold">Protocolo: {selectedConversation.protocol}</h2>
                </div>
                <SupportStatusBadge conversation={selectedConversation} />
              </div>
            ) : (
              <div>
                <p className="theme-soft text-xs font-semibold uppercase tracking-[0.16em]">Atendimento</p>
                <h2 className="mt-1 text-lg font-bold">Nenhum chamado selecionado</h2>
              </div>
            )}
          </header>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center text-center">
                <p className="theme-muted max-w-sm text-sm">
                  Abra um chamado ou selecione uma conversa existente para acompanhar as respostas.
                </p>
              </div>
            ) : messages.length === 0 ? (
              <p className="theme-muted text-sm">Nenhuma mensagem registrada ainda.</p>
            ) : (
              <div className="grid gap-3">
                {messages.map((item) => <MessageBubble key={item.id} item={item} />)}
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 p-4">
            <label className="grid gap-2 text-sm font-semibold">
              Mensagem
              <textarea
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                disabled={!selectedConversation || selectedConversation.status === "closed"}
                rows={3}
                maxLength={4000}
                placeholder={
                  selectedConversation?.status === "closed"
                    ? "Este chamado foi encerrado."
                    : "Escreva uma resposta para o suporte."
                }
                className="theme-input min-h-24 resize-y rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="theme-muted text-xs">Anexos serao disponibilizados em uma proxima etapa.</p>
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!selectedConversation || selectedConversation.status === "closed" || sending || !replyDraft.trim()}
                className="rounded-lg bg-re7-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </AppShell>
  );
}
