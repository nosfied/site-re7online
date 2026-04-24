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
  fullScreen?: boolean;
};

function getLinkClasses(active: boolean) {
  return `rounded-lg border px-3 py-1.5 text-sm transition ${
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

export default function AppShell({ session, title, subtitle, children, fullScreen = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  return (
    <main
      className={
        fullScreen
          ? "h-screen w-screen overflow-hidden bg-re7-navy px-2 py-2 text-white"
          : "min-h-screen bg-re7-navy px-4 py-4 text-white md:px-6"
      }
    >
      <div className={fullScreen ? "flex h-full w-full flex-col gap-2" : "mx-auto flex w-full max-w-7xl flex-col gap-3"}>
        <header
          className={
            fullScreen
              ? "z-20 px-2 py-2 backdrop-blur"
              : "sticky top-2 z-20 rounded-xl border border-white/10 bg-[#0d1b36]/95 px-4 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Portal do cliente
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm text-white/70">{session.user.name || session.user.email}</p>
                {fullScreen ? <span className="text-sm text-white/40">•</span> : null}
                {fullScreen ? <p className="text-sm font-medium text-white">{title}</p> : null}
                {fullScreen && subtitle ? <p className="text-sm text-white/60">{subtitle}</p> : null}
              </div>
            </div>
            <div className="flex items-center">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-sm text-red-100 hover:bg-red-900/30"
              >
                Sair
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <div className="flex min-w-[190px] flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
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
              <div className="flex min-w-[190px] flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
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
                    Setores
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
          </div>
        </header>

        {!fullScreen ? (
          <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-sm text-white/70">{subtitle}</p> : null}
          </section>
        ) : null}

        {children}
      </div>
    </main>
  );
}
