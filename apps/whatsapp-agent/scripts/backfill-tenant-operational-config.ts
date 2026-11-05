#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { normalizeQualificationSchema } from "../src/agent/qualification.js";
import { env } from "../src/config/env.js";
import { readAuthenticatedTenantJsonSource } from "../src/config/authenticatedTenantJsonSource.js";
import { readAuthenticatedPrivateJsonSource } from "../src/config/authenticatedPrivateJsonSource.js";
import { classifyTenantMetaParticipation } from "../src/config/tenantMetaParticipation.js";
import {
  normalizeTenantOperationalConfigFieldSelection,
  normalizeTenantOperationalConfigSelection,
  selectedTenantOperationalConfigKeys,
  validateTenantOperationalConfigPlan,
  type OwnerAuthorizedBaseConfig,
  type TenantOperationalConfigFieldSelection,
  type TenantOperationalConfigPlanDocument,
} from "../src/config/tenantOperationalConfigMigrationPlan.js";
import {
  normalizeAiAssistantIntentCatalog,
  normalizeCrmBusinessStatuses,
  normalizeHandoffLeadNotificationRecipients,
  normalizeTenantMediaHandoffPolicy,
} from "../src/config/tenantConfig.js";

type Options = {
  json: boolean;
  tenants?: string[];
  dryRun: boolean;
  source: string;
  expectedSourceSha256: string;
  plan?: string;
  expectedPlanSha256?: string;
  fields?: TenantOperationalConfigFieldSelection[];
};

type BackfillItem = {
  tenantKey: string;
  clientId: string | null;
  action: "would_upsert" | "upserted" | "unchanged" | "skipped_missing_client";
  fieldsChanged: string[];
  statusCount?: number;
  manualHandoffTemplate?: string | null;
  followUp?: ReturnType<typeof normalizeFollowUp>;
  handoffLeadNotification?: ReturnType<typeof normalizeHandoffLeadNotification>;
  mediaHandoffPolicy?: ReturnType<typeof normalizeTenantMediaHandoffPolicy>;
  planLimits?: ReturnType<typeof normalizePlanLimits>;
  automationFlags?: ReturnType<typeof normalizeAutomationFlags>;
  aiAssistantConfig?: ReturnType<typeof summarizeAiAssistantConfig>;
  aiIntentQualification?: ReturnType<typeof summarizeAiIntentQualification>;
  baseConfig: ReturnType<typeof summarizeBaseConfig>;
  provenance: "HISTORICAL_SOURCE" | "OWNER_AUTHORIZED_DB_IDENTITY";
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    dryRun: false,
    source: "",
    expectedSourceSha256: "",
  };
  const tenantValues: string[] = [];
  const fieldValues: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--json":
        options.json = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--tenant":
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
        tenantValues.push(next);
        index += 1;
        break;
      case "--field":
        if (!next || next.startsWith("--")) throw new Error("--field exige um valor");
        fieldValues.push(next);
        index += 1;
        break;
      case "--source":
        if (!next || next.startsWith("--")) throw new Error("--source exige um valor");
        options.source = next;
        index += 1;
        break;
      case "--expected-source-sha256":
        if (!next || !/^[a-f0-9]{64}$/i.test(next)) {
          throw new Error("--expected-source-sha256 exige SHA-256 hexadecimal");
        }
        options.expectedSourceSha256 = next.toLowerCase();
        index += 1;
        break;
      case "--plan":
        if (!next || next.startsWith("--")) throw new Error("--plan exige um valor");
        options.plan = next;
        index += 1;
        break;
      case "--expected-plan-sha256":
        if (!next || !/^[a-f0-9]{64}$/i.test(next)) {
          throw new Error("--expected-plan-sha256 exige SHA-256 hexadecimal");
        }
        options.expectedPlanSha256 = next.toLowerCase();
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  if (!path.isAbsolute(options.source)) throw new Error("source_must_be_absolute");
  if (!options.expectedSourceSha256) throw new Error("expected_source_sha256_required");
  if (Boolean(options.plan) !== Boolean(options.expectedPlanSha256)) throw new Error("plan_and_expected_sha256_required_together");
  if (options.plan && !path.isAbsolute(options.plan)) throw new Error("plan_must_be_absolute");
  if (options.plan && tenantValues.length === 0) throw new Error("plan_requires_tenant_selection");
  if (tenantValues.length > 0) options.tenants = normalizeTenantOperationalConfigSelection(tenantValues);
  if (fieldValues.length > 0) {
    options.fields = normalizeTenantOperationalConfigFieldSelection(fieldValues);
    if (options.tenants?.length !== 1) throw new Error("field_selection_requires_exactly_one_tenant");
  }
  return options;
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function normalizeManualHandoffTemplate(input: unknown) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value.slice(0, 120) : null;
}

function normalizePositiveInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(1, Math.floor(input));
}

function normalizeNonNegativeInteger(input: unknown, fallback: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(0, Math.floor(input));
}

function normalizeTemplateName(input: unknown) {
  if (typeof input !== "string") return "";
  const value = input.trim();
  return /^[a-z0-9_]+$/.test(value) ? value.slice(0, 120) : "";
}

function normalizeTemplateLang(input: unknown, fallback?: string | null) {
  const value = typeof input === "string" ? input.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(value)) return value;
  const fallbackValue = typeof fallback === "string" ? fallback.trim() : "";
  if (/^[a-z]{2}_[A-Z]{2}$/.test(fallbackValue)) return fallbackValue;
  return env.OUTBOUND_TEMPLATE_DEFAULT_LANG;
}

function normalizeFollowUp(tenant: {
  followUpEnabled?: boolean;
  followUpDelayMinutes?: number;
  followUpMaxCount?: number;
  followUpUseTemplate?: boolean;
  followUpTemplateName?: string;
  followUpTemplateLang?: string;
  defaultLanguage?: string;
}) {
  return {
    enabled: tenant.followUpEnabled === true,
    delayMinutes: normalizePositiveInteger(tenant.followUpDelayMinutes, env.FOLLOWUP_DEFAULT_DELAY_MINUTES),
    maxCount: normalizeNonNegativeInteger(tenant.followUpMaxCount, env.FOLLOWUP_MAX_PER_CONVERSATION),
    useTemplate: tenant.followUpUseTemplate === true,
    templateName: normalizeTemplateName(tenant.followUpTemplateName),
    templateLang: normalizeTemplateLang(tenant.followUpTemplateLang, tenant.defaultLanguage),
  };
}

function normalizeHandoffLeadNotification(tenant: {
  handoffLeadNotificationEnabled?: boolean;
  handoffLeadNotificationRecipients?: unknown;
}) {
  return {
    enabled: tenant.handoffLeadNotificationEnabled === true,
    recipients: normalizeHandoffLeadNotificationRecipients(tenant.handoffLeadNotificationRecipients),
  };
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value ? value.slice(0, maxLength) : null;
}

function normalizeOptionalNonNegativeNumber(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) return null;
  return Math.floor(input);
}

function normalizeQuotaWarnAtPct(input: unknown) {
  if (typeof input !== "number" || !Number.isFinite(input)) return 0.8;
  return Math.min(1, Math.max(0, input));
}

function normalizeQuotaExcludeWaIds(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((waId) => (typeof waId === "string" ? waId.replace(/\D/g, "") : ""))
        .filter(Boolean)
    )
  );
}

function normalizePlanLimits(tenant: {
  planName?: string;
  messagesLimit?: number;
  quotaMonthlyConversations?: number;
  quotaWarnAtPct?: number;
  quotaBlockedReplyText?: string;
  quotaExcludeWaIds?: string[];
}) {
  return {
    planName: normalizeOptionalText(tenant.planName, 80),
    messagesLimit: normalizeOptionalNonNegativeNumber(tenant.messagesLimit),
    quotaMonthlyConversations: normalizeOptionalNonNegativeNumber(tenant.quotaMonthlyConversations),
    quotaWarnAtPct: normalizeQuotaWarnAtPct(tenant.quotaWarnAtPct),
    quotaBlockedReplyText: normalizeOptionalText(tenant.quotaBlockedReplyText, 1000),
    quotaExcludeWaIds: normalizeQuotaExcludeWaIds(tenant.quotaExcludeWaIds),
  };
}

