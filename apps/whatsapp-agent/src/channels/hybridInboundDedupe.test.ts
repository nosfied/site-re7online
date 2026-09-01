import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  buildHybridInboundLogicalKey,
  claimHybridInboundLogicalMessage,
  extractUnderlyingWhatsAppStanzaId,
  HYBRID_INBOUND_CLAIM_EVENT,
  HYBRID_INBOUND_DEDUPED_EVENT,
} from "./hybridInboundDedupe.js";

const INCIDENT_SENDER = "558499049614";
const INCIDENT_STANZA_1 = "AC44D70432A205C6B36D137B98A3C5B5";
const INCIDENT_STANZA_2 = "AC38B75487A556EF797A413A3765EB4A";
const INCIDENT_WAMID_1 =
  "wamid.HBgMNTU4NDk5MDQ5NjE0FQIAEhggQUM0NEQ3MDQzMkEyMDVDNkIzNkQxMzdCOThBM0M1QjUA";
const INCIDENT_WAMID_2 =
  "wamid.HBgMNTU4NDk5MDQ5NjE0FQIAEhggQUMzOEI3NTQ4N0E1NTZFRjc5N0E0MTNBMzc2NUVCNEEA";

test("extractUnderlyingWhatsAppStanzaId proves shared ids from real sanitized incident patterns", () => {
  assert.equal(
    extractUnderlyingWhatsAppStanzaId({
      provider: "web_session",
      providerMessageId: INCIDENT_STANZA_1,
      senderWaIdCanonical: INCIDENT_SENDER,
    }),
    INCIDENT_STANZA_1
  );
  assert.equal(
    extractUnderlyingWhatsAppStanzaId({
      provider: "meta",
      providerMessageId: INCIDENT_WAMID_1,
      senderWaIdCanonical: INCIDENT_SENDER,
    }),
    INCIDENT_STANZA_1
  );
  assert.equal(
    extractUnderlyingWhatsAppStanzaId({
      provider: "meta",
      providerMessageId: INCIDENT_WAMID_2,
      senderWaIdCanonical: INCIDENT_SENDER,
    }),
    INCIDENT_STANZA_2
  );
});

test("buildHybridInboundLogicalKey is transport independent, tenant scoped and sender scoped", () => {
  const web = buildHybridInboundLogicalKey({
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "web_session",
    providerMessageId: INCIDENT_STANZA_1,
  });
  const meta = buildHybridInboundLogicalKey({
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
  });
  const otherTenant = buildHybridInboundLogicalKey({
    clientId: "tenant_b",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
  });
  const otherSender = buildHybridInboundLogicalKey({
    clientId: "tenant_a",
    senderWaIdCanonical: "558499887787",
    provider: "web_session",
    providerMessageId: INCIDENT_STANZA_1,
  });

  assert.equal(web?.hash, meta?.hash);
  assert.notEqual(web?.hash, otherTenant?.hash);
  assert.notEqual(web?.hash, otherSender?.hash);
});

test("buildHybridInboundLogicalKey keeps identical text in distinct WhatsApp messages independent", () => {
  const first = buildHybridInboundLogicalKey({
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
  });
  const second = buildHybridInboundLogicalKey({
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_2,
  });

  assert.notEqual(first?.hash, second?.hash);
});

test("buildHybridInboundLogicalKey declines opaque Meta ids instead of guessing", () => {
  assert.equal(
    buildHybridInboundLogicalKey({
      clientId: "tenant_a",
      senderWaIdCanonical: INCIDENT_SENDER,
      provider: "meta",
      providerMessageId: "wamid.opaque-not-base64",
    }),
    null
  );
});

test("claimHybridInboundLogicalMessage atomically suppresses cross-provider duplicate", async () => {
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const duplicate = events.find(
          (event) =>
            event.clientId === data.clientId &&
            event.eventName === data.eventName &&
            event.requestId === data.requestId
        );
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        events.push(data);
        return { id: `event_${events.length}` };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        events.find(
          (event) =>
            event.clientId === where.clientId &&
            event.eventName === where.eventName &&
            event.requestId === where.requestId
        ) ?? null,
    },
  };

  const first = await claimHybridInboundLogicalMessage({
    prisma: prisma as never,
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "web_session",
    providerMessageId: INCIDENT_STANZA_1,
    requestId: "web-request",
  });
  const second = await claimHybridInboundLogicalMessage({
    prisma: prisma as never,
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
    requestId: "meta-request",
  });

  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(second.winningProvider, "web_session");
  assert.equal(events.filter((event) => event.eventName === HYBRID_INBOUND_CLAIM_EVENT).length, 1);
  assert.equal(events.filter((event) => event.eventName === HYBRID_INBOUND_DEDUPED_EVENT).length, 1);
  assert.equal(JSON.stringify(events).includes(INCIDENT_SENDER), false);
});

test("claimHybridInboundLogicalMessage allows independent tenants with same provider ids", async () => {
  const events: Array<Record<string, unknown>> = [];
  const prisma = {
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const duplicate = events.find(
          (event) =>
            event.clientId === data.clientId &&
            event.eventName === data.eventName &&
            event.requestId === data.requestId
        );
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        events.push(data);
        return { id: `event_${events.length}` };
      },
      findFirst: async () => null,
    },
  };

  const first = await claimHybridInboundLogicalMessage({
    prisma: prisma as never,
    clientId: "tenant_a",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
  });
  const second = await claimHybridInboundLogicalMessage({
    prisma: prisma as never,
    clientId: "tenant_b",
    senderWaIdCanonical: INCIDENT_SENDER,
    provider: "meta",
    providerMessageId: INCIDENT_WAMID_1,
  });

  assert.equal(first.claimed, true);
  assert.equal(second.claimed, true);
  assert.equal(events.filter((event) => event.eventName === HYBRID_INBOUND_CLAIM_EVENT).length, 2);
});
