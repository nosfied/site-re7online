import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_BUSINESS_CLIENT_FEATURES,
  DEFAULT_GOVERNMENT_CLIENT_FEATURES,
  getClientProfile,
  resolveTenantCapabilities,
  type TenantCapabilityKey,
} from "./clientFeatures.js";

type FeatureCategory = "attendance" | "communication" | "management" | "security" | "automation";
type FeatureStatus = "enabled" | "disabled" | "unavailable";

type CatalogDependency =
  | "meta_cloud"
  | "webchat_channel"
  | "telegram_channel"
  | "whatsapp_web_session_channel"
  | "webhooks"
  | "scheduling"
  | "mfa";

export type TenantFeatureCatalogItem = {
  key: TenantCapabilityKey;
  label: string;
  description: string;
  category: FeatureCategory;
  technicalCapabilitySource: string;
  entitlementSource: "Client.features";
  runtimeDependency: string;
  frontendVisibilityGuard: string;
  backendGuard: string;
  defaultByProfile: Record<"business" | "government", boolean>;
  dependencies?: CatalogDependency[];
};

export type TenantFeatureEntitlementItem = TenantFeatureCatalogItem & {
  enabled: boolean;
  status: FeatureStatus;
  unavailableReasons: string[];
};

type ClientFeatureInput = {
  id: string;
  profile?: unknown;
  features?: unknown;
};