function normalizeAutomationFlags(tenant: {
  disableChatbot?: boolean;
  disableAiFallback?: boolean;
  disableIntentClassifier?: boolean;
  disableLegacyFlows?: boolean;
  disableChatbotFlowEditing?: boolean;
}) {
  return {
    disableChatbot: tenant.disableChatbot === true,
    disableAiFallback: tenant.disableAiFallback === true,
    disableIntentClassifier: tenant.disableIntentClassifier === true,
    disableLegacyFlows: tenant.disableLegacyFlows !== false,
    disableChatbotFlowEditing: tenant.disableChatbotFlowEditing === true,
  };
}

function normalizeBaseConfig(tenant: {
  allowlist?: string[];
  handoffAttendantWaid?: string;
  defaultLanguage?: string;
  disableAutoReply?: boolean;
}) {
  return {
    allowlist: normalizeQuotaExcludeWaIds(tenant.allowlist),
    handoffAttendantWaid: typeof tenant.handoffAttendantWaid === "string"
      ? tenant.handoffAttendantWaid.replace(/\D/g, "")
      : "",
    defaultLanguage: typeof tenant.defaultLanguage === "string" && /^[a-z]{2}_[A-Z]{2}$/.test(tenant.defaultLanguage.trim())
      ? tenant.defaultLanguage.trim()
      : env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
    disableAutoReply: tenant.disableAutoReply === true,
  };
}

function summarizeBaseConfig(config: ReturnType<typeof normalizeBaseConfig>) {
  return {
    allowlistCount: config.allowlist.length,
    hasHandoffAttendant: Boolean(config.handoffAttendantWaid),
    defaultLanguage: config.defaultLanguage,
    disableAutoReply: config.disableAutoReply,
  };
}

function normalizeAiAssistantProfile(input: unknown) {
  if (input === "government" || input === "legal_previdenciario") return input;
  return "business";
}

function normalizeAiAssistantText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function normalizeAiAssistantTermList(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((term) => (typeof term === "string" ? term.trim() : ""))
        .filter(Boolean)
        .map((term) => term.slice(0, 120))
    )
  );
}

function normalizeAiAssistantConfig(tenant: {
  aiAssistantEnabled?: boolean;
  aiAssistantFallbackToHandoff?: boolean;
  aiBusinessContext?: string;
  aiAssistantSystemPrompt?: string;
  aiAssistantGreetingMessage?: string;
  aiAssistantFallbackMessage?: string;
  aiAssistantHandoffPrompt?: string;
  aiAssistantAllowedTopics?: string[];
  aiAssistantSecondaryTopics?: string[];
  aiAssistantBlockedTerms?: string[];
  aiAssistantHandoffKeywords?: string[];
  aiAssistantMaxReplies?: number;
  aiAssistantProfile?: string;
}) {
  return {
    aiAssistantEnabled: tenant.aiAssistantEnabled === true,
    aiAssistantFallbackToHandoff: tenant.aiAssistantFallbackToHandoff === true,
    aiBusinessContext: normalizeAiAssistantText(tenant.aiBusinessContext, 4000),
    aiAssistantSystemPrompt: normalizeAiAssistantText(tenant.aiAssistantSystemPrompt, 4000),
    aiAssistantGreetingMessage: normalizeAiAssistantText(tenant.aiAssistantGreetingMessage, 1000),
    aiAssistantFallbackMessage: normalizeAiAssistantText(tenant.aiAssistantFallbackMessage, 1000),
    aiAssistantHandoffPrompt: normalizeAiAssistantText(tenant.aiAssistantHandoffPrompt, 1000),
    aiAssistantAllowedTopics: normalizeAiAssistantTermList(tenant.aiAssistantAllowedTopics),
    aiAssistantSecondaryTopics: normalizeAiAssistantTermList(tenant.aiAssistantSecondaryTopics),
    aiAssistantBlockedTerms: normalizeAiAssistantTermList(tenant.aiAssistantBlockedTerms),
    aiAssistantHandoffKeywords: normalizeAiAssistantTermList(tenant.aiAssistantHandoffKeywords),
    aiAssistantMaxReplies: normalizeNonNegativeInteger(tenant.aiAssistantMaxReplies, 2),
    aiAssistantProfile: normalizeAiAssistantProfile(tenant.aiAssistantProfile),
  };
}

