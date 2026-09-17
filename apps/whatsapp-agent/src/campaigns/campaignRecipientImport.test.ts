import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPrisma } from "../db.js";
import { recordContactOptOut } from "./optOutRegistry.js";
import {
  buildCampaignImportRecipientsFromCsv,
  importCampaignRecipients,
  previewCampaignRecipientImport,
  resolveCampaignImportTemplate,
} from "./campaignRecipientImport.js";
import { readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import { buildCrmWhatsappExternalUserHash } from "../crm/crmWhatsappIdentity.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaign-recipient-import-test-secret";

const prisma = getPrisma();
const prefix = `campaign-import-${process.pid}-${Date.now()}`;

async function cleanup(clientId: string) {
  await prisma.event.deleteMany({ where: { clientId } });
  await prisma.campaign.deleteMany({ where: { clientId } });
  await prisma.template.deleteMany({ where: { clientId } });
  await prisma.lead.deleteMany({ where: { tenantId: clientId } });
  await prisma.contactChannelIdentity.deleteMany({ where: { clientId } });
  await prisma.tenantOperationalConfig.deleteMany({ where: { clientId } });
  await prisma.contact.deleteMany({ where: { clientId } });
  await prisma.client.deleteMany({ where: { id: clientId } });
}

test("campaign CSV import previews and persists eligible recipients without sending", async () => {
  const clientId = crypto.randomUUID();
  await cleanup(clientId).catch(() => undefined);
  await prisma.client.create({
    data: {
      id: clientId,
      clientKey: clientId,
      name: "Campaign Import Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: `${prefix}_template`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Olá {{1}}, protocolo {{2}}.",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: "CSV Draft",
      templateId: template.id,
      templateName: template.name,
      status: "draft",
      totalRecipients: 0,
    },
  });
  await prisma.event.create({
    data: {
      clientId,
      messageId: campaign.id,
      requestId: `${prefix}:existing-seed`,
      eventName: "campaign.seed.saved",
      payloadJson: {
        recipients: ["5541991100001"],
        componentsByWaId: {},
      },
    },
  });
  await recordContactOptOut({
    clientId,
    waId: "5541991100004",
    source: "test",
    reason: "csv import block",
  });
  await prisma.contact.create({
    data: {
      clientId,
      waId: "5541991100005",
      name: "Pendente Consentimento",
      lifecycle: "PROVISIONAL",
    },
  });
  await prisma.contact.create({
    data: {
      clientId,
      waId: "anon-campaign-provisional",
      externalUserRef: "5541991100006",
      name: "Pendente Consentimento Alias",
      lifecycle: "PROVISIONAL",
    },
  });
  await prisma.contact.create({
    data: {
      clientId,
      waId: "5541991100007",
      name: "Contato Excluido",
      lifecycle: "ACTIVE",
      operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
    },
  });

  const csv = [
    "\uFEFFtelefone;nome;primeiro_nome;protocolo",
    "5541991100002;Maria Silva;Maria;P-001",
    "\"+55 (41) 99110-0002\";Maria Duplicada;Maria;P-001",
    "5541991100003;João Souza;;P-002",
    "5541991100004;Opt Out;Opt;P-003",
    "5541991100005;Pendente Consentimento;Pendente;P-005",
    "5541991100006;Pendente Alias;Pendente;P-006",
    "5541991100007;Contato Excluido;Excluido;P-007",
    "5541991100001;Existente;Ja;P-004",
    "telefone ruim;Inválido;X;P-005",
  ].join("\r\n");
  const parsed = buildCampaignImportRecipientsFromCsv({
    csvText: csv,
    mapping: {
      phoneColumn: "telefone",
      nameColumn: "nome",
      variableColumns: {
        "1": "primeiro_nome",
        "2": "protocolo",
      },
    },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(parsed.headers, ["telefone", "nome", "primeiro_nome", "protocolo"]);

  const importTemplate = await resolveCampaignImportTemplate(prisma, {
    clientId,
    campaignId: campaign.id,
  });
  assert.ok(importTemplate);
  const eventsBeforePreview = await prisma.event.count({ where: { clientId } });
  const campaignBeforePreview = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  const preview = await previewCampaignRecipientImport(prisma, {
    clientId,
    campaignId: campaign.id,
    template: importTemplate,
    recipients: parsed.recipients,
  });
  const eventsAfterPreview = await prisma.event.count({ where: { clientId } });
  const campaignAfterPreview = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert.equal(eventsAfterPreview, eventsBeforePreview);
  assert.equal(campaignAfterPreview.totalRecipients, campaignBeforePreview.totalRecipients);
  assert.equal(campaignAfterPreview.status, campaignBeforePreview.status);
  assert.equal(preview.summary.received, 9);
  assert.equal(preview.summary.readyToImport, 1);
  assert.equal(preview.summary.duplicates, 1);
  assert.equal(preview.summary.existingDuplicates, 1);
  assert.equal(preview.summary.invalid, 1);
  assert.equal(preview.summary.missingRequiredVariables, 1);
  assert.equal(preview.summary.optOutBlocked, 1);
  assert.equal(preview.summary.blockedByReason.find((item) => item.reason === "provisional_contact")?.count, 2);
  assert.equal(preview.summary.blockedByReason.find((item) => item.reason === "excluded_contact")?.count, 1);
  assert.equal(preview.recipients[0]?.identifierDisplay, "Maria Silva");
  assert.equal(JSON.stringify(preview).includes("5541991100002"), false);

  const outboundBefore = await prisma.outboundMessage.count({ where: { clientId } });
  const imported = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    requestId: `${prefix}:csv-import`,
    source: "csv",
    recipients: parsed.recipients,
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.importedCount, 1);
  assert.equal(imported.campaign?.totalRecipients, 2);
  assert.equal(imported.campaign?.sentCount, 0);
  const outboundAfter = await prisma.outboundMessage.count({ where: { clientId } });
  assert.equal(outboundAfter, outboundBefore);

  const seed = await prisma.event.findFirstOrThrow({
    where: { clientId, eventName: "campaign.seed.saved", messageId: campaign.id },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  const seedPayload = seed.payloadJson as Record<string, unknown>;
  assert.equal(JSON.stringify(seedPayload).includes("5541991100001"), false);
  assert.equal(JSON.stringify(seedPayload).includes("5541991100002"), false);
  const privateSeed = readPrivateCampaignSeedFields(seedPayload);
  assert.deepEqual(privateSeed.recipients, ["5541991100001", "5541991100002"]);
  const componentsByWaId = privateSeed.componentsByWaId as Record<string, unknown>;
  assert.ok(componentsByWaId["5541991100002"]);

  const repeat = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    requestId: `${prefix}:csv-import-repeat`,
    source: "csv",
    recipients: parsed.recipients,
  });
  assert.equal(repeat.ok, true);
  assert.equal(repeat.importedCount, 0);
  assert.equal(repeat.campaign?.totalRecipients, 2);

  await cleanup(clientId);
});

test("campaign CSV parser accepts comma quoted values and reports missing phone mapping", () => {
  const parsed = buildCampaignImportRecipientsFromCsv({
    csvText: 'phone,name,first\n"5541991100005","Ana, Operadora","Ana"',
    mapping: {
      phoneColumn: "phone",
      nameColumn: "name",
      variableColumns: { "1": "first" },
    },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.recipients[0]?.name, "Ana, Operadora");

  const missing = buildCampaignImportRecipientsFromCsv({
    csvText: "phone,name\n5541991100006,João",
    mapping: { phoneColumn: "telefone" },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "missing_phone_column");

  const empty = buildCampaignImportRecipientsFromCsv({
    csvText: "   ",
    mapping: { phoneColumn: "phone" },
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "csv_empty");

  const malformed = buildCampaignImportRecipientsFromCsv({
    csvText: 'phone,name\n"5541991100007,Ana',
    mapping: { phoneColumn: "phone" },
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, "csv_malformed");
});

test("campaign CSV import upserts CRM contacts and resolves Situação no CRM safely", async () => {
  const clientId = crypto.randomUUID();
  const otherClientId = crypto.randomUUID();
  await cleanup(clientId).catch(() => undefined);
  await cleanup(otherClientId).catch(() => undefined);
  await prisma.client.createMany({
    data: [
      {
        id: clientId,
        clientKey: `${prefix}-crm-import`,
        name: "Campaign CRM Import Test",
        profile: "business",
        features: { campaigns: true, crm: true },
      },
      {
        id: otherClientId,
        clientKey: `${prefix}-crm-import-other`,
        name: "Other Tenant",
        profile: "business",
        features: { campaigns: true, crm: true },
      },
    ],
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: `${prefix}_crm_template`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Olá {{1}}",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      clientId,
      name: "CSV CRM Draft",
      templateId: template.id,
      templateName: template.name,
      status: "draft",
      totalRecipients: 0,
    },
  });
  await prisma.lead.create({
    data: {
      tenantId: clientId,
      waId: "5541992200002",
      waIdCanonical: "5541992200002",
      phone: "5541992200002",
      name: "Nome Antigo",
      status: "NEW",
    },
  });
  await prisma.lead.create({
    data: {
      tenantId: clientId,
      waId: "5541992200003",
      waIdCanonical: "5541992200003",
      phone: "5541992200003",
      name: "Preservar",
      status: "QUALIFIED",
    },
  });
  await prisma.lead.create({
    data: {
      tenantId: otherClientId,
      waId: "5541992200001",
      waIdCanonical: "5541992200001",
      phone: "5541992200001",
      name: "Outro Tenant",
      status: "LOST",
    },
  });

  const csv = [
    "telefone;nome;Situação no CRM;primeiro_nome",
    "5541992200001;Novo Contato;Qualificado;Novo",
    "5541992200002;Nome Atualizado;Follow-up;Atualizado",
    "5541992200003;; ;Preservar",
    "5541992200004;Desconhecido;Status Inexistente;Erro",
    "5541992200001;Duplicado;Qualificado;Dup",
  ].join("\n");
  const parsed = buildCampaignImportRecipientsFromCsv({
    csvText: csv,
    mapping: {
      phoneColumn: "telefone",
      nameColumn: "nome",
      crmSituationColumn: "Situação no CRM",
      variableColumns: { "1": "primeiro_nome" },
    },
  });
  assert.equal(parsed.ok, true);

  const importTemplate = await resolveCampaignImportTemplate(prisma, {
    clientId,
    campaignId: campaign.id,
  });
  assert.ok(importTemplate);
  const statuses = [
    { id: "NEW", label: "Novo", isActive: true, campaignEligible: false },
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
    { id: "FOLLOW_UP", label: "Follow-up", isActive: true, campaignEligible: true },
    { id: "LOST", label: "Perdido", isActive: true, campaignEligible: true },
  ];
  const preview = await previewCampaignRecipientImport(prisma, {
    clientId,
    campaignId: campaign.id,
    template: importTemplate,
    recipients: parsed.recipients,
    crmStatuses: statuses,
  });
  assert.equal(preview.summary.readyToImport, 3);
  assert.equal(preview.summary.created, 1);
  assert.equal(preview.summary.updated, 1);
  assert.equal(preview.summary.unchanged, 1);
  assert.equal(preview.summary.unresolvedCrmSituations, 1);
  assert.equal(preview.summary.duplicates, 1);
  assert.equal(preview.recipients.find((item) => item.operation === "NOVO")?.crmSituation.statusId, "QUALIFIED");
  assert.equal(preview.recipients.find((item) => item.leadId !== null && item.operation === "ATUALIZAR")?.crmSituation.statusId, "FOLLOW_UP");

  const imported = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    actorId: "tester",
    requestId: `${prefix}:crm-upsert-import`,
    source: "csv",
    recipients: parsed.recipients,
    crmStatuses: statuses,
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.report.summary.created, 1);
  assert.equal(imported.report.summary.updated, 1);
  assert.equal(imported.report.summary.unchanged, 1);
  assert.equal(imported.report.summary.errors, 1);
  assert.equal(imported.report.summary.duplicatesConsolidated, 1);
  assert.match(imported.report.csv, /sourceRow,maskedIdentity,operation/);

  const newLead = await prisma.lead.findFirstOrThrow({ where: { tenantId: clientId, waIdCanonical: "5541992200001" } });
  assert.equal(newLead.name, "Novo Contato");
  assert.equal(newLead.status, "QUALIFIED");
  const updatedLead = await prisma.lead.findFirstOrThrow({ where: { tenantId: clientId, waIdCanonical: "5541992200002" } });
  assert.equal(updatedLead.name, "Nome Atualizado");
  assert.equal(updatedLead.status, "FOLLOW_UP");
  const preservedLead = await prisma.lead.findFirstOrThrow({ where: { tenantId: clientId, waIdCanonical: "5541992200003" } });
  assert.equal(preservedLead.name, "Preservar");
  assert.equal(preservedLead.status, "QUALIFIED");
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waIdCanonical: "5541992200001" } }), 1);
  const otherTenantLead = await prisma.lead.findFirstOrThrow({ where: { tenantId: otherClientId, waIdCanonical: "5541992200001" } });
  assert.equal(otherTenantLead.name, "Outro Tenant");
  assert.equal(otherTenantLead.status, "LOST");

  const repeat = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    actorId: "tester",
    requestId: `${prefix}:crm-upsert-import-repeat`,
    source: "csv",
    recipients: parsed.recipients,
    crmStatuses: statuses,
  });
  assert.equal(repeat.ok, true);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waIdCanonical: "5541992200001" } }), 1);
  assert.equal(repeat.importedCount, 0);

  await cleanup(clientId);
  await cleanup(otherClientId);
});

