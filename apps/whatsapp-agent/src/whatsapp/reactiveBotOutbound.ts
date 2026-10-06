import { resolveEffectiveWhatsappOutboundTransport } from "../crm/crmConversationStart.js";
import { createWebSessionTextOutboundMessage } from "../web-session/webSessionOutboundService.js";
import { reactiveRoutingDecision, revalidateReactiveSubmission } from "./reactiveOutboundPolicy.js";
import { resolveTenantOutboundCredentials } from "./tenantCredentials.js";
import { sendTextMessage } from "./whatsapp.client.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { checkUsageGate } from "../usage/usageGate.js";
import { invalidateRuntimeWriteToken, recordOwnRuntimeOutboundActivity } from "../conversation/runtimeWriteFence.js";
import { buildMetaUsageEventPayload, recordMetaUsageLedgerEvent } from "../billing/metaUsageLedger.js";

type Params = Omit<Parameters<typeof createWebSessionTextOutboundMessage>[0], "outboundSource" | "actorUserId" | "skipAgentSignature"> & {
  outboundSource: "bot"; actorUserId?: null; skipAgentSignature: true;
};

// One selected sender, one submission. Errors never select an alternative.
export async function createReactiveBotTextOutboundMessage(params: Params) {
  const client = await params.prisma.client.findFirst({
    where: { id: params.clientId, clientKey: params.clientKey }, select: { status: true },
  });
  const transport = await resolveEffectiveWhatsappOutboundTransport({ ...params, clientStatus: client?.status, intent: "REACTIVE_AUTOMATION" });
  if (transport.status !== "ready") return { ok: false as const, statusCode: 409, error: "whatsapp_transport_unavailable" };
  const routingDecision = reactiveRoutingDecision("REACTIVE_AUTOMATION", transport);
  const revalidate = (prepared: { channelAccountId: string }) => revalidateReactiveSubmission({ ...params, provider: transport.provider,
    expectedWebAccountId: prepared.channelAccountId, intent: "REACTIVE_AUTOMATION" });
  if (transport.provider === "web_session") {
    const result = await createWebSessionTextOutboundMessage({
      ...params, routingDecision, source: { channel: "whatsapp", provider: "web_session", channelAccountId: null }, beforeSubmit: revalidate,
    });
    return { ...result, provider: "web_session" as const };
  }
  const credentials = await resolveTenantOutboundCredentials(params);
  if (!credentials) return { ok: false as const, statusCode: 503, error: "tenant_outbound_credentials_missing" };
  const account = await params.prisma.waPhoneNumber.findFirst({
    where: { clientId: params.clientId, phoneNumberId: credentials.phoneNumberId }, select: { id: true },
  });
  const config = await params.prisma.tenantMetaConfig.findUnique({ where: { clientId: params.clientId }, select: { phoneNumberId: true } });
  if (!account && config?.phoneNumberId !== credentials.phoneNumberId) return { ok: false as const, statusCode: 409, error: "meta_account_unproven" };
  const usage = await checkUsageGate({ ...params, messageType: "text" });
  if (!usage.allowed) return { ok: false as const, statusCode: 429, error: "usage_limit_reached" };
  const blocked = await revalidateReactiveSubmission({ ...params, provider: "meta", expectedMetaCredentials: credentials, intent: "REACTIVE_AUTOMATION" });
  if (blocked) return { ok: false as const, statusCode: 409, error: blocked };
  const result = await sendTextMessage(params.waId, params.text, credentials);
  const status = result.ok ? "SENT" as const : "FAILED" as const;
  const messageId = `reactive.bot.${params.requestId}`;
  const createdAt = new Date();
  const usageInput = { outboundMessageId: messageId, source: "bot" as const, messageKind: "free_text" as const,
    templateCategory: "service", status, windowOpenAtSend: true, waId: params.waId, sentAt: createdAt.toISOString() };
  const metaUsage = buildMetaUsageEventPayload(usageInput);
  await persistOutboundMessage({ ...params, phoneNumberId: credentials.phoneNumberId, provider: "meta", channel: "whatsapp",
    channelAccountId: null, messageId, type: "TEXT", status, bodyText: params.text, metaMessageId: result.messageId ?? null,
    errorBody: result.errorBody ?? null, rawPayload: { source: "bot", routingDecision, actor: { source: "bot", userId: null }, metaUsage,
      ...(params.inboxVisibility ? { inboxVisibility: params.inboxVisibility, inboxInteractionKind: params.inboxInteractionKind ?? "bot" } : {}),
      ...(params.serviceCycle ? { serviceCycle: params.serviceCycle } : {}) } });
  await recordMetaUsageLedgerEvent({ ...params, messageId,
    eventName: result.ok ? "meta.usage.estimated" : "meta.usage.updated", input: usageInput });
  await persistEvent({ ...params, messageId, eventName: result.ok ? "outbound.text.sent" : "outbound.text.failed",
    payloadJson: { routingDecision, provider: "meta", source: "bot", status, errorBody: result.errorBody ?? null } });
  if (result.ok) {
    const identity = { clientId: params.clientId, waId: params.waId, channel: "whatsapp",
      OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lte: createdAt } }] };
    await params.prisma.conversation.updateMany({ where: identity, data: { lastOutboundAt: createdAt } });
    const token = params.runtimeWriteToken;
    try {
      if (!token || !await recordOwnRuntimeOutboundActivity({ ...params, expected: token, sentAt: createdAt,
        messageId, channelAccountId: "", preserveTransport: true })) {
        await params.prisma.conversationRuntimeState.updateMany({ where: identity,
          data: { lastOutboundAt: createdAt, lastOutboundMessageId: messageId } });
      }
    } catch (error) { if (token) invalidateRuntimeWriteToken(token); throw error; }
  }
  const row = await params.prisma.outboundMessage.findUnique({ where: { clientId_messageId: { clientId: params.clientId, messageId } }, select: { id: true } });
  return { ok: true as const, provider: "meta" as const, status, messageId, internalMessageId: row?.id ?? null, metaMessageId: result.messageId ?? null,
    createdAt: createdAt.toISOString(), bodyText: params.text, agentSignatureApplied: false, agentSignatureFormat: null };
}
