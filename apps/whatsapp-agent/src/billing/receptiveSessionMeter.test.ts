import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  RECEPTIVE_SESSION_EVENT_TYPE,
  recordReceptiveSessionIfNeeded,
  type ReceptiveSessionMeterPrisma,
} from "./receptiveSessionMeter.js";

type FakeEvent = {
  id: string;
  clientId: string;
  conversationId: string | null;
  waId: string | null;
  waIdCanonical: string | null;
  messageId: string | null;
  requestId: string | null;
  eventName: string;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
};

function makeFakePrisma() {
  const events: FakeEvent[] = [];
  let sequence = 0;
  let lock = Promise.resolve();
  const prisma = {
    events,
    event: {
      async findMany(args: {
        where: Record<string, unknown>;
        orderBy: { createdAt: "asc" | "desc" };
        take: number;
      }) {
        const where = args.where as {
          clientId?: string;
          eventName?: string;
          waIdCanonical?: string;
          createdAt?: { gte?: Date; lt?: Date; lte?: Date };
        };
        let rows = events.filter((event) => {
          if (where.clientId && event.clientId !== where.clientId) return false;
          if (where.eventName && event.eventName !== where.eventName) return false;
          if (where.waIdCanonical && event.waIdCanonical !== where.waIdCanonical) return false;
          if (where.createdAt?.gte && event.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lt && event.createdAt >= where.createdAt.lt) return false;
          if (where.createdAt?.lte && event.createdAt > where.createdAt.lte) return false;
          return true;
        });
        rows = rows.sort((a, b) =>
          args.orderBy.createdAt === "asc"
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime()
        );
        return rows.slice(0, args.take ?? rows.length);
      },
      async create(args: { data: Omit<FakeEvent, "id" | "createdAt"> & { payloadJson: Prisma.InputJsonValue; createdAt?: Date } }) {
        if (
          events.some(
            (event) =>
              event.clientId === args.data.clientId &&
              event.eventName === args.data.eventName &&
              event.requestId === args.data.requestId
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const payload = args.data.payloadJson as Prisma.JsonObject;
        const createdAt = args.data.createdAt ?? new Date(String(payload.sessionStartedAt));
        const row = {
          id: `event-${++sequence}`,
          clientId: args.data.clientId,
          conversationId: args.data.conversationId ?? null,
          waId: args.data.waId ?? null,
          waIdCanonical: args.data.waIdCanonical ?? null,
          messageId: args.data.messageId ?? null,
          requestId: args.data.requestId ?? null,
          eventName: args.data.eventName,
          payloadJson: payload,
          createdAt,
        };
        events.push(row);
        return row;
      },
    },
    async $executeRaw() {
      return {};
    },
    async $transaction<T>(fn: (tx: ReceptiveSessionMeterPrisma) => Promise<T>) {
      const previous = lock;
      let release: () => void = () => undefined;
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await fn(prisma as ReceptiveSessionMeterPrisma);
      } finally {
        release();
      }
    },
  };
  return prisma;
}

function input(overrides: Partial<Parameters<typeof recordReceptiveSessionIfNeeded>[0]["input"]> = {}) {
  return {
    clientId: "tenant-1",
    channel: "whatsapp",
    provider: "meta",
    channelAccountId: "phone-1",
    waId: "5581999990000",
    waIdCanonical: "5581999990000",
    sourceInboundMessageId: "inbound-1",
    providerMessageId: "wamid-1",
    occurredAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

test("records first Meta Cloud WhatsApp inbound as a receptive session", async () => {
  const prisma = makeFakePrisma();
  const result = await recordReceptiveSessionIfNeeded({ prisma, input: input() });

  assert.equal(result.ok, true);
  assert.equal(result.metered, true);
  assert.equal(prisma.events.length, 1);
  assert.equal(prisma.events[0]?.eventName, RECEPTIVE_SESSION_EVENT_TYPE);
  assert.equal((prisma.events[0]?.payloadJson as Prisma.JsonObject).provider, "meta_cloud");
});

test("does not create another session inside the 24h window and creates one exactly at the boundary", async () => {
  const prisma = makeFakePrisma();
  await recordReceptiveSessionIfNeeded({ prisma, input: input({ sourceInboundMessageId: "inbound-1" }) });
  const oneHour = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ sourceInboundMessageId: "inbound-2", occurredAt: new Date("2026-08-01T11:00:00.000Z") }),
  });
  const justBefore = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ sourceInboundMessageId: "inbound-3", occurredAt: new Date("2026-08-02T09:59:59.000Z") }),
  });
  const boundary = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ sourceInboundMessageId: "inbound-4", occurredAt: new Date("2026-08-02T10:00:00.000Z") }),
  });

  assert.deepEqual([oneHour.metered, justBefore.metered, boundary.metered], [false, false, true]);
  assert.equal(prisma.events.length, 2);
});

test("provider retry and concurrent inbounds are idempotent for the same session", async () => {
  const prisma = makeFakePrisma();
  const [first, retry, concurrent] = await Promise.all([
    recordReceptiveSessionIfNeeded({ prisma, input: input({ sourceInboundMessageId: "same-inbound" }) }),
    recordReceptiveSessionIfNeeded({ prisma, input: input({ sourceInboundMessageId: "same-inbound" }) }),
    recordReceptiveSessionIfNeeded({ prisma, input: input({ sourceInboundMessageId: "nearby-inbound", providerMessageId: "wamid-2" }) }),
  ]);

  assert.equal([first, retry, concurrent].filter((result) => result.metered).length, 1);
  assert.equal(prisma.events.length, 1);
});

test("service cycle and post-service restarts inside the window do not create billing duplicates", async () => {
  const prisma = makeFakePrisma();
  await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ rawPayload: { serviceCycle: { cycleId: "cycle-1" } } }),
  });
  const secondCycle = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({
      sourceInboundMessageId: "inbound-cycle-2",
      providerMessageId: "wamid-cycle-2",
      rawPayload: { serviceCycle: { cycleId: "cycle-2" }, postServiceDecision: "1" },
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    }),
  });

  assert.equal(secondCycle.metered, false);
  assert.equal(prisma.events.length, 1);
});

test("tenant isolation keeps the same contact independent per tenant", async () => {
  const prisma = makeFakePrisma();
  await recordReceptiveSessionIfNeeded({ prisma, input: input({ clientId: "tenant-a" }) });
  await recordReceptiveSessionIfNeeded({ prisma, input: input({ clientId: "tenant-b" }) });

  assert.equal(prisma.events.length, 2);
  assert.deepEqual(prisma.events.map((event) => event.clientId).sort(), ["tenant-a", "tenant-b"]);
});

test("excludes Web Session and management-only inbound from the CRA MVP meter", async () => {
  const prisma = makeFakePrisma();
  const webSession = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ provider: "web_session", sourceInboundMessageId: "web-session-inbound" }),
  });
  const managementOnly = await recordReceptiveSessionIfNeeded({
    prisma,
    input: input({ sourceInboundMessageId: "management-inbound", rawPayload: { inboxVisibility: "management_only" } }),
  });

  assert.equal(webSession.metered, false);
  assert.equal(managementOnly.metered, false);
  assert.equal(prisma.events.length, 0);
});

test("meter failure is observable but non-throwing", async () => {
  const prisma = {
    event: {
      async findMany() {
        throw new Error("database unavailable");
      },
      async create() {
        return {};
      },
    },
  };
  const result = await recordReceptiveSessionIfNeeded({ prisma, input: input() });

  assert.equal(result.ok, false);
  assert.equal(result.metered, false);
  assert.equal(result.reason, "error");
});
