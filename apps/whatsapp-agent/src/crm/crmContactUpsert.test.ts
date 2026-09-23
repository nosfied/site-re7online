import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmCrmContactCsvImport,
  CrmContactUpsertError,
  previewCrmContactCsvImport,
  upsertCrmContact,
} from "./crmContactUpsert.js";

function makeUpsertPrisma(params: {
  contact?: {
    id?: string;
    name?: string | null;
    lifecycle?: string | null;
    waId?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
    externalUserHash?: string | null;
    operationallyExcludedAt?: Date | null;
  } | null;
		  lead?: {
		    id?: string;
		    name?: string | null;
		    phone?: string | null;
		    status?: string;
        company?: string | null;
        city?: string | null;
        email?: string | null;
        service?: string | null;
		    contactChannelIdentityId?: string | null;
		  } | null;
  identities?: Array<{
    id: string;
    contactId?: string | null;
    externalUserHash?: string | null;
    externalUserRef?: string | null;
    legacyWaId?: string | null;
  }>;
  contactCreateError?: unknown;
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
        externalUserHash: params.contact.externalUserHash ?? null,
        operationallyExcludedAt: params.contact.operationallyExcludedAt ?? null,
      }
    : null;
  const lead = params.lead
    ? {
        id: params.lead.id ?? "lead_1",
		        name: params.lead.name ?? contact?.name ?? "Contato",
		        phone: params.lead.phone ?? contact?.waId ?? "5584951957784",
		        status: params.lead.status ?? "NEW",
            company: params.lead.company ?? null,
            city: params.lead.city ?? null,
            email: params.lead.email ?? null,
            service: params.lead.service ?? null,
		        contactChannelIdentityId: params.lead.contactChannelIdentityId ?? "identity_1",
		      }
    : null;
  const state = {
    contacts: contact ? [contact] : [] as typeof contact[],
    leads: lead ? [lead] : [] as typeof lead[],
    createdContacts: 0,
    updatedContacts: 0,
    leadUpdates: [] as unknown[],
    leadCreates: [] as unknown[],
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
    return [item.waId, item.externalUserRef, item.legacyWaId, item.externalUserHash].some((value) => value && candidates.has(value));
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
  const matchesChannelIdentityWhere = (identity: NonNullable<typeof params.identities>[number], where: unknown) => {
    if (!where || typeof where !== "object") return true;
    const record = where as { OR?: Array<Record<string, { in?: string[] }>> };
    const candidates = new Set(
      (record.OR ?? []).flatMap((condition) =>
        Object.values(condition).flatMap((value) => (Array.isArray(value?.in) ? value.in : []))
      )
    );
    if (candidates.size === 0) return true;
    return [identity.externalUserHash, identity.externalUserRef, identity.legacyWaId].some(
      (value) => value && candidates.has(value)
    );
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    contactChannelIdentity: {
      findMany: async ({ where }: { where?: unknown } = {}) =>
        params.identities?.length
          ? params.identities.filter((identity) => matchesChannelIdentityWhere(identity, where)).map((identity) => ({ ...identity, contact }))
          : contact && matchesIdentityWhere(contact, where)
            ? [
                {
                  externalUserHash: contact.externalUserHash,
                  externalUserRef: contact.externalUserRef,
                  legacyWaId: contact.legacyWaId,
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
        if (params.contactCreateError) throw params.contactCreateError;
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
      create: async ({ data }: { data: unknown }) => {
        state.leadCreates.push(data);
        return { id: "lead_created" };
      },
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
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_excluded",
      name: "Ediane",
      waId: "5584951957784",
      operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
    },
    lead: { id: "lead_excluded", name: "Ediane" },
  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584951957784,Ediane\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

  assert.equal(preview.validRows, 1);
  assert.equal(preview.excludedContacts, 1);
  assert.equal(preview.readyToImport, 0);
  assert.equal(preview.sampleErrors[0]?.reason, "excluded_contact");
  assert.equal(preview.sampleErrors[0]?.code, "EXCLUDED_CONTACT");
  assert.equal(preview.sampleErrors[0]?.label, "Contato fora da operação");
  assert.equal(preview.sampleErrors[0]?.phoneDisplay, "5584951957784");
  assert.equal(preview.sampleErrors[0]?.normalizedPhoneDisplay, "5584951957784");
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

test("CRM manual create normalizes valid formatted BR phones and rejects unsafe phones before persistence", async () => {
  const formattedPrisma = makeUpsertPrisma();
  const formatted = await upsertCrmContact(formattedPrisma as never, {
    clientId: "client_a",
    input: { phone: "(84) 99904-9614", name: "Contato Formatado" },
    actorUserId: "admin_1",
    requestId: "req_formatted",
    source: "crm_manual",
    audit: false,
  });
  assert.equal(formatted.waIdCanonical, "5584999049614");
  assert.equal(formattedPrisma.__state.createdContacts, 1);

  for (const phone of ["99904-9614", "123", "558499904961499", "+1 415 555 0100"]) {
    const prisma = makeUpsertPrisma();
    await assert.rejects(
      () =>
        upsertCrmContact(prisma as never, {
          clientId: "client_a",
          input: { phone, name: "Invalido" },
          actorUserId: "admin_1",
          requestId: `req_invalid_${phone}`,
          source: "crm_manual",
        }),
      (error) => error instanceof CrmContactUpsertError && error.code === "invalid_phone"
    );
    assert.equal(prisma.__state.createdContacts, 0);
    assert.equal(prisma.__state.updatedContacts, 0);
  }
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

test("CRM CSV import creates only genuinely new contacts", async () => {
  const prisma = makeUpsertPrisma();

  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Deifson\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_new",
    audit: false,
  });

  assert.equal(result.created, 1);
  assert.equal(result.reused, 0);
  assert.equal(result.readyToImport, 1);
  assert.equal(result.excludedContacts, 0);
  assert.equal(result.provisionalContacts, 0);
  assert.equal(result.identityConflicts, 0);
  assert.equal(prisma.__state.createdContacts, 1);
});

test("CRM CSV import updates existing active contacts without duplicating", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_existing",
      name: "Maria",
      waId: "5584999049614",
    },
	    lead: { id: "lead_existing", name: "Maria", phone: "5584999049614", status: "NEW" },
	  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Maria Nova\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Maria Nova\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_existing",
    audit: false,
  });

	  assert.equal(preview.existingContacts, 1);
	  assert.equal(preview.readyToImport, 1);
	  assert.equal(preview.rows?.[0]?.operation, "UPDATE");
	  assert.equal(result.created, 0);
	  assert.equal(result.updated, 1);
	  assert.equal(prisma.__state.createdContacts, 0);
	  assert.equal(prisma.__state.updatedContacts, 1);
});

test("CRM CSV import resolves CRM situation and preserves existing status when blank", async () => {
  const statuses = [
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
    { id: "FOLLOW_UP", label: "Follow-up", isActive: true, campaignEligible: true },
  ];
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_existing",
      name: "Preservar",
      waId: "5584999049614",
    },
    lead: { id: "lead_existing", name: "Preservar", phone: "5584999049614", status: "FOLLOW_UP" },
  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "Telefone,Nome,Situação no CRM\n5584999049614,Preservar,\n5584999049615,Novo,Qualificado\n5584999049616,Erro,Status que não existe\n",
    mapping: { phoneColumn: "Telefone", nameColumn: "Nome", crmSituationColumn: "Situação no CRM" },
    crmStatuses: statuses,
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "Telefone,Nome,Situação no CRM\n5584999049614,Preservar,\n5584999049615,Novo,Qualificado\n5584999049616,Erro,Status que não existe\n",
    mapping: { phoneColumn: "Telefone", nameColumn: "Nome", crmSituationColumn: "Situação no CRM" },
    crmStatuses: statuses,
    actorUserId: "admin_1",
    requestId: "import_crm_status",
    audit: false,
  });

  assert.equal(preview.readyToImport, 2);
  assert.equal(preview.invalidCrmStatuses, 1);
  assert.equal(preview.rows?.find((row) => row.normalizedPhone === "5584999049614")?.operation, "UNCHANGED");
  assert.equal(preview.rows?.find((row) => row.normalizedPhone === "5584999049615")?.crmSituation.statusId, "QUALIFIED");
  assert.equal(preview.sampleErrors[0]?.code, "INVALID_CRM_STATUS");
  assert.equal(result.created, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.invalidCrmStatuses, 1);
  assert.equal(prisma.__state.createdContacts, 1);
  assert.equal(prisma.__state.leadUpdates.length, 1);
  assert.equal((prisma.__state.leadUpdates[0] as { status?: string }).status, undefined);
});

