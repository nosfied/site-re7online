import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { getPrisma } from "../db.js";
import { resolveAccountScopedTemplateMedia, resolveAccountScopedTemplateMediaWithPersistentLease, clearTemplateMediaUploadSingleFlightForTests, isExplicitTemplateMediaRejection } from "./templateMediaAccountUpload.js";
import { storeTemplateMedia } from "./templateMediaStorage.js";

const prisma = getPrisma();
const originalFetch = globalThis.fetch;
let root = "";

async function fixture(t: TestContext, label: string) {
  const client = await prisma.client.create({
    data: { clientKey: `media-account-${label}-${crypto.randomUUID()}`, name: label, status: "ACTIVE" },
  });
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]);
  const stored = await storeTemplateMedia({
    clientId: client.id,
    purpose: "CAMPAIGN",
    upload: { content: bytes, mimeType: "image/jpeg", fileName: "header.jpg", kind: "IMAGE" },
  });
  const asset = await prisma.templateMediaAsset.create({
    data: {
      id: stored.id,
      clientId: client.id,
      purpose: "CAMPAIGN",
      kind: "IMAGE",
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
    },
  });
  t.after(() => prisma.client.delete({ where: { id: client.id } }).then(() => undefined));
  return { client, asset };
}

function input(value: Awaited<ReturnType<typeof fixture>>, phoneNumberId = "phone-a") {
  return {
    clientId: value.client.id,
    assetId: value.asset.id,
    assetSha256: value.asset.sha256,
    kind: "IMAGE" as const,
    phoneNumberId,
    credentialGeneration: "tenant_meta:g1",
    storageKey: value.asset.storageKey,
    mimeType: value.asset.mimeType,
    originalFilename: value.asset.originalFilename,
    accessToken: "not-logged-test-token",
  };
}

test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "re7-template-account-upload-"));
  process.env.TEMPLATE_MEDIA_ROOT = root;
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.TEMPLATE_MEDIA_ROOT;
  await prisma.$disconnect();
  await fs.rm(root, { recursive: true, force: true });
});

test("only explicit provider media rejection permits controlled reacquisition", () => {
  assert.equal(isExplicitTemplateMediaRejection(400, '{"error":{"message":"Invalid media id"}}'), true);
  assert.equal(isExplicitTemplateMediaRejection(404, "media does not exist"), true);
  assert.equal(isExplicitTemplateMediaRejection(500, "invalid media id"), false);
  assert.equal(isExplicitTemplateMediaRejection(400, "template parameter invalid"), false);
});

test("one and 1001 eligible sends reuse one confirmed upload for the same tenant/account", async (t) => {
  const value = await fixture(t, "fanout");
  let uploadCalls = 0;
  globalThis.fetch = async () => {
    uploadCalls += 1;
    return new Response(JSON.stringify({ id: `media-${uploadCalls}` }), { status: 200 });
  };
  const first = await resolveAccountScopedTemplateMedia(input(value));
  assert.equal(first.ok, true);
  let messageCalls = 0;
  for (let index = 0; index < 1001; index += 1) {
    const media = await resolveAccountScopedTemplateMedia(input(value));
    assert.equal(media.ok, true);
    messageCalls += 1;
  }
  assert.equal(uploadCalls, 1);
  assert.equal(messageCalls, 1001);
});

test("concurrency is single-flight and scopes phone, tenant, hash, expiration and uncertainty", async (t) => {
  const firstTenant = await fixture(t, "concurrent-a");
  const secondTenant = await fixture(t, "concurrent-b");
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return new Response(JSON.stringify({ id: `media-${calls}` }), { status: 200 });
  };
  clearTemplateMediaUploadSingleFlightForTests();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => resolveAccountScopedTemplateMediaWithPersistentLease(input(firstTenant))));
  assert(concurrent.every((item) => item.ok));
  assert.equal(calls, 1);
  assert.equal((await resolveAccountScopedTemplateMedia(input(firstTenant, "phone-b"))).ok, true);
  assert.equal((await resolveAccountScopedTemplateMedia(input(secondTenant))).ok, true);
  assert.equal(calls, 3, "different phone/account and tenant require separate uploads");

  const mismatch = await resolveAccountScopedTemplateMedia({ ...input(firstTenant), assetSha256: "0".repeat(64) });
  assert.deepEqual(mismatch, { ok: false, error: "content_mismatch" });
  assert.equal(calls, 3, "a changed hash is denied rather than reusing a media id");

  await prisma.templateMediaAccountUpload.updateMany({
    where: { clientId: firstTenant.client.id, phoneNumberId: "phone-a", state: "confirmed" },
    data: { validUntil: new Date(0) },
  });
  assert.equal((await resolveAccountScopedTemplateMedia(input(firstTenant))).ok, true);
  assert.equal(calls, 4, "expired confirmed uploads are reacquired once");

  await prisma.templateMediaAccountUpload.deleteMany({ where: { clientId: firstTenant.client.id, phoneNumberId: "phone-a" } });
  clearTemplateMediaUploadSingleFlightForTests();
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("ambiguous network result");
  };
  assert.deepEqual(await resolveAccountScopedTemplateMedia(input(firstTenant)), { ok: false, error: "upload_uncertain" });
  const afterUncertainCalls = calls;
  assert.deepEqual(await resolveAccountScopedTemplateMedia(input(firstTenant)), { ok: false, error: "upload_uncertain" });
  assert.equal(calls, afterUncertainCalls, "uncertain result cannot trigger a blind retry");
});