function summarizeAiAssistantConfig(config: ReturnType<typeof normalizeAiAssistantConfig>) {
  return {
    aiAssistantEnabled: config.aiAssistantEnabled,
    aiAssistantFallbackToHandoff: config.aiAssistantFallbackToHandoff,
    hasBusinessContext: Boolean(config.aiBusinessContext),
    hasSystemPrompt: Boolean(config.aiAssistantSystemPrompt),
    hasGreetingMessage: Boolean(config.aiAssistantGreetingMessage),
    hasFallbackMessage: Boolean(config.aiAssistantFallbackMessage),
    hasHandoffPrompt: Boolean(config.aiAssistantHandoffPrompt),
    allowedTopicsCount: config.aiAssistantAllowedTopics.length,
    secondaryTopicsCount: config.aiAssistantSecondaryTopics.length,
    blockedTermsCount: config.aiAssistantBlockedTerms.length,
    handoffKeywordsCount: config.aiAssistantHandoffKeywords.length,
    aiAssistantMaxReplies: config.aiAssistantMaxReplies,
    aiAssistantProfile: config.aiAssistantProfile,
  };
}

function normalizeAiIntentQualification(tenant: {
  aiAssistantIntentCatalog?: unknown;
  aiQualification?: unknown;
}) {
  return {
    aiAssistantIntentCatalog: normalizeAiAssistantIntentCatalog(tenant.aiAssistantIntentCatalog),
    aiQualification: normalizeQualificationSchema(tenant.aiQualification) ?? null,
  };
}

function summarizeAiIntentQualification(config: ReturnType<typeof normalizeAiIntentQualification>) {
  return {
    intentCatalogCount: config.aiAssistantIntentCatalog.length,
    qualificationEnabled: config.aiQualification?.enabled === true,
    qualificationSlotCount: config.aiQualification?.slots?.length ?? 0,
    qualificationHandoffWhenCount: config.aiQualification?.handoffWhen?.length ?? 0,
    qualificationOutcomeCount: config.aiQualification?.outcomes?.length ?? 0,
  };
}

function mergeConfig(
  current: unknown,
  baseConfig: ReturnType<typeof normalizeBaseConfig>,
  crmBusinessStatuses: unknown,
  manualHandoffTemplate: string | null,
  followUp: ReturnType<typeof normalizeFollowUp>,
  handoffLeadNotification: ReturnType<typeof normalizeHandoffLeadNotification>,
  mediaHandoffPolicy: ReturnType<typeof normalizeTenantMediaHandoffPolicy>,
  planLimits: ReturnType<typeof normalizePlanLimits>,
  automationFlags: ReturnType<typeof normalizeAutomationFlags>,
  aiAssistantConfig: ReturnType<typeof normalizeAiAssistantConfig>,
  aiIntentQualification: ReturnType<typeof normalizeAiIntentQualification>
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  base.baseConfig = baseConfig;
  base.crmBusinessStatuses = crmBusinessStatuses;
  if (manualHandoffTemplate) {
    const currentTemplates =
      base.templates && typeof base.templates === "object" && !Array.isArray(base.templates)
        ? { ...(base.templates as Record<string, unknown>) }
        : {};
    base.templates = {
      ...currentTemplates,
      manualHandoff: manualHandoffTemplate,
    };
  }
  base.followUp = followUp;
  base.handoffLeadNotification = handoffLeadNotification;
  base.mediaHandoffPolicy = mediaHandoffPolicy;
  base.planLimits = planLimits;
  base.automationFlags = automationFlags;
  base.aiAssistantConfig = aiAssistantConfig;
  base.aiIntentQualification = aiIntentQualification;
  return base as Prisma.InputJsonValue;
}

