"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import { AppSession, clearAppSession, fetchAppTenantSummary } from "@/lib/appClientApi";
import { getAppFeatures, getAppProfile, type AppFeatureKey, type AppProfile } from "@/lib/appFeatures";

type AppShellProps = {
  session: AppSession;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  fullScreen?: boolean;
};

type NavItem = {
  href: string;
  icon: string;
  group: "operation" | "administration";
  labels: Record<AppProfile, string>;
  feature?: AppFeatureKey;
  profiles?: AppProfile[];
  minRole?: "SUPERVISOR" | "ADMIN";
};

function getLinkClasses(active: boolean) {
  return `inline-flex h-8 min-w-0 items-center justify-center rounded-md border px-2.5 text-xs leading-none transition lg:h-9 lg:px-3 lg:text-sm ${
    active ? "theme-nav-link-active" : "theme-nav-link"
  }`;
}

function isSupervisorRole(role: string) {
  return role.trim().toUpperCase() === "SUPERVISOR";
}

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

const APP_NAV_ITEMS: NavItem[] = [
  {
    href: "/app/inbox",
    icon: "📥",
    group: "operation",
    labels: { business: "Inbox", government: "Atendimento" },
  },
  {
    href: "/app/dashboard",
    icon: "📊",
    group: "operation",
    profiles: ["government"],
    minRole: "SUPERVISOR",
    labels: { business: "Dashboard", government: "Dashboard" },
  },
  {
    href: "/app/campaigns",
    icon: "📢",
    group: "operation",
    feature: "campaigns",
    profiles: ["business"],
    labels: { business: "Campanhas", government: "Comunicados" },
  },
  {
    href: "/app/templates",
    icon: "🧾",
    group: "operation",
    profiles: ["business"],
    labels: { business: "Templates", government: "Templates" },
  },
  {
    href: "/app/chatbot",
    icon: "🤖",
    group: "operation",
    feature: "chatbot",
    minRole: "SUPERVISOR",
    labels: { business: "Automacao", government: "Configuracoes" },
  },
  {
    href: "/app/reports",
    icon: "📈",
    group: "operation",
    feature: "reports",
    minRole: "SUPERVISOR",
    labels: { business: "Relatorios", government: "Indicadores" },
  },
  {
    href: "/app/settings/users",
    icon: "👤",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Usuarios", government: "Usuarios" },
  },
  {
    href: "/app/settings/departments",
    icon: "🏢",
    group: "administration",
    feature: "departments",
    minRole: "SUPERVISOR",
    labels: { business: "Setores", government: "Departamentos" },
  },
  {
    href: "/app/settings/privacy",
    icon: "🔒",
    group: "administration",
    minRole: "ADMIN",
    labels: { business: "Privacidade", government: "Auditoria" },
  },
];

