import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { promoteContactLifecycleToActive } from "../contacts/contactLifecycle.js";

type PrismaForConsent = Pick<PrismaClient, "contact" | "lead" | "conversation" | "contactConsent" | "event">;
type PrismaWithTransactionForConsent = PrismaForConsent & Pick<PrismaClient, "$transaction">;

export type ContactConsentStatus = "missing" | "accepted" | "revoked" | "blocked_anonymized";

const CONSENT_TRANSACTION_MAX_ATTEMPTS = 3;

export function normalizeConsentPurpose(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 80);
}

export function buildConsentTextHash(text: string | null | undefined) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function resolveConsentSubject(params: {
  prisma: PrismaForConsent;
  clientId: string;
  contactId?: string | null;
  leadId?: string | null;
  waId?: string | null;
}) {
  if (!params.contactId && !params.leadId && !params.waId) {
    return { ok: false as const, reason: "subject_required" as const };
  }
  const [contact, lead] = await Promise.all([
    params.contactId
      ? params.prisma.contact.findFirst({
          where: { id: params.contactId, clientId: params.clientId },
          select: { id: true, waId: true },
        })
      : params.waId
        ? params.prisma.contact.findFirst({
            where: { clientId: params.clientId, waId: params.waId },
            select: { id: true, waId: true },
          })
      : Promise.resolve(null),
    params.leadId
      ? params.prisma.lead.findFirst({
          where: { id: params.leadId, tenantId: params.clientId },
          select: { id: true, waId: true },
        })
      : params.waId
        ? params.prisma.lead.findFirst({
            where: { tenantId: params.clientId, waId: params.waId },
            select: { id: true, waId: true },
          })
      : Promise.resolve(null),
  ]);
  if (params.contactId && !contact) return { ok: false as const, reason: "contact_not_found" as const };
  if (params.leadId && !lead) return { ok: false as const, reason: "lead_not_found" as const };
  if (contact?.waId && lead?.waId && contact.waId !== lead.waId) {
    return { ok: false as const, reason: "subject_mismatch" as const };
  }
  const waId = contact?.waId ?? lead?.waId ?? null;
  if (waId) {
    const anonymized = await params.prisma.conversation.findFirst({
      where: {
        clientId: params.clientId,
        waId,
        anonymizedAt: { not: null },
      },
      select: { id: true },
    });
    if (anonymized) {
      return { ok: false as const, reason: "blocked_anonymized" as const };
    }
  }
  return {
    ok: true as const,
    contactId: contact?.id ?? null,
    leadId: lead?.id ?? null,
    waId,
  };
}

