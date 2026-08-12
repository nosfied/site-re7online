import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deleteWebSessionStoredMedia,
  resolveWebSessionStoredMedia,
  storeWebSessionMediaFile,
  validateWebSessionMedia,
  WebSessionMediaError,
} from "./webSessionMedia.js";

const png1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

test("storeWebSessionMediaFile stores safe image metadata without exposing physical path as ref", async (t) => {
  const previousRoot = process.env.WEB_SESSION_MEDIA_ROOT;
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "web-session-media-"));
  process.env.WEB_SESSION_MEDIA_ROOT = tmpRoot;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.WEB_SESSION_MEDIA_ROOT;
    else process.env.WEB_SESSION_MEDIA_ROOT = previousRoot;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const stored = await storeWebSessionMediaFile({
    clientId: "client/a",
    messageId: "../message",
    content: png1x1,
    mimeType: "image/png",
    fileName: "../print.png",
    caption: "print",
    kind: "image",
  });

  assert.equal(stored.kind, "image");
  assert.equal(stored.mimeType, "image/png");
  assert.equal(stored.fileName, "__print.png");
  assert.equal(stored.caption, "print");
  assert.equal(stored.sizeBytes, png1x1.length);
  assert.equal(stored.storageProvider, "local_web_session");
  assert.equal(stored.storageRef.includes(".."), false);
  assert.equal(path.isAbsolute(stored.storageRef), false);
  assert.match(stored.mediaId, /^web-session:/);

  const resolved = await resolveWebSessionStoredMedia({
    media: {
      storageProvider: stored.storageProvider,
      storageRef: stored.storageRef,
      mimeType: stored.mimeType,
      fileName: stored.fileName,
    },
  });
  assert.equal(resolved?.size, png1x1.length);
  assert.equal(resolved?.mimeType, "image/png");

  await deleteWebSessionStoredMedia(stored);
  assert.equal(await resolveWebSessionStoredMedia({ media: stored }), null);
});

test("validateWebSessionMedia rejects svg spoofed as image and oversize content", () => {
  assert.throws(
    () =>
      validateWebSessionMedia({
        content: Buffer.from("<svg></svg>"),
        mimeType: "image/svg+xml",
        fileName: "x.svg",
        kind: "image",
      }),
    WebSessionMediaError
  );
  assert.throws(
    () =>
      validateWebSessionMedia({
        content: Buffer.alloc(10 * 1024 * 1024 + 1),
        mimeType: "application/pdf",
        fileName: "x.pdf",
        kind: "document",
      }),
    WebSessionMediaError
  );
});

test("resolveWebSessionStoredMedia rejects symlinks inside storage root", async (t) => {
  const previousRoot = process.env.WEB_SESSION_MEDIA_ROOT;
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "web-session-media-symlink-"));
  process.env.WEB_SESSION_MEDIA_ROOT = tmpRoot;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.WEB_SESSION_MEDIA_ROOT;
    else process.env.WEB_SESSION_MEDIA_ROOT = previousRoot;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const outside = path.join(tmpRoot, "..", `outside-${process.pid}.png`);
  await fs.writeFile(outside, png1x1);
  await fs.symlink(outside, path.join(tmpRoot, "linked.png"));

  const resolved = await resolveWebSessionStoredMedia({
    media: {
      storageProvider: "local_web_session",
      storageRef: "linked.png",
      mimeType: "image/png",
      fileName: "linked.png",
    },
  });
  assert.equal(resolved, null);
  await fs.rm(outside, { force: true });
});
