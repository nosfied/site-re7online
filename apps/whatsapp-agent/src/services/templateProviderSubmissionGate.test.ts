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

test("templates without media keep one final eligibility gate immediately before the message", async () => {
  let gates = 0;
  let messages = 0;
  const allowed = await runTemplateProviderSubmissionGate({
    beforeSubmit: async () => {
      gates += 1;
      return null;
    },
  });
  if (allowed.ok) messages += 1;
  assert.equal(gates, 1);
  assert.equal(messages, 1);
});

for (const eligibilityChange of ["active_opt_out", "campaign_paused_or_cancelled"] as const) {
  test(`media upload is retained but message is blocked when ${eligibilityChange} changes during upload`, async () => {
    let reason: string | null = null;
    let gates = 0;
    let uploads = 0;
    let messages = 0;
    let confirmedMediaId: string | null = null;
    let releaseUpload!: () => void;
    let markUploadStarted!: () => void;
    const uploadStarted = new Promise<void>((resolve) => { markUploadStarted = resolve; });
    const uploadPending = new Promise<void>((resolve) => { releaseUpload = resolve; });
    const beforeSubmit = async () => {
      gates += 1;
      return reason;
    };
    const resolveMedia = async () => {
      if (!confirmedMediaId) {
        uploads += 1;
        markUploadStarted();
        await uploadPending;
        confirmedMediaId = "confirmed-media";
      }
      return { ok: true as const, mediaId: confirmedMediaId };
    };

    const pending = runTemplateProviderSubmissionGate({ beforeSubmit, resolveMedia });
    await uploadStarted;
    reason = eligibilityChange;
    releaseUpload();
    const deniedAfterUpload = await pending;
    if (deniedAfterUpload.ok) messages += 1;
    assert.deepEqual(deniedAfterUpload, {
      ok: false,
      blockedByEligibility: true,
      errorBody: eligibilityChange,
    });
    assert.equal(gates, 2, "the same eligibility gate runs before and after media resolution");
    assert.equal(uploads, 1);
    assert.equal(messages, 0);
    assert.equal(confirmedMediaId, "confirmed-media", "confirmed media remains reusable");

    const stillDenied = await runTemplateProviderSubmissionGate({ beforeSubmit, resolveMedia });
    if (stillDenied.ok) messages += 1;
    assert.equal(stillDenied.ok, false);
    assert.equal(uploads, 1, "a blocked retry neither uploads nor invalidates confirmed media");
    assert.equal(messages, 0);

    reason = null;
    const restored = await runTemplateProviderSubmissionGate({ beforeSubmit, resolveMedia });
    if (restored.ok) messages += 1;
    assert.deepEqual(restored, { ok: true, mediaId: "confirmed-media" });
    assert.equal(uploads, 1, "restored eligibility reuses the prior confirmed media id");
    assert.equal(messages, 1);
  });
}

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
  let gates = 0;
  const one = await runTemplateProviderSubmissionGate({ beforeSubmit: async () => null, resolveMedia });
  if (one.ok) messages += 1;
  assert.equal(uploads, 1);
  assert.equal(messages, 1);
  uploads = 0;
  confirmedMedia = null;
  messages = 0;
  for (let index = 0; index < 1001; index += 1) {
    const gate = await runTemplateProviderSubmissionGate({ beforeSubmit: async () => {
      gates += 1;
      return null;
    }, resolveMedia });
    if (gate.ok) messages += 1;
  }
  assert.equal(uploads, 1);
  assert.equal(messages, 1001);
  assert.equal(gates, 2002, "media sends revalidate immediately before every message");
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
