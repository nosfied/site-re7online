"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSession,
  AppWebchatAllowedDomain,
  AppWebchatSettings,
  AppWebchatSite,
  AppWebchatSiteStatus,
  clearAppSession,
  createAppWebchatAllowedDomain,
  createAppWebchatSite,
  fetchAppWebchat,
  loadAppSession,
  saveAppSession,
  updateAppWebchatAllowedDomain,
  updateAppWebchatSite,
  upsertAppWebchatSettings,
} from "@/lib/appClientApi";

type TabKey = "sites" | "settings" | "domains";

type SiteForm = {
  id: string;
  name: string;
  slug: string;
  status: AppWebchatSiteStatus;
};

type SettingsForm = {
  siteId: string;
  welcomeMessage: string;
  primaryColor: string;
  accentColor: string;
  position: string;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowAnonymous: boolean;
};

type DomainForm = {
  id: string;
  siteId: string;
  domain: string;
  active: boolean;
};

const SITE_EMPTY: SiteForm = {
  id: "",
  name: "",
  slug: "",
  status: "inactive",
};

const SETTINGS_EMPTY: SettingsForm = {
  siteId: "",
  welcomeMessage: "",
  primaryColor: "#111827",
  accentColor: "#2563eb",
  position: "bottom-right",
  collectName: true,
  collectEmail: false,
  collectPhone: false,
  allowAnonymous: true,
};

const DOMAIN_EMPTY: DomainForm = {
  id: "",
  siteId: "",
  domain: "",
  active: true,
};

function canManageWebchat(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessao expirada. Faca login novamente.";
  if (error.status === 403) return "Seu perfil nao tem permissao para gerenciar webchat.";
  if (error.errorCode === "feature_not_enabled") return "Webchat nao esta habilitado para este tenant.";
  if (error.errorCode === "duplicate_webchat_record") return "Ja existe um registro de webchat com estes dados.";
  if (error.errorCode?.endsWith("_not_found")) return "O registro selecionado nao pertence a este tenant ou nao existe.";
  return error.message || fallback;
}

function StatusPill({ status, active }: { status?: string; active?: boolean }) {
  const label =
    typeof active === "boolean"
      ? active
        ? "Ativo"
        : "Inativo"
      : status === "active"
        ? "Ativo"
        : status === "archived"
          ? "Arquivado"
          : "Inativo";
  return <span className="rounded-full border px-2 py-0.5 text-[11px] theme-muted">{label}</span>;
}

function toSettingsForm(siteId: string, settings?: AppWebchatSettings): SettingsForm {
  const theme = settings?.theme ?? {};
  return {
    siteId,
    welcomeMessage: settings?.welcomeMessage ?? "",
    primaryColor: typeof theme.primaryColor === "string" ? theme.primaryColor : SETTINGS_EMPTY.primaryColor,
    accentColor: typeof theme.accentColor === "string" ? theme.accentColor : SETTINGS_EMPTY.accentColor,
    position: typeof theme.position === "string" ? theme.position : SETTINGS_EMPTY.position,
    collectName: settings?.collectName ?? SETTINGS_EMPTY.collectName,
    collectEmail: settings?.collectEmail ?? SETTINGS_EMPTY.collectEmail,
    collectPhone: settings?.collectPhone ?? SETTINGS_EMPTY.collectPhone,
    allowAnonymous: settings?.allowAnonymous ?? SETTINGS_EMPTY.allowAnonymous,
  };
}