test("CRM CSV import accepts phone-only mapping and defaults new contacts to NEW", async () => {
  const prisma = makeUpsertPrisma();
  const csvText = "Telefone\n5584999049614\n";

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: {},
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: {},
    actorUserId: "admin_1",
    requestId: "import_phone_only",
    audit: false,
  });

  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.rows?.[0]?.operation, "CREATE");
  assert.equal(result.created, 1);
  assert.equal((prisma.__state.leadCreates[0] as { status?: string }).status, "NEW");
});

test("CRM CSV import respects explicitly unmapped optional columns", async () => {
  const statuses = [{ id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true }];
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_existing",
      name: "Preservar",
      waId: "5584999049614",
    },
    lead: { id: "lead_existing", name: "Preservar", phone: "5584999049614", status: "NEW" },
  });
  const csvText = "Telefone,Nome,Situação no CRM\n5584999049614,Novo Nome,Qualificado\n";

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: { phoneColumn: "Telefone", nameColumn: null, crmSituationColumn: null },
    crmStatuses: statuses,
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: { phoneColumn: "Telefone", nameColumn: null, crmSituationColumn: null },
    crmStatuses: statuses,
    actorUserId: "admin_1",
    requestId: "import_unmapped_optional",
    audit: false,
  });

  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.rows?.[0]?.operation, "UNCHANGED");
  assert.deepEqual(preview.rows?.[0]?.fieldsToUpdate, []);
  assert.equal(result.unchanged, 1);
  assert.equal(prisma.__state.leadUpdates.length, 1);
  assert.equal((prisma.__state.leadUpdates[0] as { name?: string; status?: string }).name, "Preservar");
  assert.equal((prisma.__state.leadUpdates[0] as { name?: string; status?: string }).status, undefined);
});

