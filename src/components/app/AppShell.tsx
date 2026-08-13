"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import {
  AppSession,
  clearAppSession,
  clearSupportReturnSession,
  exitPlatformSupportTenant,
  fetchAppTenantSummary,
  getAppSessionRemainingMs,
  loadSupportReturnSession,
  logoutAppSession,
  renewAppSession,
  saveAppSession,
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
  hideTitleBar?: boolean;
  titleSurface?: "default" | "strong";
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
const COMPACT_OPERATION_NAV_LIMIT = 2;
const COMPACT_ADMINISTRATION_NAV_LIMIT = 1;
const NARROW_OPERATION_NAV_LIMIT = 1;
const NARROW_ADMINISTRATION_NAV_LIMIT = 1;
const SESSION_WARNING_THRESHOLD_MS = 60 * 1000;
const APP_SESSION_STORAGE_KEYS = new Set(["wa_app_session_session_v1", "wa_app_session_local_v1"]);

function getDirectNavLimits(width: number) {
  if (width < 1024) {
    return {
      operation: DIRECT_OPERATION_NAV_LIMIT,
      administration: DIRECT_ADMINISTRATION_NAV_LIMIT,
    };
  }
  if (width < 1200) {
    return {
      operation: NARROW_OPERATION_NAV_LIMIT,
      administration: NARROW_ADMINISTRATION_NAV_LIMIT,
    };
  }
  if (width < 1441) {
    return {
      operation: COMPACT_OPERATION_NAV_LIMIT,
      administration: COMPACT_ADMINISTRATION_NAV_LIMIT,
    };
  }
  return {
    operation: DIRECT_OPERATION_NAV_LIMIT,
    administration: DIRECT_ADMINISTRATION_NAV_LIMIT,
  };
}

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
    active ? "theme-nav-link-active" : "theme-nav-link"
  }`;
}

function getOverflowTriggerIconClasses() {
  return "flex h-4 w-4 items-center justify-center rounded-full border border-current/20 bg-re7-sky/15 text-[12px] font-black leading-none text-current";
}

function getHelpTriggerClasses(active: boolean) {
  return `inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold leading-none shadow-sm transition min-[1441px]:h-9 min-[1441px]:px-3 min-[1441px]:text-sm ${
    active ? "theme-nav-link-active" : "theme-nav-link"
  }`;
}

function isSupervisorRole(role: string) {
  return role.trim().toUpperCase() === "SUPERVISOR";
}

function isAdminRole(role: string) {
  return role.trim().toUpperCase() === "ADMIN";
}

function formatCountdown(ms: number | null) {
  const totalSeconds = Math.max(0, Math.ceil((ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const APP_NAV_ITEMS: NavItem[] = [
  {
    href: "/app/inbox",
    icon: "📥",
    group: "operation",
    labels: { business: "Caixa de entrada", government: "Atendimento" },
  },
  {
    href: "/app/dashboard",
    icon: "📊",
    group: "operation",
    feature: "dashboard",
    minRole: "SUPERVISOR",
    labels: { business: "Painel", government: "Painel" },
  },
  {
    href: "/app/operations",
    icon: "▦",
    group: "operation",
    feature: "operationsBoard",
    minRole: "SUPERVISOR",
    labels: { business: "Central de Operações", government: "Central de Operações" },
  },
  {
    href: "/app/campaigns",
    icon: "📢",
    group: "operation",
    feature: "campaigns",
    labels: { business: "Campanhas", government: "Comunicados" },
  },
  {
    href: "/app/crm",
    icon: "👥",
    group: "operation",
    feature: "crm",
    labels: { business: "Contatos", government: "Contatos" },
  },
  {
    href: "/app/templates",
    icon: "🧾",
    group: "operation",
    feature: "templates",
    labels: { business: "Modelos", government: "Modelos" },
  },
  {
    href: "/app/chatbot",
    icon: "🤖",
    group: "operation",
    feature: "chatbot",
    minRole: "SUPERVISOR",
    labels: { business: "Automação", government: "Configurações" },
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
    labels: { business: "Chat do site", government: "Chat do site" },
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
    labels: { business: "Relatórios", government: "Indicadores" },
  },
  {
    href: "/app/settings/users",
    icon: "👤",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Usuários", government: "Usuários" },
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
    href: "/app/settings/queue",
    icon: "⇄",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Fila", government: "Fila" },
  },
  {
    href: "/app/settings/channels/whatsapp",
    icon: "☏",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Canais", government: "Canais" },
  },
  {
    href: "/app/settings/inbox",
    icon: "✍",
    group: "administration",
    minRole: "SUPERVISOR",
    labels: { business: "Atendimento", government: "Atendimento" },
  },
  {
    href: "/app/settings/crm",
    icon: "📌",
    group: "administration",
    feature: "crm",
    minRole: "SUPERVISOR",
    labels: { business: "Config. CRM", government: "Config. CRM" },
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
    minRole: "SUPERVISOR",
    labels: { business: "Segurança", government: "Segurança" },
  },
  {
    href: "/app/settings/privacy",
    icon: "🔒",
    group: "administration",
    minRole: "ADMIN",
    labels: { business: "Privacidade", government: "Auditoria" },
  },
];

export default function AppShell({
  session,
  title,
  subtitle,
  children,
  fullScreen = false,
  hideTitleBar = false,
  titleSurface = "default",
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showMainMenuSubmenu, setShowMainMenuSubmenu] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [activeSession, setActiveSession] = useState(session);
  const [remainingMs, setRemainingMs] = useState<number | null>(() => getAppSessionRemainingMs(session));
  const [renewingSession, setRenewingSession] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [exitingSupportMode, setExitingSupportMode] = useState(false);
  const [directNavLimits, setDirectNavLimits] = useState(() => ({
    operation: DIRECT_OPERATION_NAV_LIMIT,
    administration: DIRECT_ADMINISTRATION_NAV_LIMIT,
  }));
  const helpMenuRef = useRef<HTMLDivElement | null>(null);
  const [tenantSummary, setTenantSummary] = useState<{
    name: string;
    phoneDisplay: string | null;
    profile: AppProfile;
  } | null>(null);
  const canViewAdministration = isSupervisorRole(activeSession.user.role) || isAdminRole(activeSession.user.role);
  const capabilities = getTenantCapabilities(activeSession);
  const profile = tenantSummary?.profile ?? getAppProfile(activeSession);

  useEffect(() => {
    setActiveSession(session);
    setRemainingMs(getAppSessionRemainingMs(session));
  }, [session]);

  useEffect(() => {
    setShowHelpMenu(false);
    setShowMainMenuSubmenu(false);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const updateDirectNavLimits = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setDirectNavLimits(getDirectNavLimits(window.innerWidth));
      });
    };
    updateDirectNavLimits();
    window.addEventListener("resize", updateDirectNavLimits);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateDirectNavLimits);
    };
  }, []);

  useEffect(() => {
    if (!showHelpMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && helpMenuRef.current?.contains(target)) return;
      setShowHelpMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowHelpMenu(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showHelpMenu]);

  useEffect(() => {
    let cancelled = false;
    fetchAppTenantSummary(activeSession)
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
  }, [activeSession]);

  useEffect(() => {
    const refreshRemaining = () => {
      const nextRemaining = getAppSessionRemainingMs(activeSession);
      setRemainingMs(nextRemaining);
      if (nextRemaining !== null && nextRemaining <= 0) {
        clearAppSession();
        router.replace("/app/login");
      }
    };
    refreshRemaining();
    const timer = window.setInterval(refreshRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession, router]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !APP_SESSION_STORAGE_KEYS.has(event.key)) return;
      let current: AppSession | null = null;
      try {
        current = event.newValue ? JSON.parse(event.newValue) as AppSession : null;
      } catch {
        current = null;
      }
      if (current?.token) {
        setActiveSession(current);
        setRemainingMs(getAppSessionRemainingMs(current));
        setRenewError(null);
        return;
      }
      router.replace("/app/login");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [router]);

  const handleLogout = () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint ?? null;
        if (subscription) {
          await subscription.unsubscribe();
        }
        await logoutAppSession(activeSession, endpoint).catch(() => null);
        await unsubscribeAppPush(activeSession, endpoint).catch(() => null);
      } catch {
        // Logout must remain fail-open even if the browser denies service worker access.
      } finally {
        clearAppSession();
        router.replace("/app/login");
      }
    })();
  };

  const handleExitSupportMode = () => {
    if (!activeSession.supportAccess || exitingSupportMode) return;
    setExitingSupportMode(true);
    void (async () => {
      try {
        await exitPlatformSupportTenant(activeSession).catch(() => null);
        const returnSession = loadSupportReturnSession();
        clearSupportReturnSession();
        if (returnSession?.token) {
          saveAppSession(returnSession);
          router.replace("/app/inbox");
          return;
        }
        clearAppSession();
        router.replace("/app/login");
      } finally {
        setExitingSupportMode(false);
      }
    })();
  };

  const handleRenewSession = () => {
    if (renewingSession) return;
    setRenewingSession(true);
    setRenewError(null);
    void renewAppSession(activeSession)
      .then((response) => {
        const nextSession: AppSession = {
          ...activeSession,
          token: response.token,
          expiresAt: response.expiresAt,
          user: response.user,
          features: response.features,
          profile: response.profile,
        };
        saveAppSession(nextSession);
        setActiveSession(nextSession);
        setRemainingMs(getAppSessionRemainingMs(nextSession));
      })
      .catch((error: { message?: string }) => {
        setRenewError(error.message || "Não foi possível renovar a sessão. Faça login novamente.");
      })
      .finally(() => setRenewingSession(false));
  };

  const visibleNavItems = APP_NAV_ITEMS.filter((item) => {
    if (item.profiles && !item.profiles.includes(profile)) return false;
    if (item.feature && !capabilities[item.feature]) return false;
    if (item.minRole === "ADMIN" && !isAdminRole(activeSession.user.role)) return false;
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
            className={getOverflowTriggerIconClasses()}
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
    const hasOverflow = items.length > directLimit;
    const directCount = hasOverflow ? Math.max(0, directLimit - 1) : directLimit;
    const directItems = items.slice(0, directCount);
    const overflowItems = items.slice(directCount);
    return (
      <>
        {directItems.map(renderTextLink)}
        {renderOverflowMenu(overflowItems, label)}
      </>
    );
  };

  const renderMainMenuGroup = (items: NavItem[], label: string) => {
    if (items.length === 0) return null;
    return (
      <section className="grid gap-2">
        <p className="theme-soft text-xs font-semibold uppercase leading-none tracking-[0.16em]">{label}</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMainMenuSubmenu(false)}
                className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                  active ? "theme-nav-link-active" : "theme-nav-link"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-re7-sky/12 text-lg leading-none">
                  {item.icon}
                </span>
                <span className="min-w-0 truncate font-semibold">{item.labels[profile]}</span>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  const navGroupClasses = "theme-surface grid min-w-0 max-w-full gap-1 rounded-lg border px-2 py-1.5 lg:px-1.5 min-[1441px]:px-2";
  const navLinksClasses = "flex min-w-0 max-w-full flex-nowrap items-center justify-start gap-1 overflow-visible";
  const helpMenuActive =
    pathname === "/app/support" || pathname.startsWith("/app/support/") ||
    pathname === "/app/training" || pathname.startsWith("/app/training/");
  const helpActions = (
    <div ref={helpMenuRef} className="relative z-[70] flex min-w-0 shrink-0 justify-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={showHelpMenu}
        aria-controls="app-help-support-menu"
        onClick={() => setShowHelpMenu((current) => !current)}
        className={`${getHelpTriggerClasses(helpMenuActive)} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-sky`}
      >
        <span
          aria-hidden="true"
          className="flex h-4 w-4 items-center justify-center rounded-full border border-current/25 bg-re7-sky/15 text-[11px] font-black leading-none"
        >
          ?
        </span>
        <span className="hidden sm:inline">Ajuda e suporte</span>
        <span className="sm:hidden">Ajuda</span>
        <span aria-hidden="true" className={getOverflowTriggerIconClasses()}>
          ▾
        </span>
      </button>
      {showHelpMenu ? (
        <div
          id="app-help-support-menu"
          role="menu"
          className="theme-surface-strong absolute right-0 top-[calc(100%+0.45rem)] z-[90] grid w-[min(22rem,calc(100vw-2rem))] gap-1 rounded-lg border p-1.5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
        >
          <Link
            href="/app/training"
            role="menuitem"
            onClick={() => setShowHelpMenu(false)}
            className="theme-nav-link flex min-w-0 items-start gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition hover:border-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-sky"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-re7-sky/12 text-lg leading-none">
              🎓
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">Treinamentos</span>
              <span className="theme-muted mt-1 block text-xs leading-snug">
                Vídeos e materiais para aprender a usar o Converta.
              </span>
            </span>
          </Link>
          {canViewAdministration ? (
            <Link
              href="/app/support"
              role="menuitem"
              onClick={() => setShowHelpMenu(false)}
              className="theme-nav-link flex min-w-0 items-start gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition hover:border-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-sky"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-re7-orange/15 text-lg leading-none">
                ☎
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">Abrir chamado</span>
                <span className="theme-muted mt-1 block text-xs leading-snug">
                  Fale diretamente com nossa equipe de suporte.
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  const userActions = (
    <div className="grid min-w-0 justify-items-end gap-1">
      <div className="flex min-w-0 items-center justify-end gap-2">
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
            {activeSession.user.name || activeSession.user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="h-8 shrink-0 rounded-md bg-re7-orange px-2.5 text-xs font-semibold leading-none text-white shadow-sm hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-re7-orange min-[1441px]:h-9 min-[1441px]:text-sm"
        >
          Sair
        </button>
      </div>
      {helpActions}
    </div>
  );
  const supportModeBanner = activeSession.supportAccess ? (
    <div className="rounded-lg border border-amber-300/35 bg-amber-500/12 px-3 py-2 text-sm text-amber-50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Modo de suporte</p>
          <p className="theme-muted mt-0.5 text-xs">
            Acesso temporário ao tenant{" "}
            {activeSession.supportAccess.tenantName || tenantSummary?.name || activeSession.user.clientId}.
            Expira em {new Date(activeSession.supportAccess.expiresAt).toLocaleString("pt-BR")}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExitSupportMode}
          disabled={exitingSupportMode}
          className="theme-nav-link shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exitingSupportMode ? "Saindo..." : "Sair do modo de suporte"}
        </button>
      </div>
    </div>
  ) : null;
  const logoButton = (
    <button
      type="button"
      onClick={() => router.push("/app/inbox")}
      title="Abrir caixa de entrada"
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

  const mainMenuSubmenu = showMainMenuSubmenu ? (
      <div className="theme-surface-strong absolute left-[calc(100%+0.65rem)] top-0 z-[90] grid max-h-[min(660px,calc(100dvh-1.5rem))] w-[min(540px,calc(100vw-6rem))] gap-4 overflow-auto rounded-2xl border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="theme-soft text-xs font-semibold uppercase leading-none tracking-[0.16em]">
              Navegação
            </p>
            <h2 className="mt-1 text-lg font-bold">Menu principal</h2>
            <p className="theme-muted mt-1 text-sm">
              Opções disponíveis para {activeSession.user.name || activeSession.user.email}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMainMenuSubmenu(false)}
            className="theme-nav-link shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold"
          >
            Fechar
          </button>
        </div>
        <div className="grid gap-5">
          {renderMainMenuGroup(operationItems, "Operação")}
          {renderMainMenuGroup(administrationItems, "Administração")}
        </div>
      </div>
  ) : null;
  const showSessionWarning =
    remainingMs !== null && remainingMs > 0 && remainingMs <= SESSION_WARNING_THRESHOLD_MS;
  const sessionRenewalModal = showSessionWarning ? (
    <div className="theme-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center px-4 backdrop-blur-sm">
      <div className="theme-surface-strong w-full max-w-md rounded-2xl border p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
        <p className="theme-soft text-xs font-semibold uppercase leading-none tracking-[0.16em]">
          Sessão
        </p>
        <h2 className="mt-2 text-xl font-bold">Sua sessão está prestes a expirar.</h2>
        <p className="theme-muted mt-2 text-sm">
          Sua sessão expira em breve. Continue conectado agora ou encerre o acesso.
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
          <span className="text-3xl font-bold tabular-nums">{formatCountdown(remainingMs)}</span>
        </div>
        {renewError ? (
          <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm text-red-100">
            {renewError}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleRenewSession}
            disabled={renewingSession}
            className="rounded-lg bg-re7-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renewingSession ? "Renovando..." : "Continuar conectado"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="theme-nav-link rounded-lg border px-4 py-2.5 text-sm font-semibold"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (fullScreen) {
    return (
      <main className="theme-bg theme-inbox box-border h-[var(--app-viewport-height,100dvh)] max-h-[var(--app-viewport-height,100dvh)] w-full max-w-full overflow-hidden">
        <div className="grid h-[calc(100%-var(--safe-top))] w-full max-w-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden pt-[var(--safe-top)] md:h-full md:grid-cols-[72px_minmax(0,1fr)] md:grid-rows-1 md:pt-0">
          <aside className="relative order-2 hidden min-h-0 min-w-0 max-w-full flex-row items-center border-t border-white/10 bg-[#081327] px-2 py-2 pb-[calc(0.5rem+var(--safe-bottom))] md:order-none md:flex md:h-full md:flex-col md:border-r md:border-t-0 md:px-0 md:py-3 [@media(max-height:760px)]:md:py-2">
            <div className="relative hidden h-14 w-14 items-center justify-center rounded-2xl md:flex [@media(max-height:760px)]:h-11 [@media(max-height:760px)]:w-11">
              <button
                type="button"
                onClick={() => setShowMainMenuSubmenu((current) => !current)}
                title="Menu principal"
                aria-haspopup="menu"
                aria-expanded={showMainMenuSubmenu}
                className="flex h-full w-full items-center justify-center rounded-2xl transition hover:bg-white/5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/15 bg-white/10 text-2xl font-bold leading-none text-white/85 shadow-sm [@media(max-height:760px)]:h-9 [@media(max-height:760px)]:w-9 [@media(max-height:760px)]:rounded-xl [@media(max-height:760px)]:text-xl">
                  ☰
                </span>
              </button>
              {mainMenuSubmenu}
            </div>
            <nav className="flex min-h-0 w-full flex-1 items-center gap-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-4 md:flex-col md:gap-2 md:overflow-x-hidden md:overflow-y-auto md:px-2 md:[@media(max-height:760px)]:mt-2 md:[@media(max-height:760px)]:gap-1 [&::-webkit-scrollbar]:hidden">
              {visibleNavItems.filter((item) => item.href !== "/app/inbox").map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.labels[profile]}
                    className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold transition md:flex md:h-12 md:w-12 [@media(max-height:760px)]:md:h-9 [@media(max-height:760px)]:md:w-9 [@media(max-height:760px)]:md:rounded-xl ${
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
        {sessionRenewalModal}
      </main>
    );
  }

  return (
    <main className="theme-bg theme-workspace min-h-screen overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2.5">
        <header className="theme-surface-strong theme-shadow fixed left-3 right-3 top-[calc(0.5rem+var(--safe-top))] z-50 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-1.5 backdrop-blur sm:left-4 sm:right-4 sm:w-[calc(100%-2rem)] lg:left-5 lg:right-5 lg:top-2 lg:w-[calc(100%-2.5rem)]">
          <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[82px_minmax(0,1fr)_minmax(190px,auto)] lg:items-center lg:gap-2 min-[1441px]:grid-cols-[128px_minmax(0,1fr)_minmax(230px,auto)] min-[1441px]:gap-3">
            <div className="flex min-w-0 items-center justify-between gap-2 lg:flex lg:justify-center">
              {logoButton}
              <div className="min-w-0 lg:hidden">
                {userActions}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:justify-center lg:gap-2 min-[1441px]:grid-cols-[auto_auto_auto] min-[1441px]:gap-3">
              <div className={navGroupClasses}>
                <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                  Operação
                </p>
                <div className={navLinksClasses}>
                  {renderNavLinks(operationItems, directNavLimits.operation, "operacao")}
                </div>
              </div>
              {administrationItems.length > 0 ? (
                <div className={navGroupClasses}>
                  <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
                    Administração
                  </p>
                  <div className={navLinksClasses}>
                    {renderNavLinks(administrationItems, directNavLimits.administration, "administracao")}
                  </div>
                </div>
              ) : null}
              <ThemeSelector variant="switch" className="justify-self-start" />
            </div>

            <div className="hidden min-w-0 lg:block">{userActions}</div>
          </div>
        </header>
        {!hideTitleBar ? (
          <section className={`${titleSurface === "strong" ? "theme-surface-strong" : "theme-surface"} theme-shadow fixed left-3 right-3 top-[calc(170px+var(--safe-top))] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-[1400px] rounded-xl border px-3 py-2 backdrop-blur sm:left-4 sm:right-4 sm:top-[calc(184px+var(--safe-top))] sm:w-[calc(100%-2rem)] sm:px-4 lg:left-5 lg:right-5 lg:top-[92px] lg:w-[calc(100%-2.5rem)] lg:py-1.5 min-[1441px]:top-[138px] min-[1441px]:py-2`}>
            <h1 className="text-base font-bold min-[1441px]:text-lg">{title}</h1>
            {subtitle ? <p className="theme-muted mt-0.5 text-xs min-[1441px]:text-sm">{subtitle}</p> : null}
          </section>
        ) : null}

        <div
          aria-hidden="true"
          className={
            hideTitleBar
              ? "h-[166px] sm:h-[178px] lg:h-[86px] min-[1441px]:h-[130px]"
              : "h-[230px] sm:h-[244px] lg:h-[144px] min-[1441px]:h-[196px]"
          }
        />

        {supportModeBanner}
        {children}
      </div>

      {brandModal}
      {sessionRenewalModal}
    </main>
  );
}
