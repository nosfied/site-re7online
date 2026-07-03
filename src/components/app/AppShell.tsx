"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import {
  AppSession,
  clearAppSession,
  fetchAppTenantSummary,
  logoutAppSession,
  unsubscribeAppPush,
} from "@/lib/appClientApi";
import {
  getAppProfile,
  getTenantCapabilities,
  type AppProfile,
  type TenantCapabilityKey,
} from "@/lib/appFeatures";

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
  feature?: TenantCapabilityKey;
  profiles?: AppProfile[];
  minRole?: "SUPERVISOR" | "ADMIN";
};

const DIRECT_OPERATION_NAV_LIMIT = 4;
const DIRECT_ADMINISTRATION_NAV_LIMIT = 3;

function getLinkClasses(active: boolean) {
  return `inline-flex h-8 min-w-0 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-xs leading-none transition lg:h-8 lg:px-2.5 lg:text-xs min-[1441px]:h-9 min-[1441px]:px-3 min-[1441px]:text-sm ${
    active ? "theme-nav-link-active" : "theme-nav-link"
  }`;
}

function getOverflowLinkClasses(active: boolean) {
  return `block rounded-md px-3 py-2 text-sm leading-tight transition ${
    active ? "theme-nav-link-active" : "theme-nav-link"
  }`;
}

function getOverflowTriggerClasses(active: boolean) {
  return `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold leading-none shadow-sm transition min-[1441px]:h-9 min-[1441px]:px-3 min-[1441px]:text-sm ${
    active
      ? "border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#115e59]"
      : "border-[#fb923c] bg-[#fff7ed] text-[#7c2d12] hover:bg-[#ffedd5]"
  }`;
}

