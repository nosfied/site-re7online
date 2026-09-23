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
