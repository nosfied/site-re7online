import { MessageStatus, type PrismaClient } from "@prisma/client";
import { getFeatures } from "../features/clientFeatures.js";
import { readWebSessionLifecycle } from "../web-session/webSessionLifecycle.js";
import type { WebSessionChannelSwitchWarning } from "../web-session/webSessionOutboundService.js";

export type InboxWebSessionChannelSource = {
  id?: string | null;
  waId?: string | null;
  waIdCanonical?: string | null;
  channel?: string | null;
  provider?: string | null;
  channelAccountId?: string | null;
};

type WebSessionChannelAccount = {
  id: string;
  clientId: string;
  channel: string;
  provider: string;
  channelAccountId: string;
  enabled: boolean;
  outboundEnabled: boolean;
  runtimeEnabled: boolean;
  status: string;
  metadata: unknown;
  updatedAt: Date;
  client: {
    id: string;
    clientKey: string;
    status: string;
    features: unknown;
  };
};

type OutboundIdentityRow = {
  waId: string;
  waIdCanonical: string | null;
  channelAccountId: string | null;
  createdAt: Date;
};

export type InboxWebSessionChannelStateBatch = {
  queryCount: number;
  getOutboundEnabled(source: InboxWebSessionChannelSource): boolean | undefined;
  getSwitchWarning(source: InboxWebSessionChannelSource): WebSessionChannelSwitchWarning | null | undefined;
};

function normalizeWebSessionIdentityKey(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits || normalized.toLowerCase();
}

function maskWebSessionIdentity(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? `****${digits.slice(-4)}` : "****";
}

