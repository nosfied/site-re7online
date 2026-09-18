import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");
const inboxSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/inbox/page.tsx"), "utf8");
const appShellSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/AppShell.tsx"), "utf8");

test("campaign center exposes persisted lifecycle tabs", () => {
  assert.ok(pageSource.includes('{ id: "sending", label: "Enviando" }'));
  assert.ok(pageSource.includes('{ id: "scheduled", label: "Agendadas" }'));
  assert.ok(pageSource.includes('{ id: "completed", label: "Concluídas" }'));
  assert.ok(pageSource.includes('case "sending":'));
  assert.ok(pageSource.includes('case "scheduled":'));
});

test("campaign progress modal observes backend state and can be closed", () => {
  assert.ok(pageSource.includes('selectedCampaign?.status !== "sending"'));
  assert.ok(pageSource.includes("refreshCampaignDetail(session, selectedCampaignId)"));
  assert.ok(pageSource.includes("refreshCampaigns(session, selectedCampaignId)"));
  assert.ok(pageSource.includes('onClick={() => setDetailModalOpen(false)}'));
  assert.ok(pageSource.includes('setActiveTab("sending")'));
  assert.ok(!pageSource.includes("startCampaignRun("));
});

test("customer campaign and inbox surfaces do not render financial estimates", () => {
  for (const forbidden of ["formatUsd", "CostPreviewCard", "Unitário estimado", "Total estimado", "formatBillingValue"]) {
    assert.ok(!pageSource.includes(forbidden), `campaign page still contains ${forbidden}`);
  }
  for (const forbidden of ["formatMetaUsd", "InboxCostPreview", "Unitário:", "Estimado:"]) {
    assert.ok(!inboxSource.includes(forbidden), `inbox page still contains ${forbidden}`);
  }
});

test("campaign destination remains department-only in standard flow", () => {
  assert.ok(pageSource.includes('<span className="text-white/70">Setor</span>'));
  assert.ok(pageSource.includes('type: "human_department"'));
  assert.ok(!pageSource.includes("Selecionar fila"));
  assert.ok(!pageSource.includes("returnQueueId"));
});

test("campaign result renders explicit blocked and skipped recipient states", () => {
  assert.ok(pageSource.includes('case "blocked":'));
  assert.ok(pageSource.includes('return "Bloqueada"'));
  assert.ok(pageSource.includes('case "skipped":'));
  assert.ok(pageSource.includes('return "Ignorada"'));
});

test("app shell keeps mobile title and content below the variable-height navigation", () => {
  assert.ok(appShellSource.includes("relative z-50 mx-auto w-full"));
  assert.ok(appShellSource.includes("sm:fixed sm:left-4"));
  assert.ok(appShellSource.includes('"hidden sm:block sm:h-[244px]'));
});
