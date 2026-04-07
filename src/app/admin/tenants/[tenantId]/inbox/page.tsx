"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

export default function TenantInboxDeprecatedPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Inbox admin descontinuado</h1>
            <p className="text-sm text-white/70">
              O atendimento operacional deve acontecer apenas no portal `/app`.
            </p>
          </div>
          <Link
            href={tenantId ? `/admin/tenants/${encodeURIComponent(tenantId)}` : "/admin/tenants"}
            className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Voltar
          </Link>
        </header>

        <section className="rounded-xl border border-amber-400/30 bg-amber-900/20 p-5">
          <p className="text-sm text-amber-100">
            Esta tela foi mantida apenas para evitar uso operacional concorrente entre `/admin` e
            `/app`. Use o inbox do cliente para atendimento e acompanhamento de mensagens.
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Motivo do bloqueio</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/75">
            <li>- evita divergencia visual entre inbox admin e inbox do cliente</li>
            <li>- reduz risco de atendimento em abas concorrentes</li>
            <li>- centraliza a operacao no ambiente `/app` do tenant</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