const MANAGED_CONFIG_FIELDS = [
  "baseConfig",
  "crmBusinessStatuses",
  "templates",
  "followUp",
  "handoffLeadNotification",
  "mediaHandoffPolicy",
  "planLimits",
  "automationFlags",
  "aiAssistantConfig",
  "aiIntentQualification",
] as const;

function changedManagedFields(current: unknown, next: unknown) {
  const currentRecord = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  const nextRecord = next && typeof next === "object" && !Array.isArray(next)
    ? next as Record<string, unknown>
    : {};
  return MANAGED_CONFIG_FIELDS.filter((field) => !isDeepStrictEqual(currentRecord[field], nextRecord[field]));
}

function selectManagedFields(
  current: unknown,
  next: Prisma.InputJsonValue,
  fields?: readonly TenantOperationalConfigFieldSelection[]
): Prisma.InputJsonValue {
  if (!fields) return next;
  const currentRecord = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  const nextRecord = next && typeof next === "object" && !Array.isArray(next)
    ? next as Record<string, unknown>
    : {};
  for (const field of fields) currentRecord[field] = nextRecord[field];
  return currentRecord as Prisma.InputJsonValue;
}

function normalizedManagedValues(tenant: Record<string, unknown>) {
  return {
    baseConfig: normalizeBaseConfig(tenant),
    statuses: normalizeCrmBusinessStatuses(tenant.crmBusinessStatuses),
    manualHandoffTemplate: normalizeManualHandoffTemplate(
      (tenant.templates as { manualHandoff?: unknown } | undefined)?.manualHandoff
    ),
    followUp: normalizeFollowUp(tenant),
    handoffLeadNotification: normalizeHandoffLeadNotification(tenant),
    mediaHandoffPolicy: normalizeTenantMediaHandoffPolicy(tenant.mediaHandoffPolicy),
    planLimits: normalizePlanLimits(tenant),
    automationFlags: normalizeAutomationFlags(tenant),
    aiAssistantConfig: normalizeAiAssistantConfig(tenant),
    aiIntentQualification: normalizeAiIntentQualification(tenant),
  };
}

function mergedManagedConfig(current: unknown, values: ReturnType<typeof normalizedManagedValues>) {
  return mergeConfig(
    current,
    values.baseConfig,
    values.statuses,
    values.manualHandoffTemplate,
    values.followUp,
    values.handoffLeadNotification,
    values.mediaHandoffPolicy,
    values.planLimits,
    values.automationFlags,
    values.aiAssistantConfig,
    values.aiIntentQualification
  );
}

function mergedOwnerAuthorizedConfig(current: unknown, baseConfig: OwnerAuthorizedBaseConfig): Prisma.InputJsonValue {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  base.baseConfig = {
    allowlist: [...baseConfig.allowlist],
    handoffAttendantWaid: baseConfig.handoffAttendantWaid,
    defaultLanguage: baseConfig.defaultLanguage,
    disableAutoReply: baseConfig.disableAutoReply,
  };
  return base as Prisma.InputJsonValue;
}

