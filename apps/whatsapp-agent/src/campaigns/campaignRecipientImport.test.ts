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

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaign-recipient-import-test-secret";

const prisma = getPrisma();
const prefix = `campaign-import-${process.pid}-${Date.now()}`;

async function cleanup(clientId: string) {
  await prisma.event.deleteMany({ where: { clientId } });
  await prisma.campaign.deleteMany({ where: { clientId } });
  await prisma.template.deleteMany({ where: { clientId } });
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
