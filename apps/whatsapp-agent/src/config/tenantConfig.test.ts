import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCrmBusinessStatuses } from "./tenantConfig.js";

test("CRM system NEW status is mandatory active and campaign eligible by default", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "NEW", label: "Novo", isActive: false, campaignEligible: true },
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
  ]);

  const systemNew = statuses.find((status) => status.id === "NEW");
  assert.ok(systemNew);
  assert.equal(systemNew.isActive, true);
  assert.equal(systemNew.campaignEligible, true);
});

test("CRM system NEW status is restored when tenant settings omit it", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "QUALIFIED", label: "Qualificado", isActive: true, campaignEligible: true },
  ]);

  assert.equal(statuses[0]?.id, "NEW");
  assert.equal(statuses[0]?.isActive, true);
  assert.equal(statuses[0]?.campaignEligible, true);
});

test("CRM system NEW status can only be made campaign-ineligible by explicit campaign setting", () => {
  const statuses = normalizeCrmBusinessStatuses([
    { id: "NEW", label: "Novo", isActive: false, campaignEligible: false },
  ]);

  assert.equal(statuses[0]?.id, "NEW");
  assert.equal(statuses[0]?.isActive, true);
  assert.equal(statuses[0]?.campaignEligible, false);
});

test("strict tenant reads distinguish absent configuration from read/parse failure without writing or trusting cache", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { getTenants } = await import("./tenantConfig.js");
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tenant-strict-read-"));
  process.chdir(dir);
  try {
    const missing = await getTenants({ strict: true });
    assert.ok(missing.default, "preserves current missing-file defaults");
    assert.deepEqual(await fs.readdir(dir), [], "read fallback must not write configuration");
    await fs.mkdir(".data");
    await fs.writeFile(".data/tenants.json", "{invalid");
    await getTenants(); // Existing non-strict readers may cache their env fallback.
    await assert.rejects(getTenants({ strict: true }), SyntaxError);
    await fs.writeFile(".data/tenants.json", JSON.stringify({ invalid: false }));
    await assert.rejects(getTenants({ strict: true }));
    await fs.unlink(".data/tenants.json");
    await fs.mkdir(".data/tenants.json");
    await assert.rejects(getTenants({ strict: true }));
    await fs.rmdir(".data/tenants.json");
    await fs.writeFile(".data/tenants.json", "{}");
    await assert.rejects(getTenants({ strict: true }), /empty_tenants/);
    const valid = { synthetic: { id: "synthetic", name: "Synthetic", metaPhoneNumberId: "local", allowlist: [], handoffAttendantWaid: "", defaultLanguage: "pt_BR" } };
    const raw = JSON.stringify(valid);
    await fs.writeFile(".data/tenants.json", raw);
    assert.equal((await getTenants({ strict: true })).synthetic.id, "synthetic");
    assert.equal(await fs.readFile(".data/tenants.json", "utf8"), raw);
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
