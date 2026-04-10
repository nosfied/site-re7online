"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  fetchTemplatesObservability,
  formatDateTime,
  TemplateObservabilityItem,
} from "@/lib/whatsappAdminApi";

function getStatusClasses(status: string) {
  switch (status) {
    case "read":
      return "bg-emerald-500/20 text-emerald-200";
    case "delivered":
      return "bg-sky-500/20 text-sky-200";
    case "sent":
    case "SENT":
      return "bg-amber-500/20 text-amber-200";
    case "failed":
    case "FAILED":
      return "bg-red-500/20 text-red-200";
    default:
      return "bg-white/10 text-white/80";
  }
}

function boolLabel(value: boolean | null) {
  if (value === null) return "-";
  return value ? "sim" : "nao";
}

function renderTable(items: TemplateObservabilityItem[], emptyText: string) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-white/70">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1300px] text-sm">
        <thead className="bg-white/10 text-left">
          <tr>
            <th className="px-3 py-2">Criada em</th>
            <th className="px-3 py-2">waId</th>
            <th className="px-3 py-2">Template</th>
            <th className="px-3 py-2">Status Meta</th>
            <th className="px-3 py-2">Pricing category</th>
            <th className="px-3 py-2">Billable</th>
            <th className="px-3 py-2">Pricing model</th>
            <th className="px-3 py-2">Conversation</th>
            <th className="px-3 py-2">Meta error</th>
            <th className="px-3 py-2">metaMessageId</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.metaMessageId ?? item.requestId ?? item.createdAt}-${item.waId}`}
              className="border-t border-white/10"
            >
              <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.waId}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <span>{item.templateName ?? "(sem template)"}</span>
                  <span className="text-xs text-white/60">{item.templateLang ?? "-"}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <span
                    className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(item.lastStatus ?? item.status)}`}
                  >
                    {item.lastStatus ?? item.status}
                  </span>
                  <span className="text-xs text-white/60">{item.statusDetail ?? "-"}</span>
                </div>
              </td>
              <td className="px-3 py-2">{item.pricingCategory ?? "-"}</td>
              <td className="px-3 py-2">{boolLabel(item.pricingBillable)}</td>
              <td className="px-3 py-2">{item.pricingModel ?? "-"}</td>
              <td className="px-3 py-2 font-mono text-xs">{item.conversationId ?? "-"}</td>
              <td className="px-3 py-2">
                <div className="max-w-xs whitespace-pre-wrap text-xs text-white/80">
                  {item.errorBody ??
                    (item.errorData
                      ? JSON.stringify(item.errorData)
                      : item.errors
                        ? JSON.stringify(item.errors)
                        : "-")}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{item.metaMessageId ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TemplatesAdminPage() {
  const { connection } = useAdminConsole();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    recent: TemplateObservabilityItem[];
    failed: TemplateObservabilityItem[];
  } | null>(null);

  useEffect(() => {
    if (!connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTemplatesObservability(connection)
      .then((response) => {
        if (cancelled) return;
        setData({
          recent: response.recent,
          failed: response.failed,
        });
      })
      .catch((err: { status?: number; message?: string }) => {
        if (cancelled) return;
        setError(err.message || "Falha ao carregar observabilidade de templates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection]);

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Outbound observability</h1>
            <p className="text-sm text-white/70">Templates e status real da Meta</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/templates/manage"
              className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20"
            >
              Gestao de templates
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        {loading ? <p className="text-sm text-white/70">Carregando...</p> : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Recentes</h2>
          </div>
          {renderTable(data?.recent ?? [], "Nenhum outbound recente encontrado.")}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Falhas recentes</h2>
          </div>
          {renderTable(data?.failed ?? [], "Nenhuma falha recente encontrada.")}
        </section>
      </div>
    </div>
  );
}
