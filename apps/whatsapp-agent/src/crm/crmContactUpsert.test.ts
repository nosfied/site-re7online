import assert from "node:assert/strict";
import test from "node:test";
import { CrmContactUpsertError, previewCrmContactCsvImport, upsertCrmContact } from "./crmContactUpsert.js";

function makeUpsertPrisma(params: {
  contact?: {
    id?: string;
    name?: string | null;
    lifecycle?: string | null;
    waId?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
    operationallyExcludedAt?: Date | null;
  } | null;
  lead?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    contactChannelIdentityId?: string | null;
  } | null;
  identities?: Array<{
    id: string;
    contactId?: string | null;
    externalUserHash?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
  }>;
  upsertedIdentityId?: string;
} = {}) {
  const contact = params.contact
    ? {
        id: params.contact.id ?? "contact_1",
        name: params.contact.name ?? "Contato",
        lifecycle: params.contact.lifecycle ?? "ACTIVE",
        waId: params.contact.waId ?? "5584951957784",
        externalUserRef: params.contact.externalUserRef ?? params.contact.waId ?? "5584951957784",
        legacyWaId: params.contact.legacyWaId ?? params.contact.waId ?? "5584951957784",
        operationallyExcludedAt: params.contact.operationallyExcludedAt ?? null,
      }
    : null;
  const lead = params.lead
    ? {
        id: params.lead.id ?? "lead_1",
        name: params.lead.name ?? contact?.name ?? "Contato",
        phone: params.lead.phone ?? contact?.waId ?? "5584951957784",
        contactChannelIdentityId: params.lead.contactChannelIdentityId ?? "identity_1",
      }
    : null;
  const state = {
    contacts: contact ? [contact] : [] as typeof contact[],
    leads: lead ? [lead] : [] as typeof lead[],
    createdContacts: 0,
    updatedContacts: 0,
    leadUpdates: [] as unknown[],
    events: [] as unknown[],
  };
  const matchesIdentityWhere = (item: typeof contact, where: unknown) => {
    if (!item || !where || typeof where !== "object") return true;
    const record = where as { OR?: Array<Record<string, { in?: string[] }>> };
    const candidates = new Set(
      (record.OR ?? []).flatMap((condition) =>
        Object.values(condition).flatMap((value) => (Array.isArray(value?.in) ? value.in : []))
      )
    );
    if (candidates.size === 0) return true;
    return [item.waId, item.externalUserRef, item.legacyWaId].some((value) => value && candidates.has(value));
  };
  const matchesLeadWhere = (item: typeof lead, where: unknown) => {
    if (!item || !where || typeof where !== "object") return true;
    const record = where as { OR?: Array<Record<string, { in?: string[] }>> };
    const candidates = new Set(
      (record.OR ?? []).flatMap((condition) =>
        Object.values(condition).flatMap((value) => (Array.isArray(value?.in) ? value.in : []))
      )
    );
    if (candidates.size === 0) return true;
    return [item.phone].some((value) => value && candidates.has(value));
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    contactChannelIdentity: {
      findMany: async ({ where }: { where?: unknown } = {}) =>
        contact && matchesIdentityWhere(contact, where)
          ? [
              {
                contact,
              },
            ]
          : [],
      findFirst: async ({ where }: { where?: { id?: string } } = {}) =>
        params.identities?.find((identity) => identity.id === where?.id) ?? null,
      upsert: async () => ({ id: params.upsertedIdentityId ?? "identity_1" }),
    },
    contact: {
      findMany: async ({ where }: { where?: { operationallyExcludedAt?: { not: null } } } = {}) =>
        state.contacts
          .filter((item) => matchesIdentityWhere(item, where))
          .filter((item) => !where?.operationallyExcludedAt || item?.operationallyExcludedAt),
      update: async () => {
        state.updatedContacts += 1;
        return contact;
      },
      create: async () => {
        state.createdContacts += 1;
        return {
          id: "contact_created",
          name: "Novo",
          lifecycle: "ACTIVE",
        };
      },
    },
    lead: {
      findMany: async ({ where }: { where?: unknown } = {}) => state.leads.filter((item) => matchesLeadWhere(item, where)),
      update: async ({ data }: { data: unknown }) => {
        state.leadUpdates.push(data);
        return { id: lead?.id ?? "lead_1" };
      },
      create: async () => ({ id: "lead_created" }),
    },
    event: {
      create: async ({ data }: { data: unknown }) => {
        state.events.push(data);
      },
    },
    __state: state,
  };
  return prisma;
}

test("CRM CSV preview blocks operationally excluded contacts without creating duplicates", async () => {
  const prisma = {
    contact: {
      findMany: async () => [
        {
          waId: "5584951957784",
          externalUserRef: "5584951957784",
          legacyWaId: "5584951957784",
          operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
        },
      ],
    },
  };

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584951957784,Ediane\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

  assert.equal(preview.validRows, 1);
  assert.equal(preview.excludedContacts, 1);
  assert.equal(preview.readyToImport, 0);
  assert.equal(preview.sampleErrors[0]?.reason, "excluded_contact");
  assert.equal(preview.sampleErrors[0]?.label, "Contato excluído da operação");
});