test("campaign CRM import uses canonical hash identity and deterministic duplicate winners", async () => {
  const clientId = crypto.randomUUID();
  const otherClientId = crypto.randomUUID();
  await cleanup(clientId).catch(() => undefined);
  await cleanup(otherClientId).catch(() => undefined);
  await prisma.client.createMany({
    data: [
      { id: clientId, clientKey: `${prefix}-canonical`, name: "Canonical Import", profile: "business", features: { campaigns: true, crm: true } },
      { id: otherClientId, clientKey: `${prefix}-canonical-other`, name: "Canonical Other", profile: "business", features: { campaigns: true, crm: true } },
    ],
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: `${prefix}_canonical_template`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso",
    },
  });
  const campaign = await prisma.campaign.create({
    data: { clientId, name: "Canonical CSV", templateId: template.id, templateName: template.name, status: "draft", totalRecipients: 0 },
  });
  const hashOnlyPhone = "5541992300001";
  const hashOnlyLead = await prisma.lead.create({
    data: {
      tenantId: clientId,
      waId: `hash-only-${crypto.randomUUID()}`,
      externalUserHash: buildCrmWhatsappExternalUserHash(hashOnlyPhone),
      name: "Nome Hash",
      status: "NEW",
    },
  });
  const otherTenantLead = await prisma.lead.create({
    data: {
      tenantId: otherClientId,
      waId: "5541992300002",
      waIdCanonical: "5541992300002",
      phone: "5541992300002",
      name: "Outro Tenant",
      status: "OTHER",
    },
  });
  const statuses = [
    { id: "EQ", label: "=1+1", isActive: true, campaignEligible: true },
    { id: "PLUS", label: "+SUM(A1:A2)", isActive: true, campaignEligible: true },
    { id: "MINUS", label: "-1+2", isActive: true, campaignEligible: true },
    { id: "AT", label: "@cmd", isActive: true, campaignEligible: true },
  ];
  const recipients = [
    { rowNumber: 1, phone: hashOnlyPhone, name: "Hash Atualizado", crmSituation: "EQ" },
    { rowNumber: 2, phone: "5541992300002", name: "Invalido Primeiro", crmSituation: "DESCONHECIDO" },
    { rowNumber: 3, phone: "5541992300002", name: "Valido Segundo", crmSituation: "PLUS" },
    { rowNumber: 4, phone: "5541992300003", name: "Valido Primeiro", crmSituation: "MINUS" },
    { rowNumber: 5, phone: "5541992300003", name: "Invalido Segundo", crmSituation: "DESCONHECIDO" },
    { rowNumber: 6, phone: "5541992300004", name: "Primeiro Valido", crmSituation: "AT" },
    { rowNumber: 7, phone: "5541992300005", name: "Intermediario", crmSituation: "EQ" },
    { rowNumber: 8, phone: "5541992300004", name: "Duplicado Distante", crmSituation: "AT" },
  ];
  const importTemplate = await resolveCampaignImportTemplate(prisma, { clientId, campaignId: campaign.id });
  assert.ok(importTemplate);
  const preview = await previewCampaignRecipientImport(prisma, {
    clientId,
    campaignId: campaign.id,
    template: importTemplate,
    recipients,
    crmStatuses: statuses,
  });
  assert.equal(preview.summary.readyToImport, 5);
  assert.equal(preview.summary.unresolvedCrmSituations, 2);
  assert.equal(preview.summary.duplicates, 1);
  const hashPreview = preview.recipients.find((item) => item.rowNumber === 1);
  assert.equal(hashPreview?.leadId, hashOnlyLead.id);
  assert.equal(hashPreview?.operation, "ATUALIZAR");
  assert.ok(preview.recipients.some((item) => item.rowNumber === 3));
  assert.ok(preview.recipients.some((item) => item.rowNumber === 4));
  assert.equal(preview.errors.find((item) => item.rowNumber === 2)?.reason, "crm_situation_unresolved");
  assert.equal(preview.errors.find((item) => item.rowNumber === 5)?.reason, "crm_situation_unresolved");
  assert.equal(preview.errors.find((item) => item.rowNumber === 8)?.reason, "duplicate_recipient");

  const imported = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    actorId: "tester",
    requestId: `${prefix}:canonical-import`,
    source: "csv",
    recipients,
    crmStatuses: statuses,
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.importedCount, 5);
  assert.equal(imported.report.summary.created, 4);
  assert.equal(imported.report.summary.updated, 1);
  assert.equal(imported.report.summary.errors, 2);
  assert.equal(imported.report.summary.duplicatesConsolidated, 1);
  assert.match(imported.report.csv, /'=1\+1/);
  assert.match(imported.report.csv, /'\+SUM\(A1:A2\)/);
  assert.match(imported.report.csv, /'-1\+2/);
  assert.match(imported.report.csv, /'@cmd/);
  const reusedHashLead = await prisma.lead.findFirstOrThrow({ where: { tenantId: clientId, id: hashOnlyLead.id } });
  assert.equal(reusedHashLead.name, "Hash Atualizado");
  assert.equal(reusedHashLead.status, "EQ");
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, externalUserHash: hashOnlyLead.externalUserHash } }), 1);
  const untouchedOtherTenant = await prisma.lead.findUniqueOrThrow({ where: { id: otherTenantLead.id } });
  assert.equal(untouchedOtherTenant.name, "Outro Tenant");
  assert.equal(untouchedOtherTenant.status, "OTHER");

  const repeat = await importCampaignRecipients(prisma, {
    clientId,
    campaignId: campaign.id,
    actorId: "tester",
    requestId: `${prefix}:canonical-import-repeat`,
    source: "csv",
    recipients,
    crmStatuses: statuses,
  });
  assert.equal(repeat.ok, true);
  assert.equal(repeat.importedCount, 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId } }), 5);

  await cleanup(clientId);
  await cleanup(otherClientId);
});

