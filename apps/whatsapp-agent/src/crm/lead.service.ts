import { getPrisma } from "../db.js";
import { canonicalizeBrazilWaId } from "../utils/waid.js";

export async function ensureLeadForConversation(params: {
  tenantId: string;
  waId: string;
}) {
  const prisma = getPrisma();

  const existing = await prisma.lead.findFirst({
    where: {
      tenantId: params.tenantId,
      waId: params.waId,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      waIdCanonical: canonicalizeBrazilWaId(params.waId),
      phone: params.waId,
      status: "NEW",
    },
  });
}

export async function upsertLeadFromCapture(params: {
  tenantId: string;
  waId: string;
  name?: string;
  city?: string;
  service?: string;
  company?: string;
}) {
  const prisma = getPrisma();

  const existing = await prisma.lead.findFirst({
    where: {
      tenantId: params.tenantId,
      waId: params.waId,
    },
  });

  if (existing) {
    return prisma.lead.update({
      where: { id: existing.id },
      data: {
        name: params.name ?? existing.name,
        phone: existing.phone ?? params.waId,
        waIdCanonical: existing.waIdCanonical ?? canonicalizeBrazilWaId(params.waId),
        city: params.city ?? existing.city,
        service: params.service ?? existing.service,
        company: params.company ?? existing.company,
        status: "QUALIFIED",
      },
    });
  }

  return prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      waIdCanonical: canonicalizeBrazilWaId(params.waId),
      name: params.name,
      phone: params.waId,
      city: params.city,
      service: params.service,
      company: params.company,
    },
  });
}
