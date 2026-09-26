import { persistEvent } from "../db/persist.js";

export const CRM_CONTACT_EXCLUDED_EVENT = "crm.contact.excluded";
export const CRM_CONTACT_REACTIVATED_EVENT = "crm.contact.reactivated";

type ContactExclusionPrisma = {
  contact?: {
    findMany(args: unknown): Promise<Array<{
      id?: string | null;
      waId?: string | null;
      externalUserRef?: string | null;
      legacyWaId?: string | null;
      operationallyExcludedAt?: Date | string | null;
    }>>;
    findFirst?(args: unknown): Promise<{
      id: string;
      waId?: string | null;
      externalUserRef?: string | null;
      legacyWaId?: string | null;
      operationallyExcludedAt?: Date | string | null;
    } | null>;
    update?(args: unknown): Promise<unknown>;
    updateMany?(args: unknown): Promise<{ count: number }>;
  };
  event?: {
    create?(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export function normalizeOperationalContactIdentity(value: unknown) {
  return String(value ?? "").trim();
}

export function contactOperationalIdentityKeys(contact: {
  waId?: string | null;
  externalUserRef?: string | null;
  legacyWaId?: string | null;
}) {
  return Array.from(
    new Set(
      [contact.waId, contact.externalUserRef, contact.legacyWaId]
        .map(normalizeOperationalContactIdentity)
        .filter(Boolean)
    )
  );
}

export function isOperationallyExcludedContact(contact: { operationallyExcludedAt?: Date | string | null } | null | undefined) {
  return Boolean(contact?.operationallyExcludedAt);
}

export async function loadOperationallyExcludedWaIds(
  prisma: ContactExclusionPrisma,
  params: { clientId: string; waIds: string[] }
) {
  const waIds = Array.from(new Set(params.waIds.map(normalizeOperationalContactIdentity).filter(Boolean)));
  if (waIds.length === 0) return new Set<string>();
  if (!prisma.contact?.findMany) return new Set<string>();
  if (waIds.length > 1000) {
    const excluded = new Set<string>();
    for (let offset = 0; offset < waIds.length; offset += 1000) {
      const chunk = await loadOperationallyExcludedWaIds(prisma, { clientId: params.clientId, waIds: waIds.slice(offset, offset + 1000) });
      for (const waId of chunk) excluded.add(waId);
    }
    return excluded;
  }
  const contacts = await prisma.contact.findMany({
    where: {
      clientId: params.clientId,
      operationallyExcludedAt: { not: null },
      OR: [
        { waId: { in: waIds } },
        { externalUserRef: { in: waIds } },
        { legacyWaId: { in: waIds } },
      ],
    },
    select: {
      waId: true,
      externalUserRef: true,
      legacyWaId: true,
      operationallyExcludedAt: true,
    },
  });
  return new Set(contacts.flatMap(contactOperationalIdentityKeys));
}

async function createOperationalExclusionAuditEvent(
  prisma: ContactExclusionPrisma | undefined,
  data: Record<string, unknown>
) {
  if (prisma?.event?.create) {
    await prisma.event.create({ data });
    return;
  }
  await persistEvent(data as Parameters<typeof persistEvent>[0]);
}

export async function recordCrmContactOperationalExclusion(
  params: {
    prisma?: ContactExclusionPrisma;
    clientId: string;
    leadId: string;
    contactId?: string | null;
    waId: string;
    waIdCanonical: string;
    actorUserId?: string | null;
    requestId: string;
    reason?: string | null;
  }
) {
  await createOperationalExclusionAuditEvent(params.prisma, {
    clientId: params.clientId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    requestId: `${CRM_CONTACT_EXCLUDED_EVENT}:${params.leadId}:${params.requestId}`,
    eventName: CRM_CONTACT_EXCLUDED_EVENT,
    payloadJson: {
      leadId: params.leadId,
      contactId: params.contactId ?? null,
      actorUserId: params.actorUserId ?? null,
      reason: params.reason ?? null,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function recordCrmContactOperationalReactivation(
  params: {
    prisma?: ContactExclusionPrisma;
    clientId: string;
    leadId: string;
    contactId?: string | null;
    waId: string;
    waIdCanonical: string;
    actorUserId?: string | null;
    requestId: string;
    source?: string | null;
  }
) {
  await createOperationalExclusionAuditEvent(params.prisma, {
    clientId: params.clientId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    requestId: `${CRM_CONTACT_REACTIVATED_EVENT}:${params.leadId}:${params.requestId}`,
    eventName: CRM_CONTACT_REACTIVATED_EVENT,
    payloadJson: {
      leadId: params.leadId,
      contactId: params.contactId ?? null,
      actorUserId: params.actorUserId ?? null,
      source: params.source ?? null,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function reactivateOperationallyExcludedContactIfNeeded(
  prisma: ContactExclusionPrisma,
  params: {
    clientId: string;
    leadId: string;
    contactId: string;
    waId: string;
    waIdCanonical: string;
    requestId: string;
    source: string;
  }
) {
  const contact = prisma.contact?.findFirst
    ? await prisma.contact.findFirst({
        where: {
          id: params.contactId,
          clientId: params.clientId,
          operationallyExcludedAt: { not: null },
        },
        select: { id: true, operationallyExcludedAt: true },
      })
    : null;
  if (!contact) return { reactivated: false };
  await prisma.contact?.update?.({
    where: { id: params.contactId },
    data: { operationallyExcludedAt: null },
  });
  await recordCrmContactOperationalReactivation({
    prisma,
    clientId: params.clientId,
    leadId: params.leadId,
    contactId: params.contactId,
    waId: params.waId,
    waIdCanonical: params.waIdCanonical,
    actorUserId: null,
    requestId: params.requestId,
    source: params.source,
  });
  return { reactivated: true };
}
