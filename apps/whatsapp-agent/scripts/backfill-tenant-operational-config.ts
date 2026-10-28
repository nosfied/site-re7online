#!/usr/bin/env tsx
import { withLockedTenantOperationalConfig } from "../src/config/tenantOperationalConfigStore.js";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { normalizeQualificationSchema } from "../src/agent/qualification.js";
import { env } from "../src/config/env.js";
import { readAuthenticatedTenantJsonSource } from "../src/config/authenticatedTenantJsonSource.js";
import {
  normalizeAiAssistantIntentCatalog,
  normalizeCrmBusinessStatuses,
  normalizeHandoffLeadNotificationRecipients,
  normalizeTenantMediaHandoffPolicy,
} from "../src/config/tenantConfig.js";

type Options = {
  json: boolean;
  tenant?: string;
  dryRun: boolean;
  source: string;
  expectedSourceSha256: string;
};

type BackfillItem = {
  tenantKey: string;
  clientId: string | null;
  action: "would_upsert" | "upserted" | "unchanged" | "skipped_missing_client";
  fieldsChanged: string[];
  statusCount: number;
  manualHandoffTemplate: string | null;
  followUp: ReturnType<typeof normalizeFollowUp>;
  handoffLeadNotification: ReturnType<typeof normalizeHandoffLeadNotification>;
  mediaHandoffPolicy: ReturnType<typeof normalizeTenantMediaHandoffPolicy>;
  planLimits: ReturnType<typeof normalizePlanLimits>;
  automationFlags: ReturnType<typeof normalizeAutomationFlags>;
  aiAssistantConfig: ReturnType<typeof summarizeAiAssistantConfig>;
  aiIntentQualification: ReturnType<typeof summarizeAiIntentQualification>;
  baseConfig: ReturnType<typeof summarizeBaseConfig>;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    dryRun: false,
    source: "",
    expectedSourceSha256: "",
  };
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
        options.tenant = next;
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
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  if (!path.isAbsolute(options.source)) throw new Error("source_must_be_absolute");
  if (!options.expectedSourceSha256) throw new Error("expected_source_sha256_required");
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

