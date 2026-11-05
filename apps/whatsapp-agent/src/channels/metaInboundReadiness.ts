import type { PrismaClient } from "@prisma/client";
import { isManagementOnlyInboxMessage } from "../inbox/messageVisibility.js";
import { compareConversationLookupPriority } from "../utils/waid.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function latestDate(...values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => current > latest ? current : latest);
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export type MetaInboundReadinessAccount = {
  accountId: string | null;
  channelAccountId: string;
  displayName: string | null;
  identityLinked: boolean;
  connected: boolean;
  permissions: {
    enabled: boolean;
    runtimeEnabled: boolean;
    inboundPersistenceEnabled: boolean;
  };
  inboundValidation: {
    validated: boolean;
    persistedOnce: boolean;
    visibleInHumanTimeline: boolean;
    receivedAt: string | null;
    departmentName: string | null;
    queueName: string | null;
    status: string | null;
  };
};

export type MetaInboundReadiness = {
  baseConfig: {
    configured: boolean;
    source: "db" | "json_fallback";
    canMaterialize: boolean;
    updatedAt: string | null;
  };
  accounts: MetaInboundReadinessAccount[];
};

export async function readMetaInboundReadiness(params: {
  prisma: PrismaClient;
  clientId: string;
  hasCanonicalTenantSource: boolean;
}): Promise<MetaInboundReadiness> {
  const [accounts, phoneNumbers, metaConfig, operationalConfig] = await Promise.all([
    params.prisma.channelAccount.findMany({
      where: { clientId: params.clientId, channel: "whatsapp", provider: "meta" },
      orderBy: [{ displayName: "asc" }, { channelAccountId: "asc" }],
      select: {
        id: true,
        displayName: true,
        channelAccountId: true,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        status: true,
        aliases: { select: { alias: true } },
      },
    }),
    params.prisma.waPhoneNumber.findMany({
      where: { clientId: params.clientId },
      orderBy: { phoneNumberId: "asc" },
      select: { phoneNumberId: true },
    }),
    params.prisma.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: { phoneNumberId: true },
    }),
    params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: params.clientId },
      select: { config: true, updatedAt: true },
    }),
  ]);

  const operationalValue = isRecord(operationalConfig?.config) ? operationalConfig.config : {};
  const baseConfigConfigured = isRecord(operationalValue.baseConfig);
  const readinessAccounts: MetaInboundReadinessAccount[] = [];
  const accountEntries = accounts.map((account) => ({
    account,
    bindingIds: Array.from(new Set([
      account.channelAccountId,
      ...account.aliases.map((item) => item.alias),
    ].filter(isNonEmptyString))),
  }));
  const knownMetaBindings = Array.from(new Set([
    ...phoneNumbers.map((item) => item.phoneNumberId),
    metaConfig?.phoneNumberId,
  ].filter(isNonEmptyString)));
  const entries: Array<{
    account: typeof accounts[number] | null;
    bindingIds: string[];
    channelAccountId: string;
  }> = accountEntries.map(({ account, bindingIds }) => ({
    account,
    bindingIds,
    channelAccountId: account.channelAccountId,
  }));
  for (const binding of knownMetaBindings) {
    if (accountEntries.some((entry) => entry.bindingIds.includes(binding))) continue;
    entries.push({ account: null, bindingIds: [binding], channelAccountId: binding });
  }

  for (const entry of entries) {
    const { account, bindingIds } = entry;
    const inboundCandidates = await params.prisma.inboundMessage.findMany({
      where: {
        clientId: params.clientId,
        channel: "whatsapp",
        provider: "meta",
        channelAccountId: { in: bindingIds },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        messageId: true,
        waId: true,
        waIdCanonical: true,
        rawPayload: true,
        createdAt: true,
      },
    });
    const persistedInbound = inboundCandidates[0] ?? null;
    const inbound = inboundCandidates.find((item) => !isManagementOnlyInboxMessage(item.rawPayload)) ?? null;
    const identities = inbound
      ? Array.from(new Set([inbound.waId, inbound.waIdCanonical].filter(isNonEmptyString)))
      : [];
    const conversations = identities.length > 0
      ? await params.prisma.conversation.findMany({
          where: {
            clientId: params.clientId,
            deletedAt: null,
            anonymizedAt: null,
            channel: "whatsapp",
            provider: "meta",
            channelAccountId: { in: bindingIds },
            OR: [{ waId: { in: identities } }, { waIdCanonical: { in: identities } }],
          },
          select: {
            createdAt: true,
            updatedAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            historyVisibleAfter: true,
          },
        })
      : [];
    const conversation = conversations.sort(compareConversationLookupPriority)[0] ?? null;
    const visibleAfter = conversation
      ? latestDate(conversation.createdAt, conversation.historyVisibleAfter)
      : null;
    const visibleInHumanTimeline = Boolean(
      inbound &&
      conversation &&
      (!visibleAfter || inbound.createdAt > visibleAfter)
    );
    const runtime = identities.length > 0
      ? await params.prisma.conversationRuntimeState.findFirst({
          where: {
            clientId: params.clientId,
            channel: "whatsapp",
            provider: "meta",
            channelAccountId: { in: bindingIds },
            OR: [{ waId: { in: identities } }, { waIdCanonical: { in: identities } }],
          },
          orderBy: { updatedAt: "desc" },
          select: {
            status: true,
            department: { select: { name: true } },
            queue: { select: { name: true } },
          },
        })
      : null;

    readinessAccounts.push({
      accountId: account?.id ?? null,
      channelAccountId: entry.channelAccountId,
      displayName: account?.displayName ?? null,
      identityLinked: Boolean(account),
      connected: Boolean(account?.enabled && account.status === "connected"),
      permissions: {
        enabled: account?.enabled ?? false,
        runtimeEnabled: account?.runtimeEnabled ?? false,
        inboundPersistenceEnabled: account?.inboundPersistenceEnabled ?? false,
      },
      inboundValidation: {
        validated: Boolean(account && inbound && visibleInHumanTimeline),
        persistedOnce: Boolean(persistedInbound),
        visibleInHumanTimeline,
        receivedAt: inbound?.createdAt.toISOString() ?? null,
        departmentName: runtime?.department?.name ?? null,
        queueName: runtime?.queue?.name ?? null,
        status: runtime?.status ?? null,
      },
    });
  }

  return {
    baseConfig: {
      configured: baseConfigConfigured,
      source: baseConfigConfigured ? "db" : "json_fallback",
      canMaterialize: !baseConfigConfigured && params.hasCanonicalTenantSource,
      updatedAt: baseConfigConfigured ? operationalConfig?.updatedAt.toISOString() ?? null : null,
    },
    accounts: readinessAccounts,
  };
}
