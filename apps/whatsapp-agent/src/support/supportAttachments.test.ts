import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SupportAttachmentError,
  validateSupportImageUpload,
} from "./supportAttachments.js";

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2t0XQAAAABJRU5ErkJggg==",
  "base64"
);

const jpegHeader = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11,
  0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);

const webpHeader = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
  0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

test("validateSupportImageUpload accepts PNG, JPEG and WebP only with matching magic bytes", () => {
  assert.equal(
    validateSupportImageUpload({ fileName: "print.png", mimeType: "image/png", content: png1x1 }).mimeType,
    "image/png"
  );
  assert.equal(
    validateSupportImageUpload({ fileName: "print.jpg", mimeType: "image/jpeg", content: jpegHeader }).mimeType,
    "image/jpeg"
  );
  assert.equal(
    validateSupportImageUpload({ fileName: "print.webp", mimeType: "image/webp", content: webpHeader }).mimeType,
    "image/webp"
  );
});

test("validateSupportImageUpload rejects spoofed, SVG and oversized uploads", () => {
  assert.throws(
    () => validateSupportImageUpload({ fileName: "spoof.png", mimeType: "image/png", content: Buffer.from("not image") }),
    (error) => error instanceof SupportAttachmentError && error.code === "support_attachment_invalid"
  );
  assert.throws(
    () =>
      validateSupportImageUpload({
        fileName: "unsafe.svg",
        mimeType: "image/svg+xml",
        content: Buffer.from("<svg><script /></svg>"),
      }),
    (error) => error instanceof SupportAttachmentError && error.code === "support_attachment_invalid"
  );
  assert.throws(
    () =>
      validateSupportImageUpload({
        fileName: "large.png",
        mimeType: "image/png",
        content: Buffer.concat([png1x1, Buffer.alloc(SUPPORT_ATTACHMENT_MAX_BYTES)]),
      }),
    (error) => error instanceof SupportAttachmentError && error.code === "support_attachment_too_large"
  );
});
