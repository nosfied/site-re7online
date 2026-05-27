import crypto from "node:crypto";
import type { TenantConfig } from "../config/tenantConfig.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import type {
  ChannelPersistencePlan,
  ChannelPersistencePlanSummary,
  ChannelPersistenceSchemaChange,
} from "./channelPersistence.types.js";

type BuildChannelPersistencePlanOptions = {
  nowIso?: string;
};

const PERSISTENCE_ENTITIES = [
  "conversation",
  "runtime_state",
  "inbound_message",
  "lead",
  "contact",
] as const;

const MULTICHANNEL_SCHEMA_CHANGES: ChannelPersistenceSchemaChange[] = [
  {
    model: "Conversation",
    change: "Adicionar channel, provider, channelAccountId e externalUserHash/ref.",
    reason: "Identificar conversas por canal sem depender de waId.",
  },
  {
    model: "Conversation",
    change: "Criar indice unico por tenantKey + channel + provider + channelAccountId + externalUserHash/ref.",
    reason: "Evitar colisao entre tenants, contas e canais.",
  },
  {
    model: "ConversationRuntimeState",
    change: "Adicionar channel, provider, channelAccountId e externalUserHash/ref.",
    reason: "Carregar estado operacional multicanal sem chave legada WhatsApp.",
  },
  {
    model: "InboundMessage",
    change: "Adicionar channel, provider, channelAccountId, externalMessageId e externalUserHash/ref.",
    reason: "Persistir inbound de canais Meta sem armazenar identificador externo puro.",
  },
  {
    model: "Lead",
    change: "Adicionar identidade de canal ou relacionamento com ContactChannelIdentity.",
    reason: "Permitir CRM por contato multicanal sem sobrescrever telefone/waId.",
  },
  {
    model: "ContactChannelIdentity",
    change: "Criar modelo para tenantKey, channel, provider, channelAccountId, externalUserHash/ref e metadados.",
    reason: "Normalizar multiplas identidades de contato por tenant.",
  },
];

function normalizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function hashExternalUserId(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function createPlanId() {
  return `persist_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function cloneSchemaChanges() {
  return MULTICHANNEL_SCHEMA_CHANGES.map((item) => ({ ...item }));
}

export function buildChannelPersistencePlan(
  normalizedEvent: NormalizedInboundEvent,
  tenantConfig?: Pick<TenantConfig, "id" | "channelAccounts"> | null,
  options: BuildChannelPersistencePlanOptions = {}
): ChannelPersistencePlan {
  const tenantKey = normalizeText(normalizedEvent.tenantKey || tenantConfig?.id, 120) || "unknown";
  const channelAccountId = normalizeText(normalizedEvent.channelAccountId, 160) || "unknown";
  const externalUserId = normalizeText(normalizedEvent.externalUserId, 240);
  const externalUserHash = externalUserId ? hashExternalUserId(externalUserId) : "unknown";

  if (normalizedEvent.channel === "whatsapp") {
    const legacyWaId = externalUserId;
    return {
      id: createPlanId(),
      createdAt: options.nowIso ?? new Date().toISOString(),
      target: {
        tenantKey,
        channel: "whatsapp",
        provider: normalizedEvent.provider,
        channelAccountId,
        externalUserHash,
        ...(legacyWaId ? { legacyWaId } : {}),
      },
      strategy: legacyWaId ? "legacy_whatsapp" : "unsupported",
      wouldCreateOrUpdate: [...PERSISTENCE_ENTITIES],
      blockers: legacyWaId ? [] : ["legacy_waid_missing"],
      warnings: [],
      safeToPersistNow: Boolean(legacyWaId),
      passive: true,
    };
  }

  if (normalizedEvent.channel === "messenger" || normalizedEvent.channel === "instagram") {
    return {
      id: createPlanId(),
      createdAt: options.nowIso ?? new Date().toISOString(),
      target: {
        tenantKey,
        channel: normalizedEvent.channel,
        provider: normalizedEvent.provider,
        channelAccountId,
        externalUserHash,
      },
      strategy: "new_multichannel_required",
      wouldCreateOrUpdate: [...PERSISTENCE_ENTITIES],
      requiredSchemaChanges: cloneSchemaChanges(),
      blockers: ["schema_migration_required", "multichannel_persistence_not_implemented"],
      warnings: ["legacy_waid_not_available"],
      safeToPersistNow: false,
      passive: true,
    };
  }

  return {
    id: createPlanId(),
    createdAt: options.nowIso ?? new Date().toISOString(),
    target: {
      tenantKey,
      channel: normalizedEvent.channel,
      provider: normalizedEvent.provider,
      channelAccountId,
      externalUserHash,
    },
    strategy: "unsupported",
    wouldCreateOrUpdate: [],
    blockers: ["channel_not_supported"],
    warnings: [],
    safeToPersistNow: false,
    passive: true,
  };
}

export function summarizeChannelPersistencePlan(
  plan: ChannelPersistencePlan
): ChannelPersistencePlanSummary {
  return {
    strategy: plan.strategy,
    safeToPersistNow: plan.safeToPersistNow,
    blockers: [...plan.blockers],
    warnings: [...plan.warnings],
    requiredSchemaChangeCount: plan.requiredSchemaChanges?.length ?? 0,
    wouldCreateOrUpdate: [...plan.wouldCreateOrUpdate],
  };
}
