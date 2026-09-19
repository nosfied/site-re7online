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
  assert.ok(pageSource.includes('<DetailSection title="Histórico">'));
  assert.ok(pageSource.includes("Campanhas relacionadas"));
  assert.ok(pageSource.includes("CampaignHistoryRow"));
  assert.ok(pageSource.includes("Nenhuma campanha vinculada a este contato."));
  assert.ok(pageSource.includes("Há mais registros. Abra campanhas para consultar o histórico completo."));
});

test("CRM campaign relationship reuses the departments expandable row pattern", () => {
  assert.ok(pageSource.includes("theme-list-row theme-list-row-even overflow-hidden rounded-xl border"));
  assert.ok(pageSource.includes("departments-settings-department-header grid"));
  assert.ok(pageSource.includes("grid-cols-[minmax(0,1fr)_auto]"));
  assert.ok(pageSource.includes("expand-row-action-slot"));
  assert.ok(pageSource.includes("grid h-8 w-8 place-items-center rounded-full border"));
  assert.ok(pageSource.includes('aria-expanded={campaignsExpanded}'));
  assert.ok(pageSource.includes("aria-controls={`contact-campaign-panel-${item.leadId}`}"));
  assert.ok(pageSource.includes("departments-settings-department-body grid gap-2 bg-black/10 px-3 py-3 md:px-4"));
  assert.ok(pageSource.includes("›"));
});

test("CRM row actions expose only open and delete without row edit action", () => {
  const rowBlock = pageSource.slice(
    pageSource.indexOf("function CrmContactRow"),
    pageSource.indexOf("function CampaignHistoryRow")
  );
  assert.ok(pageSource.includes("aria-label={label}"));
  assert.ok(rowBlock.includes('label="Abrir contato"'));
  assert.ok(rowBlock.includes('label="Excluir contato"'));
  assert.ok(rowBlock.includes("onClick={() => onOpenDetail(item)}"));
  assert.ok(rowBlock.includes("onClick={() => onDelete(item)}"));
  assert.ok(rowBlock.includes("disabled={!canDelete || item.isOperationallyExcluded}"));
  assert.ok(!rowBlock.includes('label="Editar cadastro"'));
  assert.ok(pageSource.includes("requestContactExclusion"));
  assert.ok(pageSource.includes("event.stopPropagation();"));
  assert.ok(!pageSource.includes("border-red-300/30 bg-red-500/10 p-3"));
});

test("CRM detail keeps close navigation and edit semantics without detail delete", () => {
  const shellBlock = pageSource.slice(
    pageSource.indexOf('<aside'),
    pageSource.indexOf('<div className="min-h-0 overflow-y-auto')
  );
  const headerBlock = shellBlock.slice(shellBlock.indexOf('<header className="theme-surface-strong'));
  assert.ok(shellBlock.includes('aria-label="Fechar"'));
  assert.ok(shellBlock.includes("absolute right-3 top-3 z-10"));
  assert.ok(headerBlock.includes('label={editingBasics ? "Cancelar edicao" : "Editar dados"}'));
  assert.ok(!headerBlock.includes("Excluir contato"));
  assert.ok(!headerBlock.includes('variant="destructive"'));
  assert.ok(!headerBlock.includes('aria-label="Fechar"'));
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
