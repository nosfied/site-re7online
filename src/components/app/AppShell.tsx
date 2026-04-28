"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  return `inline-flex min-w-0 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs leading-none transition sm:px-3 sm:text-sm ${
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
  { href: "/app/chatbot", label: "Configurações Chatbot", icon: "🤖", adminOnly: true },
  { href: "/app/reports", label: "Relatórios", icon: "📊", adminOnly: true },
  { href: "/app/settings/users", label: "Usuários", icon: "👤", adminOnly: true },
  { href: "/app/settings/departments", label: "Setores", icon: "🏢", adminOnly: true },
];

export default function AppShell({ session, title, subtitle, children, fullScreen = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBrandModal, setShowBrandModal] = useState(false);
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  const brandModal = showBrandModal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/78 px-4 backdrop-blur-sm"
      onClick={() => setShowBrandModal(false)}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0d1b36] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setShowBrandModal(false)}
          className="absolute right-4 top-4 rounded-full border border-white/15 px-3 py-1 text-sm text-white/75 hover:bg-white/10 hover:text-white"
        >
          Fechar
        </button>
        <div className="flex min-h-[280px] items-center justify-center">
          <Image
            src="/images/converta-logo-light.png"
            alt="Converta ampliada"
            width={900}
            height={340}
            priority
            className="h-auto w-full max-w-[760px] object-contain"
          />
        </div>
      </div>
    </div>
  ) : null;

  if (fullScreen) {
    return (
      <main className="h-screen w-screen overflow-hidden bg-re7-navy text-white">
        <div className="grid h-full w-full grid-cols-[72px_minmax(0,1fr)] overflow-hidden">
          <aside className="flex h-full flex-col items-center border-r border-white/10 bg-[#081327] py-3">
            <button
              type="button"
              onClick={() => setShowBrandModal(true)}
              title="Ampliar logo da Converta"
              className="flex h-14 w-14 items-center justify-center rounded-2xl transition hover:bg-white/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f7f8fa]">
                <Image
                  src="/images/converta-check-mark.png"
                  alt="Converta"
                  width={64}
                  height={64}
                  className="h-9 w-9 translate-x-[2px] object-contain"
                />
              </span>
            </button>
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
        {brandModal}
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-re7-navy px-3 py-3 text-white sm:px-4 md:px-6 lg:px-7 xl:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <header className="sticky top-2 z-20 rounded-xl border border-white/10 bg-[#0d1b36]/95 px-3 py-3 shadow-[0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur sm:px-4">
          <div className="grid min-w-0 gap-3 xl:grid-cols-[150px_minmax(0,1fr)_150px] xl:items-start">
            <div className="flex min-w-0 items-center justify-center gap-1.5 xl:justify-start xl:pt-5">
              <button
                type="button"
                onClick={() => router.push("/app/inbox")}
                title="Abrir inbox"
                className="flex h-10 w-36 max-w-full items-center justify-center sm:w-40 xl:w-32"
              >
                <Image
                  src="/images/converta-logo-light.png"
                  alt="Converta"
                  width={160}
                  height={60}
                  priority
                  className="h-auto w-full object-contain"
                />
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-start justify-center gap-2 xl:pt-1">
              <div className="flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Operacao
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                <div className="flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                    Administracao
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                      Configurações Chatbot
                    </Link>
                    <Link href="/app/reports" className={getLinkClasses(pathname === "/app/reports")}>
                      Relatorios
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-row flex-wrap items-center justify-center gap-2 xl:flex-col xl:items-end xl:justify-start xl:gap-1 xl:pt-1">
              <span className="min-w-0 truncate text-center text-sm leading-none text-white/65 xl:text-right">
                {session.user.name || session.user.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-sm text-red-100 hover:bg-red-900/30"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 sm:px-4">
          <h1 className="text-lg font-bold sm:text-xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-white/70">{subtitle}</p> : null}
        </section>

        {children}
      </div>

      {brandModal}
    </main>
  );
}
