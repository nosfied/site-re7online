import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/settings/crm/page.tsx"), "utf8");

test("CRM system NEW status keeps active locked without forcing campaign ineligibility", () => {
  assert.ok(pageSource.includes('const isSystemNew = status.id === "NEW";'));
  assert.ok(pageSource.includes("checked={isSystemNew ? true : status.isActive}"));
  assert.ok(pageSource.includes("disabled={isSystemNew}"));
  assert.ok(pageSource.includes("checked={status.campaignEligible}"));
  assert.ok(!pageSource.includes("checked={isSystemNew ? false : status.campaignEligible}"));
});

test("CRM settings uses expandable rows and separates CRM situation from active-send blocks", () => {
  assert.ok(pageSource.includes("expandedStatusId"));
  assert.ok(pageSource.includes("aria-expanded={isExpanded}"));
  assert.ok(pageSource.includes("aria-label={isExpanded ? \"Recolher linha\" : \"Expandir linha\"}"));
  assert.ok(pageSource.includes("Pode compor audiência de campanha"));
  assert.ok(pageSource.includes("Bloqueio de envio ativo, opt-out e retirada da operação continuam sendo regras separadas."));
});
