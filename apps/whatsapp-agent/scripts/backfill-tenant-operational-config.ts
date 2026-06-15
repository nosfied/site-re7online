#!/usr/bin/env tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "../src/config/env.js";
import {
  getTenants,
  normalizeCrmBusinessStatuses,
  normalizeHandoffLeadNotificationRecipients,
  normalizeTenantMediaHandoffPolicy,
} from "../src/config/tenantConfig.js";

type Options = {
  json: boolean;
  tenant?: string;
  dryRun: boolean;
};

type BackfillItem = {
  tenantKey: string;
  clientId: string | null;
  action: "would_upsert" | "upserted" | "skipped_missing_client";
  statusCount: number;
  manualHandoffTemplate: string | null;
  followUp: ReturnType<typeof normalizeFollowUp>;
  handoffLeadNotification: ReturnType<typeof normalizeHandoffLeadNotification>;
  mediaHandoffPolicy: ReturnType<typeof normalizeTenantMediaHandoffPolicy>;
  planLimits: ReturnType<typeof normalizePlanLimits>;
  automationFlags: ReturnType<typeof normalizeAutomationFlags>;
  aiAssistantConfig: ReturnType<typeof normalizeAiAssistantConfig>;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    json: false,
    dryRun: false,
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
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
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

function mergeConfig(
  current: unknown,
  crmBusinessStatuses: unknown,
  manualHandoffTemplate: string | null,
  followUp: ReturnType<typeof normalizeFollowUp>,
  handoffLeadNotification: ReturnType<typeof normalizeHandoffLeadNotification>,
  mediaHandoffPolicy: ReturnType<typeof normalizeTenantMediaHandoffPolicy>,
  planLimits: ReturnType<typeof normalizePlanLimits>,
  automationFlags: ReturnType<typeof normalizeAutomationFlags>,
  aiAssistantConfig: ReturnType<typeof normalizeAiAssistantConfig>
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
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
  return base as Prisma.InputJsonValue;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const startedAt = Date.now();
  const items: BackfillItem[] = [];
  try {
    const tenants = await getTenants();
    const entries = Object.entries(tenants).filter(([tenantKey]) => {
      return options.tenant ? tenantKey === options.tenant : true;
    });
    for (const [tenantKey, tenant] of entries) {
      const client = await prisma.client.findUnique({
        where: { clientKey: tenantKey },
        select: {
          id: true,
          operationalConfig: {
            select: { config: true },
          },
        },
      });
      const statuses = normalizeCrmBusinessStatuses(tenant.crmBusinessStatuses);
      const manualHandoffTemplate = normalizeManualHandoffTemplate(tenant.templates?.manualHandoff);
      const followUp = normalizeFollowUp(tenant);
      const handoffLeadNotification = normalizeHandoffLeadNotification(tenant);
      const mediaHandoffPolicy = normalizeTenantMediaHandoffPolicy(tenant.mediaHandoffPolicy);
      const planLimits = normalizePlanLimits(tenant);
      const automationFlags = normalizeAutomationFlags(tenant);
      const aiAssistantConfig = normalizeAiAssistantConfig(tenant);
      if (!client) {
        items.push({
          tenantKey,
          clientId: null,
          action: "skipped_missing_client",
          statusCount: statuses.length,
          manualHandoffTemplate,
          followUp,
          handoffLeadNotification,
          mediaHandoffPolicy,
          planLimits,
          automationFlags,
          aiAssistantConfig,
        });
        continue;
      }
      items.push({
        tenantKey,
        clientId: client.id,
        action: options.dryRun ? "would_upsert" : "upserted",
        statusCount: statuses.length,
        manualHandoffTemplate,
        followUp,
        handoffLeadNotification,
        mediaHandoffPolicy,
        planLimits,
        automationFlags,
        aiAssistantConfig,
      });
      if (options.dryRun) continue;
      const nextConfig = mergeConfig(
        client.operationalConfig?.config,
        statuses,
        manualHandoffTemplate,
        followUp,
        handoffLeadNotification,
        mediaHandoffPolicy,
        planLimits,
        automationFlags,
        aiAssistantConfig
      );
      await prisma.tenantOperationalConfig.upsert({
        where: { clientId: client.id },
        update: {
          config: nextConfig,
          schemaVersion: 1,
        },
        create: {
          clientId: client.id,
          config: nextConfig,
          schemaVersion: 1,
        },
      });
    }
    const report = {
      ok: true,
      dryRun: options.dryRun,
      tenant: options.tenant ?? null,
      durationMs: Date.now() - startedAt,
      processed: items.length,
      upserted: items.filter((item) => item.action === "upserted").length,
      wouldUpsert: items.filter((item) => item.action === "would_upsert").length,
      skippedMissingClient: items.filter((item) => item.action === "skipped_missing_client").length,
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
            `aiAssistantAllowedTopics=${item.aiAssistantConfig.aiAssistantAllowedTopics.length} ` +
            `aiAssistantBlockedTerms=${item.aiAssistantConfig.aiAssistantBlockedTerms.length}`
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
