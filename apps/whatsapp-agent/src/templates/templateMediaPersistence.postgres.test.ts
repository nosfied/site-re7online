import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanupOrphanTemplateMedia } from "./templateMediaCleanup.js";
import { storeTemplateMedia } from "./templateMediaStorage.js";

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

test("account uploads are tenant/account scoped and tenant deletion cascades all media relations", async (t) => {
  const tenantA = await createTenant(t, "upload-scope-a");
  const tenantB = await createTenant(t, "upload-scope-b");
  const asset = await prisma.templateMediaAsset.create({
    data: { clientId: tenantA, purpose: "CAMPAIGN", kind: "VIDEO", storageKey: `${tenantA}/a.mp4`, mimeType: "video/mp4", sizeBytes: 12, sha256: "b".repeat(64) },
  });
  await prisma.templateMediaAccountUpload.createMany({
    data: ["phone-1", "phone-2"].map((phoneNumberId) => ({
      clientId: tenantA,
      assetId: asset.id,
      assetSha256: asset.sha256,
      kind: asset.kind,
      phoneNumberId,
      credentialGeneration: "generation-1",
      state: "confirmed",
      mediaId: `media-${phoneNumberId}`,
      attemptId: crypto.randomUUID(),
      uploadedAt: new Date(),
      validUntil: new Date(Date.now() + 60_000),
    })),
  });
  assert.equal(await prisma.templateMediaAccountUpload.count({ where: { clientId: tenantA } }), 2);
  await assert.rejects(prisma.templateMediaAccountUpload.create({
    data: {
      clientId: tenantB,
      assetId: asset.id,
      assetSha256: asset.sha256,
      kind: asset.kind,
      phoneNumberId: "phone-foreign",
      credentialGeneration: "generation-1",
      attemptId: crypto.randomUUID(),
    },
  }), /foreign key constraint/i);
  await prisma.$transaction(async (tx) => {
    await tx.templateMediaAccountUpload.updateMany({ where: { clientId: tenantA }, data: { state: "expired" } });
    throw new Error("rollback-proof");
  }).catch(() => undefined);
  assert.equal(await prisma.templateMediaAccountUpload.count({ where: { clientId: tenantA, state: "confirmed" } }), 2);

  const disposable = await prisma.client.create({ data: { clientKey: `media-delete-${crypto.randomUUID()}`, name: "delete", status: "ACTIVE" } });
  const disposableAsset = await prisma.templateMediaAsset.create({ data: { clientId: disposable.id, purpose: "TEMPLATE_EXAMPLE", kind: "IMAGE", storageKey: `${disposable.id}/delete.jpg`, mimeType: "image/jpeg", sizeBytes: 4, sha256: "c".repeat(64) } });
  await prisma.template.create({ data: { clientId: disposable.id, name: `delete_${crypto.randomUUID().replace(/-/g, "")}`, category: "UTILITY", language: "pt_BR", status: "approved", content: "x", headerType: "IMAGE", exampleMediaId: disposableAsset.id } });
  await prisma.templateMediaAccountUpload.create({ data: { clientId: disposable.id, assetId: disposableAsset.id, assetSha256: disposableAsset.sha256, kind: "IMAGE", phoneNumberId: "phone-delete", credentialGeneration: "g1", attemptId: crypto.randomUUID() } });
  await prisma.client.delete({ where: { id: disposable.id } });
  assert.equal(await prisma.templateMediaAsset.count({ where: { clientId: disposable.id } }), 0);
  assert.equal(await prisma.templateMediaAccountUpload.count({ where: { clientId: disposable.id } }), 0);
});

test("orphan cleanup is dry-run by default, preserves references and denies symlinks", async (t) => {
  const previousRoot = process.env.TEMPLATE_MEDIA_ROOT;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "re7-template-cleanup-"));
  process.env.TEMPLATE_MEDIA_ROOT = root;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.TEMPLATE_MEDIA_ROOT;
    else process.env.TEMPLATE_MEDIA_ROOT = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
  });
  const clientId = await createTenant(t, "cleanup");
  async function asset() {
    const stored = await storeTemplateMedia({
      clientId,
      purpose: "TEMPLATE_EXAMPLE",
      upload: { content: Buffer.from([0xff, 0xd8, 0xff, 1]), mimeType: "image/jpeg", fileName: "example.jpg", kind: "IMAGE" },
    });
    return prisma.templateMediaAsset.create({ data: { id: stored.id, clientId, purpose: "TEMPLATE_EXAMPLE", kind: "IMAGE", storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, originalFilename: stored.originalFilename, createdAt: new Date(0) } });
  }
  const orphan = await asset();
  const referenced = await asset();
  const symlinked = await asset();
  const symlinkPath = path.join(root, symlinked.storageKey);
  const outside = path.join(root, "outside-preserved.jpg");
  await fs.writeFile(outside, Buffer.from([0xff, 0xd8, 0xff, 2]));
  await fs.rm(symlinkPath);
  await fs.symlink(outside, symlinkPath);
  await prisma.template.create({ data: { clientId, name: `cleanup_${crypto.randomUUID().replace(/-/g, "")}`, category: "UTILITY", language: "pt_BR", status: "approved", content: "x", headerType: "IMAGE", exampleMediaId: referenced.id } });
  const dry = await cleanupOrphanTemplateMedia({ dryRun: true, olderThan: new Date(), clientId });
  assert.equal(dry.eligible, 2);
  assert.equal((await prisma.templateMediaAsset.findUniqueOrThrow({ where: { id: orphan.id } })).state, "stored");
  const applied = await cleanupOrphanTemplateMedia({ dryRun: false, olderThan: new Date(), clientId });
  assert.equal(applied.removed, 1);
  assert.equal(applied.failed, 1);
  assert.equal((await prisma.templateMediaAsset.findUniqueOrThrow({ where: { id: orphan.id } })).state, "deleted");
  assert.equal((await prisma.templateMediaAsset.findUniqueOrThrow({ where: { id: referenced.id } })).state, "stored");
  assert.equal((await prisma.templateMediaAsset.findUniqueOrThrow({ where: { id: symlinked.id } })).state, "cleanup_failed");
  assert.equal((await fs.readFile(outside)).length, 4, "cleanup never follows a symlink");
});
