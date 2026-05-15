import test from "node:test";
import assert from "node:assert/strict";
import { buildChannelRuntimePreflight } from "./channelRuntimePreflight.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

function account(overrides: Partial<TenantChannelAccount> = {}): TenantChannelAccount {
  return {
    id: "tenant-a-meta-messenger-page-1",
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    enabled: true,
    automationEnabled: true,
    runtimeEnabled: true,
    outboundEnabled: false,
    aiEnabled: true,
    handoffEnabled: true,
    status: "connected",
    tokenStatus: "configured",
    ...overrides,
  };
}

function preflight(overrides: Partial<TenantChannelAccount> = {}, extra: Record<string, unknown> = {}) {
  return buildChannelRuntimePreflight({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    account: account(overrides),
    signatureConfigured: true,
    mode: "dry_run",
    ...extra,
  });
}

test("missing account blocks preflight", () => {
  const result = buildChannelRuntimePreflight({
    tenantKey: "tenant-a",
    channel: "messenger",
    provider: "meta",
    channelAccountId: "page-1",
    account: null,
    signatureConfigured: true,
    mode: "dry_run",
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.canDryRun, false);
  assert.equal(result.blockers.includes("account_disabled"), true);
});

test("disabled account blocks preflight", () => {
  const result = preflight({ enabled: false, status: "disabled" });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.includes("account_disabled"), true);
  assert.equal(result.blockers.includes("account_not_connected"), true);
});

test("pending and error statuses block preflight", () => {
  const pending = preflight({ status: "pending" });
  const error = preflight({ status: "error" });

  assert.equal(pending.blockers.includes("account_pending"), true);
  assert.equal(error.blockers.includes("account_error"), true);
});

test("automation and runtime disabled block preflight", () => {
  const automation = preflight({ automationEnabled: false });
  const runtime = preflight({ runtimeEnabled: false });

  assert.equal(automation.blockers.includes("automation_disabled"), true);
  assert.equal(runtime.blockers.includes("runtime_disabled"), true);
});

test("missing or expired token blocks preflight", () => {
  const missing = preflight({ tokenStatus: "missing" });
  const expired = preflight({ tokenStatus: "expired" });

  assert.equal(missing.blockers.includes("token_missing"), true);
  assert.equal(expired.blockers.includes("token_expired"), true);
});

test("signature missing blocks preflight", () => {
  const result = preflight({}, { signatureConfigured: false });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.includes("signature_missing"), true);
});

test("dry-run eligible allows canDryRun while keeping persistence and outbound false", () => {
  const result = preflight();

  assert.equal(result.ok, true);
  assert.equal(result.summary.canDryRun, true);
  assert.equal(result.summary.canAttemptRuntime, false);
  assert.equal(result.summary.canPersist, false);
  assert.equal(result.summary.canSendOutbound, false);
});

test("runtime candidate remains blocked while persistence and outbound are not implemented", () => {
  const result = preflight({}, { mode: "runtime_candidate", readinessBlockers: [] });

  assert.equal(result.ok, false);
  assert.equal(result.summary.canAttemptRuntime, false);
  assert.equal(result.blockers.includes("persistence_not_implemented"), true);
  assert.equal(result.blockers.includes("outbound_not_implemented"), true);
});

test("readiness critical blocker blocks dry-run", () => {
  const result = preflight({}, { readinessBlockers: ["runtime_disabled"] });

  assert.equal(result.ok, false);
  assert.equal(result.summary.canDryRun, false);
  assert.equal(result.blockers.includes("readiness_blocked"), true);
});

test("observe only does not authorize runtime and records warnings", () => {
  const result = preflight(
    { enabled: false, status: "disabled", tokenStatus: "missing", automationEnabled: false, runtimeEnabled: false },
    { mode: "observe_only", signatureConfigured: false }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.canObserve, true);
  assert.equal(result.summary.canDryRun, false);
  assert.equal(result.summary.canAttemptRuntime, false);
  assert.equal(result.warnings.includes("account_disabled"), true);
  assert.equal(result.warnings.includes("token_missing"), true);
});

test("preflight result does not expose PII or token fields", () => {
  const result = preflight();
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("psid"), false);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes("accessToken"), false);
  assert.equal(serialized.includes("pageAccessToken"), false);
  assert.equal(serialized.includes("secret"), false);
});
