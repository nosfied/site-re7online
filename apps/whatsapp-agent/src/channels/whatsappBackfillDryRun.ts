import crypto from "node:crypto";

export type BackfillModelName =
  | "conversations"
  | "runtimeStates"
  | "inboundMessages"
  | "outboundMessages"
  | "leads"
  | "contacts";

export type WhatsAppBackfillClient = {
  id: string;
  clientKey: string;
  phoneNumberIds: string[];
  tenantConfigMetaPhoneNumberId?: string | null;
};

export type WhatsAppBackfillRecord = {
  model: BackfillModelName;
  id: string;
  clientId: string;
  clientKey?: string;
  waId?: string | null;
  phoneNumberId?: string | null;
};

export type WhatsAppBackfillSimulation = {
  channel: "whatsapp";
  provider: "meta";
  legacyWaIdHash: string | null;
  externalUserHash: string | null;
  channelAccountId: string | null;
};

export type WhatsAppBackfillRisk = {
  type:
    | "missing_waid"
    | "missing_channel_account_id"
    | "multiple_channel_accounts"
    | "unknown_client"
    | "external_user_hash_collision"
    | "message_without_conversation";
  model: BackfillModelName;
  recordId?: string;
  clientId?: string;
  clientKey?: string;
  waIdHash?: string | null;
  externalUserHash?: string | null;
  channelAccountId?: string | null;
  details?: string;
};

export type WhatsAppBackfillSample = {
  model: BackfillModelName;
  recordId: string;
  clientKey?: string;
  waIdHash: string | null;
  externalUserHash: string | null;
  channelAccountId: string | null;
  action: "would_backfill" | "would_skip";
  reason?: string;
};

export type WhatsAppBackfillRiskByTenant = {
  tenantKey: string;
  clientId: string;
  channelAccountResolution:
    | "wa_phone_number"
    | "tenant_config_meta_phone_number_id"
    | "missing"
    | "multiple_wa_phone_numbers";
  warnings: Array<
    | "tenant_without_wa_phone_number"
    | "tenant_config_meta_phone_number_id_without_wa_phone_number"
    | "multiple_wa_phone_numbers"
    | "tenant_without_resolvable_channel_account"
    | "orphan_records"
  >;
  models: Partial<Record<BackfillModelName, {
    missingChannelAccountId: number;
    missingWaId: number;
    multipleChannelAccounts: number;
    unknownClient: number;
    messageWithoutConversation: number;
  }>>;
  waPhoneNumbers: string[];
  tenantConfigMetaPhoneNumberId: string | null;
  recommendation:
    | "configure_wa_phone_number_or_tenant_meta_phone_number_id"
    | "choose_canonical_wa_phone_number"
    | "link_runtime_leads_contacts_to_channel_account"
    | "review_orphan_records"
    | "no_action_required";
};

export type WhatsAppBackfillDryRunReport = {
  ok: boolean;
  dryRun: true;
  generatedAt: string;
  filters: {
    tenant: string | null;
    limit: number;
    includeSamples: boolean;
  };
  counts: Record<BackfillModelName, number>;
  resolvable: Record<BackfillModelName, number>;
  missingChannelAccountId: Record<BackfillModelName, number>;
  conflicts: WhatsAppBackfillRisk[];
  riskByTenant?: WhatsAppBackfillRiskByTenant[];
  samples: WhatsAppBackfillSample[];
  risks: {
    missingWaId: number;
    unknownClient: number;
    multipleChannelAccounts: number;
    missingChannelAccountId: number;
    externalUserHashCollisions: number;
    messageWithoutConversation: number;
  };
};

export type BuildWhatsAppBackfillDryRunReportInput = {
  clients: WhatsAppBackfillClient[];
  records: Record<BackfillModelName, WhatsAppBackfillRecord[]>;
  conversationIdentityKeys?: Set<string>;
  tenant?: string | null;
  limit?: number;
  includeSamples?: boolean;
  includeRiskReport?: boolean;
  nowIso?: string;
};

