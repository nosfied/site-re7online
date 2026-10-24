import assert from "node:assert/strict";
import test from "node:test";
import { boundedMetaProviderTimeoutMs } from "./metaTemplateMedia.js";
import {
  META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS,
  META_TEMPLATE_PROVIDER_STAGE_TIMEOUT_MS,
  MetaTemplateServiceError,
  normalizeMetaTemplateSyncStatus,
  selectMetaTemplateSyncMatch,
  submitTemplateToMeta,
} from "./template.service.js";

const expected = {
  expectedName: "imagem_previdenciario",
  expectedLanguage: "pt_BR",
};

test("PENDING, APPROVED and REJECTED are conclusive provider states", () => {
  for (const [provider, local] of [
    ["PENDING", "pending"],
    ["APPROVED", "approved"],
    ["REJECTED", "rejected"],
  ] as const) {
    assert.equal(normalizeMetaTemplateSyncStatus(provider), local);
    const selected = selectMetaTemplateSyncMatch({
      ...expected,
      items: [{ id: `meta-${local}`, name: expected.expectedName, language: expected.expectedLanguage, status: provider }],
    });
    assert.equal(selected.ok, true);
    if (selected.ok) assert.equal(selected.match.status, local);
  }
});

test("sync matching fails closed for absent, ambiguous, malformed and unknown results", () => {
  const cases = [
    { items: [], reason: "not_found" },
    {
      items: [
        { id: "one", name: expected.expectedName, language: expected.expectedLanguage, status: "PENDING" },
        { id: "two", name: expected.expectedName, language: expected.expectedLanguage, status: "PENDING" },
      ],
      reason: "ambiguous",
    },
    { items: null, reason: "invalid_response" },
    {
      items: [{ id: "one", name: expected.expectedName, language: expected.expectedLanguage, status: "PAUSED" }],
      reason: "unknown_status",
    },
    {
      items: [{ id: "one", name: expected.expectedName, status: "PENDING" }],
      reason: "not_found",
    },
  ];
  for (const item of cases) {
    const selected = selectMetaTemplateSyncMatch({ ...expected, items: item.items });
    assert.deepEqual(selected, { ok: false, reason: item.reason });
  }
});

test("existing Meta identity must match tenant-scoped name and language", () => {
  const selected = selectMetaTemplateSyncMatch({
    ...expected,
    expectedMetaTemplateId: "known-id",
    items: [
      { id: "other-id", name: expected.expectedName, language: expected.expectedLanguage, status: "APPROVED" },
      { id: "known-id", name: expected.expectedName, language: "en_US", status: "APPROVED" },
    ],
  });
  assert.deepEqual(selected, { ok: false, reason: "identity_mismatch" });
});

test("one provider deadline bounds all stages and leaves client/proxy persistence margin", () => {
  assert.equal(META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS, 45_000);
  assert.equal(META_TEMPLATE_PROVIDER_STAGE_TIMEOUT_MS, 20_000);
  assert.equal(boundedMetaProviderTimeoutMs({ stageTimeoutMs: 20_000, deadlineAtMs: 145_000, nowMs: 100_000 }), 20_000);
  assert.equal(boundedMetaProviderTimeoutMs({ stageTimeoutMs: 20_000, deadlineAtMs: 145_000, nowMs: 137_500 }), 7_500);
  assert.equal(boundedMetaProviderTimeoutMs({ stageTimeoutMs: 20_000, deadlineAtMs: 145_000, nowMs: 145_000 }), null);
  assert.equal(boundedMetaProviderTimeoutMs({ stageTimeoutMs: 20_000, deadlineAtMs: 145_000, nowMs: 146_000 }), null);
  assert.ok(58_000 - META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS >= 13_000);
  assert.ok(60_000 - META_TEMPLATE_PROVIDER_OPERATION_TIMEOUT_MS >= 15_000);
});

const textTemplate = {
  name: "budget_test",
  category: "UTILITY",
  language: "pt_BR",
  content: "Mensagem de teste de orçamento.",
  headerType: "NONE" as const,
};

test("expired budget before template submission performs zero creation POST", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("transport_must_not_start");
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const clock = [1_000, 46_000];
  await assert.rejects(
    submitTemplateToMeta({
      tenantConfig: { businessToken: "token", wabaId: "waba" },
      template: textTemplate,
      nowMs: () => clock.shift() ?? 46_000,
    }),
    (error: unknown) => {
      assert.equal(error instanceof MetaTemplateServiceError, true);
      if (!(error instanceof MetaTemplateServiceError)) return false;
      assert.equal(error.code, "meta_template_submit_budget_exhausted");
      assert.equal(error.status, 504);
      assert.equal(error.diagnostic?.stage, "template_submission_not_started");
      return true;
    }
  );
  assert.equal(calls, 0);
});

test("timeout after creation POST starts remains uncertain and is not retried", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true }
      );
    });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const clock = [1_000, 45_995];
  await assert.rejects(
    submitTemplateToMeta({
      tenantConfig: { businessToken: "token", wabaId: "waba" },
      template: textTemplate,
      nowMs: () => clock.shift() ?? 45_995,
    }),
    (error: unknown) => {
      assert.equal(error instanceof MetaTemplateServiceError, true);
      if (!(error instanceof MetaTemplateServiceError)) return false;
      assert.equal(error.code, "meta_template_submit_uncertain");
      assert.equal(error.diagnostic?.stage, "template_submission");
      return true;
    }
  );
  assert.equal(calls, 1);
});
