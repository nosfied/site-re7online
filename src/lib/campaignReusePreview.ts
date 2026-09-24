import type {
  AppApiError,
  AppCampaignAudiencePreviewItem,
  AppCampaignAudiencePreviewResponse,
  AppCrmContactItem,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

export const CAMPAIGN_REUSE_PREVIEW_CONCURRENCY = 4;

export type CampaignReusePreviewState = "idle" | "loading" | "ready" | "partial" | "failed";
export type ReuseHydrationErrorKind = "not_found" | "unauthorized" | "network" | "failed";

export type CampaignReusePreviewCampaign = {
  id: string;
  name?: string | null;
  updatedAt: string;
  draftSeed?: {
    leadIds?: string[] | null;
    recipients?: string[] | null;
    dynamicFilter?: { crmBusinessStatusId?: string | null } | null;
  } | null;
};

export function getReuseHydrationErrorKind(error: unknown): ReuseHydrationErrorKind {
  const typed = error as AppApiError;
  if (typed.status === 404) return "not_found";
  if (typed.status === 401 || typed.status === 403) return "unauthorized";
  if (typed.status === 0 || typed.errorCode === "network_error" || typed.errorCode === "network_timeout") return "network";
  return "failed";
}

export function getReuseHydrationBlockedCopy(kind: ReuseHydrationErrorKind) {
  switch (kind) {
    case "not_found":
      return {
        reason: "missing_contact" as const,
        label: "Contato atual não localizado",
        itemLabel: "Contato atual não localizado",
      };
    case "unauthorized":
      return {
        reason: "missing_contact" as const,
        label: getAppErrorUxMessage({ status: 403 }),
        itemLabel: "Consulta sem permissão",
      };
    case "network":
      return {
        reason: "missing_contact" as const,
        label: "Falha de conexão ao consultar contato atual",
        itemLabel: "Falha de conexão na consulta",
      };
    case "failed":
    default:
      return {
        reason: "missing_contact" as const,
        label: "Falha ao consultar contato atual",
        itemLabel: "Falha ao consultar contato atual",
      };
  }
}

export function getAudienceCrmStatusDisplay(item: AppCampaignAudiencePreviewItem) {
  if (item.crmStatusLabel || item.crmStatus) return item.crmStatusLabel || item.crmStatus;
  if (item.blockedReason === "missing_contact" && item.blockedReasonLabel) return item.blockedReasonLabel;
  return "Sem situação";
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );
  return results;
}