const MODEL_NAMES: BackfillModelName[] = [
  "conversations",
  "runtimeStates",
  "inboundMessages",
  "outboundMessages",
  "leads",
  "contacts",
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function hashWhatsAppExternalUser(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function maskWhatsAppId(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return `hash:${hashWhatsAppExternalUser(normalized)}`;
}

function emptyCounts(): Record<BackfillModelName, number> {
  return {
    conversations: 0,
    runtimeStates: 0,
    inboundMessages: 0,
    outboundMessages: 0,
    leads: 0,
    contacts: 0,
  };
}

function identityKey(clientId: string, channelAccountId: string | null, waIdHash: string | null) {
  return [clientId, "whatsapp", "meta", channelAccountId ?? "", waIdHash ?? ""].join("|");
}

function resolveChannelAccountId(
  record: WhatsAppBackfillRecord,
  client?: WhatsAppBackfillClient
): { value: string | null; risk?: "unknown_client" | "missing_channel_account_id" | "multiple_channel_accounts" } {
  const direct = normalizeText(record.phoneNumberId);
  if (direct) return { value: direct };
  if (!client) return { value: null, risk: "unknown_client" };
  const uniquePhoneIds = [...new Set(client.phoneNumberIds.map(normalizeText).filter(Boolean))];
  if (uniquePhoneIds.length === 1) return { value: uniquePhoneIds[0] ?? null };
  const tenantConfigPhone = normalizeText(client.tenantConfigMetaPhoneNumberId);
  if (tenantConfigPhone && uniquePhoneIds.length === 0) return { value: tenantConfigPhone };
  if (uniquePhoneIds.length > 1) return { value: null, risk: "multiple_channel_accounts" };
  return { value: null, risk: "missing_channel_account_id" };
}

function riskCountForModel(risks: WhatsAppBackfillRisk[], model: BackfillModelName) {
  const scoped = risks.filter((risk) => risk.model === model);
  return {
    missingChannelAccountId: scoped.filter((risk) => risk.type === "missing_channel_account_id").length,
    missingWaId: scoped.filter((risk) => risk.type === "missing_waid").length,
    multipleChannelAccounts: scoped.filter((risk) => risk.type === "multiple_channel_accounts").length,
    unknownClient: scoped.filter((risk) => risk.type === "unknown_client").length,
    messageWithoutConversation: scoped.filter((risk) => risk.type === "message_without_conversation").length,
  };
}

function chooseTenantRecommendation(
  client: WhatsAppBackfillClient | undefined,
  risks: WhatsAppBackfillRisk[]
): WhatsAppBackfillRiskByTenant["recommendation"] {
  if (risks.some((risk) => risk.type === "unknown_client" || risk.type === "message_without_conversation")) {
    return "review_orphan_records";
  }
  if (risks.some((risk) => risk.type === "multiple_channel_accounts")) {
    return "choose_canonical_wa_phone_number";
  }
  if (risks.some((risk) => risk.type === "missing_channel_account_id")) {
    const hasNoDbPhone = !client || client.phoneNumberIds.length === 0;
    const hasConfigPhone = Boolean(normalizeText(client?.tenantConfigMetaPhoneNumberId));
    return hasNoDbPhone && !hasConfigPhone
      ? "configure_wa_phone_number_or_tenant_meta_phone_number_id"
      : "link_runtime_leads_contacts_to_channel_account";
  }
  return "no_action_required";
}

function getTenantChannelAccountResolution(client: WhatsAppBackfillClient | undefined): WhatsAppBackfillRiskByTenant["channelAccountResolution"] {
  if (!client) return "missing";
  const uniquePhoneIds = [...new Set(client.phoneNumberIds.map(normalizeText).filter(Boolean))];
  if (uniquePhoneIds.length > 1) return "multiple_wa_phone_numbers";
  if (uniquePhoneIds.length === 1) return "wa_phone_number";
  if (normalizeText(client.tenantConfigMetaPhoneNumberId)) return "tenant_config_meta_phone_number_id";
  return "missing";
}

function buildTenantWarnings(
  client: WhatsAppBackfillClient | undefined,
  risks: WhatsAppBackfillRisk[]
): WhatsAppBackfillRiskByTenant["warnings"] {
  const warnings = new Set<WhatsAppBackfillRiskByTenant["warnings"][number]>();
  const uniquePhoneIds = [...new Set((client?.phoneNumberIds ?? []).map(normalizeText).filter(Boolean))];
  const hasConfigPhone = Boolean(normalizeText(client?.tenantConfigMetaPhoneNumberId));

  if (uniquePhoneIds.length === 0) warnings.add("tenant_without_wa_phone_number");
  if (uniquePhoneIds.length === 0 && hasConfigPhone) {
    warnings.add("tenant_config_meta_phone_number_id_without_wa_phone_number");
  }
  if (uniquePhoneIds.length > 1) warnings.add("multiple_wa_phone_numbers");
  if (uniquePhoneIds.length === 0 && !hasConfigPhone) warnings.add("tenant_without_resolvable_channel_account");
  if (risks.some((risk) => risk.type === "unknown_client" || risk.type === "message_without_conversation")) {
    warnings.add("orphan_records");
  }

  return [...warnings];
}

export function buildWhatsAppBackfillRiskByTenant(
  clients: WhatsAppBackfillClient[],
  risks: WhatsAppBackfillRisk[]
): WhatsAppBackfillRiskByTenant[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const risksByClient = new Map<string, WhatsAppBackfillRisk[]>();
  for (const risk of risks) {
    const clientId = normalizeText(risk.clientId);
    if (!clientId) continue;
    const current = risksByClient.get(clientId) ?? [];
    current.push(risk);
    risksByClient.set(clientId, current);
  }

  const clientIdsWithTenantRisk = new Set([
    ...risksByClient.keys(),
    ...clients
      .filter((client) => {
        const warnings = buildTenantWarnings(client, []);
        return warnings.length > 0;
      })
      .map((client) => client.id),
  ]);

  return [...clientIdsWithTenantRisk]
    .map((clientId) => {
      const client = clientsById.get(clientId);
      const tenantRisks = risksByClient.get(clientId) ?? [];
      const models: WhatsAppBackfillRiskByTenant["models"] = {};
      for (const model of MODEL_NAMES) {
        const counts = riskCountForModel(tenantRisks, model);
        if (Object.values(counts).some((value) => value > 0)) {
          models[model] = counts;
        }
      }
      return {
        tenantKey: client?.clientKey ?? tenantRisks[0]?.clientKey ?? "unknown",
        clientId,
        channelAccountResolution: getTenantChannelAccountResolution(client),
        warnings: buildTenantWarnings(client, tenantRisks),
        models,
        waPhoneNumbers: client?.phoneNumberIds.map((value) => `hash:${hashWhatsAppExternalUser(value)}`) ?? [],
        tenantConfigMetaPhoneNumberId: client?.tenantConfigMetaPhoneNumberId
          ? `hash:${hashWhatsAppExternalUser(client.tenantConfigMetaPhoneNumberId)}`
          : null,
        recommendation: chooseTenantRecommendation(client, tenantRisks),
      };
    })
    .sort((a, b) => a.tenantKey.localeCompare(b.tenantKey));
}

export function simulateWhatsAppBackfillRecord(
  record: WhatsAppBackfillRecord,
  client?: WhatsAppBackfillClient
): { simulation: WhatsAppBackfillSimulation; risks: WhatsAppBackfillRisk[] } {
  const clientKey = record.clientKey ?? client?.clientKey;
  const waId = normalizeText(record.waId);
  const legacyWaIdHash = waId ? hashWhatsAppExternalUser(waId) : null;
  const { value: channelAccountId, risk } = resolveChannelAccountId(record, client);
  const risks: WhatsAppBackfillRisk[] = [];

  if (!waId) {
    risks.push({
      type: "missing_waid",
      model: record.model,
      recordId: record.id,
      clientId: record.clientId,
      clientKey,
      waIdHash: null,
      externalUserHash: null,
      channelAccountId,
    });
  }

  if (risk) {
    risks.push({
      type: risk,
      model: record.model,
      recordId: record.id,
      clientId: record.clientId,
      clientKey,
      waIdHash: legacyWaIdHash ? `hash:${legacyWaIdHash}` : null,
      externalUserHash: legacyWaIdHash,
      channelAccountId,
    });
  }

  return {
    simulation: {
      channel: "whatsapp",
      provider: "meta",
      legacyWaIdHash: legacyWaIdHash ? `hash:${legacyWaIdHash}` : null,
      externalUserHash: legacyWaIdHash,
      channelAccountId,
    },
    risks,
  };
}

export function buildWhatsAppBackfillDryRunReport(
  input: BuildWhatsAppBackfillDryRunReportInput
): WhatsAppBackfillDryRunReport {
  const limit = Math.max(0, Math.min(100, Math.trunc(input.limit ?? 20)));
  const includeSamples = input.includeSamples === true;
  const includeRiskReport = input.includeRiskReport === true;
  const clientsById = new Map(input.clients.map((client) => [client.id, client]));
  const counts = emptyCounts();
  const resolvable = emptyCounts();
  const missingChannelAccountId = emptyCounts();
  const risks: WhatsAppBackfillRisk[] = [];
  const samples: WhatsAppBackfillSample[] = [];
  const hashOwners = new Map<string, { waIdHash: string; records: string[] }>();

  for (const model of MODEL_NAMES) {
    const records = input.records[model] ?? [];
    counts[model] = records.length;

    for (const record of records) {
      const client = clientsById.get(record.clientId);
      const clientKey = record.clientKey ?? client?.clientKey;
      const { simulation, risks: recordRisks } = simulateWhatsAppBackfillRecord(
        { ...record, clientKey },
        client
      );
      risks.push(...recordRisks);

      if (simulation.channelAccountId) {
        resolvable[model] += 1;
      } else {
        missingChannelAccountId[model] += 1;
      }

      if (simulation.externalUserHash) {
        const key = identityKey(record.clientId, simulation.channelAccountId, simulation.externalUserHash);
        const current = hashOwners.get(key);
        const waIdHash = simulation.legacyWaIdHash ?? "";
        if (!current) {
          hashOwners.set(key, { waIdHash, records: [`${model}:${record.id}`] });
        } else {
          current.records.push(`${model}:${record.id}`);
          if (current.waIdHash !== waIdHash) {
            risks.push({
              type: "external_user_hash_collision",
              model,
              recordId: record.id,
              clientId: record.clientId,
              clientKey,
              waIdHash,
              externalUserHash: simulation.externalUserHash,
              channelAccountId: simulation.channelAccountId,
              details: "same scope/hash with divergent masked waId",
            });
          }
        }
      }

      if (
        (model === "inboundMessages" || model === "outboundMessages") &&
        input.conversationIdentityKeys &&
        simulation.externalUserHash &&
        simulation.channelAccountId &&
        !input.conversationIdentityKeys.has(
          identityKey(record.clientId, simulation.channelAccountId, simulation.externalUserHash)
        )
      ) {
        risks.push({
          type: "message_without_conversation",
          model,
          recordId: record.id,
          clientId: record.clientId,
          clientKey,
          waIdHash: simulation.legacyWaIdHash,
          externalUserHash: simulation.externalUserHash,
          channelAccountId: simulation.channelAccountId,
        });
      }

      if (includeSamples && samples.length < limit) {
        samples.push({
          model,
          recordId: record.id,
          clientKey,
          waIdHash: simulation.legacyWaIdHash,
          externalUserHash: simulation.externalUserHash,
          channelAccountId: simulation.channelAccountId,
          action: recordRisks.length === 0 ? "would_backfill" : "would_skip",
          ...(recordRisks[0]?.type ? { reason: recordRisks[0].type } : {}),
        });
      }
    }
  }

  return {
    ok: risks.length === 0,
    dryRun: true,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    filters: {
      tenant: input.tenant ?? null,
      limit,
      includeSamples,
    },
    counts,
    resolvable,
    missingChannelAccountId,
    conflicts: risks,
    ...(includeRiskReport ? { riskByTenant: buildWhatsAppBackfillRiskByTenant(input.clients, risks) } : {}),
    samples,
    risks: {
      missingWaId: risks.filter((risk) => risk.type === "missing_waid").length,
      unknownClient: risks.filter((risk) => risk.type === "unknown_client").length,
      multipleChannelAccounts: risks.filter((risk) => risk.type === "multiple_channel_accounts").length,
      missingChannelAccountId: risks.filter((risk) => risk.type === "missing_channel_account_id").length,
      externalUserHashCollisions: risks.filter((risk) => risk.type === "external_user_hash_collision").length,
      messageWithoutConversation: risks.filter((risk) => risk.type === "message_without_conversation").length,
    },
  };
}

export function buildConversationIdentityKeys(records: WhatsAppBackfillRecord[], clients: WhatsAppBackfillClient[]) {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const keys = new Set<string>();
  for (const record of records) {
    const { simulation } = simulateWhatsAppBackfillRecord(record, clientsById.get(record.clientId));
    if (simulation.externalUserHash && simulation.channelAccountId) {
      keys.add(identityKey(record.clientId, simulation.channelAccountId, simulation.externalUserHash));
    }
  }
  return keys;
}
