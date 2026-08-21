import assert from "node:assert/strict";
import test from "node:test";
import { getPrisma } from "../db.js";
import {
  AGENT_ONLINE_TTL_MS,
  getAgentAvailability,
  getEffectivelyAvailableUserIds,
  isAgentEffectivelyAvailable,
  recordAgentHeartbeat,
  setAgentAvailability,
} from "./agentAvailability.js";

const prisma = getPrisma();
const prefix = `agent-availability-${process.pid}-${Date.now()}`;

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { clientKey: { startsWith: prefix } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.agentAvailability.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
}

async function createClientAndUser(suffix: string) {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-${suffix}`,
      name: `Agent Availability ${suffix}`,
      profile: "business",
      features: {},
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      clientId: client.id,
      name: `Agent ${suffix}`,
      email: `${prefix}-${suffix}@example.test`,
      role: "AGENT",
      isActive: true,
    },
    select: { id: true },
  });
  return { client, user };
}

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("missing availability row defaults to unavailable", async () => {
  const { client, user } = await createClientAndUser("default");
  const availability = await getAgentAvailability({ prisma, clientId: client.id, userId: user.id });

  assert.equal(availability.available, false);
  assert.equal(availability.effectiveAvailable, false);
  assert.equal(availability.lastHeartbeatAt, null);
});

test("effective availability requires explicit available and recent heartbeat", async () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  assert.equal(isAgentEffectivelyAvailable({ available: true, lastHeartbeatAt: now }, now), true);
  assert.equal(
    isAgentEffectivelyAvailable(
      { available: true, lastHeartbeatAt: new Date(now.getTime() - AGENT_ONLINE_TTL_MS - 1) },
      now
    ),
    false
  );
  assert.equal(isAgentEffectivelyAvailable({ available: false, lastHeartbeatAt: now }, now), false);
  assert.equal(isAgentEffectivelyAvailable({ available: true, lastHeartbeatAt: null }, now), false);
});

test("heartbeat does not turn unavailable user into available", async () => {
  const { client, user } = await createClientAndUser("heartbeat");
  await setAgentAvailability({ prisma, clientId: client.id, userId: user.id, available: false });
  const heartbeat = await recordAgentHeartbeat({ prisma, clientId: client.id, userId: user.id });

  assert.equal(heartbeat.available, false);
  assert.equal(heartbeat.effectiveAvailable, false);
  assert.ok(heartbeat.lastHeartbeatAt);
});

test("effective availability lookup is tenant scoped", async () => {
  const now = new Date();
  const tenantA = await createClientAndUser("tenant-a");
  const tenantB = await createClientAndUser("tenant-b");
  await setAgentAvailability({
    prisma,
    clientId: tenantA.client.id,
    userId: tenantA.user.id,
    available: true,
    now,
  });
  await recordAgentHeartbeat({
    prisma,
    clientId: tenantA.client.id,
    userId: tenantA.user.id,
    now,
  });
  await setAgentAvailability({
    prisma,
    clientId: tenantB.client.id,
    userId: tenantB.user.id,
    available: true,
    now,
  });
  await recordAgentHeartbeat({
    prisma,
    clientId: tenantB.client.id,
    userId: tenantB.user.id,
    now,
  });

  const availableForA = await getEffectivelyAvailableUserIds({
    prisma,
    clientId: tenantA.client.id,
    userIds: [tenantA.user.id, tenantB.user.id],
    now,
  });

  assert.deepEqual([...availableForA], [tenantA.user.id]);
});
