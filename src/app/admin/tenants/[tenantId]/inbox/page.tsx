"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AdminConfigPanel from "@/components/admin/AdminConfigPanel";
import {
  AdminConnection,
  fetchConversation,
  fetchConversations,
  fetchTenantsSummary,
  formatDateTime,
  InboxConversationItem,
  InboxMessageItem,
  loadAdminConnection,
  saveAdminConnection,
  testAdminConnection,
} from "@/lib/whatsappAdminApi";

export default function TenantInboxPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = decodeURIComponent(params.tenantId);

  const [connection, setConnection] = useState<AdminConnection>({
    baseUrl: "",
    adminToken: "",
    rememberToken: false,
  });
  const [clientKey, setClientKey] = useState(tenantId);
  const [conversations, setConversations] = useState<InboxConversationItem[]>([]);
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessageItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnection(loadAdminConnection());
  }, []);

  useEffect(() => {
    if (!connection.baseUrl && !connection.adminToken) return;
    saveAdminConnection(connection);
  }, [connection]);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoadingConversations(true);
    setError(null);

    (async () => {
      try {
        const summary = await fetchTenantsSummary(connection, "24h");
        const resolvedClientKey = summary.find((item) => item.tenantId === tenantId)?.clientKey ?? tenantId;
        if (cancelled) return;
        setClientKey(resolvedClientKey);
        const result = await fetchConversations(connection, resolvedClientKey, { limit: 100 });
        if (cancelled) return;
        setConversations(result.items);
        if (result.items.length > 0) {
          setSelectedWaId((prev) => prev ?? result.items[0].waId);
        } else {
          setSelectedWaId(null);
          setMessages([]);
        }
      } catch (err) {
        if (cancelled) return;
        const typed = err as { status?: number; message?: string };
        if (typed.status === 403) {
          setError("Sem permissao para acessar inbox.");
          return;
        }
        if (typed.status === 404) {
          setError("Tenant nao encontrado para inbox.");
          return;
        }
        setError(typed.message || "Falha ao carregar conversas da inbox.");
      } finally {
        if (!cancelled) {
          setLoadingConversations(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, tenantId]);

  useEffect(() => {
    if (!selectedWaId) return;
    if (!connection.baseUrl || !connection.adminToken) return;

    let cancelled = false;
    setLoadingMessages(true);
    setError(null);

    fetchConversation(connection, clientKey, selectedWaId, { order: "asc", limit: 300 })
      .then((response) => {
        if (cancelled) return;
        setMessages(response.items);
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (err.status === 403) {
          setError("Sem permissao para acessar mensagens.");
          return;
        }
        setError(err.message || "Falha ao carregar timeline da conversa.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, connection, selectedWaId]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.waId === selectedWaId) ?? null,
    [conversations, selectedWaId]
  );

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setError(null);
    try {
      await testAdminConnection(connection);
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao testar conexao.");
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Inbox CRM</h1>
            <p className="text-sm text-white/70">
              tenantId: <span className="font-mono">{tenantId}</span> | clientKey:{" "}
              <span className="font-mono">{clientKey}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Config tenant
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        <AdminConfigPanel
          connection={connection}
          onChange={setConnection}
          onTestConnection={handleTestConnection}
          testingConnection={testingConnection}
        />

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-[340px_1fr]">
          <aside className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">Conversas</h2>
            </div>
            <div className="max-h-[68vh] overflow-y-auto">
              {loadingConversations ? (
                <p className="px-4 py-3 text-sm text-white/70">Carregando conversas...</p>
              ) : null}
              {!loadingConversations && conversations.length === 0 ? (
                <p className="px-4 py-3 text-sm text-white/70">Nenhuma conversa para este tenant.</p>
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
                    <p className="text-sm font-medium">{item.leadName || item.waId}</p>
                    <p className="mt-1 text-xs text-white/70">
                      status: {item.leadStatus || "-"} • {formatDateTime(item.updatedAt)}
                    </p>
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
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-4">
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
          </div>
        </section>
      </div>
    </main>
  );
}
