import assert from "node:assert/strict";
import test from "node:test";
import {
  CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT,
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
  conflictingContact?: boolean;
} = {}) {
  const contact = {
    id: "contact_1",
    waId: "5584951957784",
    externalUserRef: "5584951957784",
    legacyWaId: "5584951957784",
    operationallyExcludedAt: params.excludedAt ?? null,
  };
  const conflictContact = {
    id: "contact_2",
    waId: "5584951957785",
    externalUserRef: "5584951957784",
    legacyWaId: "5584951957784",
    operationallyExcludedAt: null,
  };
  let materializedContact: typeof contact | null = params.existingContact === false ? null : contact;
  let contactCreateCount = 0;
  let identityUpsertCount = 0;
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
    externalUserRef: "5584951957784",
    legacyWaId: "5584951957784",
    externalUserHash: "whatsapp:hash",
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
      findMany: async () =>
        materializedContact
          ? [
              {
                contact: materializedContact,
              },
            ]
          : [],
      upsert: async () => {
        identityUpsertCount += 1;
        lead.contactChannelIdentityId = "identity_created";
        return { id: "identity_created" };
      },
    },
    contact: {
      findMany: async () => [
        ...(materializedContact ? [materializedContact] : []),
        ...(params.conflictingContact ? [conflictContact] : []),
      ],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        contactCreateCount += 1;
        materializedContact = {
          id: "contact_created",
          waId: String(data.waId ?? ""),
          externalUserRef: String(data.externalUserRef ?? ""),
          legacyWaId: String(data.legacyWaId ?? ""),
          operationallyExcludedAt: null,
        };
        return materializedContact;
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
    __getContactCreateCount: () => contactCreateCount,
    __getIdentityUpsertCount: () => identityUpsertCount,
    __lead: lead,
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
  assert.equal(prisma.__getContactCreateCount(), 0);
  assert.equal(prisma.__events[0]?.eventName, "crm.contact.excluded");
});

test("CRM operational exclusion materializes lead-only contact with explicit system provenance", async () => {
  const prisma = makePrisma({ directIdentity: false, existingContact: false });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_materialize",
    reason: "fora da operacao",
  });

  assert.equal(prisma.__getContactCreateCount(), 1);
  assert.equal(prisma.__getIdentityUpsertCount(), 1);
  assert.equal(prisma.__getMaterializedContact()?.id, "contact_created");
  assert.ok(prisma.__getMaterializedContact()?.operationallyExcludedAt instanceof Date);
  assert.equal(prisma.__lead.contactChannelIdentityId, "identity_created");
  assert.equal(prisma.__events[0]?.eventName, CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT);
  assert.equal((prisma.__events[0]?.payloadJson as Record<string, unknown>)?.source, "operational_exclusion");
  assert.equal(prisma.__events[1]?.eventName, "crm.contact.excluded");
});

test("CRM operational exclusion repeated request does not materialize duplicates", async () => {
  const prisma = makePrisma({ directIdentity: false, existingContact: false });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_repeat_1",
  });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_repeat_2",
  });

  assert.equal(prisma.__getContactCreateCount(), 1);
  assert.equal(prisma.__getIdentityUpsertCount(), 1);
  assert.equal(
    prisma.__events.filter((event) => event.eventName === CRM_CONTACT_MATERIALIZED_FOR_OPERATIONAL_EXCLUSION_EVENT).length,
    1
  );
});

test("CRM operational exclusion blocks ambiguous canonical contacts without mutation", async () => {
  const prisma = makePrisma({ directIdentity: false, conflictingContact: true });
  await assert.rejects(
    () =>
      excludeCrmContactFromOperation(prisma as never, {
        clientId: "client_1",
        leadId: "lead_1",
        userId: "admin_1",
        requestId: "req_conflict",
      }),
    (error) => error instanceof CrmContactMutationError && error.code === "identity_conflict"
  );
  assert.equal(prisma.__getContactCreateCount(), 0);
  assert.equal(prisma.__events.length, 0);
});

test("CRM operational exclusion checks active blockers before lead-only materialization", async () => {
  const prisma = makePrisma({ directIdentity: false, existingContact: false, runtimeStatus: "IN_PROGRESS" });
  await assert.rejects(
    () =>
      excludeCrmContactFromOperation(prisma as never, {
        clientId: "client_1",
        leadId: "lead_1",
        userId: "admin_1",
        requestId: "req_block_materialize",
      }),
    (error) => error instanceof CrmContactMutationError && error.code === "active_conversation_exists"
  );
  assert.equal(prisma.__getContactCreateCount(), 0);
  assert.equal(prisma.__getIdentityUpsertCount(), 0);
  assert.equal(prisma.__events.length, 0);
});

test("CRM operational reactivation after lead-only materialization uses same contact", async () => {
  const prisma = makePrisma({ directIdentity: false, existingContact: false });
  await excludeCrmContactFromOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_materialize_reactivate",
  });
  const contactId = prisma.__getMaterializedContact()?.id;
  await reactivateCrmContactForOperation(prisma as never, {
    clientId: "client_1",
    leadId: "lead_1",
    userId: "admin_1",
    requestId: "req_reactivate_materialized",
  });

  assert.equal(prisma.__getContactCreateCount(), 1);
  assert.equal(prisma.__getMaterializedContact()?.id, contactId);
  assert.equal(prisma.__getMaterializedContact()?.operationallyExcludedAt, null);
  assert.equal(prisma.__events[prisma.__events.length - 1]?.eventName, "crm.contact.reactivated");
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
