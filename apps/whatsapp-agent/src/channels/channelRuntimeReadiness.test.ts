import test from "node:test";
import assert from "node:assert/strict";
import { buildChannelRuntimeReadinessReports } from "./channelRuntimeReadiness.js";
import type { DryRunSessionState } from "./channelDryRunSessions.js";
import type { ObservedChannelEvent } from "./observedChannelEvents.js";
import type { TenantConfigMap } from "../config/tenantConfig.js";

function tenantsWithAccount(overrides: Record<string, unknown> = {}): TenantConfigMap {
  return {
    "tenant-a": {
      id: "tenant-a",
      name: "Tenant A",
      metaPhoneNumberId: "phone-tenant-a",
      allowlist: [],
      handoffAttendantWaid: "",
      defaultLanguage: "pt_BR",
      channelAccounts: [
        {
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
        },
      ],
    },
  };
}

test("buildChannelRuntimeReadinessReports returns empty reports without channelAccounts", () => {
  const reports = buildChannelRuntimeReadinessReports({
    tenants: {
      "tenant-a": {
        id: "tenant-a",
        name: "Tenant A",
        metaPhoneNumberId: "phone-tenant-a",
        allowlist: [],
        handoffAttendantWaid: "",
        defaultLanguage: "pt_BR",
      },
    },
  });

  assert.deepEqual(reports, []);
});

test("disabled account reports account_disabled blocker", () => {
  const [report] = buildChannelRuntimeReadinessReports({
    tenants: tenantsWithAccount({
      enabled: false,
      automationEnabled: false,
      runtimeEnabled: false,
      status: "disabled",
      tokenStatus: "missing",
    }),
  });

  assert.equal(report?.gate.allowed, false);
  assert.equal(report?.readiness.canDryRun, false);
  assert.equal(report?.readiness.blockers.includes("account_disabled"), true);
  assert.equal(report?.readiness.blockers.includes("token_missing"), true);
});

test("runtime disabled blocks dry-run readiness", () => {
  const [report] = buildChannelRuntimeReadinessReports({
    tenants: tenantsWithAccount({ runtimeEnabled: false }),
  });

  assert.equal(report?.gate.reason, "runtime_disabled");
  assert.equal(report?.readiness.canDryRun, false);
  assert.equal(report?.readiness.blockers.includes("runtime_disabled"), true);
});

test("outbound disabled keeps canSendOutbound false", () => {
  const [report] = buildChannelRuntimeReadinessReports({
    tenants: tenantsWithAccount({ outboundEnabled: false }),
  });

  assert.equal(report?.gate.allowed, true);
  assert.equal(report?.gate.outboundAllowed, false);
  assert.equal(report?.readiness.canSendOutbound, false);
  assert.equal(report?.readiness.blockers.includes("outbound_disabled"), true);
});

test("observed events and dry-run sessions feed report stats and last shadow plan", () => {
  const observedEvents: ObservedChannelEvent[] = [
    {
      id: "obs-1",
      receivedAt: "2026-05-15T10:00:00.000Z",
      provider: "meta",
      channel: "messenger",
      channelAccountId: "page-1",
      tenantKey: "tenant-a",
      resolution: "matched_enabled",
      externalMessageId: "mid-1",
      externalUserHash: "hash-1",
      eventType: "message",
      passive: true,
    },
  ];
  const dryRunSessions: DryRunSessionState[] = [
    {
      id: "dry-1",
      tenantKey: "tenant-a",
      channel: "messenger",
      provider: "meta",
      channelAccountId: "page-1",
      externalUserHash: "hash-1",
      startedAt: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:01:00.000Z",
      turnCount: 1,
      flowTags: [],
      lastDryRunResult: {
        qualificationRan: true,
        capturedSlots: ["tipo"],
        readyForHandoff: false,
        wouldAskHandoff: false,
        wouldPersist: false,
        wouldSendOutbound: false,
      },
      lastShadowPlan: {
        id: "shadow-1",
        createdAt: "2026-05-15T10:01:00.000Z",
        tenantKey: "tenant-a",
        channel: "messenger",
        provider: "meta",
        channelAccountId: "page-1",
        externalUserHash: "hash-1",
        resolution: "matched_enabled",
        gate: {
          allowed: true,
          reason: "runtime_allowed",
          outboundAllowed: false,
          aiAllowed: true,
          handoffAllowed: true,
        },
        steps: [],
        summary: {
          wouldEnterRuntime: true,
          wouldPersist: true,
          wouldRunQualification: true,
          wouldRunAi: true,
          wouldEvaluateHandoff: true,
          wouldSendOutbound: false,
        },
        passive: true,
      },
    },
  ];

  const [report] = buildChannelRuntimeReadinessReports({
    tenants: tenantsWithAccount(),
    observedEvents,
    dryRunSessions,
  });

  assert.equal(report?.observed.totalEvents, 1);
  assert.equal(report?.observed.lastEventAt, "2026-05-15T10:00:00.000Z");
  assert.equal(report?.observed.lastResolution, "matched_enabled");
  assert.equal(report?.dryRun.sessions, 1);
  assert.equal(report?.dryRun.lastShadowPlan?.wouldEnterRuntime, true);
  assert.equal(report?.dryRun.lastShadowPlan?.wouldPersist, true);
  assert.equal(report?.readiness.warnings.includes("no_recent_events"), false);
  assert.equal(report?.readiness.warnings.includes("no_shadow_plan"), false);
});

test("report does not expose raw user identifiers or message text", () => {
  const [report] = buildChannelRuntimeReadinessReports({
    tenants: tenantsWithAccount(),
    observedEvents: [
      {
        id: "obs-1",
        receivedAt: "2026-05-15T10:00:00.000Z",
        provider: "meta",
        channel: "messenger",
        channelAccountId: "page-1",
        tenantKey: "tenant-a",
        resolution: "matched_enabled",
        externalMessageId: "mid-1",
        externalUserHash: "hash-only",
        eventType: "message",
        passive: true,
      },
    ],
  });

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("psid"), false);
  assert.equal(serialized.includes("raw"), false);
  assert.equal(serialized.includes("texto"), false);
  assert.equal(serialized.includes("hash-only"), false);
});
