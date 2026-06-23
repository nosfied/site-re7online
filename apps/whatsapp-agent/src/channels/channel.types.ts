export type Channel = "whatsapp" | "instagram" | "messenger" | "telegram";

export type Provider = "meta" | "telegram";

export type NormalizedInboundEvent = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserId: string;
  externalMessageId?: string;
  externalThreadId?: string;
  text?: string;
  media?: unknown[];
  timestamp?: string;
  raw?: unknown;
};

export type ConversationIdentity = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserId: string;
  conversationKey: string;
  legacyWaId?: string;
};

export type ConversationIdentityInput = Omit<ConversationIdentity, "conversationKey" | "legacyWaId"> & {
  legacyWaId?: string;
};
