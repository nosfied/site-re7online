"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppSession, clearAppSession, fetchAppTenantSummary } from "@/lib/appClientApi";

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
  return `inline-flex h-8 min-w-0 items-center justify-center rounded-md border px-2.5 text-xs leading-none transition lg:h-9 lg:px-3 lg:text-sm ${
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
  { href: "/app/settings/privacy", label: "Privacidade", icon: "🔒", adminOnly: true },
];

export default function AppShell({ session, title, subtitle, children, fullScreen = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [tenantSummary, setTenantSummary] = useState<{ name: string; phoneDisplay: string | null } | null>(null);
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);

  useEffect(() => {
    if (fullScreen) return;
    let cancelled = false;
    fetchAppTenantSummary(session)
      .then((response) => {
        if (cancelled) return;
        setTenantSummary({
          name: response.tenant.name,
          phoneDisplay: response.tenant.phoneDisplay,
        });
      })
      .catch(() => {
        if (!cancelled) setTenantSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fullScreen, session]);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  const operationLinks = (
    <>
      <Link href="/app/inbox" className={getLinkClasses(pathname === "/app/inbox")}>
        Inbox
      </Link>
      <Link href="/app/campaigns" className={getLinkClasses(pathname === "/app/campaigns")}>
        Campanhas
      </Link>
      <Link href="/app/templates" className={getLinkClasses(pathname === "/app/templates")}>
        Templates
      </Link>
    </>
  );

  const administrationLinks = canViewAdministration ? (
    <>
      <Link href="/app/settings/users" className={getLinkClasses(pathname === "/app/settings/users")}>
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
      {isAdminRole(session.user.role) ? (
        <Link href="/app/settings/privacy" className={getLinkClasses(pathname === "/app/settings/privacy")}>
          Privacidade
        </Link>
      ) : null}
    </>
  ) : null;

  const navGroupClasses =
    "grid min-w-0 max-w-full gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5";
  const navLinksClasses = "flex min-w-0 flex-wrap items-center justify-center gap-1";
  const userActions = (
    <div className="flex min-w-0 items-center justify-end gap-1.5 lg:flex-col lg:items-end lg:gap-1">
      <div className="min-w-0 text-right">
        {tenantSummary ? (
          <>
            <p className="truncate text-xs leading-tight text-white/80">{tenantSummary.name}</p>
            {tenantSummary.phoneDisplay ? (
              <p className="truncate text-xs leading-tight text-white/55">{tenantSummary.phoneDisplay}</p>
            ) : null}
          </>
        ) : null}
        <p className="truncate text-xs leading-tight text-white/65 lg:text-sm">
          {session.user.name || session.user.email}
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="h-8 rounded-md border border-red-400/30 bg-red-900/20 px-2.5 text-xs leading-none text-red-100 hover:bg-red-900/30 lg:h-9 lg:text-sm"
      >
        Sair
      </button>
    </div>
  );
  const logoButton = (
    <button
      type="button"
      onClick={() => router.push("/app/inbox")}
      title="Abrir inbox"
      className="relative m-0 flex h-[82px] w-[195px] shrink-0 items-center justify-center overflow-visible p-0 sm:h-[95px] sm:w-[213px] lg:h-[109px] lg:w-[247px]"
    >
      <Image
        src="/images/converta-logo-light.png"
        alt="Converta"
        width={160}
        height={200}
        priority
        className="absolute left-1/2 top-1/2 m-0 block h-[124px] w-auto -translate-x-1/2 -translate-y-1/2 object-contain p-0 sm:h-[141px] lg:h-[177px]"
      />
    </button>
  );

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
    <main className="min-h-screen overflow-x-hidden bg-re7-navy px-3 py-3 text-white sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2.5">
        <header className="fixed left-3 right-3 top-2 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border border-white/10 bg-[#0d1b36]/95 px-3 py-1.5 shadow-[0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur sm:left-4 sm:right-4 sm:w-[calc(100%-2rem)] lg:left-5 lg:right-5 lg:w-[calc(100%-2.5rem)]">
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[120px_minmax(0,1fr)_150px] lg:items-center lg:gap-3 xl:grid-cols-[128px_minmax(0,1fr)_160px]">
            <div className="flex min-w-0 items-center justify-between gap-2 lg:flex lg:justify-center">
              {logoButton}
              <div className="min-w-0 lg:hidden">
                {userActions}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[auto_auto] lg:items-center lg:justify-center lg:gap-2 xl:gap-3">
              <div className={navGroupClasses}>
                <p className="text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-white/45">
                  Operacao
                </p>
                <div className={navLinksClasses}>{operationLinks}</div>
              </div>
              {administrationLinks ? (
                <div className={navGroupClasses}>
                  <p className="text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-white/45">
                    Administracao
                  </p>
                  <div className={navLinksClasses}>{administrationLinks}</div>
                </div>
              ) : null}
            </div>

            <div className="hidden min-w-0 overflow-hidden lg:block">{userActions}</div>
          </div>
        </header>
        <section className="fixed left-3 right-3 top-[170px] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur sm:left-4 sm:right-4 sm:top-[184px] sm:w-[calc(100%-2rem)] sm:px-4 lg:left-5 lg:right-5 lg:top-[138px] lg:w-[calc(100%-2.5rem)]">
          <h1 className="text-lg font-bold">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-white/70">{subtitle}</p> : null}
        </section>

        <div aria-hidden="true" className="h-[230px] sm:h-[244px] lg:h-[196px]" />

        {children}
      </div>

      {brandModal}
    </main>
  );
}
