"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppSession, clearAppSession } from "@/lib/appClientApi";

type AppShellProps = {
  session: AppSession;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
};

function getLinkClasses(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm transition ${
    active
      ? "border-re7-sky/50 bg-re7-sky/20 text-white"
      : "border-white/20 text-white/80 hover:bg-white/10"
  }`;
}

function isSupervisorRole(role: string) {
  return role.trim().toUpperCase() === "SUPERVISOR";
}

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

export default function AppShell({ session, title, subtitle, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
            <p className="mt-1 text-xs text-white/50">{session.user.name || session.user.email}</p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-[220px] flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Operacao
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/app/inbox" className={getLinkClasses(pathname === "/app/inbox")}>
                  Inbox
                </Link>
                <Link href="/app/campaigns" className={getLinkClasses(pathname === "/app/campaigns")}>
                  Campanhas
                </Link>
                <Link href="/app/templates" className={getLinkClasses(pathname === "/app/templates")}>
                  Templates
                </Link>
              </div>
            </div>
            {canViewAdministration ? (
              <div className="flex min-w-[220px] flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Administracao
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/app/settings/users"
                    className={getLinkClasses(pathname === "/app/settings/users")}
                  >
                    Usuarios
                  </Link>
                  <Link
                    href="/app/settings/departments"
                    className={getLinkClasses(pathname === "/app/settings/departments")}
                  >
                    Departamentos
                  </Link>
                  <Link href="/app/chatbot" className={getLinkClasses(pathname === "/app/chatbot")}>
                    Chatbot
                  </Link>
                  <Link href="/app/reports" className={getLinkClasses(pathname === "/app/reports")}>
                    Relatorios
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="flex items-center">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-red-400/30 bg-red-900/20 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
