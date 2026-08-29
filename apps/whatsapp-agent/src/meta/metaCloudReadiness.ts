import { Prisma, type PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import {
  buildMetaPublicWhatsappIdentityPayload,
  normalizeHybridWhatsappNumber,
} from "../web-session/hybridIdentity.js";

export type MetaCloudReadinessReason =
  | "not_configured"
  | "token_missing"
  | "object_access_failed"
  | "phone_not_in_waba"
  | "public_identity_mismatch"
  | "phone_disconnected"
  | "phone_not_verified"
  | "registration_incomplete"
  | "unknown";

export type MetaCloudReadinessResult = {
  configured: boolean;
  objectAccess: boolean | "unknown";
  phoneBelongsToWaba: boolean | "unknown";
  publicIdentity: {
    canonicalNumber: string;
    maskedNumber: string | null;
    rawDisplayPhoneNumber: string;
  } | null;
  phoneNumberIdPresent: boolean;
  wabaIdPresent: boolean;
  phoneStatus: string | null;
  codeVerificationStatus: string | null;
  platformType: string | null;
  accountMode: string | null;
  isOnBizApp: boolean | "unknown";
  cloudMode: "STANDARD_CLOUD" | "COEXISTENCE" | "UNKNOWN";
  qualityRating: string | null;
  operational: boolean;
  reason: MetaCloudReadinessReason;
  adminStage: MetaCloudAdminStage;
  checkedAt: string | null;
};

type GraphPayload = Record<string, unknown>;

export type MetaCloudAdminStage =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "ACTION_REQUIRED"
  | "OPERATIONAL";

type GraphReadResult =
  | { ok: true; status: number; payload: GraphPayload }
  | { ok: false; status: number | null; error: string };

export const META_CLOUD_READINESS_SNAPSHOT_KEY = "metaReadiness";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeGraphStatus(value: unknown) {
  return optionalString(value)?.toUpperCase() ?? null;
}

function readGraphId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildPublicIdentity(displayPhoneNumber: unknown) {
  const payload = buildMetaPublicWhatsappIdentityPayload(displayPhoneNumber);
  return payload
    ? {
        canonicalNumber: payload.canonicalNumber,
        maskedNumber: payload.maskedNumber,
        rawDisplayPhoneNumber: payload.rawDisplayPhoneNumber,
      }
    : null;
}

export function resolveMetaCloudAdminStage(
  readiness: Pick<MetaCloudReadinessResult, "configured" | "operational" | "reason">
): MetaCloudAdminStage {
  if (!readiness.configured) return "NOT_CONFIGURED";
  if (readiness.operational) return "OPERATIONAL";
  if (readiness.reason === "registration_incomplete") return "CONFIGURED";
  return "ACTION_REQUIRED";
}

export function shouldBlockMetaCloudPhoneRegister(readiness: MetaCloudReadinessResult) {
  const platformType = normalizeGraphStatus(readiness.platformType);
  if (!readiness.configured || !readiness.phoneNumberIdPresent) return true;
  if (readiness.objectAccess !== true) return true;
  if (platformType !== "CLOUD_API") return true;
  return false;
}

export function readMetaCloudReadinessSnapshot(rawPayload: unknown): MetaCloudReadinessResult | null {
  if (!isRecord(rawPayload)) return null;
  const snapshot = rawPayload[META_CLOUD_READINESS_SNAPSHOT_KEY];
  if (!isRecord(snapshot)) return null;
  const reason = optionalString(snapshot.reason);
  if (!reason) return null;
  return {
    configured: snapshot.configured === true,
    objectAccess:
      typeof snapshot.objectAccess === "boolean" ? snapshot.objectAccess : "unknown",
    phoneBelongsToWaba:
      typeof snapshot.phoneBelongsToWaba === "boolean" ? snapshot.phoneBelongsToWaba : "unknown",
    publicIdentity: isRecord(snapshot.publicIdentity)
      ? {
          canonicalNumber: optionalString(snapshot.publicIdentity.canonicalNumber) ?? "",
          maskedNumber: optionalString(snapshot.publicIdentity.maskedNumber),
          rawDisplayPhoneNumber: optionalString(snapshot.publicIdentity.rawDisplayPhoneNumber) ?? "",
        }
      : null,
    phoneNumberIdPresent: snapshot.phoneNumberIdPresent === true,
    wabaIdPresent: snapshot.wabaIdPresent === true,
    phoneStatus: optionalString(snapshot.phoneStatus),
    codeVerificationStatus: optionalString(snapshot.codeVerificationStatus),
    platformType: optionalString(snapshot.platformType),
    accountMode: optionalString(snapshot.accountMode),
    isOnBizApp:
      typeof snapshot.isOnBizApp === "boolean" ? snapshot.isOnBizApp : "unknown",
    cloudMode:
      optionalString(snapshot.cloudMode) === "STANDARD_CLOUD" ||
      optionalString(snapshot.cloudMode) === "COEXISTENCE" ||
      optionalString(snapshot.cloudMode) === "UNKNOWN"
        ? (optionalString(snapshot.cloudMode) as MetaCloudReadinessResult["cloudMode"])
        : "UNKNOWN",
    qualityRating: optionalString(snapshot.qualityRating),
    operational: snapshot.operational === true,
    reason: reason as MetaCloudReadinessReason,
    adminStage:
      optionalString(snapshot.adminStage) === "NOT_CONFIGURED" ||
      optionalString(snapshot.adminStage) === "CONFIGURED" ||
      optionalString(snapshot.adminStage) === "ACTION_REQUIRED" ||
      optionalString(snapshot.adminStage) === "OPERATIONAL"
        ? (optionalString(snapshot.adminStage) as MetaCloudAdminStage)
        : resolveMetaCloudAdminStage({
            configured: snapshot.configured === true,
            operational: snapshot.operational === true,
            reason: reason as MetaCloudReadinessReason,
          }),
    checkedAt: optionalString(snapshot.checkedAt),
  };
}

export function evaluateMetaCloudReadiness(input: {
  tokenPresent: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  phoneObject: GraphPayload | null;
  wabaObject: GraphPayload | null;
  wabaPhoneNumbers: GraphPayload[];
  phoneObjectAccess: boolean | "unknown";
  wabaObjectAccess: boolean | "unknown";
  expectedPublicIdentity?: string | null;
  checkedAt?: string | null;
}): MetaCloudReadinessResult {
  const phoneNumberId = input.phoneNumberId?.trim() || null;
  const wabaId = input.wabaId?.trim() || null;
  const phoneStatus = normalizeGraphStatus(input.phoneObject?.status);
  const codeVerificationStatus = normalizeGraphStatus(input.phoneObject?.code_verification_status);
  const platformType = normalizeGraphStatus(input.phoneObject?.platform_type);
  const accountMode = normalizeGraphStatus(input.phoneObject?.account_mode);
  const isOnBizApp =
    typeof input.phoneObject?.is_on_biz_app === "boolean" ? input.phoneObject.is_on_biz_app : "unknown";
  const cloudMode =
    isOnBizApp === true && platformType === "CLOUD_API"
      ? "COEXISTENCE"
      : platformType === "CLOUD_API"
        ? "STANDARD_CLOUD"
        : "UNKNOWN";
  const qualityRating = normalizeGraphStatus(input.phoneObject?.quality_rating);
  const publicIdentity = buildPublicIdentity(input.phoneObject?.display_phone_number);
  const expectedPublicIdentity = normalizeHybridWhatsappNumber(input.expectedPublicIdentity ?? "");
  const phoneBelongsToWaba =
    phoneNumberId && input.wabaPhoneNumbers.length > 0
      ? input.wabaPhoneNumbers.some((phone) => readGraphId(phone.id) === phoneNumberId)
      : "unknown";
  const objectAccess =
    input.phoneObjectAccess === true && input.wabaObjectAccess === true
      ? true
      : input.phoneObjectAccess === false || input.wabaObjectAccess === false
        ? false
        : "unknown";

  let reason: MetaCloudReadinessReason = "unknown";
  let operational = false;
  if (!phoneNumberId || !wabaId) {
    reason = "not_configured";
  } else if (!input.tokenPresent) {
    reason = "token_missing";
  } else if (objectAccess === false) {
    reason = "object_access_failed";
  } else if (phoneBelongsToWaba === false) {
    reason = "phone_not_in_waba";
  } else if (
    expectedPublicIdentity &&
    publicIdentity?.canonicalNumber &&
    expectedPublicIdentity !== publicIdentity.canonicalNumber
  ) {
    reason = "public_identity_mismatch";
  } else if (phoneStatus && phoneStatus !== "CONNECTED") {
    reason = "phone_disconnected";
  } else if (codeVerificationStatus === "NOT_VERIFIED" && cloudMode !== "COEXISTENCE") {
    reason = "phone_not_verified";
  } else if (
    cloudMode === "COEXISTENCE" &&
    accountMode &&
    accountMode !== "LIVE"
  ) {
    reason = "registration_incomplete";
  } else if (!phoneStatus || objectAccess !== true || phoneBelongsToWaba !== true || !publicIdentity) {
    reason = "registration_incomplete";
  } else {
    operational = true;
    reason = "unknown";
  }

  return {
    configured: Boolean(phoneNumberId && wabaId),
    objectAccess,
    phoneBelongsToWaba,
    publicIdentity,
    phoneNumberIdPresent: Boolean(phoneNumberId),
    wabaIdPresent: Boolean(wabaId),
    phoneStatus,
    codeVerificationStatus,
    platformType,
    accountMode,
    isOnBizApp,
    cloudMode,
    qualityRating,
    operational,
    reason,
    adminStage: resolveMetaCloudAdminStage({ configured: Boolean(phoneNumberId && wabaId), operational, reason }),
    checkedAt: input.checkedAt ?? null,
  };
}

async function fetchMetaGraphJson(params: {
  path: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GraphReadResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${params.path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
    });
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message.slice(0, 500) : "fetch_failed" };
  }
  const rawText = await response.text();
  let payload: GraphPayload;
  try {
    payload = JSON.parse(rawText) as GraphPayload;
  } catch {
    return { ok: false, status: response.status, error: rawText.slice(0, 500) };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: JSON.stringify(payload).slice(0, 500) };
  }
  return { ok: true, status: response.status, payload };
}

