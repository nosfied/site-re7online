import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTenantJsonRetirementOptions,
  selectTenantJsonRetirementTenants,
  tenantJsonRetirementReady,
} from "./tenantJsonRetirementSelection.js";

const tenants = [
  { clientKey: "tendencia-modas", ready: true },
  { clientKey: "outside-incomplete", ready: false },
  { clientKey: "cra-pr", ready: true },
  { clientKey: "justa-advocacia", ready: true },
];

test("CRA, Justa and Tendencia selection is deterministic and excludes outside debt", () => {
  const options = parseTenantJsonRetirementOptions([
    "--tenant", "tendencia-modas",
    "--tenant", "cra-pr",
    "--tenant", "justa-advocacia",
  ]);
  const selected = selectTenantJsonRetirementTenants({ tenants, selectedTenants: options.tenants });
  assert.deepEqual(selected.map((tenant) => tenant.clientKey), [
    "cra-pr",
    "justa-advocacia",
    "tendencia-modas",
  ]);
  assert.equal(selected.every((tenant) => tenant.ready), true);
  assert.equal(tenantJsonRetirementReady({
    databaseReachable: true,
    blockingUsageCount: 0,
    incompleteTenantCount: selected.filter((tenant) => !tenant.ready).length,
  }), true);
});

test("selected incomplete tenant blocks while an incomplete tenant outside the batch does not", () => {
  const outside = selectTenantJsonRetirementTenants({
    tenants,
    selectedTenants: ["cra-pr", "justa-advocacia", "tendencia-modas"],
  });
  assert.equal(outside.some((tenant) => !tenant.ready), false);
  const selected = selectTenantJsonRetirementTenants({ tenants, selectedTenants: ["outside-incomplete"] });
  assert.equal(tenantJsonRetirementReady({
    databaseReachable: true,
    blockingUsageCount: 0,
    incompleteTenantCount: selected.filter((tenant) => !tenant.ready).length,
  }), false);
});

test("unknown, empty and duplicate selectors fail closed", () => {
  assert.throws(
    () => selectTenantJsonRetirementTenants({ tenants, selectedTenants: ["unknown"] }),
    /TENANTS_JSON_RETIREMENT_TENANT_UNKNOWN:unknown/
  );
  assert.throws(
    () => parseTenantJsonRetirementOptions(["--tenant", ""]),
    /SELECTOR_EMPTY/
  );
  assert.throws(
    () => parseTenantJsonRetirementOptions(["--tenant", "cra-pr", "--tenant", "cra-pr"]),
    /SELECTOR_DUPLICATE:cra-pr/
  );
});

test("absence of selectors preserves the global set and global runtime usage remains blocking", () => {
  const options = parseTenantJsonRetirementOptions([]);
  assert.equal(options.tenants, undefined);
  assert.deepEqual(selectTenantJsonRetirementTenants({ tenants }), tenants);
  assert.equal(tenantJsonRetirementReady({
    databaseReachable: true,
    blockingUsageCount: 1,
    incompleteTenantCount: 0,
  }), false);
});
