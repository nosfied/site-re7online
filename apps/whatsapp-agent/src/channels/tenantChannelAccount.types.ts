import type { Channel, Provider } from "./channel.types.js";

export type TenantChannelAccountStatus = "connected" | "disabled" | "pending" | "error";

export type TenantChannelTokenStatus = "not_required" | "configured" | "expired" | "missing";

export type TenantChannelAccount = {
  id: string;
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  displayName?: string;
  channelAccountId: string;
  externalAccountIds?: string[];
  externalBusinessId?: string;
  metadata?: Record<string, string>;
  enabled: boolean;
  automationEnabled?: boolean;
  runtimeEnabled?: boolean;
  inboundPersistenceEnabled?: boolean;
  outboundEnabled?: boolean;
  aiEnabled?: boolean;
  handoffEnabled?: boolean;
  status?: TenantChannelAccountStatus;
  tokenStatus?: TenantChannelTokenStatus;
  pageAccessToken?: string;
  instagramBusinessAccessToken?: string;
  createdAt?: string;
  updatedAt?: string;
};
