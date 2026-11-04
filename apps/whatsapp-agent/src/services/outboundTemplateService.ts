import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import {
  ConversationIntent,
} from "../conversation/conversation.types.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";
import { getPrisma } from "../db.js";
import {
  isWhatsappTemplateCategoryAllowedForTenant,
  WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
} from "../meta/templateCategoryPolicy.js";
import type { CampaignTemplateComponents } from "../templates/templateComponents.js";
import { assertTemplateMediaCompatibility, withHeaderMediaComponent } from "../templates/templateComponents.js";
import { invalidateConfirmedTemplateMedia, isExplicitTemplateMediaRejection, resolveAccountScopedTemplateMedia } from "../templates/templateMediaAccountUpload.js";
import { runTemplateProviderSubmissionGate } from "./templateProviderSubmissionGate.js";

export type OutboundTemplateParams = {
  toE164: string;
  waId: string;
  intent: ConversationIntent | undefined;
  templateName: string;
  lang?: string;
  components?: CampaignTemplateComponents;
  media?: { assetId: string; kind: "IMAGE" | "VIDEO"; sha256: string };
  isFallback?: boolean;
  fallbackReason?: string;
  requestId?: string;
  rid?: string;
  messageId?: string;
  clientId?: string;
  clientKey?: string;
  beforeSubmit?: () => Promise<string | null>;
};

export type SendTemplateResult = {
  ok: boolean;
  status?: number;
  metaMessageId?: string;
  errorBody?: string;
  blockedByUsage?: boolean;
  blockedByEligibility?: boolean;
  failureDisposition?: "recipient_definitive" | "operation_definitive" | "submission_uncertain";
  providerErrorCode?: number;
};

const RECIPIENT_DEFINITIVE_META_ERROR_CODES = new Set([130497, 131026]);

export function classifyTemplateProviderFailure(params: { responseReceived: boolean; errorBody?: string }) {
  if (!params.responseReceived) {
    return { disposition: "submission_uncertain" as const, providerErrorCode: null };
  }
  let providerErrorCode: number | null = null;
  try {
    const parsed = JSON.parse(params.errorBody ?? "") as { error?: { code?: unknown } };
    const candidate = Number(parsed?.error?.code);
    if (Number.isSafeInteger(candidate)) providerErrorCode = candidate;
  } catch {
    // A concrete HTTP response is still definitive for this attempt. An
    // unparseable body must never be promoted to a recipient-only failure.
  }
  return {
    disposition: providerErrorCode !== null && RECIPIENT_DEFINITIVE_META_ERROR_CODES.has(providerErrorCode)
      ? "recipient_definitive" as const
      : "operation_definitive" as const,
    providerErrorCode,
  };
}

