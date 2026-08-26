import assert from "node:assert/strict";
import test from "node:test";
import {
  CrmContactMutationError,
  excludeCrmContactFromOperation,
  reactivateCrmContactForOperation,
} from "./crmContactMutations.js";

function makePrisma(params: { runtimeStatus?: string | null; excludedAt?: Date | null } = {}) {
  const contact = {
    id: "contact_1",
    waId: "5584951957784",
    externalUserRef: "5584951957784",
    legacyWaId: "5584951957784",
    operationallyExcludedAt: params.excludedAt ?? null,
  };
  const events: Array<Record<string, unknown>> = [];
  const lead = {
    id: "lead_1",
    tenantId: "client_1",
    waId: "5584951957784",
    waIdCanonical: "5584951957784",
    channel: "whatsapp",
    provider: "web_session",
    contactChannelIdentityId: "identity_1",
    name: "Ediane",
    phone: "5584951957784",
    city: null,
    email: null,
    company: null,
    status: "NEW",
    contactChannelIdentity: {
      contactId: contact.id,
      contact,
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    lead: {
      findFirst: async () => lead,
    },
    conversationRuntimeState: {
      findFirst: async () =>
        params.runtimeStatus && params.runtimeStatus !== "CLOSED" ? { id: "runtime_1" } : null,
    },
    contact: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(contact, data);
        return contact;
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: `event_${events.length}` };
      },
    },
    __contact: contact,
    __events: events,
  };
  return prisma;
}

test("CRM operational exclusion blocks active conversations and does not mutate contact", async () => {
  const prisma = makePrisma({ runtimeStatus: "IN_PROGRESS" });
  await assert.rejects(
    () =>
      excludeCrmContactFromOperation(prisma as never, {
        clientId: "client_1",
        leadId: "lead_1",
        userId: "admin_1",
        requestId: "req_1",
      }),
    (error) => error instanceof CrmContactMutationError && error.code === "active_conversation_exists"
  );
  assert.equal(prisma.__contact.operationallyExcludedAt, null);
  assert.equal(prisma.__events.length, 0);
});

test("CRM operational exclusion allows closed historical conversations", async () => {
  const prisma = makePrisma({ runtimeStatus: "CLOSED" });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_closed",
  });

  assert.ok(prisma.__contact.operationallyExcludedAt instanceof Date);
  assert.equal(prisma.__events[0]?.eventName, "crm.contact.excluded");
});

test("CRM operational exclusion and reactivation use Contact state with audit events", async () => {
  const prisma = makePrisma();
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_2",
    reason: "Cadastro incorreto",
  });
  assert.ok(prisma.__contact.operationallyExcludedAt instanceof Date);
  assert.equal(prisma.__events[0]?.eventName, "crm.contact.excluded");

  await reactivateCrmContactForOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_3",
  });
  assert.equal(prisma.__contact.operationallyExcludedAt, null);
  assert.equal(prisma.__events[1]?.eventName, "crm.contact.reactivated");
});