export default function AppShell({ session, title, subtitle, children, fullScreen = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [tenantSummary, setTenantSummary] = useState<{
    name: string;
    phoneDisplay: string | null;
    profile: AppProfile;
  } | null>(null);
  const canViewAdministration = isSupervisorRole(session.user.role) || isAdminRole(session.user.role);
  const features = getAppFeatures(session);
  const profile = tenantSummary?.profile ?? getAppProfile(session);

  useEffect(() => {
    let cancelled = false;
    fetchAppTenantSummary(session)
      .then((response) => {
        if (cancelled) return;
        setTenantSummary({
          name: response.tenant.name,
          phoneDisplay: response.tenant.phoneDisplay,
          profile: response.tenant.profile,
        });
      })
      .catch(() => {
        if (!cancelled) setTenantSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  const visibleNavItems = APP_NAV_ITEMS.filter((item) => {
    if (item.profiles && !item.profiles.includes(profile)) return false;
    if (item.feature && !features[item.feature]) return false;
    if (item.minRole === "ADMIN" && !isAdminRole(session.user.role)) return false;
    if (item.minRole === "SUPERVISOR" && !canViewAdministration) return false;
    return true;
  });
  const operationItems = visibleNavItems.filter((item) => item.group === "operation");
  const administrationItems = visibleNavItems.filter((item) => item.group === "administration");

  const renderTextLink = (item: NavItem) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href} className={getLinkClasses(active)}>
        {item.labels[profile]}
      </Link>
    );
  };

  const navGroupClasses = "theme-surface grid min-w-0 max-w-full gap-1 rounded-lg border px-2 py-1.5";
  const navLinksClasses = "flex min-w-0 flex-wrap items-center justify-center gap-1";
  const userActions = (
    <div className="flex min-w-0 items-center justify-end gap-1.5 lg:flex-col lg:items-end lg:gap-1">
      <div className="min-w-0 text-right">
        {tenantSummary ? (
          <>
            <p className="theme-muted truncate text-xs leading-tight">{tenantSummary.name}</p>
            {tenantSummary.phoneDisplay ? (
              <p className="theme-soft truncate text-xs leading-tight">{tenantSummary.phoneDisplay}</p>
            ) : null}
          </>
        ) : null}
        <p className="theme-muted truncate text-xs leading-tight lg:text-sm">
          {session.user.name || session.user.email}
        </p>
      </div>
      <div className="flex items-center gap-1.5 lg:flex-col lg:items-end">
        <ThemeSelector />
        <button
          type="button"
          onClick={handleLogout}
          className="h-8 rounded-md border border-red-400/30 bg-red-900/20 px-2.5 text-xs leading-none text-red-100 hover:bg-red-900/30 lg:h-9 lg:text-sm"
        >
          Sair
        </button>
      </div>
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
        className="theme-logo-light absolute left-1/2 top-1/2 m-0 block h-[124px] w-auto -translate-x-1/2 -translate-y-1/2 object-contain p-0 sm:h-[141px] lg:h-[177px]"
      />
      <Image
        src="/images/converta-logo-dark.png"
        alt="Converta"
        width={160}
        height={200}
        priority
        className="theme-logo-dark absolute left-1/2 top-1/2 m-0 h-[124px] w-auto -translate-x-1/2 -translate-y-1/2 object-contain p-0 sm:h-[141px] lg:h-[177px]"
      />
    </button>
  );

  const brandModal = showBrandModal ? (
    <div
      className="theme-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      onClick={() => setShowBrandModal(false)}
    >
      <div
        className="theme-surface-strong relative w-full max-w-3xl rounded-2xl border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.22)] sm:p-6"
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
            className="theme-logo-light h-auto w-full max-w-[760px] object-contain"
          />
          <Image
            src="/images/converta-logo-dark.png"
            alt="Converta ampliada"
            width={900}
            height={340}
            priority
            className="theme-logo-dark h-auto w-full max-w-[760px] object-contain"
          />
        </div>
      </div>
    </div>
  ) : null;

  if (fullScreen) {
    return (
      <main className="theme-bg h-screen w-screen overflow-hidden [@media(max-height:760px)]:h-[100dvh]">
        <div className="grid h-full w-full grid-cols-[72px_minmax(0,1fr)] overflow-hidden">
          <aside className="flex h-full min-h-0 flex-col items-center border-r border-white/10 bg-[#081327] py-3 [@media(max-height:760px)]:py-2">
            <button
              type="button"
              onClick={() => setShowBrandModal(true)}
              title="Ampliar logo da Converta"
              className="flex h-14 w-14 items-center justify-center rounded-2xl transition hover:bg-white/5 [@media(max-height:760px)]:h-11 [@media(max-height:760px)]:w-11"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#f7f8fa] [@media(max-height:760px)]:h-9 [@media(max-height:760px)]:w-9 [@media(max-height:760px)]:rounded-xl">
                <Image
                  src="/images/converta-check-mark.png"
                  alt="Converta"
                  width={64}
                  height={64}
                  className="h-9 w-9 translate-x-[2px] object-contain [@media(max-height:760px)]:h-7 [@media(max-height:760px)]:w-7"
                />
              </span>
            </button>
            <nav className="mt-4 flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-2 [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:gap-1">
              {visibleNavItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.labels[profile]}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold transition [@media(max-height:760px)]:h-9 [@media(max-height:760px)]:w-9 [@media(max-height:760px)]:rounded-xl ${
                      active
                        ? "bg-re7-sky/25 text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="text-xl leading-none [@media(max-height:760px)]:text-lg">{item.icon}</span>
                  </Link>
                );
              })}
            </nav>
            <ThemeSelector className="mt-2 flex-col gap-1 [&_select]:h-8 [&_select]:w-14 [&_select]:px-1 [&_select]:text-[10px]" />
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className="mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-400/25 bg-red-900/20 text-xs font-semibold text-red-100 transition hover:bg-red-900/30 [@media(max-height:760px)]:h-9 [@media(max-height:760px)]:w-9 [@media(max-height:760px)]:rounded-xl"
            >
              <span className="text-xl leading-none [@media(max-height:760px)]:text-lg">🚪</span>
            </button>
          </aside>

          <section className="min-h-0 min-w-0 overflow-hidden">{children}</section>
        </div>
        {brandModal}
      </main>
    );
  }

  return (
    <main className="theme-bg min-h-screen overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2.5">
        <header className="theme-surface-strong theme-shadow fixed left-3 right-3 top-2 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-1.5 backdrop-blur sm:left-4 sm:right-4 sm:w-[calc(100%-2rem)] lg:left-5 lg:right-5 lg:w-[calc(100%-2.5rem)]">
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[120px_minmax(0,1fr)_150px] lg:items-center lg:gap-3 xl:grid-cols-[128px_minmax(0,1fr)_160px]">
            <div className="flex min-w-0 items-center justify-between gap-2 lg:flex lg:justify-center">
              {logoButton}
              <div className="min-w-0 lg:hidden">
                {userActions}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[auto_auto] lg:items-center lg:justify-center lg:gap-2 xl:gap-3">
              <div className={navGroupClasses}>
                <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                  Operacao
                </p>
                <div className={navLinksClasses}>{operationItems.map(renderTextLink)}</div>
              </div>
              {administrationItems.length > 0 ? (
                <div className={navGroupClasses}>
                  <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                    Administracao
                  </p>
                  <div className={navLinksClasses}>{administrationItems.map(renderTextLink)}</div>
                </div>
              ) : null}
            </div>

            <div className="hidden min-w-0 overflow-hidden lg:block">{userActions}</div>
          </div>
        </header>
        <section className="theme-surface theme-shadow fixed left-3 right-3 top-[170px] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-2 backdrop-blur sm:left-4 sm:right-4 sm:top-[184px] sm:w-[calc(100%-2rem)] sm:px-4 lg:left-5 lg:right-5 lg:top-[138px] lg:w-[calc(100%-2.5rem)]">
          <h1 className="text-lg font-bold">{title}</h1>
          {subtitle ? <p className="theme-muted mt-0.5 text-sm">{subtitle}</p> : null}
        </section>

        <div aria-hidden="true" className="h-[230px] sm:h-[244px] lg:h-[196px]" />

        {children}
      </div>

      {brandModal}
    </main>
  );
}
