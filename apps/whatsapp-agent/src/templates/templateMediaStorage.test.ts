import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  TEMPLATE_IMAGE_MAX_BYTES,
  TemplateMediaError,
  resolveTemplateMediaFile,
  storeTemplateMedia,
  validateTemplateMediaUpload,
} from "./templateMediaStorage.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

test("validates image/video magic bytes, MIME, extension, emptiness and limits", () => {
  assert.equal(validateTemplateMediaUpload({ content: jpeg, mimeType: "image/jpeg", fileName: "a.jpg", kind: "IMAGE" }).mimeType, "image/jpeg");
  assert.equal(validateTemplateMediaUpload({ content: png, mimeType: "image/png", fileName: "a.png", kind: "IMAGE" }).mimeType, "image/png");
  assert.equal(validateTemplateMediaUpload({ content: mp4, mimeType: "video/mp4", fileName: "a.mp4", kind: "VIDEO" }).mimeType, "video/mp4");
  assert.throws(() => validateTemplateMediaUpload({ content: Buffer.alloc(0), mimeType: "image/png", fileName: "a.png", kind: "IMAGE" }), (error) => error instanceof TemplateMediaError && error.code === "template_media_empty");
  assert.throws(() => validateTemplateMediaUpload({ content: png, mimeType: "image/jpeg", fileName: "a.jpg", kind: "IMAGE" }), /MIME/);
  assert.throws(() => validateTemplateMediaUpload({ content: png, mimeType: "image/png", fileName: "a.mp4", kind: "IMAGE" }), /Extensão/);
  const tooLarge = Buffer.alloc(TEMPLATE_IMAGE_MAX_BYTES + 1, 0);
  assert.throws(() => validateTemplateMediaUpload({ content: tooLarge, mimeType: "image/jpeg", fileName: "a.jpg", kind: "IMAGE" }), (error) => error instanceof TemplateMediaError && error.code === "template_media_too_large");
});

test("stores private tenant-scoped bytes and rejects symlinked roots", async (t) => {
  const previous = process.env.TEMPLATE_MEDIA_ROOT;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "template-media-"));
  const root = path.join(temp, "private");
  process.env.TEMPLATE_MEDIA_ROOT = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.TEMPLATE_MEDIA_ROOT;
    else process.env.TEMPLATE_MEDIA_ROOT = previous;
    await fs.rm(temp, { recursive: true, force: true });
  });
  const stored = await storeTemplateMedia({
    clientId: "tenant-a",
    purpose: "CAMPAIGN",
    upload: { content: jpeg, mimeType: "image/jpeg", fileName: "../../foto.jpg", kind: "IMAGE" },
  });
  assert.equal(stored.storageKey.startsWith("tenant-a/campaign/"), true);
  assert.equal((await fs.stat(stored.absolutePath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
  assert.deepEqual((await resolveTemplateMediaFile(stored.storageKey)).content, jpeg);

  const symlinkRoot = path.join(temp, "linked");
  await fs.symlink(root, symlinkRoot);
  process.env.TEMPLATE_MEDIA_ROOT = symlinkRoot;
  await assert.rejects(
    storeTemplateMedia({ clientId: "tenant-b", purpose: "CAMPAIGN", upload: { content: jpeg, mimeType: "image/jpeg", fileName: "b.jpg", kind: "IMAGE" } }),
    (error) => error instanceof TemplateMediaError && error.code === "template_media_storage_invalid"
  );
});
