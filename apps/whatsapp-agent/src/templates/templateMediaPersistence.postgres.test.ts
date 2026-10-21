import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";

const prisma = getPrisma();
test.after(() => prisma.$disconnect());

async function createTenant(t: { after: (fn: () => Promise<void>) => void }, label: string) {
  const client = await prisma.client.create({
    data: { clientKey: `template-media-${label}-${crypto.randomUUID()}`, name: `Template media ${label}`, status: "ACTIVE" },
    select: { id: true },
  });
  t.after(() => prisma.client.delete({ where: { id: client.id } }).then(() => undefined));
  return client.id;
}

test("template and campaign media relations fail closed across tenants", async (t) => {
  const tenantA = await createTenant(t, "a");
  const tenantB = await createTenant(t, "b");
  const asset = await prisma.templateMediaAsset.create({
    data: {
      clientId: tenantA,
      purpose: "CAMPAIGN",
      kind: "IMAGE",
      storageKey: `${tenantA}/campaign/${crypto.randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 12,
      sha256: "a".repeat(64),
    },
  });

  await assert.rejects(
    prisma.campaign.create({
      data: {
        clientId: tenantB,
        name: "cross-tenant-denied",
        templateName: "media_template",
        status: "draft",
        templateMediaAssetId: asset.id,
        templateMediaSnapshot: { assetId: asset.id, kind: "IMAGE", sha256: asset.sha256 },
      },
    }),
    /foreign key constraint/i
  );

  const campaign = await prisma.campaign.create({
    data: {
      clientId: tenantA,
      name: "same-tenant-accepted",
      templateName: "media_template",
      status: "draft",
      templateMediaAssetId: asset.id,
      templateMediaSnapshot: { assetId: asset.id, kind: "IMAGE", sha256: asset.sha256 },
    },
  });
  assert.equal(campaign.templateMediaAssetId, asset.id);
  await assert.rejects(prisma.templateMediaAsset.delete({ where: { id: asset.id } }), /foreign key constraint/i);
});

test("legacy text templates remain valid with additive defaults", async (t) => {
  const clientId = await createTenant(t, "legacy");
  const template = await prisma.template.create({
    data: {
      clientId,
      name: `legacy_${crypto.randomUUID().replace(/-/g, "")}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Olá",
    },
  });
  assert.equal(template.headerType, "NONE");
  assert.equal(template.exampleMediaId, null);
  assert.equal(template.components, null);
});