test("CRM CSV import blocks when phone mapping is explicitly disabled", async () => {
  const prisma = makeUpsertPrisma();

  await assert.rejects(
    () =>
      previewCrmContactCsvImport(prisma as never, {
        clientId: "client_a",
        csvText: "Telefone,Nome\n5584999049614,Novo\n",
        mapping: { phoneColumn: null },
      }),
    (error) => error instanceof CrmContactUpsertError && error.code === "missing_phone_column"
  );
});

test("CRM CSV import maps all editable fields and preserves blank mapped values", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_existing",
      name: "Contato Base",
      waId: "5584999049614",
    },
    lead: {
      id: "lead_existing",
      name: "Contato Base",
      phone: "5584999049614",
      status: "NEW",
      company: "Empresa Original",
      city: "Natal",
      email: "base@example.com",
      service: "Servico Original",
    },
  });
  const csvText =
    "Telefone,Nome,Empresa,Cidade,E-mail,Serviço / interesse\n" +
    "5584999049614,Contato Atualizado,,Mossoro,NOVO@EXAMPLE.COM,Servico Novo\n";

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: {
      phoneColumn: "Telefone",
      nameColumn: "Nome",
      companyColumn: "Empresa",
      cityColumn: "Cidade",
      emailColumn: "E-mail",
      serviceColumn: "Serviço / interesse",
    },
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText,
    mapping: {
      phoneColumn: "Telefone",
      nameColumn: "Nome",
      companyColumn: "Empresa",
      cityColumn: "Cidade",
      emailColumn: "E-mail",
      serviceColumn: "Serviço / interesse",
    },
    actorUserId: "admin_1",
    requestId: "import_full_fields",
    audit: false,
  });

  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.rows?.[0]?.operation, "UPDATE");
  assert.deepEqual(preview.rows?.[0]?.fieldsToUpdate, ["Nome", "Cidade", "E-mail", "Serviço / interesse"]);
  assert.equal(result.updated, 1);
  assert.equal(prisma.__state.leadUpdates.length, 1);
  const update = prisma.__state.leadUpdates[0] as {
    name?: string;
    company?: string;
    city?: string;
    email?: string;
    service?: string;
  };
  assert.equal(update.name, "Contato Atualizado");
  assert.equal(update.company, undefined);
  assert.equal(update.city, "Mossoro");
  assert.equal(update.email, "novo@example.com");
  assert.equal(update.service, "Servico Novo");
});

test("CRM CSV import does not restore operationally excluded contacts", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_excluded",
      name: "Neide",
      waId: "5584999040528",
      operationallyExcludedAt: new Date("2026-08-27T10:00:00.000Z"),
    },
    lead: { id: "lead_excluded", name: "Neide", phone: "5584999040528" },
  });

  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999040528,Neide\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_excluded",
    audit: false,
  });

  assert.equal(result.created, 0);
  assert.equal(result.reused, 0);
  assert.equal(result.excludedContacts, 1);
  assert.equal(result.errors?.[0]?.code, "EXCLUDED_CONTACT");
  assert.equal(result.errors?.[0]?.phoneDisplay, "5584999040528");
  assert.equal(result.errors?.[0]?.normalizedPhoneDisplay, "5584999040528");
  assert.equal(prisma.__state.createdContacts, 0);
  assert.equal(prisma.__state.updatedContacts, 0);
});

