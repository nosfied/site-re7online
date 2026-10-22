import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { getPrisma } from "../db.js";
import {
  classifyExistingTemplateMediaUpload,
  resolveAccountScopedTemplateMedia,
  resolveAccountScopedTemplateMediaWithPersistentLease,
  clearTemplateMediaUploadSingleFlightForTests,
  isExplicitTemplateMediaRejection,
  setTemplateMediaPersistentLeaseTestHooksForTests,
} from "./templateMediaAccountUpload.js";
import { storeTemplateMedia } from "./templateMediaStorage.js";
import { sendTemplate } from "../services/outboundTemplateService.js";

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

test("existing upload classification permits only explicit terminal reuse, denial or expiry reclaim", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const future = new Date(now.getTime() + 60_000);
  const past = new Date(now.getTime() - 60_000);
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "confirmed", mediaId: "media-stable", validUntil: future, leaseExpiresAt: null }, now), { action: "reuse", mediaId: "media-stable" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "confirmed", mediaId: "media-expired", validUntil: past, leaseExpiresAt: null }, now), { action: "reclaim" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "uploading", mediaId: null, validUntil: null, leaseExpiresAt: future }, now), { action: "wait" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "uploading", mediaId: null, validUntil: null, leaseExpiresAt: past }, now), { action: "reclaim" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "failed", mediaId: null, validUntil: future, leaseExpiresAt: null }, now), { action: "deny", error: "upload_failed" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "uncertain", mediaId: null, validUntil: future, leaseExpiresAt: null }, now), { action: "deny", error: "upload_uncertain" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "failed", mediaId: null, validUntil: past, leaseExpiresAt: null }, now), { action: "reclaim" });
  assert.deepEqual(classifyExistingTemplateMediaUpload({ state: "uncertain", mediaId: null, validUntil: past, leaseExpiresAt: null }, now), { action: "reclaim" });
});

test("P2002 loser reclassifies a rapidly confirmed row without reclaiming it", async (t) => {
  const value = await fixture(t, "p2002-confirmed");
  let uploadCalls = 0;
  let missingReaders = 0;
  let releaseMissingReaders!: () => void;
  let markConfirmed!: () => void;
  const bothObservedMissing = new Promise<void>((resolve) => { releaseMissingReaders = resolve; });
  const confirmedPersisted = new Promise<void>((resolve) => { markConfirmed = resolve; });
  setTemplateMediaPersistentLeaseTestHooksForTests({
    afterMissingRead: async () => {
      missingReaders += 1;
      if (missingReaders === 2) releaseMissingReaders();
      await bothObservedMissing;
    },
    afterCreateConflict: async () => confirmedPersisted,
    afterConfirmedPersisted: markConfirmed,
  });
  t.after(() => setTemplateMediaPersistentLeaseTestHooksForTests(null));
  globalThis.fetch = async () => {
    uploadCalls += 1;
    return new Response(JSON.stringify({ id: "media-p2002-winner" }), { status: 200 });
  };

  const results = await Promise.all([
    resolveAccountScopedTemplateMediaWithPersistentLease(input(value)),
    resolveAccountScopedTemplateMediaWithPersistentLease(input(value)),
  ]);

  assert.equal(missingReaders, 2);
  assert.equal(uploadCalls, 1);
  assert(results.every((result) => result.ok && result.mediaId === "media-p2002-winner"));
  assert.equal(results.filter((result) => result.ok && result.reused).length, 1);
  const persisted = await prisma.templateMediaAccountUpload.findFirstOrThrow({ where: { clientId: value.client.id } });
  assert.equal(persisted.state, "confirmed");
  assert.equal(persisted.mediaId, "media-p2002-winner");
  assert(persisted.validUntil && persisted.validUntil > new Date());
  setTemplateMediaPersistentLeaseTestHooksForTests(null);
});