function normalizeProvider(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isWebSessionSource(source: InboxWebSessionChannelSource) {
  return normalizeProvider(source.channel) === "whatsapp" && normalizeProvider(source.provider) === "web_session";
}

function getSourceKey(source: InboxWebSessionChannelSource) {
  return String(source.id ?? source.waIdCanonical ?? source.waId ?? "").trim();
}

function getIdentityCandidates(source: InboxWebSessionChannelSource) {
  return Array.from(
    new Set(
      [source.waId, source.waIdCanonical]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function isWebSessionAccountConnected(account: WebSessionChannelAccount) {
  if (account.client.status !== "ACTIVE") return false;
  if (getFeatures(account.client).whatsappWebSession !== true) return false;
  if (account.channel !== "whatsapp" || account.provider !== "web_session") return false;
  if (!account.enabled || !account.outboundEnabled || !account.runtimeEnabled) return false;
  if (account.status !== "connected") return false;
  return readWebSessionLifecycle(account.metadata).observedState === "CONNECTED";
}

function pickLatestAccount(accounts: WebSessionChannelAccount[]) {
  return accounts
    .slice()
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;
}

function resolveAccountForSource(params: {
  accountsByChannelAccountId: Map<string, WebSessionChannelAccount[]>;
  latestAccount: WebSessionChannelAccount | null;
  source: InboxWebSessionChannelSource;
}) {
  const requestedId = String(params.source.channelAccountId ?? "").trim();
  const requestedAccount = requestedId
    ? pickLatestAccount(params.accountsByChannelAccountId.get(requestedId) ?? [])
    : params.latestAccount;
  if (requestedId && (!requestedAccount || !isWebSessionAccountConnected(requestedAccount))) {
    return params.latestAccount && isWebSessionAccountConnected(params.latestAccount) ? params.latestAccount : null;
  }
  return requestedAccount;
}

function rememberLatestOutbound(
  latestByIdentity: Map<string, OutboundIdentityRow>,
  identity: string | null | undefined,
  row: OutboundIdentityRow
) {
  const key = String(identity ?? "").trim();
  if (!key) return;
  const current = latestByIdentity.get(key);
  if (!current || row.createdAt.getTime() > current.createdAt.getTime()) {
    latestByIdentity.set(key, row);
  }
}

export async function buildInboxWebSessionChannelStateBatch(params: {
  prisma: Pick<PrismaClient, "channelAccount" | "outboundMessage">;
  clientId: string;
  clientKey: string;
  sources: InboxWebSessionChannelSource[];
  features?: { whatsappWebSession?: boolean | null } | null;
}): Promise<InboxWebSessionChannelStateBatch> {
  const webSessionSources = params.sources.filter(isWebSessionSource);
  const outboundEnabledByKey = new Map<string, boolean>();
  const switchWarningByKey = new Map<string, WebSessionChannelSwitchWarning | null>();
  if (webSessionSources.length === 0) {
    return {
      queryCount: 0,
      getOutboundEnabled: () => undefined,
      getSwitchWarning: () => undefined,
    };
  }
  if (params.features?.whatsappWebSession !== true) {
    for (const source of webSessionSources) {
      const key = getSourceKey(source);
      if (!key) continue;
      outboundEnabledByKey.set(key, false);
      switchWarningByKey.set(key, null);
    }
    return {
      queryCount: 0,
      getOutboundEnabled: (source) =>
        isWebSessionSource(source) ? outboundEnabledByKey.get(getSourceKey(source)) ?? false : undefined,
      getSwitchWarning: (source) =>
        isWebSessionSource(source) ? switchWarningByKey.get(getSourceKey(source)) ?? null : undefined,
    };
  }

  let queryCount = 0;
  const accounts = (await params.prisma.channelAccount.findMany({
    where: {
      clientId: params.clientId,
      channel: "whatsapp",
      provider: "web_session",
    },
    include: {
      client: {
        select: {
          id: true,
          clientKey: true,
          status: true,
          features: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  })) as WebSessionChannelAccount[];
  queryCount += 1;
  const tenantAccounts = accounts.filter((account) => account.client.clientKey === params.clientKey);
  const accountsByChannelAccountId = new Map<string, WebSessionChannelAccount[]>();
  for (const account of tenantAccounts) {
    const list = accountsByChannelAccountId.get(account.channelAccountId) ?? [];
    list.push(account);
    accountsByChannelAccountId.set(account.channelAccountId, list);
  }
  const latestAccount = tenantAccounts[0] ?? null;

  const identityCandidates = Array.from(new Set(webSessionSources.flatMap(getIdentityCandidates)));
  const latestByIdentity = new Map<string, OutboundIdentityRow>();
  if (identityCandidates.length > 0) {
    const [byWaId, byWaIdCanonical] = await Promise.all([
      params.prisma.outboundMessage.findMany({
        where: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: "web_session",
          status: MessageStatus.SENT,
          channelAccountId: { not: null },
          waId: { in: identityCandidates },
        },
        orderBy: { createdAt: "desc" },
        select: {
          waId: true,
          waIdCanonical: true,
          channelAccountId: true,
          createdAt: true,
        },
      }),
      params.prisma.outboundMessage.findMany({
        where: {
          clientId: params.clientId,
          channel: "whatsapp",
          provider: "web_session",
          status: MessageStatus.SENT,
          channelAccountId: { not: null },
          waIdCanonical: { in: identityCandidates },
        },
        orderBy: { createdAt: "desc" },
        select: {
          waId: true,
          waIdCanonical: true,
          channelAccountId: true,
          createdAt: true,
        },
      }),
    ]);
    queryCount += 2;
    for (const row of [...byWaId, ...byWaIdCanonical] as OutboundIdentityRow[]) {
      rememberLatestOutbound(latestByIdentity, row.waId, row);
      rememberLatestOutbound(latestByIdentity, row.waIdCanonical, row);
    }
  }

  for (const source of webSessionSources) {
    const key = getSourceKey(source);
    if (!key) continue;
    const account = resolveAccountForSource({
      accountsByChannelAccountId,
      latestAccount,
      source,
    });
    const connected = Boolean(account && isWebSessionAccountConnected(account));
    outboundEnabledByKey.set(key, connected);
    if (!account || !connected) {
      switchWarningByKey.set(key, null);
      continue;
    }
    const currentIdentityKey = normalizeWebSessionIdentityKey(account.channelAccountId);
    if (!currentIdentityKey) {
      switchWarningByKey.set(key, null);
      continue;
    }
    const latestOutbound =
      getIdentityCandidates(source)
        .map((identity) => latestByIdentity.get(identity) ?? null)
        .filter((row): row is OutboundIdentityRow => Boolean(row))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
    const previousIdentityKey = normalizeWebSessionIdentityKey(latestOutbound?.channelAccountId);
    if (!previousIdentityKey || previousIdentityKey === currentIdentityKey) {
      switchWarningByKey.set(key, null);
      continue;
    }
    switchWarningByKey.set(key, {
      pending: true,
      previousIdentityMasked: maskWebSessionIdentity(latestOutbound?.channelAccountId),
      currentIdentityMasked: maskWebSessionIdentity(account.channelAccountId),
    });
  }

  return {
    queryCount,
    getOutboundEnabled: (source) =>
      isWebSessionSource(source) ? outboundEnabledByKey.get(getSourceKey(source)) ?? false : undefined,
    getSwitchWarning: (source) =>
      isWebSessionSource(source) ? switchWarningByKey.get(getSourceKey(source)) ?? null : undefined,
  };
}