test("CRM CSV import does not promote provisional contacts", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_provisional",
      name: "Contato Provisorio",
      lifecycle: "PROVISIONAL",
      waId: "5584999049614",
    },
    lead: { id: "lead_provisional", name: "Contato Provisorio", phone: "5584999049614" },
  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Contato Provisorio\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Contato Provisorio\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_provisional",
    audit: false,
  });

  assert.equal(preview.provisionalContacts, 1);
  assert.equal(preview.readyToImport, 0);
  assert.equal(result.created, 0);
  assert.equal(result.promotedProvisional, 0);
  assert.equal(result.provisionalContacts, 1);
  assert.equal(preview.sampleErrors[0]?.code, "PROVISIONAL_CONTACT");
  assert.equal(result.errors?.[0]?.code, "PROVISIONAL_CONTACT");
  assert.equal(prisma.__state.createdContacts, 0);
  assert.equal(prisma.__state.updatedContacts, 0);
});

test("CRM CSV import rejects duplicate rows before contact upsert", async () => {
  const prisma = makeUpsertPrisma();

  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Primeiro\n5584999049614,Segundo\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_duplicate",
    audit: false,
  });

  assert.equal(result.created, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.readyToImport, 1);
  assert.equal(prisma.__state.createdContacts, 1);
});

test("CRM CSV import deduplicates modern and legacy BR variants in the same file", async () => {
  const prisma = makeUpsertPrisma();

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n8494784366,Legacy\n84994784366,Modern\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

  assert.equal(preview.validRows, 1);
  assert.equal(preview.duplicatesInFile, 1);
  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.sampleErrors[0]?.code, "DUPLICATE");
});

test("CRM CSV import rejects invalid phone rows with detailed report and no persistence", async () => {
  const prisma = makeUpsertPrisma();

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n99904-9614,Sem DDD\n123,Curto\n+1 415 555 0100,Internacional\n84999049614,Com DDD\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });
  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n99904-9614,Sem DDD\n123,Curto\n+1 415 555 0100,Internacional\n84999049614,Com DDD\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_invalid_phone_report",
    audit: false,
  });

  assert.equal(preview.invalidRows, 3);
  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.sampleErrors[0]?.code, "INVALID_PHONE");
  assert.equal(result.invalid, 3);
  assert.equal(result.created, 1);
  assert.equal(result.errors?.length, 3);
  assert.equal(result.errors?.[0]?.code, "INVALID_PHONE");
  assert.equal(prisma.__state.createdContacts, 1);
});

test("CRM CSV import treats confirmed aliases as existing contact evidence", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_existing",
      name: "Alfredo",
      waId: "558494784366",
      legacyWaId: "8494784366",
    },
  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n84994784366,Alfredo\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

	  assert.equal(preview.existingContacts, 1);
	  assert.equal(preview.readyToImport, 1);
	  assert.equal(preview.rows?.[0]?.operation, "UNCHANGED");
});

test("CRM CSV import allows anonymized detached history without relinking", async () => {
  const prisma = makeUpsertPrisma({
    identities: [
      {
        id: "identity_anonymized",
        contactId: null,
        externalUserHash: "anon:conversation_old",
        externalUserRef: null,
        legacyWaId: null,
      },
    ],
  });

  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Deifson\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_anonymized",
    audit: false,
  });

  assert.equal(result.created, 1);
  assert.equal(result.reused, 0);
  assert.equal(prisma.__state.createdContacts, 1);
});

test("CRM CSV import keeps same suffix with different DDD distinct", async () => {
  const prisma = makeUpsertPrisma({
    contact: {
      id: "contact_ddd11",
      name: "DDD11",
      waId: "5511951957784",
      externalUserRef: "5511951957784",
      legacyWaId: "5511951957784",
      operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
    },
  });

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584951957784,DDD84\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

  assert.equal(preview.readyToImport, 1);
  assert.equal(preview.excludedContacts, 0);
});

test("CRM CSV import reports unique persistence races as identity conflicts", async () => {
  const prisma = makeUpsertPrisma({
    contactCreateError: Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
  });

  const result = await confirmCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584999049614,Deifson\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
    actorUserId: "admin_1",
    requestId: "import_p2002",
    audit: false,
  });

  assert.equal(result.created, 0);
  assert.equal(result.identityConflicts, 1);
  assert.equal(result.failed, 0);
});