export async function sendTemplate(params: OutboundTemplateParams): Promise<SendTemplateResult> {
  const resolvedLang =
    params.lang && params.lang.trim().length > 0
      ? params.lang
      : env.OUTBOUND_TEMPLATE_DEFAULT_LANG;
  if (!resolvedLang) {
    logger.error({
      event: "outbound.template.failed",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      template: params.templateName,
      language: resolvedLang,
      clientId: params.clientId ?? env.CLIENT_ID,
      clientKey: params.clientKey ?? env.CLIENT_ID,
      isFallback: Boolean(params.isFallback),
      fallbackReason: params.fallbackReason,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      reason: "language_missing",
    });
    return { ok: false, errorBody: "language_missing" };
  }
  const credentials =
    params.clientId && params.clientKey
      ? await resolveTenantOutboundCredentials({
          clientId: params.clientId,
          clientKey: params.clientKey,
        })
      : null;
  const resolvedPhoneNumberId = credentials?.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
  const resolvedAccessToken = credentials?.accessToken || env.WHATSAPP_ACCESS_TOKEN;
  const credentialSource = credentials?.source ?? "env";
  const credentialGeneration = credentials?.credentialGeneration ?? "env:process";
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${resolvedPhoneNumberId}/messages`;
  let resolvedComponents = params.components;

  logger.info({
    event: "outbound.template.sending",
    waId: maskNumber(params.waId),
    to: maskNumber(params.toE164),
    intent: params.intent ?? "unknown",
    template: params.templateName,
    language: resolvedLang,
    clientId: params.clientId ?? env.CLIENT_ID,
    clientKey: params.clientKey ?? env.CLIENT_ID,
    isFallback: Boolean(params.isFallback),
    fallbackReason: params.fallbackReason,
    requestId: params.requestId,
    rid: params.rid,
    messageId: params.messageId,
    resolvedPhoneNumberId,
    credentialSource,
  });

  if (params.clientId && params.clientKey) {
    const prisma = getPrisma();
    const template = await prisma.template.findFirst({
      where: {
        clientId: params.clientId,
        name: params.templateName,
        language: resolvedLang,
      },
      select: {
        category: true,
        headerType: true,
      },
    });
    try {
      assertTemplateMediaCompatibility({
        headerType: template?.headerType ?? "NONE",
        mediaKind: params.media?.kind,
        mediaAssetId: params.media?.assetId,
      });
    } catch (error) {
      return { ok: false, status: 400, errorBody: (error as Error).message };
    }
    const categoryDecision = await isWhatsappTemplateCategoryAllowedForTenant({
      prisma,
      clientId: params.clientId,
      effectiveCategory: template?.category ?? null,
    });
    if (!categoryDecision.allowed) {
      logger.warn({
        event: "outbound.template.blocked",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: params.templateName,
        language: resolvedLang,
        clientId: params.clientId,
        clientKey: params.clientKey,
        isFallback: Boolean(params.isFallback),
        fallbackReason: params.fallbackReason,
        requestId: params.requestId,
        rid: params.rid,
        messageId: params.messageId,
        reason: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
        templateCategory: template?.category ?? null,
      });
      return { ok: false, status: 403, errorBody: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED };
    }

    const usageGate = await checkUsageGate({
      clientId: params.clientId,
      clientKey: params.clientKey,
      messageType: "template",
      requestId: params.requestId,
      waId: params.waId,
    });
    if (!usageGate.allowed) {
      logger.warn({
        event: "outbound.template.failed",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: params.templateName,
        language: resolvedLang,
        clientId: params.clientId,
        clientKey: params.clientKey,
        requestId: params.requestId,
        rid: params.rid,
        messageId: params.messageId,
        reason: "usage_limit_reached",
        planName: usageGate.planName,
        messagesSent: usageGate.usage.messagesSent,
        messagesLimit: usageGate.usage.messagesLimit,
        period: usageGate.usage.period,
      });
      return { ok: false, errorBody: "usage_limit_reached", blockedByUsage: true };
    }
  }

  // All asynchronous credential/template/usage work is complete. No provider call
  // can precede the campaign's final current-tenant eligibility observation.
  const media = params.media;
  const mediaClientId = params.clientId;
  const finalGate = await runTemplateProviderSubmissionGate({
    beforeSubmit: params.beforeSubmit,
    resolveMedia: media && mediaClientId ? async () => {
      const prisma = getPrisma();
      const asset = await prisma.templateMediaAsset.findFirst({
        where: { id: media.assetId, clientId: mediaClientId, state: { in: ["stored", "ready"] } },
        select: { id: true, kind: true, storageKey: true, mimeType: true, sha256: true, originalFilename: true },
      });
      if (!asset || asset.kind !== media.kind || asset.sha256 !== media.sha256) {
        return { ok: false as const, status: 409, errorBody: "template_media_snapshot_mismatch" };
      }
      const uploaded = await resolveAccountScopedTemplateMedia({
        clientId: mediaClientId,
        assetId: asset.id,
        assetSha256: asset.sha256,
        kind: media.kind,
        phoneNumberId: resolvedPhoneNumberId,
        credentialGeneration,
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        originalFilename: asset.originalFilename,
        accessToken: resolvedAccessToken,
      });
      if (!uploaded.ok) {
        return { ok: false as const, status: uploaded.error === "content_mismatch" ? 409 : 502, errorBody: `template_media_${uploaded.error}` };
      }
      return { ok: true as const, mediaId: uploaded.mediaId };
    } : undefined,
  });
  if (!finalGate.ok) return finalGate;
  if (params.media && finalGate.mediaId) {
    resolvedComponents = withHeaderMediaComponent(resolvedComponents, { kind: params.media.kind, mediaId: finalGate.mediaId });
  }
  const payload = {
    messaging_product: "whatsapp",
    to: params.toE164,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: resolvedLang },
      ...(resolvedComponents ? { components: resolvedComponents } : {}),
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedAccessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      let metaMessageId: string | undefined;
      const sentAt = new Date().toISOString();
      try {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        metaMessageId = json.messages?.[0]?.id;
      } catch {
        // ignore parse errors
      }

      await runtimeStorage.appendOutboundEvent({
        direction: "outbound",
        messageId: metaMessageId ?? params.messageId ?? params.rid ?? "",
        metaMessageId: metaMessageId ?? undefined,
        from: params.toE164,
        to: params.toE164,
        timestamp: sentAt,
        type: "template",
        text: null,
        templateName: params.templateName,
        language: resolvedLang,
        intent: params.intent ?? undefined,
        clientKey: params.clientKey ?? "default",
        status: "sent",
        allowlist: { enabled: false, hit: false },
        raw: {
          senderPhoneNumberId: resolvedPhoneNumberId,
          requestId: params.requestId,
          rid: params.rid,
          metaMessageId,
        },
      });

      if (params.clientId && params.clientKey && params.waId) {
        // An outbound template is not an inbound. Update only outbound activity so a
        // concurrent inbound, claim, or handoff cannot be replaced by a stale state.
        await getPrisma().conversationRuntimeState.updateMany({
          where: { clientId: params.clientId, waId: params.waId },
          data: {
            lastOutboundAt: new Date(sentAt),
            lastOutboundMessageId: metaMessageId ?? params.messageId ?? params.rid ?? null,
          },
        });
      }

      logger.info({
        event: "outbound.template.sent",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: params.templateName,
        language: resolvedLang,
        clientId: params.clientId ?? env.CLIENT_ID,
        clientKey: params.clientKey ?? env.CLIENT_ID,
        isFallback: Boolean(params.isFallback),
        fallbackReason: params.fallbackReason,
        requestId: params.requestId,
        rid: params.rid,
        messageId: params.messageId,
        metaMessageId,
        resolvedPhoneNumberId,
        credentialSource,
      });
      return { ok: true, status: response.status, metaMessageId };
    }

    const errorText = await response.text().catch(() => "");
    const failure = classifyTemplateProviderFailure({ responseReceived: true, errorBody: errorText });
    if (media && mediaClientId && finalGate.mediaId && isExplicitTemplateMediaRejection(response.status, errorText)) {
      await invalidateConfirmedTemplateMedia({
        clientId: mediaClientId,
        assetId: media.assetId,
        assetSha256: media.sha256,
        kind: media.kind,
        phoneNumberId: resolvedPhoneNumberId,
        credentialGeneration,
      }, finalGate.mediaId);
    }
    await runtimeStorage.appendOutboundEvent({
      direction: "outbound",
      messageId: params.messageId ?? params.rid ?? "",
      metaMessageId: undefined,
      from: params.toE164,
      to: params.toE164,
      timestamp: new Date().toISOString(),
      type: "template",
      text: null,
      templateName: params.templateName,
      language: resolvedLang,
      intent: params.intent ?? undefined,
      clientKey: params.clientKey ?? "default",
      status: "failed",
      allowlist: { enabled: false, hit: false },
      raw: {
        senderPhoneNumberId: resolvedPhoneNumberId,
        requestId: params.requestId,
        rid: params.rid,
        errorBody: errorText.slice(0, 500),
      },
    });
    logger.error({
      event: "outbound.template.failed",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      template: params.templateName,
      language: resolvedLang,
      clientId: params.clientId ?? env.CLIENT_ID,
      clientKey: params.clientKey ?? env.CLIENT_ID,
      isFallback: Boolean(params.isFallback),
      fallbackReason: params.fallbackReason,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      errorBody: errorText.slice(0, 500),
      status: response.status,
      resolvedPhoneNumberId,
      credentialSource,
    });
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500),
      failureDisposition: failure.disposition, providerErrorCode: failure.providerErrorCode ?? undefined };
  } catch (error) {
    clearTimeout(timeout);
    logger.error({
      event: "outbound.template.failed",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      template: params.templateName,
      language: resolvedLang,
      clientId: params.clientId ?? env.CLIENT_ID,
      clientKey: params.clientKey ?? env.CLIENT_ID,
      isFallback: Boolean(params.isFallback),
      fallbackReason: params.fallbackReason,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      errorMessage: (error as Error).message,
      resolvedPhoneNumberId,
      credentialSource,
    });
    return { ok: false, errorBody: (error as Error).message, failureDisposition: "submission_uncertain" };
  }
}

export function resolveTemplateForIntent(
  intent: ConversationIntent | undefined,
  clientKey: string = env.CLIENT_ID
) {
  const key = intent ?? "unknown";
  const byClient = env.OUTBOUND_TEMPLATES_BY_CLIENT[clientKey] ?? {};
  const clientMapped = byClient[key];
  if (clientMapped && clientMapped.name) {
    return {
      name: clientMapped.name,
      language: clientMapped.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
    };
  }
  const clientDefault = byClient.default;
  if (clientDefault && clientDefault.name) {
    return {
      name: clientDefault.name,
      language: clientDefault.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
    };
  }
  const mapped = env.OUTBOUND_TEMPLATE_INTENT_MAP[key];
  if (mapped && mapped.name) {
    return {
      name: mapped.name,
      language: mapped.language ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
    };
  }
  return {
    name: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
    language: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
  };
}

export function resolveFallbackTemplate() {
  const name = env.OUTBOUND_TEMPLATE_FALLBACK_NAME || env.OUTBOUND_TEMPLATE_DEFAULT_NAME;
  const language = env.OUTBOUND_TEMPLATE_FALLBACK_LANG || env.OUTBOUND_TEMPLATE_DEFAULT_LANG;
  return { name, language };
}

export function shouldRetryWithFallback(params: {
  currentName: string;
  currentLang: string;
  fallbackName: string;
  fallbackLang: string;
  status?: number;
  errorBody?: string;
}) {
  if (
    params.currentName === params.fallbackName &&
    params.currentLang === params.fallbackLang
  ) {
    return false;
  }
  const errorText = (params.errorBody ?? "").toLowerCase();
  const isTemplateError =
    params.status === 400 ||
    params.status === 404 ||
    params.status === 132001 ||
    errorText.includes("does not exist in the translation") ||
    errorText.includes("template") ||
    errorText.includes("language");
  return isTemplateError;
}

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
