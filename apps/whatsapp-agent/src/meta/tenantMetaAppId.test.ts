import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  configureTenantMetaAppId,
  mergeEmbeddedSignupAppId,
  resolveTenantMetaAppId,
  TenantMetaAppIdError,
} from "./tenantMetaAppId.js";
import { MetaTemplateServiceError, submitTemplateToMeta, validateMetaTemplateSubmissionConfig } from "./template.service.js";

const APP_A = "100001";
const APP_B = "200002";

function fakePrisma(rawPayload: Record<string, unknown>) {
  const state = {
    row: { id: "config-a", clientId: "tenant-a", rawPayload, updatedAt: new Date("2026-10-22T00:00:00Z") },
    events: [] as unknown[],
    updateCount: 0,
  };
  const tx = {
    tenantMetaConfig: {
      async findUnique() { return { ...state.row }; },
      async updateMany(args: { data: { rawPayload: Record<string, unknown> } }) {
        state.row.rawPayload = args.data.rawPayload;
        state.updateCount += 1;
        return { count: 1 };
      },
    },
    event: {
      async create(args: unknown) { state.events.push(args); return args; },
    },
  };
  return {
    state,
    prisma: { ...tx, async $transaction<T>(callback: (client: typeof tx) => Promise<T>) { return callback(tx); } } as unknown as PrismaClient,
  };
}

test("tenant App ID has priority and global fallback is fail-closed by default", () => {
  assert.deepEqual(resolveTenantMetaAppId({ rawPayload: { appId: APP_A }, globalAppId: APP_B }), {
    appId: APP_A,
    source: "tenant_app_id",
  });
  assert.deepEqual(resolveTenantMetaAppId({ rawPayload: {}, globalAppId: APP_B }), {
    appId: null,
    source: "missing",
  });
  assert.deepEqual(resolveTenantMetaAppId({ rawPayload: {}, globalAppId: APP_B, fallbackMode: "shared_app" }), {
    appId: APP_B,
    source: "global_explicit",
  });
  assert.throws(
    () => resolveTenantMetaAppId({ rawPayload: { appId: "invalid", applicationId: APP_A } }),
    (error: unknown) => error instanceof TenantMetaAppIdError && error.code === "meta_app_id_invalid"
  );
});

test("configuration changes only the target tenant, preserves payload and emits no full App ID", async () => {
  const target = fakePrisma({ source: "embedded_signup", retained: { value: true } });
  const otherTenant = { source: "other_provider", retained: true };
  const result = await configureTenantMetaAppId({
    prisma: target.prisma,
    clientId: "tenant-a",
    appId: APP_A,
    provenance: "embedded_signup",
    confirmTenantScoped: true,
    actor: "superadmin",
    requestId: "request-a",
  });
  assert.deepEqual(result, { configured: true, changed: true, source: "embedded_signup" });
  assert.equal(target.state.row.rawPayload.appId, APP_A);
  assert.deepEqual(target.state.row.rawPayload.retained, { value: true });
  assert.deepEqual(otherTenant, { source: "other_provider", retained: true });
  assert.equal(JSON.stringify(target.state.events).includes(APP_A), false);
});

test("same value is idempotent and divergent replacement is denied", async () => {
  const fixture = fakePrisma({ source: "embedded_signup", appId: APP_A });
  const same = await configureTenantMetaAppId({
    prisma: fixture.prisma,
    clientId: "tenant-a",
    appId: APP_A,
    provenance: "embedded_signup",
    confirmTenantScoped: true,
    actor: "superadmin",
    requestId: "request-same",
  });
  assert.equal(same.changed, false);
  assert.equal(fixture.state.updateCount, 0);
  await assert.rejects(
    configureTenantMetaAppId({
      prisma: fixture.prisma,
      clientId: "tenant-a",
      appId: APP_B,
      provenance: "embedded_signup",
      confirmTenantScoped: true,
      actor: "superadmin",
      requestId: "request-conflict",
    }),
    (error: unknown) => error instanceof TenantMetaAppIdError && error.code === "meta_app_id_conflict"
  );
});

test("incompatible provenance, invalid input and missing explicit confirmation are denied", async () => {
  assert.throws(
    () => mergeEmbeddedSignupAppId({ source: "manual_legacy" }, APP_A),
    (error: unknown) => error instanceof TenantMetaAppIdError && error.code === "meta_app_id_provenance_incompatible"
  );
  const fixture = fakePrisma({ source: "embedded_signup" });
  for (const input of [
    { appId: "not-numeric", provenance: "embedded_signup", confirmTenantScoped: true },
    { appId: APP_A, provenance: "other", confirmTenantScoped: true },
    { appId: APP_A, provenance: "embedded_signup", confirmTenantScoped: false },
  ]) {
    await assert.rejects(configureTenantMetaAppId({
      prisma: fixture.prisma,
      clientId: "tenant-a",
      actor: "superadmin",
      requestId: "request-denied",
      ...input,
    }), TenantMetaAppIdError);
  }
});

test("embedded signup preserves every prior property and rejects a conflicting App ID", () => {
  const merged: Record<string, unknown> = mergeEmbeddedSignupAppId({ source: "embedded_signup", nested: { kept: true } }, APP_A);
  assert.deepEqual(merged.nested, { kept: true });
  assert.equal(merged.appId, APP_A);
  assert.throws(() => mergeEmbeddedSignupAppId({ source: "embedded_signup", appId: APP_B }, APP_A));
});

test("media submission denies missing tenant App ID before provider state while text remains valid", () => {
  assert.throws(
    () => validateMetaTemplateSubmissionConfig({
      tenantConfig: { businessToken: "token", wabaId: "waba", appId: null },
      headerType: "IMAGE",
    }),
    (error: unknown) => error instanceof MetaTemplateServiceError && error.code === "meta_config_missing"
  );
  assert.deepEqual(
    validateMetaTemplateSubmissionConfig({
      tenantConfig: { businessToken: "token", wabaId: "waba", appId: null },
      headerType: "NONE",
    }),
    { businessToken: "token", wabaId: "waba", appId: null }
  );
});

test("ambiguous provider submission is reconciliation-only and never blindly retried", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("controlled_transport_failure");
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    submitTemplateToMeta({
      tenantConfig: { businessToken: "token", wabaId: "waba", appId: APP_A },
      template: {
        name: "tenant_scoped_test",
        category: "UTILITY",
        language: "pt_BR",
        content: "Mensagem institucional para acompanhamento do atendimento.",
        headerType: "NONE",
      },
    }),
    (error: unknown) => error instanceof MetaTemplateServiceError && error.code === "meta_template_submit_uncertain"
  );
  assert.equal(calls, 1);
});