test("CRM manual create returns an actionable excluded-contact conflict without duplicates", async () => {
  const excludedAt = new Date("2026-08-26T10:00:00.000Z");
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_excluded",
      name: "Ediane",
      waId: "5584951957784",
      operationallyExcludedAt: excludedAt,
    },
    lead: { id: "lead_excluded", name: "Ediane" },
  });

  await assert.rejects(
    () =>
      upsertCrmContact(prisma as never, {
        clientId: "client_a",
        input: { phone: "5584951957784", name: "Ediane Nova" },
        actorUserId: "admin_1",
        requestId: "req_1",
        source: "crm_manual",
      }),
    (error) => {
      assert.ok(error instanceof CrmContactUpsertError);
      assert.equal(error.code, "contact_operationally_excluded");
      assert.equal(error.details?.state, "excluded");
      assert.equal(error.details?.contactId, "contact_excluded");
      assert.equal(error.details?.leadId, "lead_excluded");
      return true;
    }
  );
  assert.equal(prisma.__state.createdContacts, 0);
  assert.equal(prisma.__state.updatedContacts, 0);
});

test("CRM manual create resolves excluded contacts through confirmed BR identity aliases", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_ddd84",
      name: "Ediane DDD84",
      waId: "84951957784",
      externalUserRef: "84951957784",
      legacyWaId: "84951957784",
      operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
    },
    lead: { id: "lead_ddd84", name: "Ediane DDD84", phone: "84951957784" },
  });

  await assert.rejects(
    () =>
      upsertCrmContact(prisma as never, {
        clientId: "client_a",
        input: { phone: "5584951957784", name: "Ediane" },
        actorUserId: "admin_1",
        requestId: "req_alias",
        source: "crm_manual",
      }),
    (error) =>
      error instanceof CrmContactUpsertError &&
      error.code === "contact_operationally_excluded" &&
      error.details?.contactId === "contact_ddd84"
  );
});

test("CRM manual create rebinds reused leads away from anonymized detached identities", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_1",
      name: "Deifson Oliveira",
      waId: "5584999049614",
    },
    lead: {
      id: "lead_1",
      name: "Deifson Oliveira",
      phone: "5584999049614",
      contactChannelIdentityId: "identity_old",
    },
    identities: [
      {
        id: "identity_old",
        contactId: null,
        externalUserHash: "anon:conversation_1",
        externalUserRef: null,
        legacyWaId: null,
      },
    ],
    upsertedIdentityId: "identity_new",
  });

  await upsertCrmContact(prisma as never, {
    clientId: "client_a",
    input: { phone: "5584999049614", name: "Deifson Oliveira" },
    actorUserId: "admin_1",
    requestId: "req_rebind",
    source: "crm_manual",
    audit: false,
  });

  assert.equal(
    (prisma.__state.leadUpdates[0] as { contactChannelIdentityId?: string }).contactChannelIdentityId,
    "identity_new"
  );
});

test("CRM manual create preserves reused leads that already point to operational identities", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_1",
      name: "Deifson Oliveira",
      waId: "5584999049614",
    },
    lead: {
      id: "lead_1",
      name: "Deifson Oliveira",
      phone: "5584999049614",
      contactChannelIdentityId: "identity_current",
    },
    identities: [
      {
        id: "identity_current",
        contactId: "contact_1",
        externalUserHash: "whatsapp:hash_1",
        externalUserRef: "5584999049614",
        legacyWaId: "5584999049614",
      },
    ],
    upsertedIdentityId: "identity_new",
  });

  await upsertCrmContact(prisma as never, {
    clientId: "client_a",
    input: { phone: "5584999049614", name: "Deifson Oliveira" },
    actorUserId: "admin_1",
    requestId: "req_keep",
    source: "crm_manual",
    audit: false,
  });

  assert.equal(
    (prisma.__state.leadUpdates[0] as { contactChannelIdentityId?: string }).contactChannelIdentityId,
    "identity_current"
  );
});

test("CRM manual create keeps same suffix with different DDD distinct", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_ddd11",
      name: "Ediane DDD11",
      waId: "5511951957784",
      externalUserRef: "5511951957784",
      legacyWaId: "5511951957784",
      operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
    },
    lead: { id: "lead_ddd11", name: "Ediane DDD11", phone: "5511951957784" },
  });

  await assert.doesNotReject(() =>
    upsertCrmContact(prisma as never, {
      clientId: "client_a",
      input: { phone: "5584951957784", name: "Ediane DDD84" },
      actorUserId: "admin_1",
      requestId: "req_ddd",
      source: "crm_manual",
      audit: false,
    })
  );
});

test("CRM manual create does not promote provisional contacts or reinterpret consent", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_provisional",
      name: "Contato Provisorio",
      lifecycle: "PROVISIONAL",
      waId: "5584951957784",
    },
    lead: { id: "lead_provisional", name: "Contato Provisorio" },
  });

  await assert.rejects(
    () =>
      upsertCrmContact(prisma as never, {
        clientId: "client_a",
        input: { phone: "5584951957784", name: "Contato Provisorio" },
        actorUserId: "admin_1",
        requestId: "req_provisional",
        source: "crm_manual",
      }),
    (error) =>
      error instanceof CrmContactUpsertError &&
      error.code === "contact_already_provisional" &&
      error.details?.state === "provisional"
  );
  assert.equal(prisma.__state.createdContacts, 0);
  assert.equal(prisma.__state.updatedContacts, 0);
});
