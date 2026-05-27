import type {
  Channel,
  ConversationIdentity,
  ConversationIdentityInput,
  NormalizedInboundEvent,
  Provider,
} from "./channel.types.js";

const SUPPORTED_CHANNELS = new Set<Channel>(["whatsapp", "instagram", "messenger"]);
const SUPPORTED_PROVIDERS = new Set<Provider>(["meta"]);

function normalizeIdentifier(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasSeparator(value: string) {
  return /[:\s]/.test(value);
}

function assertPlainIdentifier(name: string, value: string) {
  if (!value) {
    throw new Error(`${name}_required`);
  }
  if (hasSeparator(value)) {
    throw new Error(`${name}_invalid`);
  }
}

export function isWhatsAppIdentity(
  identity: Pick<ConversationIdentityInput | ConversationIdentity, "channel">
) {
  return identity.channel === "whatsapp";
}

export function buildConversationKey(identityInput: ConversationIdentityInput) {
  const tenantKey = normalizeIdentifier(identityInput.tenantKey);
  const channel = identityInput.channel;
  const provider = identityInput.provider;
  const channelAccountId = normalizeIdentifier(identityInput.channelAccountId);
  const externalUserId = normalizeIdentifier(identityInput.externalUserId);

  assertPlainIdentifier("tenantKey", tenantKey);
  if (!SUPPORTED_CHANNELS.has(channel)) {
    throw new Error("channel_invalid");
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error("provider_invalid");
  }
  assertPlainIdentifier("channelAccountId", channelAccountId);
  assertPlainIdentifier("externalUserId", externalUserId);

  if (channel === "whatsapp") {
    return `${tenantKey}:${externalUserId}`;
  }

  return `${tenantKey}:${channel}:${channelAccountId}:${externalUserId}`;
}

export function assertValidChannelIdentity(identity: ConversationIdentity) {
  const expectedKey = buildConversationKey(identity);
  if (identity.conversationKey !== expectedKey) {
    throw new Error("conversationKey_invalid");
  }
  if (identity.legacyWaId && identity.channel !== "whatsapp") {
    throw new Error("legacyWaId_channel_invalid");
  }
}

export function getLegacyWaIdFromIdentity(
  identity: Pick<ConversationIdentity, "channel" | "externalUserId" | "legacyWaId">
) {
  if (identity.channel !== "whatsapp") {
    return undefined;
  }
  return normalizeIdentifier(identity.legacyWaId) || normalizeIdentifier(identity.externalUserId);
}

export function toConversationIdentity(input: ConversationIdentityInput): ConversationIdentity {
  const conversationKey = buildConversationKey(input);
  const identity: ConversationIdentity = {
    tenantKey: normalizeIdentifier(input.tenantKey),
    channel: input.channel,
    provider: input.provider,
    channelAccountId: normalizeIdentifier(input.channelAccountId),
    externalUserId: normalizeIdentifier(input.externalUserId),
    conversationKey,
    ...(input.channel === "whatsapp"
      ? { legacyWaId: normalizeIdentifier(input.legacyWaId) || normalizeIdentifier(input.externalUserId) }
      : {}),
  };
  assertValidChannelIdentity(identity);
  return identity;
}

export function assertValidNormalizedInboundEvent(event: NormalizedInboundEvent) {
  const identity = toConversationIdentity({
    tenantKey: event.tenantKey,
    channel: event.channel,
    provider: event.provider,
    channelAccountId: event.channelAccountId,
    externalUserId: event.externalUserId,
  });
  assertValidChannelIdentity(identity);
}
