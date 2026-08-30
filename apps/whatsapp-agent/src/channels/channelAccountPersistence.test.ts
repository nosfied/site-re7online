import test from "node:test";
import assert from "node:assert/strict";
import { preserveGenericWebSessionLifecycleState } from "./channelAccountPersistence.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

function webSessionAccount(overrides: Partial<TenantChannelAccount> = {}): TenantChannelAccount {
  return {
    id: "tenant-a-web_session-whatsapp-558199999999",
    tenantKey: "tenant-a",
    channel: "whatsapp",
    provider: "web_session",
    displayName: "WhatsApp",
    channelAccountId: "558199999999",
    enabled: true,
    automationEnabled: true,
    runtimeEnabled: true,
    inboundPersistenceEnabled: true,
    outboundEnabled: true,
    aiEnabled: true,
    handoffEnabled: true,
    status: "disabled",
    metadata: {
      webSession: "client stale value",
      label: "updated",
    } as never,
    tokenStatus: "not_required",
    ...overrides,
  };
}

test("generic channel save preserves existing Web Session lifecycle state", () => {
  const preserved = preserveGenericWebSessionLifecycleState(webSessionAccount(), {
    status: "connected",
    metadata: {
      webSession: {
        desiredState: "CONNECTED",
        observedState: "CONNECTED",
        lastConnectedAt: "2026-08-30T12:00:00.000Z",
      },
      preservedTechnical: "value",
    },
  });

  assert.equal(preserved.status, "connected");
  assert.deepEqual((preserved.metadata as Record<string, unknown>).webSession, {
    desiredState: "CONNECTED",
    observedState: "CONNECTED",
    lastConnectedAt: "2026-08-30T12:00:00.000Z",
  });
  assert.equal((preserved.metadata as Record<string, unknown>).label, "updated");
});

test("generic channel save leaves new Web Session accounts and Meta accounts unchanged", () => {
  const incoming = webSessionAccount();
  assert.equal(preserveGenericWebSessionLifecycleState(incoming, null), incoming);

  const meta: TenantChannelAccount = {
    ...incoming,
    provider: "meta",
    channelAccountId: "phone-id",
    status: "disabled",
  };

  assert.equal(
    preserveGenericWebSessionLifecycleState(meta, {
      status: "connected",
      metadata: { webSession: { desiredState: "CONNECTED" } },
    }),
    meta
  );
});