function backfillItem(params: {
  tenantKey: string;
  clientId: string;
  current: unknown;
  next: unknown;
  values: ReturnType<typeof normalizedManagedValues>;
  dryRun: boolean;
}): BackfillItem {
  const fieldsChanged = changedManagedFields(params.current, params.next);
  return {
    tenantKey: params.tenantKey,
    clientId: params.clientId,
    action: fieldsChanged.length === 0 ? "unchanged" : params.dryRun ? "would_upsert" : "upserted",
    fieldsChanged,
    statusCount: params.values.statuses.length,
    manualHandoffTemplate: params.values.manualHandoffTemplate,
    followUp: params.values.followUp,
    handoffLeadNotification: params.values.handoffLeadNotification,
    mediaHandoffPolicy: params.values.mediaHandoffPolicy,
    planLimits: params.values.planLimits,
    automationFlags: params.values.automationFlags,
    aiAssistantConfig: summarizeAiAssistantConfig(params.values.aiAssistantConfig),
    aiIntentQualification: summarizeAiIntentQualification(params.values.aiIntentQualification),
    baseConfig: summarizeBaseConfig(params.values.baseConfig),
  };
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const startedAt = Date.now();
  const items: BackfillItem[] = [];
  try {
    const tenants = await readAuthenticatedTenantJsonSource({
      source: options.source,
      expectedSha256: options.expectedSourceSha256,
    });
    const entries = Object.entries(tenants).filter(([tenantKey]) => {
      return options.tenant ? tenantKey === options.tenant : true;
    });
    const clientKeys = entries.map(([tenantKey]) => tenantKey);
    const clients = await prisma.client.findMany({
      where: { clientKey: { in: clientKeys } },
      select: { id: true, clientKey: true, operationalConfig: { select: { config: true } } },
    });
    const clientsByKey = new Map(clients.map((client) => [client.clientKey, client]));
    const missingClients = entries
      .map(([tenantKey]) => tenantKey)
      .filter((tenantKey) => !clientsByKey.has(tenantKey));
    if (missingClients.length > 0) {
      throw new Error(`source_tenant_missing_client:${missingClients.sort().join(",")}`);
    }
    const clientIds = clients.map((client) => client.id);
    const [channelAccounts, phoneNumbers, metaConfigs] = await Promise.all([
      prisma.channelAccount.findMany({
        where: { clientId: { in: clientIds }, channel: "whatsapp", provider: "meta" },
        select: {
          clientId: true,
          channelAccountId: true,
          aliases: { select: { alias: true } },
        },
      }),
      prisma.waPhoneNumber.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, phoneNumberId: true },
      }),
      prisma.tenantMetaConfig.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, phoneNumberId: true },
      }),
    ]);
    const prepared = entries.map(([tenantKey, tenant]) => {
      const client = clientsByKey.get(tenantKey)!;
      const sourcePhoneNumberId = typeof tenant.metaPhoneNumberId === "string"
        ? tenant.metaPhoneNumberId.trim()
        : "";
      const mappedPhoneIds = new Set([
        ...phoneNumbers.filter((phone) => phone.clientId === client.id).map((phone) => phone.phoneNumberId),
        ...metaConfigs.filter((config) => config.clientId === client.id).map((config) => config.phoneNumberId).filter(Boolean),
      ]);
      if (!sourcePhoneNumberId || !mappedPhoneIds.has(sourcePhoneNumberId)) {
        throw new Error(`source_tenant_missing_phone_mapping:${tenantKey}`);
      }
      const hasChannelAccount = channelAccounts.some((account) =>
        account.clientId === client.id &&
        (account.channelAccountId === sourcePhoneNumberId || account.aliases.some((alias) => alias.alias === sourcePhoneNumberId))
      );
      if (!hasChannelAccount) {
        throw new Error(`source_tenant_missing_channel_account:${tenantKey}`);
      }
      const values = normalizedManagedValues(tenant as Record<string, unknown>);
      const next = mergedManagedConfig(client.operationalConfig?.config, values);
      return { tenantKey, client, values, next };
    }).sort((left, right) => left.client.id.localeCompare(right.client.id));

    for (const entry of prepared) {
      items.push(backfillItem({
        tenantKey: entry.tenantKey,
        clientId: entry.client.id,
        current: entry.client.operationalConfig?.config,
        next: entry.next,
        values: entry.values,
        dryRun: options.dryRun,
      }));
    }

    if (!options.dryRun) {
      await prisma.$transaction(async (tx) => {
        const lockedConfigs = new Map<string, unknown>();
        for (const entry of prepared) {
          const lockedClient = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id FROM "Client"
            WHERE id = ${entry.client.id}::uuid
            FOR UPDATE
          `);
          if (lockedClient.length !== 1) {
            throw new Error(`source_tenant_client_changed:${entry.tenantKey}`);
          }
        }
        for (const entry of prepared) {
          const current = await withLockedTenantOperationalConfig(tx, entry.client.id, async (lockedTx) => {
            const current = await lockedTx.tenantOperationalConfig.findUnique({
              where: { clientId: entry.client.id },
              select: { config: true },
            });
            return current?.config ?? {};
          }, { createIfMissing: false, onMissing: () => ({}) });
          lockedConfigs.set(entry.client.id, current);
        }
        for (const entry of prepared) {
          const current = lockedConfigs.get(entry.client.id) ?? {};
          const next = mergedManagedConfig(current, entry.values);
          const item = items.find((candidate) => candidate.clientId === entry.client.id)!;
          item.fieldsChanged = changedManagedFields(current, next);
          if (isDeepStrictEqual(current, next)) {
            item.action = "unchanged";
            continue;
          }
          item.action = "upserted";
          await tx.tenantOperationalConfig.upsert({
            where: { clientId: entry.client.id },
            update: { config: next, schemaVersion: 1 },
            create: { clientId: entry.client.id, config: next, schemaVersion: 1 },
          });
        }
      });
    }
    const deltaCounts = Object.fromEntries(MANAGED_CONFIG_FIELDS.map((field) => [
      field,
      items.filter((item) => item.fieldsChanged.includes(field)).length,
    ]));
    const report = {
      ok: true,
      dryRun: options.dryRun,
      source: options.source,
      sourceSha256: options.expectedSourceSha256,
      tenant: options.tenant ?? null,
      durationMs: Date.now() - startedAt,
      processed: items.length,
      upserted: items.filter((item) => item.action === "upserted").length,
      wouldUpsert: items.filter((item) => item.action === "would_upsert").length,
      unchanged: items.filter((item) => item.action === "unchanged").length,
      skippedMissingClient: items.filter((item) => item.action === "skipped_missing_client").length,
      deltaCounts,
      items,
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `tenant operational config backfill ok dryRun=${report.dryRun} processed=${report.processed} upserted=${report.upserted} skippedMissingClient=${report.skippedMissingClient}`
      );
      for (const item of items) {
        console.log(
          `- tenant=${item.tenantKey} action=${item.action} clientId=${item.clientId ?? "-"} ` +
            `crmBusinessStatuses=${item.statusCount} manualHandoff=${item.manualHandoffTemplate ?? "-"} ` +
            `followUpEnabled=${item.followUp.enabled} followUpDelayMinutes=${item.followUp.delayMinutes} ` +
            `handoffLeadNotificationEnabled=${item.handoffLeadNotification.enabled} ` +
            `handoffLeadNotificationRecipients=${item.handoffLeadNotification.recipients.length} ` +
            `mediaHandoffPolicyEnabled=${item.mediaHandoffPolicy.enabled} ` +
            `mediaHandoffPolicyBehavior=${item.mediaHandoffPolicy.behavior} ` +
            `planName=${item.planLimits.planName ?? "-"} messagesLimit=${item.planLimits.messagesLimit ?? "-"} ` +
            `quotaMonthlyConversations=${item.planLimits.quotaMonthlyConversations ?? "-"} ` +
            `disableChatbot=${item.automationFlags.disableChatbot} ` +
            `disableAiFallback=${item.automationFlags.disableAiFallback} ` +
            `disableIntentClassifier=${item.automationFlags.disableIntentClassifier} ` +
            `disableLegacyFlows=${item.automationFlags.disableLegacyFlows} ` +
            `disableChatbotFlowEditing=${item.automationFlags.disableChatbotFlowEditing} ` +
            `aiAssistantProfile=${item.aiAssistantConfig.aiAssistantProfile} ` +
            `aiAssistantMaxReplies=${item.aiAssistantConfig.aiAssistantMaxReplies} ` +
            `aiAssistantAllowedTopics=${item.aiAssistantConfig.allowedTopicsCount} ` +
            `aiAssistantBlockedTerms=${item.aiAssistantConfig.blockedTermsCount}`
        );
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
