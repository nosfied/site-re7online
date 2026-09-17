import { getPrisma } from "../db.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import {
  isWhatsAppMultichannelShadowWriteEnabled,
  safeApplyWhatsAppMultichannelShadow,
} from "../channels/whatsappMultichannelShadowWrite.js";
import { runWhatsAppDualReadShadow } from "../channels/whatsappDualReadShadow.js";
import { buildCrmWhatsappExternalUserHash } from "./crmWhatsappIdentity.js";
import { CrmContactUpsertError, resolveCrmContactIdentity } from "./crmContactUpsert.js";

type EnsureLeadForConversationParams = {
  tenantId: string;
  waId: string;
  name?: string | null;
  phoneNumberId?: string | null;
};

async function resolveConversationLeadIdentity(
  prisma: ReturnType<typeof getPrisma>,
  params: EnsureLeadForConversationParams
) {
  try {
    return await resolveCrmContactIdentity(prisma, {
      clientId: params.tenantId,
      phone: params.waId,
    });
  } catch (error) {
    if (!(error instanceof CrmContactUpsertError && error.code === "invalid_phone")) throw error;
    const lead = await prisma.lead.findFirst({
      where: { tenantId: params.tenantId, waId: params.waId },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        contactChannelIdentityId: true,
      },
    });
    return {
      waIdCanonical: canonicalizeBrazilWaId(params.waId) ?? params.waId,
      identityCandidates: [params.waId],
      contact: null,
      lead,
    };
  }
}

export async function ensureLeadForConversationWithPrisma(
  prisma: ReturnType<typeof getPrisma>,
  params: EnsureLeadForConversationParams
) {
  const resolved = await resolveConversationLeadIdentity(prisma, params);
  const existing = resolved.lead
    ? await prisma.lead.findUnique({ where: { id: resolved.lead.id } })
    : null;
  const providerIdentity = resolved.contact
    ? await prisma.contactChannelIdentity.upsert({
        where: {
          clientId_channel_provider_channelAccountId_externalUserHash: {
            clientId: params.tenantId,
            channel: "whatsapp",
            provider: "meta",
            channelAccountId: params.phoneNumberId ?? "whatsapp",
            externalUserHash: buildCrmWhatsappExternalUserHash(resolved.waIdCanonical),
          },
        },
        update: {
          contactId: resolved.contact.id,
          legacyWaId: params.waId,
          displayName: resolved.contact.name ?? params.name?.trim() ?? null,
          lastSeenAt: new Date(),
        },
        create: {
          clientId: params.tenantId,
          contactId: resolved.contact.id,
          channel: "whatsapp",
          provider: "meta",
          channelAccountId: params.phoneNumberId ?? "whatsapp",
          externalUserHash: buildCrmWhatsappExternalUserHash(resolved.waIdCanonical),
          legacyWaId: params.waId,
          displayName: resolved.contact.name ?? params.name?.trim() ?? null,
          lastSeenAt: new Date(),
        },
        select: { id: true },
      })
    : null;
  await runWhatsAppDualReadShadow({
    prisma,
    model: "Lead",
    ownerId: params.tenantId,
    waId: params.waId,
    phoneNumberId: params.phoneNumberId,
    phase: "before_persist",
    legacyRecord: existing
      ? {
          id: existing.id,
          ownerId: existing.tenantId,
          channelAccountId: existing.channelAccountId,
          externalUserHash: existing.externalUserHash,
          legacyWaId: existing.legacyWaId,
        }
      : null,
  });

  if (existing) {
    const normalizedName = params.name?.trim().replace(/\s+/g, " ").slice(0, 160) || null;
    const shouldUpdateName = !existing.name && normalizedName;
    const shouldSetCanonical = !existing.waIdCanonical;
    const shouldAttachIdentity = !existing.contactChannelIdentityId && providerIdentity;
    const updated = shouldUpdateName || shouldSetCanonical || shouldAttachIdentity
      ? await prisma.lead.update({
        where: { id: existing.id },
        data: {
          ...(shouldUpdateName ? { name: normalizedName } : {}),
          ...(shouldSetCanonical ? { waIdCanonical: resolved.waIdCanonical } : {}),
          ...(shouldAttachIdentity ? { contactChannelIdentityId: providerIdentity.id } : {}),
        },
      })
      : existing;
    if (isWhatsAppMultichannelShadowWriteEnabled()) {
      await safeApplyWhatsAppMultichannelShadow({
        prisma,
        model: "Lead",
        recordId: updated.id,
        clientId: params.tenantId,
        waId: params.waId,
        phoneNumberId: params.phoneNumberId,
      });
    }
    return updated;
  }

  const lead = await prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      waIdCanonical: resolved.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
      ...(providerIdentity ? { contactChannelIdentityId: providerIdentity.id } : {}),
      name: params.name?.trim().replace(/\s+/g, " ").slice(0, 160) || undefined,
      phone: params.waId,
      status: "NEW",
    },
  });
  if (isWhatsAppMultichannelShadowWriteEnabled()) {
    await safeApplyWhatsAppMultichannelShadow({
      prisma,
      model: "Lead",
      recordId: lead.id,
      clientId: params.tenantId,
      waId: params.waId,
      phoneNumberId: params.phoneNumberId,
    });
  }
  return lead;
}

export async function ensureLeadForConversation(params: EnsureLeadForConversationParams) {
  return ensureLeadForConversationWithPrisma(getPrisma(), params);
}

export async function upsertLeadFromCapture(params: {
  tenantId: string;
  waId: string;
  name?: string;
  city?: string;
  service?: string;
  company?: string;
  email?: string;
  phoneNumberId?: string | null;
}) {
  const prisma = getPrisma();
  const existing = await ensureLeadForConversationWithPrisma(prisma, {
    tenantId: params.tenantId,
    waId: params.waId,
    name: params.name,
    phoneNumberId: params.phoneNumberId,
  });
  return prisma.lead.update({
    where: { id: existing.id },
    data: {
      name: params.name ?? existing.name,
      phone: existing.phone ?? params.waId,
      waIdCanonical: existing.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
      city: params.city ?? existing.city,
      service: params.service ?? existing.service,
      company: params.company ?? existing.company,
      email: params.email ?? existing.email,
      status: "QUALIFIED",
    },
  });
}