export async function buildHydratedCampaignReusePreview(params: {
  campaign: CampaignReusePreviewCampaign;
  generation: number;
  isCurrentGeneration: (generation: number) => boolean;
  fetchContactDetail: (leadId: string) => Promise<AppCrmContactItem>;
  resolveBlockedReason: (item: AppCrmContactItem) => AppCampaignAudiencePreviewItem["blockedReason"];
  getBlockedReasonLabel: (reason: AppCampaignAudiencePreviewItem["blockedReason"]) => string | null;
}): Promise<{ preview: AppCampaignAudiencePreviewResponse; state: Extract<CampaignReusePreviewState, "ready" | "partial"> } | null> {
  const { campaign, generation, isCurrentGeneration, fetchContactDetail, resolveBlockedReason, getBlockedReasonLabel } = params;
  const leadIds = campaign.draftSeed?.leadIds ?? [];
  if (leadIds.length === 0) return null;
  const itemsByLeadId = new Map<string, AppCampaignAudiencePreviewItem>();
  const blockedByReason = new Map<string, { reason: AppCampaignAudiencePreviewItem["blockedReason"]; label: string; count: number }>();
  let hydrationFailed = false;

  await mapWithConcurrency(leadIds, CAMPAIGN_REUSE_PREVIEW_CONCURRENCY, async (leadId, index) => {
    if (!isCurrentGeneration(generation)) return null;
    try {
      const item = await fetchContactDetail(leadId);
      if (!isCurrentGeneration(generation)) return null;
      const blockedReason = resolveBlockedReason(item);
      const blockedReasonLabel = getBlockedReasonLabel(blockedReason);
      if (blockedReason && blockedReasonLabel) {
        const current = blockedByReason.get(blockedReason);
        blockedByReason.set(blockedReason, {
          reason: blockedReason,
          label: blockedReasonLabel,
          count: (current?.count ?? 0) + 1,
        });
      }
      itemsByLeadId.set(leadId, {
        leadId: item.leadId,
        contactId: item.contactId,
        displayName: item.displayName,
        companyName: item.companyName,
        city: item.city,
        crmStatus: item.crmStatus,
        crmStatusLabel: item.crmStatusLabel,
        channel: item.channel,
        phoneDisplay: item.phoneDisplay,
        identifierDisplay: item.identifierDisplay,
        activeOptOut: item.activeOptOut,
        isAnonymized: item.isAnonymized,
        hasValidWhatsappIdentity: item.hasValidWhatsappIdentity,
        lastConversationIdentity: item.lastConversationIdentity,
        lastProtocol: item.lastProtocol,
        importedSource: item.importedSource,
        updatedAt: item.updatedAt,
        eligible: !blockedReason,
        blockedReason,
        blockedReasonLabel,
      });
    } catch (error) {
      hydrationFailed = true;
      if (!isCurrentGeneration(generation)) return null;
      const copy = getReuseHydrationBlockedCopy(getReuseHydrationErrorKind(error));
      const current = blockedByReason.get(copy.label);
      blockedByReason.set(copy.label, {
        reason: copy.reason,
        label: copy.label,
        count: (current?.count ?? 0) + 1,
      });
      itemsByLeadId.set(leadId, {
        leadId,
        contactId: null,
        displayName: null,
        companyName: null,
        city: null,
        crmStatus: "",
        crmStatusLabel: "",
        channel: "whatsapp",
        phoneDisplay: campaign.draftSeed?.recipients?.[index] ?? leadId,
        identifierDisplay: campaign.draftSeed?.recipients?.[index] ?? leadId,
        activeOptOut: false,
        isAnonymized: false,
        hasValidWhatsappIdentity: false,
        lastConversationIdentity: null,
        lastProtocol: null,
        importedSource: `Reuso da campanha ${campaign.name || campaign.id}`,
        updatedAt: campaign.updatedAt,
        eligible: false,
        blockedReason: copy.reason,
        blockedReasonLabel: copy.itemLabel,
      });
    }
    return null;
  });

  if (!isCurrentGeneration(generation)) return null;
  const items = leadIds.map((leadId) => itemsByLeadId.get(leadId)).filter((item): item is AppCampaignAudiencePreviewItem => Boolean(item));
  const eligible = items.filter((item) => item.eligible).length;

  return {
    preview: {
      ok: true,
      filters: {
        q: "",
        status: null,
        channel: "whatsapp",
        hasConversation: null,
        optOut: null,
        updatedFrom: null,
        updatedTo: null,
        onlyWhatsappEligible: null,
        excludeOptOut: null,
        crmStatus: campaign.draftSeed?.dynamicFilter?.crmBusinessStatusId ?? null,
        city: null,
        importedSource: "campaign-reuse",
      },
      summary: {
        total: items.length,
        analyzed: items.length,
        eligible,
        blocked: items.length - eligible,
        truncated: false,
        blockedByReason: Array.from(blockedByReason.values()).filter(
          (item): item is { reason: NonNullable<AppCampaignAudiencePreviewItem["blockedReason"]>; label: string; count: number } =>
            Boolean(item.reason)
        ),
      },
      items,
      pagination: {
        page: 1,
        limit: items.length,
        total: items.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      generatedAt: new Date().toISOString(),
    },
    state: hydrationFailed ? "partial" : "ready",
  };
}