export const TENANT_FEATURE_CATALOG: TenantFeatureCatalogItem[] = [
  {
    key: "dashboard",
    label: "Painel",
    description: "Visão inicial com indicadores operacionais do tenant.",
    category: "management",
    technicalCapabilitySource: "Converta App",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência operacional externa.",
    frontendVisibilityGuard: "AppShell/dashboard",
    backendGuard: "Rotas /app/dashboard",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.dashboard,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.dashboard,
    },
  },
  {
    key: "inbox" as TenantCapabilityKey,
    label: "Inbox",
    description: "Atendimento em conversas recebidas pelos canais do tenant.",
    category: "attendance",
    technicalCapabilitySource: "Conversation + ConversationRuntimeState",
    entitlementSource: "Client.features",
    runtimeDependency: "Ao menos um canal operacional para receber conversas.",
    frontendVisibilityGuard: "Sempre visível no app operacional",
    backendGuard: "Rotas /app/inbox e /app/conversation",
    defaultByProfile: { business: true, government: true },
  },
  {
    key: "crm",
    label: "CRM",
    description: "Contatos, leads e histórico operacional do tenant.",
    category: "attendance",
    technicalCapabilitySource: "Lead + Contact read models",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/crm",
    backendGuard: "Rotas /app/crm",
    defaultByProfile: { business: true, government: false },
  },
  {
    key: "chatbot",
    label: "Chatbot",
    description: "Fluxos automáticos, menus e handoff para atendimento humano.",
    category: "automation",
    technicalCapabilitySource: "ChatbotFlow + runtime de automação",
    entitlementSource: "Client.features",
    runtimeDependency: "Flow ativo e canal compatível para operar.",
    frontendVisibilityGuard: "AppShell/chatbot",
    backendGuard: "Rotas /app/chatbot",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.chatbot,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.chatbot,
    },
  },
  {
    key: "templates",
    label: "Modelos Meta",
    description: "Catálogo e envio de templates aprovados pela Meta.",
    category: "communication",
    technicalCapabilitySource: "Meta Cloud API",
    entitlementSource: "Client.features",
    runtimeDependency: "Configuração Meta/WABA ativa.",
    frontendVisibilityGuard: "AppShell/templates",
    backendGuard: "Rotas /app/templates e envio de template",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.templates,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.templates,
    },
    dependencies: ["meta_cloud"],
  },
  {
    key: "cannedReplies",
    label: "Mensagens prontas",
    description: "Respostas internas reutilizáveis no atendimento.",
    category: "communication",
    technicalCapabilitySource: "TenantOperationalConfig.config.cannedReplies",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência operacional externa.",
    frontendVisibilityGuard: "AppShell/templates e Inbox",
    backendGuard: "Rotas /app/canned-replies e envio de mensagem pronta",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.cannedReplies,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.cannedReplies,
    },
  },
  {
    key: "campaigns",
    label: "Campanhas",
    description: "Envios de campanha por template Meta para audiências controladas.",
    category: "communication",
    technicalCapabilitySource: "Meta Cloud API + Campaign Runner",
    entitlementSource: "Client.features",
    runtimeDependency: "Configuração Meta/WABA ativa e templates aprovados.",
    frontendVisibilityGuard: "AppShell/campaigns",
    backendGuard: "Rotas /app/campaigns",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.campaigns,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.campaigns,
    },
    dependencies: ["meta_cloud"],
  },
  {
    key: "whatsappWebSession",
    label: "WhatsApp por sessão",
    description: "Transporte WhatsApp Business App por sessão controlada.",
    category: "communication",
    technicalCapabilitySource: "WEB_SESSION transport runtime",
    entitlementSource: "Client.features",
    runtimeDependency: "ChannelAccount whatsapp/web_session para operação.",
    frontendVisibilityGuard: "AppShell/settings/channels/whatsapp",
    backendGuard: "Rotas /app/settings/channels/whatsapp/web-session",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.whatsappWebSession,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.whatsappWebSession,
    },
  },
  {
    key: "browserPushNotifications",
    label: "Notificações do navegador",
    description: "Permite que usuários ativem notificações nativas do navegador para novas mensagens e atendimentos.",
    category: "communication",
    technicalCapabilitySource: "Web Push + Service Worker + PushSubscription",
    entitlementSource: "Client.features",
    runtimeDependency: "VAPID configurado e navegador compatível com notificações push.",
    frontendVisibilityGuard: "Controle de notificações da Inbox",
    backendGuard: "Rotas /app/push e envio Web Push",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.browserPushNotifications,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.browserPushNotifications,
    },
  },
  {
    key: "webchat",
    label: "Webchat",
    description: "Canal de atendimento incorporado em sites.",
    category: "communication",
    technicalCapabilitySource: "Webchat runtime",
    entitlementSource: "Client.features",
    runtimeDependency: "Configuração de widget/site quando em operação.",
    frontendVisibilityGuard: "AppShell/webchat",
    backendGuard: "Rotas /app/webchat e public widget",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.webchat,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.webchat,
    },
  },
  {
    key: "webchatOutbound",
    label: "Resposta pelo Webchat",
    description: "Envio ativo em conversas de Webchat.",
    category: "communication",
    technicalCapabilitySource: "Webchat outbound runtime",
    entitlementSource: "Client.features",
    runtimeDependency: "Webchat habilitado no tenant.",
    frontendVisibilityGuard: "Composer do Inbox",
    backendGuard: "Envio outbound Webchat",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.webchatOutbound,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.webchatOutbound,
    },
    dependencies: ["webchat_channel"],
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Canal Telegram para atendimento.",
    category: "communication",
    technicalCapabilitySource: "Telegram Bot API",
    entitlementSource: "Client.features",
    runtimeDependency: "Conta/canal Telegram configurado.",
    frontendVisibilityGuard: "AppShell/telegram",
    backendGuard: "Rotas Telegram",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.telegram,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.telegram,
    },
  },
  {
    key: "reports",
    label: "Relatórios",
    description: "Relatórios operacionais, SLA, atendentes e sessões.",
    category: "management",
    technicalCapabilitySource: "Read models e eventos operacionais",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/reports",
    backendGuard: "Rotas /app/reports",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.reports,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.reports,
    },
  },
  {
    key: "satisfaction",
    label: "Satisfação",
    description: "Pesquisa de satisfação após atendimentos.",
    category: "management",
    technicalCapabilitySource: "SatisfactionQuestion + SatisfactionSurvey + SatisfactionResponse",
    entitlementSource: "Client.features",
    runtimeDependency: "Política operacional configurada no app do tenant para envio automático.",
    frontendVisibilityGuard: "AppShell/satisfaction",
    backendGuard: "Rotas /app/satisfaction",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.satisfaction,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.satisfaction,
    },
  },
  {
    key: "training" as TenantCapabilityKey,
    label: "Treinamentos",
    description: "Central de aprendizagem interna do Converta.",
    category: "management",
    technicalCapabilitySource: "TrainingContent",
    entitlementSource: "Client.features",
    runtimeDependency: "Conteúdo publicado para exibição.",
    frontendVisibilityGuard: "Menu Ajuda e suporte",
    backendGuard: "Rotas /app/training",
    defaultByProfile: { business: true, government: true },
  },
  {
    key: "support" as TenantCapabilityKey,
    label: "Suporte da plataforma",
    description: "Abertura de chamados para a equipe RE7ONLINE.",
    category: "management",
    technicalCapabilitySource: "Support Gateway",
    entitlementSource: "Client.features",
    runtimeDependency: "Tenant de suporte da plataforma configurado.",
    frontendVisibilityGuard: "Menu Ajuda e suporte",
    backendGuard: "Rotas /app/support",
    defaultByProfile: { business: true, government: true },
  },
  {
    key: "departments",
    label: "Setores e filas",
    description: "Gestão de setores, filas e vínculo operacional de usuários.",
    category: "management",
    technicalCapabilitySource: "Department + Queue",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/settings/departments",
    backendGuard: "Rotas /app/settings/departments",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.departments,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.departments,
    },
  },
  {
    key: "users",
    label: "Usuários",
    description: "Gestão de usuários e permissões do tenant.",
    category: "management",
    technicalCapabilitySource: "User + memberships",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/settings/users",
    backendGuard: "Rotas /app/settings/users",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.users,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.users,
    },
  },
  {
    key: "operationsBoard",
    label: "Painel de operação",
    description: "Quadro operacional de acompanhamento de atendimento.",
    category: "management",
    technicalCapabilitySource: "Operations read model",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/operations",
    backendGuard: "Rotas /app/operations",
    defaultByProfile: { business: false, government: false },
  },
  {
    key: "knowledgeBase",
    label: "Base de conhecimento",
    description: "Artigos internos e conteúdo de apoio ao atendimento.",
    category: "automation",
    technicalCapabilitySource: "KnowledgeBase",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "AppShell/knowledge-base",
    backendGuard: "Rotas /app/knowledge-base",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.knowledgeBase,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.knowledgeBase,
    },
  },
  {
    key: "webhooks",
    label: "Webhooks",
    description: "Integrações por eventos externos do tenant.",
    category: "automation",
    technicalCapabilitySource: "Webhook dispatcher",
    entitlementSource: "Client.features",
    runtimeDependency: "Endpoints configurados para despacho.",
    frontendVisibilityGuard: "AppShell/webhooks",
    backendGuard: "Rotas /app/webhooks",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.webhooks,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.webhooks,
    },
  },
  {
    key: "mfa",
    label: "Autenticação em duas etapas",
    description: "Controles de MFA para acesso dos usuários.",
    category: "security",
    technicalCapabilitySource: "MFA service",
    entitlementSource: "Client.features",
    runtimeDependency: "Nenhuma dependência externa.",
    frontendVisibilityGuard: "Página Segurança",
    backendGuard: "Rotas /app/settings/security/mfa",
    defaultByProfile: {
      business: DEFAULT_BUSINESS_CLIENT_FEATURES.mfa,
      government: DEFAULT_GOVERNMENT_CLIENT_FEATURES.mfa,
    },
  },
];

