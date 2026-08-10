"use client";

import { type ClipboardEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppSupportConversation,
  AppSupportMessage,
  clearAppSession,
  fetchAppSupportAttachment,
  fetchAppSupportConversation,
  fetchAppSupportConversations,
  loadAppSession,
  openAppSupportConversation,
  saveAppSession,
  sendAppSupportConversationAttachment,
  sendAppSupportConversationMessage,
} from "@/lib/appClientApi";

const SUPPORT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const SUPPORT_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  if (error.errorCode === "support_attachment_storage_unconfigured") return "Envio de imagem ainda nao esta configurado.";
  if (error.errorCode === "support_attachment_invalid") return "Use uma imagem PNG, JPEG ou WebP.";
  if (error.errorCode === "support_attachment_too_large") return "Imagem grande demais. Use uma imagem de ate 8 MB.";
  return error.message || fallback;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateSupportImageFile(file: File) {
  if (!SUPPORT_IMAGE_MIME_TYPES.has(file.type)) return "Use uma imagem PNG, JPEG ou WebP.";
  if (file.size > SUPPORT_IMAGE_MAX_BYTES) return "Imagem grande demais. Use uma imagem de ate 8 MB.";
  return null;
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
function MessageBubble({
  item,
  session,
  supportRef,
}: {
  item: AppSupportMessage;
  session: AppSession | null;
  supportRef: string | null;
}) {
  const inbound = item.direction === "INBOUND";
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageUrl(null);
    setImageError(false);
    if (!session || !supportRef || item.media?.kind !== "image" || !item.media.ref) return;
    let cancelled = false;
    void fetchAppSupportAttachment(session, supportRef, item.media.ref)
      .then((response) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(response.blob);
        imageUrlRef.current = objectUrl;
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, [item.media?.kind, item.media?.ref, session, supportRef]);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, []);

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
        {item.media?.kind === "image" ? (
          <div className="grid gap-2">
            {imageUrl && !imageError ? (
              <a href={imageUrl} target="_blank" rel="noreferrer" title="Abrir imagem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={item.media.caption || "Imagem anexada ao chamado"}
                  className="max-h-72 rounded-lg border border-white/15 object-contain"
                />
              </a>
            ) : imageError ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Imagem indisponivel.
              </div>
            ) : (
              <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/70">
                Carregando imagem...
              </div>
            )}
            <div className="text-[11px] text-white/60">
              Imagem{item.media.fileName ? `: ${item.media.fileName}` : ""} · {formatFileSize(item.media.sizeBytes)}
            </div>
          </div>
        ) : null}
        {item.bodyText ? <p className="mt-2 whitespace-pre-wrap leading-6">{item.bodyText}</p> : item.media ? null : <p>-</p>}
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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "warning" } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
  }, [messages.length, selectedRef]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImageUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedImage);
    setSelectedImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImage]);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const selectImageFile = useCallback((file: File | null) => {
    if (!file) return;
    const error = validateSupportImageFile(file);
    if (error) {
      setToast({ variant: "error", message: error });
      clearSelectedImage();
      return;
    }
    setSelectedImage(file);
  }, [clearSelectedImage]);

  const handleOpenConversation = async () => {
    if (!session || sending || !newMessage.trim()) return;
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
    if (!session || !selectedRef || sending || (!replyDraft.trim() && !selectedImage)) return;
    setSending(true);
    try {
      const response = selectedImage
        ? await sendAppSupportConversationAttachment(session, selectedRef, selectedImage, replyDraft)
        : await sendAppSupportConversationMessage(session, selectedRef, replyDraft);
      setReplyDraft("");
      clearSelectedImage();
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

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!selectedConversation || selectedConversation.status === "closed" || sending || (!replyDraft.trim() && !selectedImage)) return;
    void handleSendReply();
  };

  const handleReplyPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => SUPPORT_IMAGE_MIME_TYPES.has(file.type));
    if (!image) return;
    event.preventDefault();
    selectImageFile(image);
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

      <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-14rem)] lg:grid-cols-[330px_minmax(0,1fr)]">
        <section className="theme-surface-strong min-h-0 overflow-y-auto rounded-lg border p-4">
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

        <section className="theme-surface-strong grid min-h-[520px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border lg:min-h-0">
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

          <div ref={timelineRef} className="min-h-0 overflow-y-auto px-4 py-4">
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
                {messages.map((item) => (
                  <MessageBubble key={item.id} item={item} session={session} supportRef={selectedRef} />
                ))}
              </div>
            )}
          </div>

          <footer className="border-t border-white/10 p-4">
            {selectedImage ? (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-re7-sky/30 bg-re7-sky/10 p-3">
                {selectedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedImageUrl}
                    alt="Previa do anexo"
                    className="h-20 w-24 rounded-md border border-white/15 object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold">{selectedImage.name || "Imagem selecionada"}</p>
                  <p className="theme-muted mt-1 text-xs">{formatFileSize(selectedImage.size)} · PNG, JPEG ou WebP</p>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedImage}
                  className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Remover
                </button>
              </div>
            ) : null}
            <label className="grid gap-2 text-sm font-semibold">
              Mensagem
              <textarea
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                onKeyDown={handleReplyKeyDown}
                onPaste={handleReplyPaste}
                disabled={!selectedConversation || selectedConversation.status === "closed"}
                rows={3}
                maxLength={4000}
                aria-label="Mensagem para o suporte"
                title="Enter envia. Shift+Enter quebra linha."
                placeholder={
                  selectedConversation?.status === "closed"
                    ? "Este chamado foi encerrado."
                    : "Escreva uma resposta para o suporte ou cole um print."
                }
                className="theme-input min-h-24 resize-y rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => selectImageFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedConversation || selectedConversation.status === "closed" || sending}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Anexar imagem
                </button>
                <p className="theme-muted text-xs">1 imagem por envio · PNG, JPEG ou WebP ate 8 MB.</p>
              </div>
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!selectedConversation || selectedConversation.status === "closed" || sending || (!replyDraft.trim() && !selectedImage)}
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
