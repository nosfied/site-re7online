export type TenantMetaParticipationEvidence = {
  metaChannelAccount: boolean;
  waPhoneNumber: boolean;
  tenantMetaConfig: boolean;
};

export type TenantMetaParticipation = TenantMetaParticipationEvidence & {
  participatesInMeta: boolean;
  hasCompleteIdentity: boolean;
};

/** Meta requirements do not apply to a tenant that is exclusively Web Session. */
export function classifyTenantMetaParticipation(
  evidence: TenantMetaParticipationEvidence
): TenantMetaParticipation {
  const participatesInMeta = evidence.metaChannelAccount || evidence.waPhoneNumber || evidence.tenantMetaConfig;
  return {
    ...evidence,
    participatesInMeta,
    hasCompleteIdentity: evidence.metaChannelAccount && (evidence.waPhoneNumber || evidence.tenantMetaConfig),
  };
}

export function isActiveTenantMetaContractIncomplete(params: {
  status: string;
  participation: TenantMetaParticipation;
  hasOperationalConfig: boolean;
  operationalConfigReady: boolean;
}) {
  return params.status === "ACTIVE" && params.participation.participatesInMeta && (
    !params.hasOperationalConfig ||
    !params.operationalConfigReady ||
    !params.participation.hasCompleteIdentity
  );
}
