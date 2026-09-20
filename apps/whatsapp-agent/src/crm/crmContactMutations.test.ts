import assert from "node:assert/strict";
import test from "node:test";
import {
  CrmContactMutationError,
  excludeCrmContactFromOperation,
  isHiddenTechnicalBlockingConversation,
  reactivateCrmContactForOperation,
} from "./crmContactMutations.js";

function makeRuntime(params: {
  status?: string | null;
  mode?: string | null;
  handoffStatus?: string | null;
  assignedUserId?: string | null;
  departmentId?: string | null;
  queueId?: string | null;
  handoffActivatedAt?: Date | null;
}) {
  const assignedUserId = params.assignedUserId === undefined ? "user_1" : params.assignedUserId;
  return {
    id: "runtime_1",
    conversationKey: "conversation_1",
    waId: "5584951957784",
    waIdCanonical: "5584951957784",
    status: params.status ?? "IN_PROGRESS",
    mode: params.mode ?? "HUMAN",
    handoffStatus: params.handoffStatus ?? "ACTIVE",
    assignedUserId,
    assignedAt: assignedUserId ? new Date("2026-08-26T10:00:00.000Z") : null,
    departmentId: params.departmentId ?? "department_1",
    queueId: params.queueId ?? "queue_1",
    handoffActivatedAt: params.handoffActivatedAt ?? (assignedUserId ? new Date("2026-08-26T10:00:00.000Z") : null),
    closedAt: null,
    updatedAt: new Date("2026-08-26T10:05:00.000Z"),
  };
}

function makePrisma(params: {
  runtimeStatus?: string | null;
  runtime?: ReturnType<typeof makeRuntime> | null;
  excludedAt?: Date | null;
  directIdentity?: boolean;
  existingContact?: boolean;
} = {}) {
  const contact = {
    id: "contact_1",
    waId: "5584951957784",
    externalUserRef: "5584951957784",
    legacyWaId: "5584951957784",
    operationallyExcludedAt: params.excludedAt ?? null,
  };
  let materializedContact: typeof contact | null = params.existingContact === false ? null : contact;
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
    contactChannelIdentity:
      params.directIdentity === false
        ? null
        : {
            contactId: materializedContact?.id ?? contact.id,
            contact: materializedContact ?? contact,
          },
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    lead: {
      findFirst: async () => lead,
      findMany: async () => [
        {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
          contactChannelIdentityId: lead.contactChannelIdentityId,
        },
      ],
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(lead, data);
        return { id: lead.id };
      },
    },
    conversationRuntimeState: {
      findFirst: async () =>
        params.runtime
          ? params.runtime
          : params.runtimeStatus && params.runtimeStatus !== "CLOSED"
            ? makeRuntime({ status: params.runtimeStatus })
            : null,
    },
    contactChannelIdentity: {
      findFirst: async () => ({
        id: lead.contactChannelIdentityId,
        contactId: null,
        externalUserHash: "anon:old",
        externalUserRef: null,
        legacyWaId: null,
      }),
      findMany: async () =>
        materializedContact
          ? [
              {
                contactId: materializedContact.id,
                contact: materializedContact,
              },
            ]
          : [],
      upsert: async () => {
        lead.contactChannelIdentityId = "identity_created";
        return { id: "identity_created" };
      },
    },
    contact: {
      findMany: async () => (materializedContact ? [materializedContact] : []),
      findFirst: async () => materializedContact,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        materializedContact = {
          id: "contact_created",
          waId: String(data.waId ?? ""),
          externalUserRef: String(data.externalUserRef ?? ""),
          legacyWaId: String(data.legacyWaId ?? ""),
          operationallyExcludedAt: null,
        };
        return { id: materializedContact.id, name: data.name ?? null, lifecycle: data.lifecycle ?? null };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(materializedContact ?? contact, data);
        return materializedContact ?? contact;
      },
    },
    event: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: `event_${events.length}` };
      },
    },
    __contact: contact,
    __getMaterializedContact: () => materializedContact,
    __events: events,
  };
  return prisma;
}

test("hidden technical blocking conversation is detected without human inbox projection", () => {
  assert.equal(
    isHiddenTechnicalBlockingConversation(
      makeRuntime({
        status: "WAITING_USER",
        mode: "BOT",
        handoffStatus: "NONE",
        assignedUserId: null,
        departmentId: null,
        queueId: null,
        handoffActivatedAt: null,
      })
    ),
    true
  );
  assert.equal(
    isHiddenTechnicalBlockingConversation(
      makeRuntime({
        status: "IN_PROGRESS",
        mode: "HUMAN",
        handoffStatus: "ACTIVE",
        assignedUserId: "user_1",
        departmentId: "department_1",
        queueId: "queue_1",
      })
    ),
    false
  );
  assert.equal(isHiddenTechnicalBlockingConversation(makeRuntime({ status: "CLOSED", mode: "BOT", assignedUserId: null })), false);
});

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
    (error) =>
      error instanceof CrmContactMutationError &&
      error.code === "active_conversation_exists" &&
      error.details?.conversationId === "5584951957784"
  );
  assert.equal(prisma.__contact.operationallyExcludedAt, null);
  assert.equal(prisma.__events.length, 0);
});

test("CRM operational exclusion returns actionable hidden conversation blocker", async () => {
  const prisma = makePrisma({
    runtime: makeRuntime({
      status: "WAITING_USER",
      mode: "BOT",
      handoffStatus: "NONE",
      assignedUserId: null,
      departmentId: null,
      queueId: null,
      handoffActivatedAt: null,
    }),
  });
  await assert.rejects(
    () =>
      excludeCrmContactFromOperation(prisma as never, {
        clientId: "client_1",
        leadId: "lead_1",
        userId: "admin_1",
        requestId: "req_hidden",
      }),
    (error) =>
      error instanceof CrmContactMutationError &&
      error.code === "hidden_active_conversation_exists" &&
      error.details?.conversationId === "5584951957784"
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

test("CRM operational exclusion resolves existing canonical contact without direct lead identity", async () => {
  const prisma = makePrisma({ directIdentity: false });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_indirect",
  });

  assert.ok(prisma.__contact.operationallyExcludedAt instanceof Date);
  assert.equal(prisma.__events[0]?.eventName, "crm.contact.excluded");
});

test("CRM operational exclusion materializes lead-only CRM contact before excluding", async () => {
  const prisma = makePrisma({ directIdentity: false, existingContact: false });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_materialize",
  });

  assert.equal(prisma.__getMaterializedContact()?.id, "contact_created");
  assert.ok(prisma.__getMaterializedContact()?.operationallyExcludedAt instanceof Date);
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
