import { getPrisma } from "../db.js";

export async function upsertLeadFromCapture(params: {
  tenantId: string;
  waId: string;
  name?: string;
  city?: string;
  service?: string;
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
        city: params.city ?? existing.city,
        service: params.service ?? existing.service,
        status: "QUALIFIED",
      },
    });
  }

  return prisma.lead.create({
    data: {
      tenantId: params.tenantId,
      waId: params.waId,
      name: params.name,
      phone: params.waId,
      city: params.city,
      service: params.service,
    },
  });
}