export default function WebchatPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [tab, setTab] = useState<TabKey>("sites");
  const [sites, setSites] = useState<AppWebchatSite[]>([]);
  const [settings, setSettings] = useState<AppWebchatSettings[]>([]);
  const [domains, setDomains] = useState<AppWebchatAllowedDomain[]>([]);
  const [siteForm, setSiteForm] = useState(SITE_EMPTY);
  const [settingsForm, setSettingsForm] = useState(SETTINGS_EMPTY);
  const [domainForm, setDomainForm] = useState(DOMAIN_EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadWebchat = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppWebchat(activeSession);
        setSites(response.sites);
        setSettings(response.settings);
        setDomains(response.allowedDomains);
        if (!settingsForm.siteId && response.sites[0]) {
          const siteId = response.sites[0].id;
          setSettingsForm(toSettingsForm(siteId, response.settings.find((item) => item.siteId === siteId)));
          setDomainForm((prev) => ({ ...prev, siteId }));
        }
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeError(typed, "Nao foi possivel carregar webchat."));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized, settingsForm.siteId]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canManageWebchat(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadWebchat(stored);
  }, [loadWebchat, router]);

  const activeSites = useMemo(() => sites.filter((site) => site.status === "active").length, [sites]);
  const activeDomains = useMemo(() => domains.filter((domain) => domain.active).length, [domains]);

  const saveSite = async () => {
    if (!session || !siteForm.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: siteForm.name,
        slug: siteForm.slug || undefined,
        status: siteForm.status,
      };
      if (siteForm.id) {
        await updateAppWebchatSite(session, siteForm.id, payload);
        setSuccess("Site atualizado.");
      } else {
        await createAppWebchatSite(session, payload);
        setSuccess("Site criado.");
      }
      setSiteForm(SITE_EMPTY);
      await loadWebchat(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar o site."));
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    if (!session || !settingsForm.siteId) return;
    setSaving(true);
    setError(null);
    try {
      await upsertAppWebchatSettings(session, {
        siteId: settingsForm.siteId,
        welcomeMessage: settingsForm.welcomeMessage || null,
        theme: {
          primaryColor: settingsForm.primaryColor,
          accentColor: settingsForm.accentColor,
          position: settingsForm.position,
        },
        collectName: settingsForm.collectName,
        collectEmail: settingsForm.collectEmail,
        collectPhone: settingsForm.collectPhone,
        allowAnonymous: settingsForm.allowAnonymous,
      });
      setSuccess("Configuracoes atualizadas.");
      await loadWebchat(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar as configuracoes."));
    } finally {
      setSaving(false);
    }
  };

  const saveDomain = async () => {
    if (!session || !domainForm.siteId || !domainForm.domain.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        siteId: domainForm.siteId,
        domain: domainForm.domain,
        active: domainForm.active,
      };
      if (domainForm.id) {
        await updateAppWebchatAllowedDomain(session, domainForm.id, payload);
        setSuccess("Dominio atualizado.");
      } else {
        await createAppWebchatAllowedDomain(session, payload);
        setSuccess("Dominio criado.");
      }
      setDomainForm({ ...DOMAIN_EMPTY, siteId: domainForm.siteId });
      await loadWebchat(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Nao foi possivel salvar o dominio."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) return <main className="min-h-screen bg-slate-950" />;

  return (
    <AppShell
      session={session}
      title="Webchat"
      subtitle="Sites, configuracoes e dominios permitidos por tenant."
    >
      <div className="space-y-4">
        <FeedbackToast message={success} variant="success" {...toastHandlers} />
        <FeedbackToast message={error} variant="error" {...toastHandlers} />

        <section className="grid gap-3 md:grid-cols-3">
          <Metric label="Sites" value={sites.length} />
          <Metric label="Sites ativos" value={activeSites} />
          <Metric label="Dominios ativos" value={activeDomains} />
        </section>

        <section className="rounded-lg border theme-surface p-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["sites", "Sites"],
              ["settings", "Configuracoes"],
              ["domains", "Dominios"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`rounded-md px-3 py-2 text-sm ${tab === key ? "theme-nav-link-active" : "theme-nav-link"}`}
                onClick={() => setTab(key as TabKey)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {loading ? <p className="theme-muted">Carregando webchat...</p> : null}

        {tab === "sites" ? (
          <TwoColumn>
            <Panel title={siteForm.id ? "Editar site" : "Novo site"}>
              <TextInput label="Nome" value={siteForm.name} onChange={(name) => setSiteForm((prev) => ({ ...prev, name }))} />
              <TextInput label="Slug" value={siteForm.slug} onChange={(slug) => setSiteForm((prev) => ({ ...prev, slug }))} />
              <StatusSelect value={siteForm.status} onChange={(status) => setSiteForm((prev) => ({ ...prev, status }))} />
              <button className="theme-button-primary h-10 rounded-md px-4 text-sm" disabled={saving || !siteForm.name.trim()} onClick={saveSite}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </Panel>
            <Panel title="Sites cadastrados">
              <ListEmpty visible={!sites.length} label="Nenhum site cadastrado." />
              {sites.map((site) => (
                <ListItem key={site.id} title={site.name} subtitle={site.slug} onEdit={() => setSiteForm({ id: site.id, name: site.name, slug: site.slug, status: site.status })}>
                  <StatusPill status={site.status} />
                </ListItem>
              ))}
            </Panel>
          </TwoColumn>
        ) : null}

        {tab === "settings" ? (
          <TwoColumn>
            <Panel title="Configuracoes">
              <SelectInput
                label="Site"
                value={settingsForm.siteId}
                onChange={(siteId) => setSettingsForm(toSettingsForm(siteId, settings.find((item) => item.siteId === siteId)))}
                options={sites.map((site) => ({ value: site.id, label: site.name }))}
              />
              <TextArea label="Mensagem inicial" value={settingsForm.welcomeMessage} onChange={(welcomeMessage) => setSettingsForm((prev) => ({ ...prev, welcomeMessage }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput label="Cor primaria" value={settingsForm.primaryColor} onChange={(primaryColor) => setSettingsForm((prev) => ({ ...prev, primaryColor }))} />
                <TextInput label="Cor de destaque" value={settingsForm.accentColor} onChange={(accentColor) => setSettingsForm((prev) => ({ ...prev, accentColor }))} />
              </div>
              <TextInput label="Posicao" value={settingsForm.position} onChange={(position) => setSettingsForm((prev) => ({ ...prev, position }))} />
              <CheckInput label="Coletar nome" checked={settingsForm.collectName} onChange={(collectName) => setSettingsForm((prev) => ({ ...prev, collectName }))} />
              <CheckInput label="Coletar email" checked={settingsForm.collectEmail} onChange={(collectEmail) => setSettingsForm((prev) => ({ ...prev, collectEmail }))} />
              <CheckInput label="Coletar telefone" checked={settingsForm.collectPhone} onChange={(collectPhone) => setSettingsForm((prev) => ({ ...prev, collectPhone }))} />
              <CheckInput label="Permitir anonimo" checked={settingsForm.allowAnonymous} onChange={(allowAnonymous) => setSettingsForm((prev) => ({ ...prev, allowAnonymous }))} />
              <button className="theme-button-primary h-10 rounded-md px-4 text-sm" disabled={saving || !settingsForm.siteId} onClick={saveSettings}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </Panel>
            <Panel title="Configuracoes salvas">
              <ListEmpty visible={!settings.length} label="Nenhuma configuracao cadastrada." />
              {settings.map((item) => {
                const site = sites.find((candidate) => candidate.id === item.siteId);
                return (
                  <ListItem key={item.id} title={site?.name ?? "Site"} subtitle={item.welcomeMessage ?? "Sem mensagem inicial"} onEdit={() => setSettingsForm(toSettingsForm(item.siteId, item))}>
                    <StatusPill active={item.allowAnonymous} />
                  </ListItem>
                );
              })}
            </Panel>
          </TwoColumn>
        ) : null}

        {tab === "domains" ? (
          <TwoColumn>
            <Panel title={domainForm.id ? "Editar dominio" : "Novo dominio"}>
              <SelectInput
                label="Site"
                value={domainForm.siteId}
                onChange={(siteId) => setDomainForm((prev) => ({ ...prev, siteId }))}
                options={sites.map((site) => ({ value: site.id, label: site.name }))}
              />
              <TextInput label="Dominio" value={domainForm.domain} onChange={(domain) => setDomainForm((prev) => ({ ...prev, domain }))} />
              <CheckInput label="Ativo" checked={domainForm.active} onChange={(active) => setDomainForm((prev) => ({ ...prev, active }))} />
              <button className="theme-button-primary h-10 rounded-md px-4 text-sm" disabled={saving || !domainForm.siteId || !domainForm.domain.trim()} onClick={saveDomain}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </Panel>
            <Panel title="Dominios permitidos">
              <ListEmpty visible={!domains.length} label="Nenhum dominio cadastrado." />
              {domains.map((domain) => {
                const site = sites.find((candidate) => candidate.id === domain.siteId);
                return (
                  <ListItem key={domain.id} title={domain.domain} subtitle={site?.name ?? "Site"} onEdit={() => setDomainForm({ id: domain.id, siteId: domain.siteId, domain: domain.domain, active: domain.active })}>
                    <StatusPill active={domain.active} />
                  </ListItem>
                );
              })}
            </Panel>
          </TwoColumn>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border theme-surface p-4">
      <p className="text-xs uppercase theme-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold theme-text">{value}</p>
    </div>
  );
}

function TwoColumn({ children }: { children: ReactNode }) {
  return <section className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">{children}</section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border theme-surface p-4">
      <h2 className="text-base font-semibold theme-text">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function ListItem({
  title,
  subtitle,
  children,
  onEdit,
}: {
  title: string;
  subtitle?: string | null;
  children?: ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border theme-card p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium theme-text">{title}</p>
        {subtitle ? <p className="truncate text-xs theme-muted">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <button className="theme-button-secondary h-8 rounded-md px-3 text-xs" onClick={onEdit}>
          Editar
        </button>
      </div>
    </div>
  );
}

function ListEmpty({ visible, label }: { visible: boolean; label: string }) {
  return visible ? <p className="rounded-md border border-dashed p-4 text-sm theme-muted">{label}</p> : null;
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm theme-text">
      <span className="theme-muted">{label}</span>
      <input className="mt-1 w-full rounded-md border theme-input px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm theme-text">
      <span className="theme-muted">{label}</span>
      <textarea className="mt-1 min-h-24 w-full rounded-md border theme-input px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm theme-text">
      <span className="theme-muted">{label}</span>
      <select className="mt-1 w-full rounded-md border theme-input px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusSelect({ value, onChange }: { value: AppWebchatSiteStatus; onChange: (value: AppWebchatSiteStatus) => void }) {
  return (
    <label className="block text-sm theme-text">
      <span className="theme-muted">Status</span>
      <select className="mt-1 w-full rounded-md border theme-input px-3 py-2" value={value} onChange={(event) => onChange(event.target.value as AppWebchatSiteStatus)}>
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
        <option value="archived">Arquivado</option>
      </select>
    </label>
  );
}

function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm theme-text">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
