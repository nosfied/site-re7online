import crypto from "node:crypto";
import { normalizeWaIdDigits } from "../utils/waid.js";

const BRAZIL_COUNTRY_CODE = "55";
const BRAZIL_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export type CrmWhatsappIdentity = {
  inputDigits: string;
  crmCanonicalPhone: string;
  providerCandidates: string[];
  legacyCandidate: string | null;
  modernCandidate: string | null;
  externalUserHash: string;
};

export type CrmWhatsappIdentityClassification =
  | { status: "SUPPORTED"; identity: CrmWhatsappIdentity }
  | { status: "UNSUPPORTED_INTERNATIONAL"; digits: string }
  | { status: "INVALID"; digits: string };

export function buildCrmWhatsappExternalUserHash(waIdCanonical: string) {
  return `whatsapp:${crypto.createHash("sha256").update(waIdCanonical).digest("hex").slice(0, 32)}`;
}

function isValidBrazilDdd(value: string) {
  return BRAZIL_DDDS.has(value);
}

function stripBrazilDomesticTrunkPrefix(digits: string) {
  if (!digits.startsWith("0")) return digits;
  const national = digits.slice(1);
  return national.length === 10 || national.length === 11 ? national : digits;
}

function parseBrazilSubscriber(digits: string) {
  const dialingDigits = stripBrazilDomesticTrunkPrefix(digits);
  const hasBrazilCountryCode =
    dialingDigits.startsWith(BRAZIL_COUNTRY_CODE) &&
    (dialingDigits.length === 12 || dialingDigits.length === 13);
  const national = hasBrazilCountryCode ? dialingDigits.slice(2) : dialingDigits;
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = national.slice(0, 2);
  if (!isValidBrazilDdd(ddd)) return null;
  const subscriber = national.slice(2);
  if (subscriber.length === 9 && !subscriber.startsWith("9")) return null;
  if (subscriber.length === 8 && !/^[2-9]/.test(subscriber)) return null;
  return { ddd, subscriber };
}

function normalizeBrazilCrmPhone(digits: string) {
  const parsed = parseBrazilSubscriber(digits);
  if (!parsed) return null;
  return `${BRAZIL_COUNTRY_CODE}${parsed.ddd}${parsed.subscriber}`;
}

export function getBrazilNinthDigitVariant(value: string) {
  const digits = normalizeWaIdDigits(value);
  const parsed = parseBrazilSubscriber(digits);
  if (!parsed) return null;
  if (parsed.subscriber.length === 9 && parsed.subscriber.startsWith("9")) {
    return `${BRAZIL_COUNTRY_CODE}${parsed.ddd}${parsed.subscriber.slice(1)}`;
  }
  if (parsed.subscriber.length === 8) {
    return `${BRAZIL_COUNTRY_CODE}${parsed.ddd}9${parsed.subscriber}`;
  }
  return null;
}

export function normalizeCrmWhatsappIdentity(value: unknown): CrmWhatsappIdentity | null {
  const inputDigits = normalizeWaIdDigits(String(value ?? ""));
  if (!inputDigits) return null;
  const crmCanonicalPhone = normalizeBrazilCrmPhone(inputDigits);
  if (!crmCanonicalPhone) return null;
  const variant = getBrazilNinthDigitVariant(crmCanonicalPhone);
  const providerCandidates = Array.from(new Set([crmCanonicalPhone, variant].filter(Boolean))) as string[];
  return {
    inputDigits,
    crmCanonicalPhone,
    providerCandidates,
    legacyCandidate:
      variant && variant.length < crmCanonicalPhone.length ? variant : null,
    modernCandidate:
      variant && variant.length > crmCanonicalPhone.length ? variant : crmCanonicalPhone,
    externalUserHash: buildCrmWhatsappExternalUserHash(crmCanonicalPhone),
  };
}

export function classifyCrmWhatsappIdentity(value: unknown): CrmWhatsappIdentityClassification {
  const digits = normalizeWaIdDigits(String(value ?? ""));
  const identity = normalizeCrmWhatsappIdentity(value);
  if (identity) return { status: "SUPPORTED", identity };
  if (!digits.startsWith(BRAZIL_COUNTRY_CODE) && /^[1-9]\d{7,14}$/.test(digits)) {
    return { status: "UNSUPPORTED_INTERNATIONAL", digits };
  }
  return { status: "INVALID", digits };
}

export function buildCrmWhatsappIdentityCandidates(values: Array<string | null | undefined>) {
  const candidates = new Set<string>();
  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (raw) candidates.add(raw);
    const digits = normalizeWaIdDigits(String(value ?? ""));
    if (digits) candidates.add(digits);
    const identity = normalizeCrmWhatsappIdentity(value);
    if (identity) {
      candidates.add(identity.crmCanonicalPhone);
      for (const candidate of identity.providerCandidates) candidates.add(candidate);
      for (const candidate of [identity.crmCanonicalPhone, ...identity.providerCandidates]) {
        if (candidate.startsWith(BRAZIL_COUNTRY_CODE)) candidates.add(candidate.slice(2));
      }
    }
  }
  return Array.from(candidates);
}

// Shared privacy boundary: inspect raw values before any digit extraction.
export function isAnonymizedMarker(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("anon:") || normalized.startsWith("hash:anon:") ||
    normalized === "[mensagem anonimizada]" || normalized === "usuario anonimizado" ||
    normalized === "usuário anonimizado" || normalized.includes("******");
}
