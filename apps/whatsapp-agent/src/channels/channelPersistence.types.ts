import type { Channel, Provider } from "./channel.types.js";

export type ChannelPersistenceTarget = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  externalUserHash: string;
  legacyWaId?: string;
};

export type ChannelPersistenceStrategy =
  | "legacy_whatsapp"
  | "new_multichannel_required"
  | "unsupported";

export type ChannelPersistenceEntity =
  | "conversation"
  | "runtime_state"
  | "inbound_message"
  | "lead"
  | "contact";

export type ChannelPersistenceSchemaChange = {
  model: string;
  change: string;
  reason: string;
};

export type ChannelPersistencePlan = {
  id: string;
  createdAt: string;
  target: ChannelPersistenceTarget;
  strategy: ChannelPersistenceStrategy;
  wouldCreateOrUpdate: ChannelPersistenceEntity[];
  requiredSchemaChanges?: ChannelPersistenceSchemaChange[];
  blockers: string[];
  warnings: string[];
  safeToPersistNow: boolean;
  passive: true;
};

export type ChannelPersistencePlanSummary = {
  strategy: ChannelPersistenceStrategy;
  safeToPersistNow: boolean;
  blockers: string[];
  warnings: string[];
  requiredSchemaChangeCount: number;
  wouldCreateOrUpdate: ChannelPersistenceEntity[];
};