export async function getContactConsentState(params: {
  prisma: PrismaForConsent;
  clientId: string;
  contactId?: string | null;
  leadId?: string | null;
  waId?: string | null;
  purpose: string;
  textVersion?: string | null;
  textBody?: string | null;
}) {
  const purpose = normalizeConsentPurpose(params.purpose);
  if (!purpose) return { ok: false as const, reason: "invalid_purpose" as const };
  const subject = await resolveConsentSubject(params);
  if (!subject.ok) {
    if (subject.reason === "blocked_anonymized") {
      return { ok: true as const, status: "blocked_anonymized" as ContactConsentStatus, consent: null };
    }
    return { ok: false as const, reason: subject.reason };
  }
  const consent = await params.prisma.contactConsent.findFirst({
    where: {
      clientId: params.clientId,
      purpose,
      ...(subject.contactId ? { contactId: subject.contactId } : {}),
      ...(subject.leadId ? { leadId: subject.leadId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      revokedAt: true,
      textVersion: true,
      textHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!consent) return { ok: true as const, status: "missing" as ContactConsentStatus, consent: null };
  if (consent.status === "accepted" && !consent.revokedAt) {
    const expectedHash = buildConsentTextHash(params.textBody);
    if (params.textVersion && consent.textVersion !== params.textVersion) {
      return { ok: true as const, status: "missing" as ContactConsentStatus, consent };
    }
    if (expectedHash && consent.textHash !== expectedHash) {
      return { ok: true as const, status: "missing" as ContactConsentStatus, consent };
    }
    return { ok: true as const, status: "accepted" as ContactConsentStatus, consent };
  }
  return { ok: true as const, status: "revoked" as ContactConsentStatus, consent };
}

export async function recordContactConsent(params: {
  prisma: PrismaForConsent;
  clientId: string;
  contactId?: string | null;
  leadId?: string | null;
  waId?: string | null;
  purpose: string;
  sourceChannel?: string | null;
  sourceProvider?: string | null;
  source?: string | null;
  textVersion?: string | null;
  textBody?: string | null;
  requestId: string;
}) {
  if (typeof (params.prisma as Partial<PrismaWithTransactionForConsent>).$transaction === "function") {
    const prisma = params.prisma as PrismaWithTransactionForConsent;
    for (let attempt = 1; attempt <= CONSENT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await prisma.$transaction((tx) => recordContactConsentAtomic({ ...params, prisma: tx }), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!isTransactionRetryable(error) || attempt === CONSENT_TRANSACTION_MAX_ATTEMPTS) throw error;
      }
    }
  }
  return recordContactConsentAtomic(params);
}

function isTransactionRetryable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function recordContactConsentAtomic(params: {
  prisma: PrismaForConsent;
  clientId: string;
  contactId?: string | null;
  leadId?: string | null;
  waId?: string | null;
  purpose: string;
  sourceChannel?: string | null;
  sourceProvider?: string | null;
  source?: string | null;
  textVersion?: string | null;
  textBody?: string | null;
  requestId: string;
}) {
  const purpose = normalizeConsentPurpose(params.purpose);
  if (!purpose) return { ok: false as const, reason: "invalid_purpose" as const };
  const subject = await resolveConsentSubject(params);
  if (!subject.ok) return { ok: false as const, reason: subject.reason };
  const now = new Date();
  await params.prisma.contactConsent.updateMany({
    where: {
      clientId: params.clientId,
      purpose,
      status: "accepted",
      revokedAt: null,
      ...(subject.contactId ? { contactId: subject.contactId } : {}),
      ...(subject.leadId ? { leadId: subject.leadId } : {}),
    },
    data: {
      status: "revoked",
      revokedAt: now,
    },
  });
  const consent = await params.prisma.contactConsent.create({
    data: {
      clientId: params.clientId,
      contactId: subject.contactId,
      leadId: subject.leadId,
      purpose,
      status: "accepted",
      sourceChannel: params.sourceChannel ?? null,
      sourceProvider: params.sourceProvider ?? null,
      source: params.source ?? null,
      textVersion: params.textVersion ?? null,
      textHash: buildConsentTextHash(params.textBody),
      acceptedAt: now,
    },
  });
  await params.prisma.contactConsent.updateMany({
    where: {
      clientId: params.clientId,
      purpose,
      status: "accepted",
      revokedAt: null,
      id: { not: consent.id },
      ...(subject.contactId ? { contactId: subject.contactId } : {}),
      ...(subject.leadId ? { leadId: subject.leadId } : {}),
    },
    data: {
      status: "revoked",
      revokedAt: now,
    },
  });
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: `${params.requestId}:consent-accepted:${purpose}`,
      eventName: "privacy.consent.accepted",
      payloadJson: {
        purpose,
        sourceChannel: params.sourceChannel ?? null,
        sourceProvider: params.sourceProvider ?? null,
        source: params.source ?? null,
        textVersion: params.textVersion ?? null,
        textHash: consent.textHash,
        hasContact: Boolean(subject.contactId),
        hasLead: Boolean(subject.leadId),
      },
    },
  });
  await promoteContactLifecycleToActive({
    prisma: params.prisma,
    clientId: params.clientId,
    contactId: subject.contactId,
    waId: subject.waId,
    source: params.source,
    requestId: params.requestId,
  });
  return { ok: true as const, consent };
}

export async function revokeContactConsent(params: {
  prisma: PrismaForConsent;
  clientId: string;
  contactId?: string | null;
  leadId?: string | null;
  waId?: string | null;
  purpose: string;
  source?: string | null;
  requestId: string;
}) {
  const purpose = normalizeConsentPurpose(params.purpose);
  if (!purpose) return { ok: false as const, reason: "invalid_purpose" as const };
  const subject = await resolveConsentSubject(params);
  if (!subject.ok) return { ok: false as const, reason: subject.reason };
  const now = new Date();
  const result = await params.prisma.contactConsent.updateMany({
    where: {
      clientId: params.clientId,
      purpose,
      status: "accepted",
      revokedAt: null,
      ...(subject.contactId ? { contactId: subject.contactId } : {}),
      ...(subject.leadId ? { leadId: subject.leadId } : {}),
    },
    data: {
      status: "revoked",
      revokedAt: now,
    },
  });
  await params.prisma.event.create({
    data: {
      clientId: params.clientId,
      requestId: `${params.requestId}:consent-revoked:${purpose}`,
      eventName: "privacy.consent.revoked",
      payloadJson: {
        purpose,
        source: params.source ?? null,
        revokedCount: result.count,
        hasContact: Boolean(subject.contactId),
        hasLead: Boolean(subject.leadId),
      },
    },
  });
  return { ok: true as const, revokedCount: result.count };
}
