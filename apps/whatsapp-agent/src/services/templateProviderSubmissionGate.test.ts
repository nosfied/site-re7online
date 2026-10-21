import assert from "node:assert/strict";
import test from "node:test";
import { runTemplateProviderSubmissionGate } from "./templateProviderSubmissionGate.js";

test("no upload or message can precede the final eligibility guard", async () => {
  let uploads = 0;
  let messages = 0;
  const gate = await runTemplateProviderSubmissionGate({
    beforeSubmit: async () => "recipient_no_longer_eligible",
    resolveMedia: async () => {
      uploads += 1;
      return { ok: true, mediaId: "media" };
    },
  });
  if (gate.ok) messages += 1;
  assert.equal(gate.ok, false);
  assert.equal(uploads, 0);
  assert.equal(messages, 0);
});

test("one and 1001 eligible recipients submit exact message counts with one reusable upload", async () => {
  let uploads = 0;
  let confirmedMedia: string | null = null;
  const resolveMedia = async () => {
    if (!confirmedMedia) {
      uploads += 1;
      confirmedMedia = "confirmed-media";
    }
    return { ok: true as const, mediaId: confirmedMedia };
  };
  let messages = 0;
  const one = await runTemplateProviderSubmissionGate({ beforeSubmit: async () => null, resolveMedia });
  if (one.ok) messages += 1;
  assert.equal(uploads, 1);
  assert.equal(messages, 1);
  uploads = 0;
  confirmedMedia = null;
  messages = 0;
  for (let index = 0; index < 1001; index += 1) {
    const gate = await runTemplateProviderSubmissionGate({ beforeSubmit: async () => null, resolveMedia });
    if (gate.ok) messages += 1;
  }
  assert.equal(uploads, 1);
  assert.equal(messages, 1001);
});

test("upload failure and uncertainty produce zero message submissions", async () => {
  for (const errorBody of ["template_media_upload_failed", "template_media_upload_uncertain"]) {
    let messages = 0;
    const gate = await runTemplateProviderSubmissionGate({
      beforeSubmit: async () => null,
      resolveMedia: async () => ({ ok: false, status: 502, errorBody }),
    });
    if (gate.ok) messages += 1;
    assert.equal(messages, 0);
    assert.equal(gate.ok, false);
  }
});
