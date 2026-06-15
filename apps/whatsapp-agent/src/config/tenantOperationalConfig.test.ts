import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanLimitsSettings } from "./tenantOperationalConfig.js";

function prismaWithConfig(config: unknown) {
  return {
    tenantOperationalConfig: {
      findUnique: async () => ({ config }),
    },
  } as never;
}

test("resolvePlanLimitsSettings prefers DB plan limits over tenants.json", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig({
      planLimits: {
        planName: "DB Pro",
        messagesLimit: 50,
        quotaMonthlyConversations: 25,
        quotaWarnAtPct: 0.7,
        quotaBlockedReplyText: "DB blocked",
        quotaExcludeWaIds: ["55 84 9999-0000", "558499990000"],
      },
    }),
    clientId: "client-1",
    tenant: {
      planName: "JSON Basic",
      messagesLimit: 10,
      quotaMonthlyConversations: 5,
      quotaWarnAtPct: 0.9,
      quotaBlockedReplyText: "JSON blocked",
      quotaExcludeWaIds: ["111"],
    },
  });

  assert.equal(resolved.source, "db");
  assert.deepEqual(resolved.settings, {
    planName: "DB Pro",
    messagesLimit: 50,
    quotaMonthlyConversations: 25,
    quotaWarnAtPct: 0.7,
    quotaBlockedReplyText: "DB blocked",
    quotaExcludeWaIds: ["558499990000"],
  });
});

test("resolvePlanLimitsSettings falls back to tenants.json plan limits", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig({}),
    clientId: "client-1",
    tenant: {
      planName: "JSON Basic",
      messagesLimit: 10,
      quotaMonthlyConversations: 5,
      quotaWarnAtPct: 0.9,
      quotaBlockedReplyText: "JSON blocked",
      quotaExcludeWaIds: ["55 84 1111-2222", "558411112222"],
    },
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    planName: "JSON Basic",
    messagesLimit: 10,
    quotaMonthlyConversations: 5,
    quotaWarnAtPct: 0.9,
    quotaBlockedReplyText: "JSON blocked",
    quotaExcludeWaIds: ["558411112222"],
  });
});

test("resolvePlanLimitsSettings uses safe defaults when no limit exists", async () => {
  const resolved = await resolvePlanLimitsSettings({
    prisma: prismaWithConfig(null),
    clientId: "client-1",
    tenant: null,
  });

  assert.equal(resolved.source, "json_fallback");
  assert.deepEqual(resolved.settings, {
    planName: null,
    messagesLimit: null,
    quotaMonthlyConversations: null,
    quotaWarnAtPct: 0.8,
    quotaBlockedReplyText: null,
    quotaExcludeWaIds: [],
  });
});
