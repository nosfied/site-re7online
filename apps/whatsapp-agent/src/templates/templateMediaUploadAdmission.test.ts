import assert from "node:assert/strict";
import test from "node:test";
import { resetTemplateMediaUploadAdmissionForTests, tryAdmitTemplateMediaUpload } from "./templateMediaUploadAdmission.js";

test("multipart admission bounds global and per-tenant memory concurrency", () => {
  process.env.TEMPLATE_MEDIA_UPLOAD_CONCURRENCY = "2";
  resetTemplateMediaUploadAdmissionForTests();
  const releaseA = tryAdmitTemplateMediaUpload("tenant-a");
  assert(releaseA);
  assert.equal(tryAdmitTemplateMediaUpload("tenant-a"), null, "one buffered upload per tenant");
  const releaseB = tryAdmitTemplateMediaUpload("tenant-b");
  assert(releaseB);
  assert.equal(tryAdmitTemplateMediaUpload("tenant-c"), null, "global buffer ceiling");
  releaseA();
  releaseA();
  const releaseC = tryAdmitTemplateMediaUpload("tenant-c");
  assert(releaseC);
  releaseB();
  releaseC();
  delete process.env.TEMPLATE_MEDIA_UPLOAD_CONCURRENCY;
});
