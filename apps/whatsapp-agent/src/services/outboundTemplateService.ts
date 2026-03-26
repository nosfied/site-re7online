import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import {
  ConversationIntent,
} from "../conversation/conversation.types.js";
import {
  getOrCreateConversation,
  updateOutbound,
} from "../conversation/conversation.service.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";

export type OutboundTemplateParams = {
  toE164: string;
  waId: string;
  intent: ConversationIntent | undefined;
  templateName: string;
  lang?: string;
  components?: Array<{
    type: "body";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
  isFallback?: boolean;
  fallbackReason?: string;
  requestId?: string;
  rid?: string;
  messageId?: string;
  clientId?: string;
  clientKey?: string;
};

export type SendTemplateResult = {
  ok: boolean;
  status?: number;
  metaMessageId?: string;
  errorBody?: string;
  blockedByUsage?: boolean;
};

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
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${resolvedPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: params.toE164,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: resolvedLang },
      ...(params.components ? { components: params.components } : {}),
    },
  };

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

      if (params.clientKey && params.waId) {
        const conversation = await getOrCreateConversation(
          runtimeStorage,
          params.clientKey,
          params.waId,
          sentAt
        );
        const nextConversation = updateOutbound(
          conversation,
          metaMessageId ?? params.messageId ?? params.rid,
          sentAt
        );
        await runtimeStorage.upsertConversation(nextConversation);
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
    return { ok: false, status: response.status, errorBody: errorText.slice(0, 500) };
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
    return { ok: false, errorBody: (error as Error).message };
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
