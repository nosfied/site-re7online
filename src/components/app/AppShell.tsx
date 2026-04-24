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

type NavItem = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
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

const FULLSCREEN_NAV_ITEMS: NavItem[] = [
  { href: "/app/inbox", label: "Inbox", icon: "📥" },
  { href: "/app/campaigns", label: "Campanhas", icon: "📢" },
  { href: "/app/templates", label: "Templates", icon: "🧾" },
  { href: "/app/chatbot", label: "Chatbot", icon: "🤖", adminOnly: true },
  { href: "/app/reports", label: "Relatórios", icon: "📊", adminOnly: true },
  { href: "/app/settings/users", label: "Usuários", icon: "👤", adminOnly: true },
  { href: "/app/settings/departments", label: "Setores", icon: "⚙️", adminOnly: true },
];

export default function AppShell({ session, title, subtitle, children, fullScreen = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  if (fullScreen) {
    return (
      <main className="h-screen w-screen overflow-x-auto overflow-y-hidden bg-re7-navy text-white">
        <div className="grid h-full min-w-[1452px] grid-cols-[72px_minmax(0,1fr)] overflow-hidden">
          <aside className="flex h-full flex-col items-center border-r border-white/10 bg-[#081327] py-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-re7-sky/15 text-sm font-semibold text-white">
              R7
            </div>
            <nav className="mt-4 flex w-full flex-1 flex-col items-center gap-2 px-2">
              {FULLSCREEN_NAV_ITEMS.filter((item) => !item.adminOnly || canViewAdministration).map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-semibold transition ${
                      active
                        ? "bg-re7-sky/25 text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="text-xl leading-none">{item.icon}</span>
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/25 bg-red-900/20 text-xs font-semibold text-red-100 transition hover:bg-red-900/30"
            >
              <span className="text-xl leading-none">🚪</span>
            </button>
          </aside>

          <section className="min-h-0 min-w-0 overflow-hidden">{children}</section>
        </div>
      </main>
    );
  }

  return (
    <main
      className={
        "min-h-screen overflow-x-auto bg-re7-navy px-4 py-4 text-white md:px-6"
      }
    >
      <div className="mx-auto flex min-w-[1100px] w-full max-w-7xl flex-col gap-3">
        <header className="sticky top-2 z-20 rounded-xl border border-white/10 bg-[#0d1b36]/95 px-4 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Portal do cliente
              </p>
              <p className="mt-0.5 text-sm text-white/70">{session.user.name || session.user.email}</p>
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

        <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-white/70">{subtitle}</p> : null}
        </section>

        {children}
      </div>
    </main>
  );
}