export async function validateMetaCloudReadiness(params: {
  prisma: PrismaClient;
  clientId: string;
  fetchImpl?: typeof fetch;
  persistSnapshot?: boolean;
}): Promise<MetaCloudReadinessResult> {
  const metaConfig = await params.prisma.tenantMetaConfig.findUnique({
    where: { clientId: params.clientId },
    select: {
      businessToken: true,
      phoneNumberId: true,
      wabaId: true,
      rawPayload: true,
    },
  });
  const checkedAt = new Date().toISOString();
  if (!metaConfig) {
    return evaluateMetaCloudReadiness({
      tokenPresent: false,
      phoneNumberId: null,
      wabaId: null,
      phoneObject: null,
      wabaObject: null,
      wabaPhoneNumbers: [],
      phoneObjectAccess: "unknown",
      wabaObjectAccess: "unknown",
      checkedAt,
    });
  }
  const businessToken = optionalString(metaConfig.businessToken);
  const phoneNumberId = optionalString(metaConfig.phoneNumberId);
  const wabaId = optionalString(metaConfig.wabaId);
  const expectedPublicIdentity = readExpectedPublicIdentity(metaConfig.rawPayload);

  let phoneRead: GraphReadResult = { ok: false, status: null, error: "not_requested" };
  let wabaRead: GraphReadResult = { ok: false, status: null, error: "not_requested" };
  let wabaPhonesRead: GraphReadResult = { ok: false, status: null, error: "not_requested" };
  if (businessToken && phoneNumberId) {
    phoneRead = await fetchMetaGraphJson({
      path: `${encodeURIComponent(phoneNumberId)}?fields=${encodeURIComponent(
        "id,display_phone_number,verified_name,status,code_verification_status,quality_rating,platform_type,name_status,new_name_status,throughput,account_mode,is_on_biz_app"
      )}`,
      accessToken: businessToken,
      fetchImpl: params.fetchImpl,
    });
  }
  if (businessToken && wabaId) {
    wabaRead = await fetchMetaGraphJson({
      path: `${encodeURIComponent(wabaId)}?fields=${encodeURIComponent(
        "id,name,account_review_status,business_verification_status,owner_business_info"
      )}`,
      accessToken: businessToken,
      fetchImpl: params.fetchImpl,
    });
    wabaPhonesRead = await fetchMetaGraphJson({
      path: `${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(
        "id,display_phone_number,verified_name,status,quality_rating,code_verification_status,platform_type,account_mode,is_on_biz_app"
      )}`,
      accessToken: businessToken,
      fetchImpl: params.fetchImpl,
    });
  }

  const wabaPhoneNumbers =
    wabaPhonesRead.ok && Array.isArray(wabaPhonesRead.payload.data)
      ? (wabaPhonesRead.payload.data as GraphPayload[])
      : [];
  const result = evaluateMetaCloudReadiness({
    tokenPresent: Boolean(businessToken),
    phoneNumberId,
    wabaId,
    phoneObject: phoneRead.ok ? phoneRead.payload : null,
    wabaObject: wabaRead.ok ? wabaRead.payload : null,
    wabaPhoneNumbers,
    phoneObjectAccess: phoneRead.ok,
    wabaObjectAccess: wabaRead.ok,
    expectedPublicIdentity,
    checkedAt,
  });

  if (params.persistSnapshot !== false) {
    await params.prisma.tenantMetaConfig.update({
      where: { clientId: params.clientId },
      data: {
        rawPayload: writeMetaCloudReadinessSnapshot(metaConfig.rawPayload, result),
      },
    });
  }
  return result;
}