function backfillItem(params: {
  tenantKey: string;
  clientId: string;
  current: unknown;
  next: unknown;
  values?: ReturnType<typeof normalizedManagedValues>;
  baseConfig: ReturnType<typeof normalizeBaseConfig> | OwnerAuthorizedBaseConfig;
  provenance: "HISTORICAL_SOURCE" | "OWNER_AUTHORIZED_DB_IDENTITY";
  dryRun: boolean;
}): BackfillItem {
  const fieldsChanged = changedManagedFields(params.current, params.next);
  const item: BackfillItem = {
    tenantKey: params.tenantKey,
    clientId: params.clientId,
    action: fieldsChanged.length === 0 ? "unchanged" : params.dryRun ? "would_upsert" : "upserted",
    fieldsChanged,
    baseConfig: summarizeBaseConfig(params.baseConfig),
    provenance: params.provenance,
  };
  if (params.values) Object.assign(item, {
    statusCount: params.values.statuses.length,
    manualHandoffTemplate: params.values.manualHandoffTemplate,
    followUp: params.values.followUp,
    handoffLeadNotification: params.values.handoffLeadNotification,
    mediaHandoffPolicy: params.values.mediaHandoffPolicy,
    planLimits: params.values.planLimits,
    automationFlags: params.values.automationFlags,
    aiAssistantConfig: summarizeAiAssistantConfig(params.values.aiAssistantConfig),
    aiIntentQualification: summarizeAiIntentQualification(params.values.aiIntentQualification),
  });
  return item;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const startedAt = Date.now();
  try {
    const tenants = await readAuthenticatedTenantJsonSource({
      source: options.source,
      expectedSha256: options.expectedSourceSha256,
    });
    let planDocument: TenantOperationalConfigPlanDocument | undefined;
    if (options.plan && options.expectedPlanSha256) {
      const rawPlan = await readAuthenticatedPrivateJsonSource<unknown>({
        source: options.plan,
        expectedSha256: options.expectedPlanSha256,
      });
      planDocument = validateTenantOperationalConfigPlan({
        document: rawPlan,
        expectedSourceSha256: options.expectedSourceSha256,
        sourceTenantKeys: Object.keys(tenants),
      });
    }
    const clientKeys = selectedTenantOperationalConfigKeys({
      sourceTenantKeys: Object.keys(tenants),
      plan: planDocument,
      selectedTenants: options.tenants,
    });

    const items = await prisma.$transaction(async (tx) => {
      const clients = await tx.client.findMany({
        where: { clientKey: { in: clientKeys } },
        select: { id: true, clientKey: true },
      });
      const clientsByKey = new Map(clients.map((client) => [client.clientKey, client]));
      const missingClients = clientKeys.filter((tenantKey) => !clientsByKey.has(tenantKey));
      if (missingClients.length > 0) throw new Error(`source_tenant_missing_client:${missingClients.sort().join(",")}`);
      const clientsInLockOrder = [...clients].sort((left, right) => left.id.localeCompare(right.id));
      if (!options.dryRun) {
        for (const client of clientsInLockOrder) {
          const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id FROM "Client" WHERE id = ${client.id}::uuid FOR UPDATE
          `);
          if (locked.length !== 1) throw new Error(`source_tenant_client_changed:${client.clientKey}`);
        }
        for (const client of clientsInLockOrder) {
          await tx.$queryRaw(Prisma.sql`
            SELECT id FROM "TenantOperationalConfig"
            WHERE "clientId" = ${client.id}::uuid
            FOR UPDATE
          `);
        }
      }
      const clientIds = clientsInLockOrder.map((client) => client.id);
      const [operationalConfigs, channelAccounts, phoneNumbers, metaConfigs] = await Promise.all([
        tx.tenantOperationalConfig.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, config: true },
        }),
        tx.channelAccount.findMany({
          where: { clientId: { in: clientIds }, channel: "whatsapp", provider: "meta" },
          select: { clientId: true, channelAccountId: true, aiEnabled: true, aliases: { select: { alias: true } } },
        }),
        tx.waPhoneNumber.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, phoneNumberId: true },
        }),
        tx.tenantMetaConfig.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, phoneNumberId: true },
        }),
      ]);
      const configsByClient = new Map(operationalConfigs.map((config) => [config.clientId, config.config]));
      const prepared = clientKeys.map((tenantKey) => {
        const client = clientsByKey.get(tenantKey)!;
        const current = configsByClient.get(client.id) ?? {};
        const tenant = tenants[tenantKey] as Record<string, unknown> | undefined;
        const clientMetaAccounts = channelAccounts.filter((account) => account.clientId === client.id);
        if (!tenant) {
          const planEntry = planDocument?.tenants[tenantKey];
          if (tenantKey !== "cra-pr" || !planEntry) throw new Error(`TENANT_OPERATIONAL_CONFIG_TENANT_UNKNOWN:${tenantKey}`);
          if (clientMetaAccounts.length !== 1 || clientMetaAccounts[0].aiEnabled !== false) {
            throw new Error(`CRA_OPERATIONAL_CONFIG_CHANNEL_ACCOUNT_AI_MISMATCH:${tenantKey}`);
          }
          const accountIdentity = clientMetaAccounts[0].channelAccountId;
          const hasWaIdentity = phoneNumbers.some((phone) => phone.clientId === client.id && phone.phoneNumberId === accountIdentity);
          const hasMetaIdentity = metaConfigs.some((config) => config.clientId === client.id && config.phoneNumberId === accountIdentity);
          if (!hasWaIdentity || !hasMetaIdentity) {
            throw new Error(`CRA_OPERATIONAL_CONFIG_DB_IDENTITY_MISMATCH:${tenantKey}`);
          }
          const baseConfig = planEntry.baseConfig;
          return {
            tenantKey,
            client,
            current,
            baseConfig,
            provenance: "OWNER_AUTHORIZED_DB_IDENTITY" as const,
            next: selectManagedFields(
              current,
              mergedOwnerAuthorizedConfig(current, baseConfig),
              options.fields
            ),
          };
        }
        const sourcePhoneNumberId = typeof tenant.metaPhoneNumberId === "string" ? tenant.metaPhoneNumberId.trim() : "";
        const mappedPhoneIds = new Set([
          ...phoneNumbers.filter((phone) => phone.clientId === client.id).map((phone) => phone.phoneNumberId),
          ...metaConfigs.filter((config) => config.clientId === client.id).map((config) => config.phoneNumberId).filter(Boolean),
        ]);
        const participation = classifyTenantMetaParticipation({
          metaChannelAccount: clientMetaAccounts.length > 0,
          waPhoneNumber: phoneNumbers.some((phone) => phone.clientId === client.id),
          tenantMetaConfig: metaConfigs.some((config) => config.clientId === client.id),
        });
        if (sourcePhoneNumberId) {
          if (!mappedPhoneIds.has(sourcePhoneNumberId)) throw new Error(`source_tenant_missing_phone_mapping:${tenantKey}`);
          if (!clientMetaAccounts.some((account) => account.channelAccountId === sourcePhoneNumberId || account.aliases.some((alias) => alias.alias === sourcePhoneNumberId))) {
            throw new Error(`source_tenant_missing_channel_account:${tenantKey}`);
          }
        } else if (participation.participatesInMeta) {
          throw new Error(`source_tenant_meta_identity_ambiguous:${tenantKey}`);
        }
        const values = normalizedManagedValues(tenant);
        return {
          tenantKey,
          client,
          current,
          values,
          baseConfig: values.baseConfig,
          provenance: "HISTORICAL_SOURCE" as const,
          next: selectManagedFields(current, mergedManagedConfig(current, values), options.fields),
        };
      }).sort((left, right) => left.client.id.localeCompare(right.client.id));

      const transactionItems = prepared.map((entry) => backfillItem({
        tenantKey: entry.tenantKey,
        clientId: entry.client.id,
        current: entry.current,
        next: entry.next,
        values: "values" in entry ? entry.values : undefined,
        baseConfig: entry.baseConfig,
        provenance: entry.provenance,
        dryRun: options.dryRun,
      }));
      if (!options.dryRun) {
        for (const entry of prepared) {
          if (isDeepStrictEqual(entry.current, entry.next)) continue;
          await tx.tenantOperationalConfig.upsert({
            where: { clientId: entry.client.id },
            update: { config: entry.next, schemaVersion: 1 },
            create: { clientId: entry.client.id, config: entry.next, schemaVersion: 1 },
          });
        }
      }
      return transactionItems;
    }, {
      ...(options.plan || (options.tenants?.length ?? 0) > 1
        ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        : {}),
      maxWait: 10_000,
      timeout: 30_000,
    });

    const deltaCounts = Object.fromEntries(MANAGED_CONFIG_FIELDS.map((field) => [
      field,
      items.filter((item) => item.fieldsChanged.includes(field)).length,
    ]));
    const reportItems = options.tenants
      ? items
      : items.map(({ provenance: _provenance, ...item }) => item);
    const report = {
      ok: true,
      dryRun: options.dryRun,
      source: options.source,
      sourceSha256: options.expectedSourceSha256,
      ...(options.tenants ? {
        plan: options.plan ?? null,
        planSha256: options.expectedPlanSha256 ?? null,
        tenant: options.tenants.length === 1 ? options.tenants[0] : null,
        selectedTenants: options.tenants,
        selectedFields: options.fields ?? null,
      } : { tenant: null }),
      durationMs: Date.now() - startedAt,
      processed: items.length,
      upserted: items.filter((item) => item.action === "upserted").length,
      wouldUpsert: items.filter((item) => item.action === "would_upsert").length,
      unchanged: items.filter((item) => item.action === "unchanged").length,
      skippedMissingClient: items.filter((item) => item.action === "skipped_missing_client").length,
      deltaCounts,
      items: reportItems,
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `tenant operational config backfill ok dryRun=${report.dryRun} processed=${report.processed} upserted=${report.upserted} skippedMissingClient=${report.skippedMissingClient}`
      );
      for (const item of items) {
        if (item.provenance === "OWNER_AUTHORIZED_DB_IDENTITY") {
          console.log(
            `- tenant=${item.tenantKey} action=${item.action} clientId=${item.clientId ?? "-"} ` +
              `provenance=${item.provenance} fieldsChanged=${item.fieldsChanged.join(",") || "-"}`
          );
        } else {
          console.log(
            `- tenant=${item.tenantKey} action=${item.action} clientId=${item.clientId ?? "-"} ` +
              `crmBusinessStatuses=${item.statusCount} manualHandoff=${item.manualHandoffTemplate ?? "-"} ` +
              `followUpEnabled=${item.followUp!.enabled} followUpDelayMinutes=${item.followUp!.delayMinutes} ` +
              `handoffLeadNotificationEnabled=${item.handoffLeadNotification!.enabled} ` +
              `handoffLeadNotificationRecipients=${item.handoffLeadNotification!.recipients.length} ` +
              `mediaHandoffPolicyEnabled=${item.mediaHandoffPolicy!.enabled} ` +
              `mediaHandoffPolicyBehavior=${item.mediaHandoffPolicy!.behavior} ` +
              `planName=${item.planLimits!.planName ?? "-"} messagesLimit=${item.planLimits!.messagesLimit ?? "-"} ` +
              `quotaMonthlyConversations=${item.planLimits!.quotaMonthlyConversations ?? "-"} ` +
              `disableChatbot=${item.automationFlags!.disableChatbot} ` +
              `disableAiFallback=${item.automationFlags!.disableAiFallback} ` +
              `disableIntentClassifier=${item.automationFlags!.disableIntentClassifier} ` +
              `disableLegacyFlows=${item.automationFlags!.disableLegacyFlows} ` +
              `disableChatbotFlowEditing=${item.automationFlags!.disableChatbotFlowEditing} ` +
              `aiAssistantProfile=${item.aiAssistantConfig!.aiAssistantProfile} ` +
              `aiAssistantMaxReplies=${item.aiAssistantConfig!.aiAssistantMaxReplies} ` +
              `aiAssistantAllowedTopics=${item.aiAssistantConfig!.allowedTopicsCount} ` +
              `aiAssistantBlockedTerms=${item.aiAssistantConfig!.blockedTermsCount}`
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
  process.exitCode = 1;
});