export const TENANT_FEATURE_CATALOG_KEYS = new Set(
  TENANT_FEATURE_CATALOG.map((item) => item.key)
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneKnownAndUnknownFeatures(value: unknown) {
  return isRecord(value) ? { ...value } : {};
}

function dependencyUnavailableReasons(
  item: TenantFeatureCatalogItem,
  features: Record<string, boolean>,
  runtime: TenantFeatureRuntimeState
) {
  const reasons: string[] = [];
  for (const dependency of item.dependencies ?? []) {
    if (dependency === "meta_cloud" && !runtime.metaCloudConfigured) reasons.push("Meta Cloud nao configurado");
    if (dependency === "webchat_channel" && !features.webchat) reasons.push("Webchat desativado");
    if (dependency === "telegram_channel" && !features.telegram) reasons.push("Telegram desativado");
    if (dependency === "whatsapp_web_session_channel" && !runtime.whatsappWebSessionChannelPresent) {
      reasons.push("Canal WhatsApp por sessao ausente");
    }
    if (dependency === "webhooks" && !features.webhooks) reasons.push("Webhooks desativado");
    if (dependency === "scheduling" && !features.scheduling) reasons.push("Agenda desativada");
    if (dependency === "mfa" && !features.mfa) reasons.push("MFA desativado");
  }
  return reasons;
}

export type TenantFeatureRuntimeState = {
  metaCloudConfigured: boolean;
  whatsappWebSessionChannelPresent: boolean;
};

export async function getTenantFeatureRuntimeState(params: {
  prisma: PrismaClient;
  clientId: string;
}) {
  const [metaConfig, webSessionAccount] = await Promise.all([
    params.prisma.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: { id: true, wabaId: true, phoneNumberId: true },
    }),
    params.prisma.channelAccount.findFirst({
      where: { clientId: params.clientId, channel: "whatsapp", provider: "web_session" },
      select: { id: true },
    }),
  ]);
  return {
    metaCloudConfigured: Boolean(metaConfig?.wabaId || metaConfig?.phoneNumberId),
    whatsappWebSessionChannelPresent: Boolean(webSessionAccount),
  };
}