function readExpectedPublicIdentity(rawPayload: unknown) {
  if (!isRecord(rawPayload)) return null;
  const identity = rawPayload.publicWhatsappIdentity;
  if (!isRecord(identity)) return null;
  return optionalString(identity.canonicalNumber);
}

export function writeMetaCloudReadinessSnapshot(
  rawPayload: unknown,
  readiness: MetaCloudReadinessResult
): Prisma.InputJsonValue {
  const previous = isRecord(rawPayload) ? rawPayload : {};
  return {
    ...previous,
    [META_CLOUD_READINESS_SNAPSHOT_KEY]: {
      checkedAt: readiness.checkedAt,
      configured: readiness.configured,
      objectAccess: readiness.objectAccess,
      phoneBelongsToWaba: readiness.phoneBelongsToWaba,
      publicIdentity: readiness.publicIdentity,
      phoneNumberIdPresent: readiness.phoneNumberIdPresent,
      wabaIdPresent: readiness.wabaIdPresent,
      phoneStatus: readiness.phoneStatus,
      codeVerificationStatus: readiness.codeVerificationStatus,
      platformType: readiness.platformType,
      accountMode: readiness.accountMode,
      isOnBizApp: readiness.isOnBizApp,
      cloudMode: readiness.cloudMode,
      qualityRating: readiness.qualityRating,
      operational: readiness.operational,
      reason: readiness.reason,
      adminStage: readiness.adminStage,
    },
  } as Prisma.InputJsonValue;
}
