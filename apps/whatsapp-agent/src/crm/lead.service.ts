import { getPrisma } from "../db.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";
import {
  isWhatsAppMultichannelShadowWriteEnabled,
  safeApplyWhatsAppMultichannelShadow,
} from "../channels/whatsappMultichannelShadowWrite.js";
import { runWhatsAppDualReadShadow } from "../channels/whatsappDualReadShadow.js";

export async function ensureLeadForConversation(params: {
  tenantId: string;
  waId: string;
  name?: string | null;
  phoneNumberId?: string | null;
}) {
  const prisma = getPrisma();

  const existing = await prisma.lead.findFirst({
    where: {
      tenantId: params.tenantId,
      waId: params.waId,
    },
  });
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
    if (!existing.name && params.name?.trim()) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { name: params.name.trim().replace(/\s+/g, " ").slice(0, 160) },
      });
    }
    if (isWhatsAppMultichannelShadowWriteEnabled()) {
      await safeApplyWhatsAppMultichannelShadow({
        prisma,
        model: "Lead",
        recordId: existing.id,
        clientId: params.tenantId,
        waId: params.waId,
        phoneNumberId: params.phoneNumberId,
      });
    }
    return existing;
  }

  const lead = await prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      waIdCanonical: canonicalizeBrazilWaId(params.waId),
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

  const existing = await prisma.lead.findFirst({
    where: {
      tenantId: params.tenantId,
      waId: params.waId,
    },
  });
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
    const lead = await prisma.lead.update({
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

  const lead = await prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      waIdCanonical: canonicalizeBrazilWaId(params.waId),
      name: params.name,
      phone: params.waId,
      city: params.city,
      service: params.service,
      company: params.company,
      email: params.email,
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
