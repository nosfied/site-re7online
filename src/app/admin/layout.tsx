"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminConfigPanel from "@/components/admin/AdminConfigPanel";
import { AdminConsoleProvider, useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import ThemeSelector from "@/components/ThemeSelector";
import {
  clearAppSession,
  clearSupportReturnSession,
  exitPlatformSupportTenant,
  loadAppSession,
  loadSupportReturnSession,
  saveAppSession,
  type AppSession,
} from "@/lib/appClientApi";
import { AdminConnection } from "@/lib/whatsappAdminApi";

function AdminConsoleGate() {
  const { connection, setConnection, ready, isConnected, testingConnection, testConnection } =
    useAdminConsole();
  const [draft, setDraft] = useState<AdminConnection>(connection);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(connection);
  }, [connection]);

  if (!ready) {
    return (
      <main className="theme-bg theme-admin min-h-screen px-4 py-8 md:px-8">
        <div className="theme-surface mx-auto max-w-xl rounded-2xl border p-6">
          <p className="theme-muted text-sm">Carregando console interno...</p>
        </div>
      </main>
    );
  }

  if (isConnected) {
    return null;
  }

  const handleEnter = async () => {
    setError(null);
    setSuccess(null);
    if (!draft.baseUrl.trim() || !draft.adminToken.trim()) {
      setError("Conecte-se com Base URL e X-Admin-Token.");
      return;
    }
    try {
      await testConnection(draft);
      setConnection(draft);
      setSuccess("Conexao valida.");
    } catch {
      setError("Falha na conexao. Verifique o token.");
    }
  };

  const handleTest = async () => {
    setError(null);
    setSuccess(null);
    try {
      await testConnection(draft);
      setSuccess("Conexao valida.");
    } catch (err) {
      setError((err as Error).message || "Falha ao testar conexao.");
    }
  };

  return (
    <main className="theme-bg theme-admin min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <section className="theme-surface rounded-2xl border p-6">
          <div className="mb-5 flex flex-col gap-2">
            <span className="w-fit rounded-full border border-amber-400/30 bg-amber-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
              Console interno
            </span>
            <h1 className="text-2xl font-bold">Acesso restrito ao administrador</h1>
            <p className="theme-muted text-sm">
              Conecte-se com Base URL e X-Admin-Token para acessar o console interno.
            </p>
          </div>

          <AdminConfigPanel
            connection={draft}
            onChange={setDraft}
            onTestConnection={handleTest}
            testingConnection={testingConnection}
          />

          {error ? (
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
              {success}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleEnter}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Entrar no console
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminConsoleShell({ children }: { children: React.ReactNode }) {
  const { connection, isConnected, logout } = useAdminConsole();
  const router = useRouter();
  const [supportSession, setSupportSession] = useState<AppSession | null>(null);
  const [supportChecked, setSupportChecked] = useState(false);
  const [exitingSupport, setExitingSupport] = useState(false);

  useEffect(() => {
    const session = loadAppSession();
    setSupportSession(session?.supportAccess ? session : null);
    setSupportChecked(true);
  }, []);

  const handleReturnToSupport = () => {
    router.replace("/app/inbox");
  };

  const handleExitSupportMode = async () => {
    if (!supportSession || exitingSupport) return;
    setExitingSupport(true);
    try {
      await exitPlatformSupportTenant(supportSession).catch(() => null);
      const returnSession = loadSupportReturnSession();
      clearSupportReturnSession();
      if (returnSession?.token) {
        saveAppSession(returnSession);
        router.replace("/admin/tenants");
        return;
      }
      clearAppSession();
      router.replace("/app/login");
    } finally {
      setExitingSupport(false);
    }
  };

  if (!supportChecked) {
    return (
      <main className="theme-bg theme-admin min-h-screen px-4 py-8 md:px-8">
        <div className="theme-surface mx-auto max-w-xl rounded-2xl border p-6">
          <p className="theme-muted text-sm">Carregando console interno...</p>
        </div>
      </main>
    );
  }

  if (supportSession?.supportAccess) {
    return (
      <main className="theme-bg theme-admin min-h-screen px-4 py-8 md:px-8">
        <section className="theme-surface mx-auto flex max-w-2xl flex-col gap-5 rounded-2xl border p-6 shadow-2xl">
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full border border-amber-400/40 bg-amber-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
              Modo de suporte ativo
            </span>
            <h1 className="text-2xl font-bold">Console interno bloqueado nesta aba</h1>
            <p className="theme-muted text-sm leading-6">
              Esta aba está usando acesso temporário de suporte ao tenant{" "}
              <strong className="theme-text">
                {supportSession.supportAccess.tenantName || supportSession.user.clientId}
              </strong>
              . Para evitar mistura entre o Console interno e o atendimento em modo suporte, volte
              ao app ou encerre o modo suporte antes de abrir páginas administrativas.
            </p>
          </div>

          <div className="rounded-xl border border-amber-400/30 bg-amber-950/30 p-4 text-sm text-amber-50">
            O Console interno continua disponível normalmente em uma aba comum da RE7ONLINE. Este
            bloqueio vale somente para a aba que entrou no modo de suporte.
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleReturnToSupport}
              className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Voltar ao modo suporte
            </button>
            <button
              type="button"
              onClick={handleExitSupportMode}
              disabled={exitingSupport}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exitingSupport ? "Saindo..." : "Sair do modo suporte"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!isConnected) {
    return <AdminConsoleGate />;
  }

  return (
    <main className="theme-bg theme-admin min-h-screen">
      <div className="theme-surface border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-400/30 bg-amber-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
                Console interno
              </span>
              <span className="theme-soft text-xs">{connection.baseUrl}</span>
            </div>
            <p className="theme-muted text-sm">Area administrativa restrita.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeSelector />
            <Link
              href="/admin/tenants"
              className="theme-nav-link rounded-md border px-3 py-2 text-sm"
            >
              Tenants
            </Link>
            <Link
              href="/admin/templates"
              className="theme-nav-link rounded-md border px-3 py-2 text-sm"
            >
              Templates
            </Link>
            <Link
              href="/admin/training"
              className="theme-nav-link rounded-md border px-3 py-2 text-sm"
            >
              Treinamentos
            </Link>
            <Link
              href="/admin/ops"
              className="theme-nav-link rounded-md border px-3 py-2 text-sm"
            >
              Ops
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-red-400/30 bg-red-900/20 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30"
            >
              Sair do console
            </button>
          </div>
        </div>
      </div>
      {children}
    </main>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminConsoleProvider>
      <AdminConsoleShell>{children}</AdminConsoleShell>
    </AdminConsoleProvider>
  );
}
