import type { Prisma, PrismaClient } from "@prisma/client";

export const META_APP_ID_PROVENANCE = "embedded_signup" as const;
const APP_ID_PATTERN = /^[1-9][0-9]{4,31}$/;

export class TenantMetaAppIdError extends Error {
  constructor(
    public readonly code:
      | "meta_app_id_invalid"
      | "meta_app_id_provenance_required"
      | "meta_app_id_provenance_incompatible"
      | "meta_app_id_conflict"
      | "meta_app_id_concurrent_update",
    public readonly status: 400 | 409 = 400
  ) {
    super(code);
    this.name = "TenantMetaAppIdError";
  }
}

export function asMetaRawPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function normalizeMetaAppId(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return APP_ID_PATTERN.test(normalized) ? normalized : null;
}

function configuredIds(rawPayload: unknown) {
  const raw = asMetaRawPayload(rawPayload);
  const canonicalInput = typeof raw.appId === "string" ? raw.appId.trim() : "";
  const legacyInput = typeof raw.applicationId === "string" ? raw.applicationId.trim() : "";
  if ((canonicalInput && !normalizeMetaAppId(canonicalInput)) || (legacyInput && !normalizeMetaAppId(legacyInput))) {
    throw new TenantMetaAppIdError("meta_app_id_invalid");
  }
  return {
    canonical: normalizeMetaAppId(canonicalInput),
    legacy: normalizeMetaAppId(legacyInput),
  };
}

export function resolveTenantMetaAppId(params: {
  rawPayload: unknown;
  globalAppId?: unknown;
  fallbackMode?: "disabled" | "single_app" | "shared_app";
}): { appId: string | null; source: "tenant_app_id" | "tenant_application_id" | "global_explicit" | "missing" } {
  const ids = configuredIds(params.rawPayload);
  if (ids.canonical && ids.legacy && ids.canonical !== ids.legacy) {
    throw new TenantMetaAppIdError("meta_app_id_conflict", 409);
  }
  if (ids.canonical) return { appId: ids.canonical, source: "tenant_app_id" };
  if (ids.legacy) return { appId: ids.legacy, source: "tenant_application_id" };
  if (params.fallbackMode === "single_app" || params.fallbackMode === "shared_app") {
    const globalAppId = normalizeMetaAppId(params.globalAppId);
    if (globalAppId) return { appId: globalAppId, source: "global_explicit" };
  }
  return { appId: null, source: "missing" };
}

export function mergeEmbeddedSignupAppId(rawPayload: unknown, appId: unknown) {
  const normalized = normalizeMetaAppId(appId);
  if (!normalized) throw new TenantMetaAppIdError("meta_app_id_invalid");
  const raw = asMetaRawPayload(rawPayload);
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (source && source !== META_APP_ID_PROVENANCE) {
    throw new TenantMetaAppIdError("meta_app_id_provenance_incompatible", 409);
  }
  const existing = configuredIds(raw);
  if ((existing.canonical && existing.canonical !== normalized) || (existing.legacy && existing.legacy !== normalized)) {
    throw new TenantMetaAppIdError("meta_app_id_conflict", 409);
  }
  return { ...raw, source: META_APP_ID_PROVENANCE, appId: normalized };
}

export async function configureTenantMetaAppId(params: {
  prisma: PrismaClient;
  clientId: string;
  appId: unknown;
  provenance: unknown;
  confirmTenantScoped: unknown;
  actor: string;
  requestId: string;
}) {
  if (params.provenance !== META_APP_ID_PROVENANCE || params.confirmTenantScoped !== true) {
    throw new TenantMetaAppIdError("meta_app_id_provenance_required");
  }
  const appId = normalizeMetaAppId(params.appId);
  if (!appId) throw new TenantMetaAppIdError("meta_app_id_invalid");

  return params.prisma.$transaction(async (tx) => {
    const current = await tx.tenantMetaConfig.findUnique({
      where: { clientId: params.clientId },
      select: { id: true, clientId: true, rawPayload: true, updatedAt: true },
    });
    if (!current) throw new TenantMetaAppIdError("meta_app_id_provenance_incompatible", 409);
    const nextPayload = mergeEmbeddedSignupAppId(current.rawPayload, appId);
    const existing = resolveTenantMetaAppId({ rawPayload: current.rawPayload });
    const changed = existing.appId !== appId;
    if (changed) {
      const result = await tx.tenantMetaConfig.updateMany({
        where: { id: current.id, clientId: params.clientId, updatedAt: current.updatedAt },
        data: { rawPayload: nextPayload as Prisma.InputJsonValue },
      });
      if (result.count !== 1) throw new TenantMetaAppIdError("meta_app_id_concurrent_update", 409);
    }
    await tx.event.create({
      data: {
        clientId: params.clientId,
        requestId: params.requestId,
        eventName: "meta.tenant_app_id.configured",
        payloadJson: {
          actor: params.actor,
          provenance: META_APP_ID_PROVENANCE,
          result: changed ? "configured" : "already_configured",
        },
      },
    });
    return { configured: true as const, changed, source: META_APP_ID_PROVENANCE };
  });
}
