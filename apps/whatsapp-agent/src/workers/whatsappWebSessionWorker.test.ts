import test from "node:test";
import assert from "node:assert/strict";
import {
  isEligibleWebSessionAccount,
  listEligibleWebSessionAccounts,
} from "./whatsappWebSessionWorker.js";

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-a",
    clientId: "client-a",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "session-a",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
    metadata: { webSession: { desiredState: "CONNECTED" } },
    client: {
      id: "client-a",
      clientKey: "tenant-a",
      status: "ACTIVE",
      profile: "business",
      features: { whatsappWebSession: true },
    },
    ...overrides,
  };
}

test("web session worker gates ignore non eligible accounts", () => {
  assert.equal(isEligibleWebSessionAccount(account({ client: { ...account().client, features: {} } }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ client: { ...account().client, status: "INACTIVE" } }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ provider: "meta" }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ channel: "instagram" }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ enabled: false }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ runtimeEnabled: false }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ metadata: { webSession: { desiredState: "DISCONNECTED" } } }) as never), false);
});

test("web session worker finds only future eligible web session account", async () => {
  const prisma = {
    channelAccount: {
      findMany: async () => [
        account(),
        account({ id: "account-meta", provider: "meta" }),
        account({ id: "account-disabled", enabled: false }),
      ],
    },
  };
  const result = await listEligibleWebSessionAccounts(prisma as never);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.tenantKey, "tenant-a");
  assert.equal(result[0]?.channelAccountId, "session-a");
});
