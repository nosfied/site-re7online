import assert from "node:assert/strict";
import test from "node:test";
import { getPrisma } from "../db.js";
import {
  AGENT_ONLINE_TTL_MS,
  getAgentAvailability,
  getEffectivelyAvailableUserIds,
  getPresenceEligibleUserIds,
  isAgentEffectivelyAvailable,
  recordAgentHeartbeat,
  resolveAssignmentPresenceEligibility,
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

test("assignment presence modes separate fresh heartbeat from explicit availability", async () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const stale = new Date(now.getTime() - AGENT_ONLINE_TTL_MS - 1);

  assert.equal(
    resolveAssignmentPresenceEligibility({ mode: "FRESH", available: true, lastHeartbeatAt: now, now }),
    true
  );
  assert.equal(
    resolveAssignmentPresenceEligibility({ mode: "FRESH", available: true, lastHeartbeatAt: stale, now }),
    false
  );
  assert.equal(
    resolveAssignmentPresenceEligibility({ mode: "AVAILABLE", available: true, lastHeartbeatAt: stale, now }),
    true
  );
  assert.equal(
    resolveAssignmentPresenceEligibility({ mode: "AVAILABLE", available: false, lastHeartbeatAt: now, now }),
    false
  );
  assert.equal(
    resolveAssignmentPresenceEligibility({ mode: "IGNORE", available: false, lastHeartbeatAt: null, now }),
    true
  );
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

test("presence eligibility lookup supports available without heartbeat freshness", async () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const stale = new Date(now.getTime() - AGENT_ONLINE_TTL_MS - 1);
  const { client, user: freshUser } = await createClientAndUser("presence-modes");
  const staleUser = await prisma.user.create({
    data: {
      clientId: client.id,
      name: "Agent presence stale",
      email: `${prefix}-presence-stale@example.test`,
      role: "AGENT",
      isActive: true,
    },
    select: { id: true },
  });
  const unavailableUser = await prisma.user.create({
    data: {
      clientId: client.id,
      name: "Agent presence unavailable",
      email: `${prefix}-presence-unavailable@example.test`,
      role: "AGENT",
      isActive: true,
    },
    select: { id: true },
  });
  await prisma.agentAvailability.createMany({
    data: [
      { clientId: client.id, userId: freshUser.id, available: true, lastHeartbeatAt: now, availabilityChangedAt: now },
      { clientId: client.id, userId: staleUser.id, available: true, lastHeartbeatAt: stale, availabilityChangedAt: stale },
      {
        clientId: client.id,
        userId: unavailableUser.id,
        available: false,
        lastHeartbeatAt: now,
        availabilityChangedAt: now,
      },
    ],
  });

  const userIds = [freshUser.id, staleUser.id, unavailableUser.id];
  const fresh = await getPresenceEligibleUserIds({
    prisma,
    clientId: client.id,
    userIds,
    mode: "FRESH",
    now,
  });
  const available = await getPresenceEligibleUserIds({
    prisma,
    clientId: client.id,
    userIds,
    mode: "AVAILABLE",
    now,
  });
  const ignore = await getPresenceEligibleUserIds({
    prisma,
    clientId: client.id,
    userIds,
    mode: "IGNORE",
    now,
  });

  assert.deepEqual([...fresh], [freshUser.id]);
  assert.deepEqual([...available].sort(), [freshUser.id, staleUser.id].sort());
  assert.deepEqual([...ignore].sort(), userIds.sort());
});
