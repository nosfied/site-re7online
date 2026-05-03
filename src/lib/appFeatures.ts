export type AppProfile = "business" | "government";

export type AppFeatureKey =
  | "departments"
  | "sla"
  | "reports"
  | "campaigns"
  | "chatbot"
  | "governmentReports"
  | "poc"
  | "salesPipeline"
  | "instagramIntegration";

export type AppFeatures = Record<AppFeatureKey, boolean>;

export const DEFAULT_APP_FEATURES: AppFeatures = {
  departments: true,
  sla: true,
  reports: true,
  campaigns: true,
  chatbot: true,
  governmentReports: false,
  poc: false,
  salesPipeline: false,
  instagramIntegration: false,
};

type SessionLike = { features?: unknown } | null | undefined;

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function getAppFeatures(session: SessionLike): AppFeatures {
  const raw = session?.features;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_APP_FEATURES };
  }
  const input = raw as Record<string, unknown>;
  return {
    departments: normalizeBoolean(input.departments) ?? DEFAULT_APP_FEATURES.departments,
    sla: normalizeBoolean(input.sla) ?? DEFAULT_APP_FEATURES.sla,
    reports: normalizeBoolean(input.reports) ?? DEFAULT_APP_FEATURES.reports,
    campaigns: normalizeBoolean(input.campaigns) ?? DEFAULT_APP_FEATURES.campaigns,
    chatbot: normalizeBoolean(input.chatbot) ?? DEFAULT_APP_FEATURES.chatbot,
    governmentReports:
      normalizeBoolean(input.governmentReports) ?? DEFAULT_APP_FEATURES.governmentReports,
    poc: normalizeBoolean(input.poc) ?? DEFAULT_APP_FEATURES.poc,
    salesPipeline: normalizeBoolean(input.salesPipeline) ?? DEFAULT_APP_FEATURES.salesPipeline,
    instagramIntegration:
      normalizeBoolean(input.instagramIntegration) ?? DEFAULT_APP_FEATURES.instagramIntegration,
  };
}

export function hasAppFeature(session: SessionLike, featureName: AppFeatureKey) {
  return getAppFeatures(session)[featureName];
}

export function getAppProfile(session: { profile?: unknown } | null | undefined): AppProfile {
  return session?.profile === "government" ? "government" : "business";
}
