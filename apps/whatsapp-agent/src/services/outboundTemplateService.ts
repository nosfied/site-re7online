import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { ConversationIntent } from "../conversation/conversation.types.js";

export type OutboundTemplateParams = {
  toE164: string;
  waId: string;
  intent: ConversationIntent | undefined;
  templateName: string;
  lang?: string;
  requestId?: string;
  rid?: string;
  messageId?: string;
};

export async function sendTemplate(params: OutboundTemplateParams) {
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
      clientId: env.CLIENT_ID,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      reason: "language_missing",
    });
    return { ok: false };
  }
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: params.toE164,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: resolvedLang },
    },
  };

  logger.info({
    event: "outbound.template.sending",
    waId: maskNumber(params.waId),
    to: maskNumber(params.toE164),
    intent: params.intent ?? "unknown",
    template: params.templateName,
    language: resolvedLang,
    clientId: env.CLIENT_ID,
    requestId: params.requestId,
    rid: params.rid,
    messageId: params.messageId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      let metaMessageId: string | undefined;
      try {
        const json = (await response.json()) as { messages?: Array<{ id?: string }> };
        metaMessageId = json.messages?.[0]?.id;
      } catch {
        // ignore parse errors
      }

      logger.info({
        event: "outbound.template.sent",
        waId: maskNumber(params.waId),
        to: maskNumber(params.toE164),
        intent: params.intent ?? "unknown",
        template: params.templateName,
        language: resolvedLang,
        clientId: env.CLIENT_ID,
        requestId: params.requestId,
        rid: params.rid,
        messageId: params.messageId,
        metaMessageId,
      });
      return { ok: true, status: response.status, metaMessageId };
    }

    const errorText = await response.text().catch(() => "");
    logger.error({
      event: "outbound.template.failed",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      template: params.templateName,
      language: resolvedLang,
      clientId: env.CLIENT_ID,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      errorBody: errorText.slice(0, 500),
      status: response.status,
    });
    return { ok: false, status: response.status };
  } catch (error) {
    clearTimeout(timeout);
    logger.error({
      event: "outbound.template.failed",
      waId: maskNumber(params.waId),
      to: maskNumber(params.toE164),
      intent: params.intent ?? "unknown",
      template: params.templateName,
      language: resolvedLang,
      clientId: env.CLIENT_ID,
      requestId: params.requestId,
      rid: params.rid,
      messageId: params.messageId,
      errorMessage: (error as Error).message,
    });
    return { ok: false };
  }
}

export function resolveTemplateForIntent(intent: ConversationIntent | undefined) {
  const key = intent ?? "unknown";
  const byClient = env.OUTBOUND_TEMPLATES_BY_CLIENT[env.CLIENT_ID] ?? {};
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

function maskNumber(number: string) {
  const tail = number.slice(-6);
  return `***${tail}`;
}
