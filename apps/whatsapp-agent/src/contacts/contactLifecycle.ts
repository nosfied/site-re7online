import type { PrismaClient } from "@prisma/client";

export const CONTACT_LIFECYCLE_PROVISIONAL = "PROVISIONAL";
export const CONTACT_LIFECYCLE_ACTIVE = "ACTIVE";

export type ContactLifecycle = typeof CONTACT_LIFECYCLE_PROVISIONAL | typeof CONTACT_LIFECYCLE_ACTIVE;

type PrismaForContactLifecycle = Pick<PrismaClient, "contact" | "event">;

export function resolveInitialContactLifecycle(params: { consentRequired: boolean }): ContactLifecycle {
  return params.consentRequired ? CONTACT_LIFECYCLE_PROVISIONAL : CONTACT_LIFECYCLE_ACTIVE;
}

export function isOperationalContactLifecycle(value: unknown): value is typeof CONTACT_LIFECYCLE_ACTIVE {
  return value === CONTACT_LIFECYCLE_ACTIVE;
}

export async function promoteContactLifecycleToActive(params: {
  prisma: PrismaForContactLifecycle;
  clientId: string;
  contactId?: string | null;
  waId?: string | null;
  requestId: string;
  source?: string | null;
}) {
  if (!params.contactId && !params.waId) return { promotedCount: 0 };
  const result = await params.prisma.contact.updateMany({
    where: {
      clientId: params.clientId,
      lifecycle: CONTACT_LIFECYCLE_PROVISIONAL,
      ...(params.contactId ? { id: params.contactId } : { waId: params.waId ?? "" }),
    },
    data: { lifecycle: CONTACT_LIFECYCLE_ACTIVE },
  });
  if (result.count > 0) {
    await params.prisma.event.create({
      data: {
        clientId: params.clientId,
        requestId: `${params.requestId}:contact-lifecycle-active`,
        eventName: "privacy.contact.lifecycle.active",
        payloadJson: {
          contactId: params.contactId ?? null,
          source: params.source ?? null,
          promotedCount: result.count,
        },
      },
    });
  }
  return { promotedCount: result.count };
}