export function buildTenantFeatureEntitlements(params: {
  client: ClientFeatureInput;
  runtime: TenantFeatureRuntimeState;
}) {
  const features = resolveTenantCapabilities(params.client) as Record<string, boolean>;
  return TENANT_FEATURE_CATALOG.map((item) => {
    const unavailableReasons = dependencyUnavailableReasons(item, features, params.runtime);
    const enabled = features[item.key] === true;
    return {
      ...item,
      enabled,
      status: unavailableReasons.length > 0 ? "unavailable" : enabled ? "enabled" : "disabled",
      unavailableReasons,
    } satisfies TenantFeatureEntitlementItem;
  });
}

export function updateTenantFeatureOverrides(params: {
  currentFeatures: unknown;
  updates: unknown;
  client: ClientFeatureInput;
  runtime: TenantFeatureRuntimeState;
}) {
  if (!isRecord(params.updates)) {
    return { ok: false as const, status: 400, error: "invalid_features" };
  }
  const nextFeatures = cloneKnownAndUnknownFeatures(params.currentFeatures);
  const currentResolved = resolveTenantCapabilities(params.client) as Record<string, boolean>;
  const nextResolved = { ...currentResolved };
  const changed: Array<{ key: string; oldState: boolean; newState: boolean }> = [];

  for (const [key, value] of Object.entries(params.updates)) {
    if (!TENANT_FEATURE_CATALOG_KEYS.has(key as TenantCapabilityKey)) {
      return { ok: false as const, status: 400, error: "unknown_feature" };
    }
    if (typeof value !== "boolean") {
      return { ok: false as const, status: 400, error: "invalid_feature_value" };
    }
    nextResolved[key] = value;
    const oldState = currentResolved[key] === true;
    if (oldState !== value) {
      changed.push({ key, oldState, newState: value });
    }
    nextFeatures[key] = value;
  }

  for (const item of TENANT_FEATURE_CATALOG) {
    if (params.updates[item.key] !== true) continue;
    const reasons = dependencyUnavailableReasons(item, nextResolved, params.runtime);
    if (reasons.length > 0) {
      return {
        ok: false as const,
        status: 409,
        error: "feature_dependency_unavailable",
        feature: item.key,
      };
    }
  }

  return {
    ok: true as const,
    features: nextFeatures as Prisma.InputJsonObject,
    changed,
  };
}
