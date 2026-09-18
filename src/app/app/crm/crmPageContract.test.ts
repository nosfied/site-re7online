import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/crm/page.tsx"), "utf8");
const campaignsPageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");

test("CRM contacts list exposes compact campaign relationship summary", () => {
  assert.ok(pageSource.includes("Campanhas"));
  assert.ok(pageSource.includes("item.campaignRelationship"));
  assert.ok(pageSource.includes("campaign.campaignCount"));
  assert.ok(pageSource.includes("campaign.latestCampaignName"));
  assert.ok(pageSource.includes("campaign.latestCampaignAt"));
  assert.ok(pageSource.includes("campaign.latestRecipientStatus"));
  assert.ok(pageSource.includes("Sem campanhas"));
});

test("CRM contact detail exposes on-demand campaign history", () => {
  assert.ok(pageSource.includes("detail?.campaignRelationshipHistory?.items"));
  assert.ok(pageSource.includes('<DetailSection title="Campanhas">'));
  assert.ok(pageSource.includes("CampaignHistoryRow"));
  assert.ok(pageSource.includes("Nenhuma campanha vinculada a este contato."));
  assert.ok(pageSource.includes("Há mais registros. Abra campanhas para consultar o histórico completo."));
});

test("CRM campaign relationship labels hide raw internal status codes", () => {
  assert.ok(pageSource.includes('return "Entregue"'));
  assert.ok(pageSource.includes('return "Lida"'));
  assert.ok(pageSource.includes('return "Falhou"'));
  assert.ok(pageSource.includes('return "Bloqueada por opt-out"'));
  assert.ok(pageSource.includes('return "Conflito de contato"'));
  assert.ok(pageSource.includes('return "Ignorada"'));
});

test("CRM campaign history links to the existing campaign detail surface", () => {
  assert.ok(pageSource.includes("campaign.campaignHref"));
  assert.ok(pageSource.includes("Abrir campanha"));
  assert.ok(campaignsPageSource.includes('new URLSearchParams(window.location.search).get("campaignId")'));
  assert.ok(campaignsPageSource.includes("setSelectedCampaignId(requestedCampaignId)"));
});

test("CRM contacts campaign relationship keeps financial values out of customer UX", () => {
  for (const forbidden of ["R$", "USD", "provider cost", "Meta rate", "contract price", "billing amount"]) {
    assert.ok(!pageSource.includes(forbidden), `CRM page still contains ${forbidden}`);
  }
});

test("CRM campaign relationship remains responsive in list and detail", () => {
  assert.ok(pageSource.includes("overflow-x-auto"));
  assert.ok(pageSource.includes("min-w-[1280px]"));
  assert.ok(pageSource.includes("md:grid-cols-[1fr_auto] md:items-center"));
  assert.ok(pageSource.includes("max-h-[calc(100vh-2rem)]"));
});