test("campaign CRM import rolls back CRM changes when row seed persistence fails", async () => {
  const clientId = crypto.randomUUID();
  await cleanup(clientId).catch(() => undefined);
  await prisma.client.create({
    data: { id: clientId, clientKey: `${prefix}-rollback`, name: "Rollback Import", profile: "business", features: { campaigns: true, crm: true } },
  });
  const template = await prisma.template.create({
    data: { clientId, name: `${prefix}_rollback_template`, category: "UTILITY", language: "pt_BR", status: "approved", content: "Aviso" },
  });
  const existingLead = await prisma.lead.create({
    data: { tenantId: clientId, waId: "5541992400001", waIdCanonical: "5541992400001", phone: "5541992400001", name: "Antes", status: "NEW" },
  });
  const statuses = [{ id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true }];
  for (const [index, hook] of ["afterCrmMutation", "beforeCampaignSeedPersist"].entries()) {
    const campaign = await prisma.campaign.create({
      data: { clientId, name: `Rollback ${hook}`, templateId: template.id, templateName: template.name, status: "draft", totalRecipients: 0 },
    });
    const phone = index === 0 ? "5541992400001" : "5541992400002";
    const result = await importCampaignRecipients(prisma, {
      clientId,
      campaignId: campaign.id,
      actorId: "tester",
      requestId: `${prefix}:rollback:${hook}`,
      source: "csv",
      recipients: [{ rowNumber: 1, phone, name: "Depois", crmSituation: "QUALIFIED" }],
      crmStatuses: statuses,
      testHooks: { [hook]: () => { throw new Error(`controlled-${hook}`); } },
    });
    assert.equal(result.ok, true);
    assert.equal(result.importedCount, 0);
    assert.equal(result.report.summary.errors, 1);
    assert.equal(result.report.rows[result.report.rows.length - 1]?.errorCode, "import_transaction_failed");
    const persistedCampaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(persistedCampaign.totalRecipients, 0);
    assert.equal(await prisma.event.count({ where: { clientId, messageId: campaign.id, eventName: "campaign.seed.saved" } }), 0);
  }
  const preserved = await prisma.lead.findUniqueOrThrow({ where: { id: existingLead.id } });
  assert.equal(preserved.name, "Antes");
  assert.equal(preserved.status, "NEW");
  assert.equal(await prisma.lead.count({ where: { tenantId: clientId, waIdCanonical: "5541992400002" } }), 0);
  assert.equal(await prisma.contact.count({ where: { clientId, waId: "5541992400002" } }), 0);
  await cleanup(clientId);
});

test("campaign recipient import only mutates draft campaigns", async () => {
  const clientId = crypto.randomUUID();
  await cleanup(clientId).catch(() => undefined);
  await prisma.client.create({
    data: {
      id: clientId,
      clientKey: `${prefix}-editable`,
      name: "Campaign Import Editable Test",
      profile: "business",
      features: { campaigns: true },
    },
  });
  const template = await prisma.template.create({
    data: {
      clientId,
      name: `${prefix}_editable_template`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Olá {{1}}",
    },
  });
  const statuses = ["scheduled", "sending", "paused", "completed", "cancelled"] as const;
  for (const status of statuses) {
    const campaign = await prisma.campaign.create({
      data: {
        clientId,
        name: `Import ${status}`,
        templateId: template.id,
        templateName: template.name,
        status,
        totalRecipients: 0,
      },
    });
    const result = await importCampaignRecipients(prisma, {
      clientId,
      campaignId: campaign.id,
      requestId: `${prefix}:non-draft:${status}`,
      source: "public_api",
      recipients: [{ phone: "5541991400001", variables: { "1": "Ana" }, rowNumber: 1 }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.error, "campaign_not_editable");
    const persisted = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(persisted.totalRecipients, 0);
  }
  await cleanup(clientId);
});