test("persistent lease test hooks are fail-closed in production without contaminating this process", () => {
  const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const moduleUrl = new URL("./templateMediaAccountUpload.ts", import.meta.url).href;
  const storageUrl = new URL("./templateMediaStorage.ts", import.meta.url).href;
  const dbUrl = new URL("../db.ts", import.meta.url).href;
  const probe = spawnSync(process.execPath, ["--import", loader, "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import crypto from "node:crypto";
    import fs from "node:fs/promises";
    import os from "node:os";
    import path from "node:path";

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "re7-template-hook-production-"));
    process.env.TEMPLATE_MEDIA_ROOT = root;
    process.env.NODE_ENV = "test";
    const uploadModule = await import(${JSON.stringify(moduleUrl)});
    const { storeTemplateMedia } = await import(${JSON.stringify(storageUrl)});
    const { getPrisma } = await import(${JSON.stringify(dbUrl)});
    const prisma = getPrisma();
    let client;
    let callbackCalls = 0;
    let uploadCalls = 0;
    try {
      uploadModule.setTemplateMediaPersistentLeaseTestHooksForTests({
        afterMissingRead: async () => { callbackCalls += 1; },
        afterCreateConflict: async () => { callbackCalls += 1; },
        afterConfirmedPersisted: () => { callbackCalls += 1; },
      });
      process.env.NODE_ENV = "production";
      assert.throws(
        () => uploadModule.setTemplateMediaPersistentLeaseTestHooksForTests(null),
        /template_media_test_hook_unavailable/
      );

      client = await prisma.client.create({
        data: { clientKey: "media-hook-production-" + crypto.randomUUID(), name: "production hook probe", status: "ACTIVE" },
      });
      const stored = await storeTemplateMedia({
        clientId: client.id,
        purpose: "CAMPAIGN",
        upload: { content: Buffer.from([0xff, 0xd8, 0xff, 0x01]), mimeType: "image/jpeg", fileName: "header.jpg", kind: "IMAGE" },
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
      globalThis.fetch = async () => {
        uploadCalls += 1;
        return new Response(JSON.stringify({ id: "media-production-normal" }), { status: 200 });
      };
      const result = await uploadModule.resolveAccountScopedTemplateMediaWithPersistentLease({
        clientId: client.id,
        assetId: asset.id,
        assetSha256: asset.sha256,
        kind: "IMAGE",
        phoneNumberId: "phone-production-probe",
        credentialGeneration: "tenant_meta:g1",
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        originalFilename: asset.originalFilename,
        accessToken: "not-logged-test-token",
      });
      assert.deepEqual(result, { ok: true, mediaId: "media-production-normal", reused: false });
      assert.equal(uploadCalls, 1);
      assert.equal(callbackCalls, 0);
      process.stdout.write("PRODUCTION_HOOK_FAIL_CLOSED_PASS\\n");
    } finally {
      if (client) await prisma.client.delete({ where: { id: client.id } }).catch(() => undefined);
      await prisma.$disconnect();
      await fs.rm(root, { recursive: true, force: true });
    }
  `], {
    cwd: new URL("../..", import.meta.url),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  assert.match(probe.stdout, /PRODUCTION_HOOK_FAIL_CLOSED_PASS/);
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

test("expired reclaimable states elect one owner while active backoff denies without upload", async (t) => {
  for (const state of ["confirmed", "uploading", "failed", "uncertain"] as const) {
    await t.test(`${state} after its deadline has one owner`, async (subtest) => {
      const value = await fixture(subtest, `expired-${state}`);
      const expiredAt = new Date(Date.now() - 60_000);
      await prisma.templateMediaAccountUpload.create({
        data: {
          clientId: value.client.id,
          assetId: value.asset.id,
          assetSha256: value.asset.sha256,
          kind: value.asset.kind,
          phoneNumberId: "phone-a",
          credentialGeneration: "tenant_meta:g1",
          state,
          attemptId: crypto.randomUUID(),
          mediaId: state === "confirmed" ? `expired-${state}` : null,
          leaseExpiresAt: state === "uploading" ? expiredAt : null,
          validUntil: state === "uploading" ? null : expiredAt,
        },
      });
      let uploadCalls = 0;
      globalThis.fetch = async () => {
        uploadCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ id: `renewed-${state}` }), { status: 200 });
      };
      const results = await Promise.all(Array.from({ length: 20 }, () => resolveAccountScopedTemplateMediaWithPersistentLease(input(value))));
      assert.equal(uploadCalls, 1);
      assert(results.every((result) => result.ok && result.mediaId === `renewed-${state}`));
    });
  }

  for (const state of ["failed", "uncertain"] as const) {
    await t.test(`${state} inside backoff is not retried`, async (subtest) => {
      const value = await fixture(subtest, `backoff-${state}`);
      await prisma.templateMediaAccountUpload.create({
        data: {
          clientId: value.client.id,
          assetId: value.asset.id,
          assetSha256: value.asset.sha256,
          kind: value.asset.kind,
          phoneNumberId: "phone-a",
          credentialGeneration: "tenant_meta:g1",
          state,
          attemptId: crypto.randomUUID(),
          validUntil: new Date(Date.now() + 60_000),
        },
      });
      let uploadCalls = 0;
      globalThis.fetch = async () => {
        uploadCalls += 1;
        throw new Error("upload must not run during backoff");
      };
      assert.deepEqual(await resolveAccountScopedTemplateMediaWithPersistentLease(input(value)), {
        ok: false,
        error: state === "failed" ? "upload_failed" : "upload_uncertain",
      });
      assert.equal(uploadCalls, 0);
    });
  }
});

test("an owner that loses attemptId cannot report its upload as persisted", async (t) => {
  const value = await fixture(t, "lost-owner");
  let uploadCalls = 0;
  globalThis.fetch = async () => {
    uploadCalls += 1;
    await prisma.templateMediaAccountUpload.updateMany({
      where: { clientId: value.client.id, assetId: value.asset.id, state: "uploading" },
      data: { attemptId: "replacement-owner" },
    });
    return new Response(JSON.stringify({ id: "orphaned-provider-media" }), { status: 200 });
  };
  assert.deepEqual(await resolveAccountScopedTemplateMediaWithPersistentLease(input(value)), { ok: false, error: "upload_uncertain" });
  assert.equal(uploadCalls, 1);
  const persisted = await prisma.templateMediaAccountUpload.findFirstOrThrow({ where: { clientId: value.client.id } });
  assert.equal(persisted.state, "uploading");
  assert.equal(persisted.mediaId, null);
  assert.equal(persisted.attemptId, "replacement-owner");
});

test("sendTemplate rechecks eligibility after a pending upload and retains confirmed media for reuse", async (t) => {
  const value = await fixture(t, "final-eligibility");
  const clientKey = value.client.clientKey;
  t.after(() => fs.rm(path.join(process.cwd(), ".data", clientKey), { recursive: true, force: true }));
  const phoneNumberId = "phone-final-eligibility";
  await prisma.tenantMetaConfig.create({
    data: {
      clientId: value.client.id,
      businessToken: "test-only-token",
      phoneNumberId,
      rawPayload: {},
    },
  });
  await prisma.template.create({
    data: {
      clientId: value.client.id,
      name: "final_eligibility_media",
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Synthetic",
      headerType: "IMAGE",
    },
  });

  let eligibilityReason: string | null = null;
  let eligibilityChecks = 0;
  let uploadCalls = 0;
  let messageCalls = 0;
  let releaseUpload!: () => void;
  let markUploadStarted!: () => void;
  const uploadStarted = new Promise<void>((resolve) => { markUploadStarted = resolve; });
  const uploadPending = new Promise<void>((resolve) => { releaseUpload = resolve; });
  const beforeSubmit = async () => {
    eligibilityChecks += 1;
    return eligibilityReason;
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith(`/${phoneNumberId}/media`)) {
      uploadCalls += 1;
      markUploadStarted();
      await uploadPending;
      return new Response(JSON.stringify({ id: "confirmed-media" }), { status: 200 });
    }
    if (url.endsWith(`/${phoneNumberId}/messages`)) {
      messageCalls += 1;
      const payload = JSON.parse(String(init?.body)) as {
        template?: { components?: Array<{ parameters?: Array<{ image?: { id?: string } }> }> };
      };
      assert.equal(payload.template?.components?.[0]?.parameters?.[0]?.image?.id, "confirmed-media");
      return new Response(JSON.stringify({ messages: [{ id: "message-1" }] }), { status: 200 });
    }
    throw new Error("unexpected_provider_url");
  };
  const params = {
    clientId: value.client.id,
    clientKey,
    waId: "5541991100961",
    toE164: "5541991100961",
    intent: undefined,
    templateName: "final_eligibility_media",
    lang: "pt_BR",
    media: { assetId: value.asset.id, kind: "IMAGE" as const, sha256: value.asset.sha256 },
    beforeSubmit,
  };

  const pending = sendTemplate(params);
  await uploadStarted;
  eligibilityReason = "active_opt_out";
  releaseUpload();
  const deniedAfterUpload = await pending;
  assert.deepEqual(deniedAfterUpload, {
    ok: false,
    blockedByEligibility: true,
    errorBody: "active_opt_out",
  });
  assert.equal(eligibilityChecks, 2);
  assert.equal(uploadCalls, 1);
  assert.equal(messageCalls, 0);
  assert.equal(await prisma.templateMediaAccountUpload.count({
    where: { clientId: value.client.id, assetId: value.asset.id, state: "confirmed", mediaId: "confirmed-media" },
  }), 1, "the provider-confirmed media id remains persisted after the final gate denies");

  const stillDenied = await sendTemplate(params);
  assert.equal(stillDenied.blockedByEligibility, true);
  assert.equal(uploadCalls, 1, "a blocked retry does not upload again");
  assert.equal(messageCalls, 0);

  eligibilityReason = null;
  const restored = await sendTemplate(params);
  assert.equal(restored.ok, true);
  assert.equal(uploadCalls, 1, "restored eligibility reuses the confirmed media id");
  assert.equal(messageCalls, 1);
});