function getOverflowTriggerIconClasses(active: boolean) {
  return `flex h-4 w-4 items-center justify-center rounded-full text-[12px] font-black leading-none ${
    active ? "bg-white/22 text-white" : "bg-[#7c2d12] text-white"
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
    feature: "dashboard",
    minRole: "SUPERVISOR",
    labels: { business: "Dashboard", government: "Dashboard" },
  },
  {
    href: "/app/campaigns",
    icon: "📢",
    group: "operation",
    feature: "campaigns",
    labels: { business: "Campanhas", government: "Comunicados" },
  },
  {
    href: "/app/templates",
    icon: "🧾",
    group: "operation",
    feature: "templates",
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
    href: "/app/knowledge-base",
    icon: "📚",
    group: "operation",
    feature: "knowledgeBase",
    minRole: "SUPERVISOR",
    labels: { business: "Base", government: "Base" },
  },
  {
    href: "/app/scheduling",
    icon: "🗓️",
    group: "operation",
    feature: "scheduling",
    minRole: "SUPERVISOR",
    labels: { business: "Agenda", government: "Agenda" },
  },
  {
    href: "/app/satisfaction",
    icon: "⭐",
    group: "operation",
    feature: "satisfaction",
    minRole: "SUPERVISOR",
    labels: { business: "Satisfacao", government: "Satisfacao" },
  },
  {
    href: "/app/audio-transcriptions",
    icon: "🎙️",
    group: "operation",
    feature: "audioTranscription",
    minRole: "SUPERVISOR",
    labels: { business: "Transcricoes", government: "Transcricoes" },
  },
  {
    href: "/app/search",
    icon: "🔎",
    group: "operation",
    feature: "advancedSearch",
    minRole: "SUPERVISOR",
    labels: { business: "Busca", government: "Busca" },
  },
  {
    href: "/app/webchat",
    icon: "💬",
    group: "operation",
    feature: "webchat",
    minRole: "SUPERVISOR",
    labels: { business: "Webchat", government: "Webchat" },
  },
  {
    href: "/app/telegram",
    icon: "✈️",
    group: "operation",
    feature: "telegram",
    minRole: "SUPERVISOR",
    labels: { business: "Telegram", government: "Telegram" },
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
    href: "/app/settings/crm",
    icon: "📌",
    group: "administration",
    feature: "crm",
    minRole: "SUPERVISOR",
    labels: { business: "CRM", government: "CRM" },
  },
  {
    href: "/app/settings/channels/instagram",
    icon: "📷",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Canais", government: "Canais" },
  },
  {
    href: "/app/api-keys",
    icon: "🔑",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "API", government: "API" },
  },
  {
    href: "/app/webhooks",
    icon: "🪝",
    group: "administration",
    feature: "webhooks",
    minRole: "SUPERVISOR",
    labels: { business: "Webhooks", government: "Webhooks" },
  },
  {
    href: "/app/settings/security",
    icon: "🔐",
    group: "administration",
    feature: "mfa",
    minRole: "SUPERVISOR",
    labels: { business: "Seguranca", government: "Seguranca" },
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
  const capabilities = getTenantCapabilities(session);
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
    void (async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint ?? null;
        if (subscription) {
          await subscription.unsubscribe();
        }
        await logoutAppSession(session, endpoint).catch(() => null);
        await unsubscribeAppPush(session, endpoint).catch(() => null);
      } catch {
        // Logout must remain fail-open even if the browser denies service worker access.
      } finally {
        clearAppSession();
        router.replace("/app/login");
      }
    })();
  };

  const visibleNavItems = APP_NAV_ITEMS.filter((item) => {
    if (item.profiles && !item.profiles.includes(profile)) return false;
    if (item.feature && !capabilities[item.feature]) return false;
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

  const renderOverflowMenu = (items: NavItem[], label: string) => {
    if (items.length === 0) return null;
    const hasActiveItem = items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    return (
      <details key={`${label}-overflow`} className="relative shrink-0">
        <summary
          className={`${getOverflowTriggerClasses(hasActiveItem)} cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden`}
          title={`Abrir mais opcoes de ${label}`}
        >
          Mais
          <span
            aria-hidden="true"
            className={getOverflowTriggerIconClasses(hasActiveItem)}
          >
            ▾
          </span>
        </summary>
        <div className="theme-surface-strong absolute right-0 top-[calc(100%+0.45rem)] z-[80] grid min-w-48 gap-1 rounded-lg border p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={getOverflowLinkClasses(active)}>
                {item.labels[profile]}
              </Link>
            );
          })}
        </div>
      </details>
    );
  };

  const renderNavLinks = (items: NavItem[], directLimit: number, label: string) => {
    const directItems = items.slice(0, directLimit);
    const overflowItems = items.slice(directLimit);
    return (
      <>
        {directItems.map(renderTextLink)}
        {renderOverflowMenu(overflowItems, label)}
      </>
    );
  };

  const navGroupClasses = "theme-surface grid min-w-0 max-w-full gap-1 rounded-lg border px-2 py-1.5 lg:px-1.5 min-[1441px]:px-2";
  const navLinksClasses = "flex min-w-0 max-w-full flex-nowrap items-center justify-start gap-1 overflow-visible";
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
      <button
        type="button"
        onClick={handleLogout}
      className="h-8 rounded-md bg-re7-orange px-2.5 text-xs font-semibold leading-none text-white shadow-sm hover:brightness-110 min-[1441px]:h-9 min-[1441px]:text-sm"
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
      className="relative m-0 flex h-[82px] w-[195px] shrink-0 items-center justify-center overflow-visible p-0 sm:h-[95px] sm:w-[213px] lg:h-[66px] lg:w-[154px] min-[1441px]:h-[109px] min-[1441px]:w-[247px]"
    >
      <Image
        src="/images/converta-logo-light.png"
        alt="Converta"
        width={160}
        height={200}
        priority
        className="theme-logo-light absolute left-1/2 top-1/2 m-0 block h-[124px] w-auto -translate-x-1/2 -translate-y-1/2 object-contain p-0 sm:h-[141px] lg:h-[104px] min-[1441px]:h-[177px]"
      />
      <Image
        src="/images/converta-logo-dark2.png"
        alt="Converta"
        width={160}
        height={200}
        priority
        className="theme-logo-dark absolute left-1/2 top-1/2 m-0 h-[67px] w-auto -translate-x-1/2 -translate-y-1/2 object-contain p-0 sm:h-[77px] lg:h-[57px] min-[1441px]:h-[96px]"
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
            src="/images/converta-logo-dark2.png"
            alt="Converta ampliada"
            width={900}
            height={340}
            priority
            className="theme-logo-dark h-auto w-full max-w-[520px] object-contain"
          />
        </div>
      </div>
    </div>
  ) : null;

  if (fullScreen) {
    return (
      <main className="theme-bg theme-inbox box-border h-[var(--app-viewport-height,100dvh)] max-h-[var(--app-viewport-height,100dvh)] w-full max-w-full overflow-hidden">
        <div className="grid h-[calc(100%-var(--safe-top))] w-full max-w-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden pt-[var(--safe-top)] md:h-full md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-1 md:pt-0">
          <aside className="order-2 hidden min-h-0 min-w-0 max-w-full flex-row items-center border-t border-white/10 bg-[#081327] px-2 py-2 pb-[calc(0.5rem+var(--safe-bottom))] md:order-none md:flex md:h-full md:flex-col md:border-r md:border-t-0 md:px-0 md:py-3 [@media(max-height:760px)]:md:py-2">
            <button
              type="button"
              onClick={() => router.push("/app/inbox")}
              title="Abrir inbox"
              className="hidden h-14 w-14 items-center justify-center rounded-2xl transition hover:bg-white/5 md:flex [@media(max-height:760px)]:h-11 [@media(max-height:760px)]:w-11"
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
            <nav className="flex min-h-0 w-full flex-1 items-center gap-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-4 md:flex-col md:gap-2 md:overflow-x-hidden md:overflow-y-auto md:px-2 md:[@media(max-height:760px)]:mt-2 md:[@media(max-height:760px)]:gap-1 [&::-webkit-scrollbar]:hidden">
              {visibleNavItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const mobileOnlyInbox = item.href === "/app/inbox";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.labels[profile]}
                    className={`${mobileOnlyInbox ? "flex" : "hidden md:flex"} h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold transition md:h-12 md:w-12 [@media(max-height:760px)]:md:h-9 [@media(max-height:760px)]:md:w-9 [@media(max-height:760px)]:md:rounded-xl ${
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
            <ThemeSelector className="hidden md:mt-2 md:flex md:flex-col md:gap-1 md:[&_select]:h-8 md:[&_select]:w-14 md:[&_select]:px-1 md:[&_select]:text-[10px]" />
            <button
              type="button"
              onClick={handleLogout}
              title="Sair"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-re7-orange/35 bg-re7-orange/15 text-xs font-semibold text-orange-100 shadow-sm transition hover:bg-re7-orange/25 md:mt-2 md:h-12 md:w-12 [@media(max-height:760px)]:md:h-9 [@media(max-height:760px)]:md:w-9 [@media(max-height:760px)]:md:rounded-xl"
            >
              <span className="text-xl leading-none [@media(max-height:760px)]:text-lg">🚪</span>
            </button>
          </aside>

          <section className="order-1 min-h-0 min-w-0 max-w-full overflow-hidden md:order-none">{children}</section>
        </div>
        {brandModal}
      </main>
    );
  }

  return (
    <main className="theme-bg theme-workspace min-h-screen overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2.5">
        <header className="theme-surface-strong theme-shadow fixed left-3 right-3 top-[calc(0.5rem+var(--safe-top))] z-50 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-1.5 backdrop-blur sm:left-4 sm:right-4 sm:w-[calc(100%-2rem)] lg:left-5 lg:right-5 lg:top-2 lg:w-[calc(100%-2.5rem)]">
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[82px_minmax(0,1fr)_124px] lg:items-center lg:gap-2 min-[1441px]:grid-cols-[128px_minmax(0,1fr)_160px] min-[1441px]:gap-3">
            <div className="flex min-w-0 items-center justify-between gap-2 lg:flex lg:justify-center">
              {logoButton}
              <div className="min-w-0 lg:hidden">
                {userActions}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:justify-center lg:gap-2 min-[1441px]:grid-cols-[auto_auto_auto] min-[1441px]:gap-3">
              <div className={navGroupClasses}>
                <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                  Operacao
                </p>
                <div className={navLinksClasses}>
                  {renderNavLinks(operationItems, DIRECT_OPERATION_NAV_LIMIT, "operacao")}
                </div>
              </div>
              {administrationItems.length > 0 ? (
                <div className={navGroupClasses}>
                  <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                    Administracao
                  </p>
                  <div className={navLinksClasses}>
                    {renderNavLinks(administrationItems, DIRECT_ADMINISTRATION_NAV_LIMIT, "administracao")}
                  </div>
                </div>
              ) : null}
              <ThemeSelector variant="switch" className="justify-self-start" />
            </div>

            <div className="hidden min-w-0 overflow-hidden lg:block">{userActions}</div>
          </div>
        </header>
        <section className="theme-surface theme-shadow fixed left-3 right-3 top-[calc(170px+var(--safe-top))] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-2 backdrop-blur sm:left-4 sm:right-4 sm:top-[calc(184px+var(--safe-top))] sm:w-[calc(100%-2rem)] sm:px-4 lg:left-5 lg:right-5 lg:top-[92px] lg:w-[calc(100%-2.5rem)] lg:py-1.5 min-[1441px]:top-[138px] min-[1441px]:py-2">
          <h1 className="text-base font-bold min-[1441px]:text-lg">{title}</h1>
          {subtitle ? <p className="theme-muted mt-0.5 text-xs min-[1441px]:text-sm">{subtitle}</p> : null}
        </section>

        <div aria-hidden="true" className="h-[230px] sm:h-[244px] lg:h-[144px] min-[1441px]:h-[196px]" />

        {children}
      </div>

      {brandModal}
    </main>
  );
}
