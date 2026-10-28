import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTenantOperationalConfigSelection,
  selectedTenantOperationalConfigKeys,
  validateTenantOperationalConfigPlan,
  type OwnerAuthorizedBaseConfig,
} from "./tenantOperationalConfigMigrationPlan.js";

const sourceSha256 = "a".repeat(64);
const craBaseConfig: OwnerAuthorizedBaseConfig = {
  allowlist: [],
  handoffAttendantWaid: "",
  defaultLanguage: "pt_BR",
  disableAutoReply: false,
};

function plan(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourceSha256,
    tenants: {
      "cra-pr": {
        provenance: "OWNER_AUTHORIZED_DB_IDENTITY",
        baseConfig: { ...craBaseConfig, allowlist: [...craBaseConfig.allowlist] },
      },
    },
    ...overrides,
  };
}

test("selection is ordered and rejects empty or duplicate selectors", () => {
  assert.deepEqual(
    normalizeTenantOperationalConfigSelection(["tendencia-modas", "cra-pr", "justa-advocacia"]),
    ["cra-pr", "justa-advocacia", "tendencia-modas"]
  );
  assert.throws(() => normalizeTenantOperationalConfigSelection([""]), /SELECTOR_EMPTY/);
  assert.throws(() => normalizeTenantOperationalConfigSelection(["cra-pr", "cra-pr"]), /SELECTOR_DUPLICATE:cra-pr/);
});

test("owner-authorized CRA plan is closed and linked to the historical source", () => {
  const validated = validateTenantOperationalConfigPlan({
    document: plan(),
    expectedSourceSha256: sourceSha256,
    sourceTenantKeys: ["tendencia-modas", "justa-advocacia"],
  });
  assert.deepEqual(
    selectedTenantOperationalConfigKeys({
      sourceTenantKeys: ["tendencia-modas", "justa-advocacia"],
      plan: validated,
      selectedTenants: ["tendencia-modas", "cra-pr", "justa-advocacia"],
    }),
    ["cra-pr", "justa-advocacia", "tendencia-modas"]
  );
  assert.throws(() => validateTenantOperationalConfigPlan({
    document: plan({ sourceSha256: "b".repeat(64) }),
    expectedSourceSha256: sourceSha256,
    sourceTenantKeys: [],
  }), /PLAN_SOURCE_SHA256_MISMATCH/);
});

test("CRA provenance, required base fields and forbidden AI payload fail closed", () => {
  const invalidProvenance = plan();
  invalidProvenance.tenants["cra-pr"].provenance = "HISTORICAL_SOURCE";
  assert.throws(() => validateTenantOperationalConfigPlan({ document: invalidProvenance, expectedSourceSha256: sourceSha256, sourceTenantKeys: [] }), /PROVENANCE_DENY/);

  const missingField = plan();
  delete (missingField.tenants["cra-pr"].baseConfig as Partial<typeof craBaseConfig>).defaultLanguage;
  assert.throws(() => validateTenantOperationalConfigPlan({ document: missingField, expectedSourceSha256: sourceSha256, sourceTenantKeys: [] }), /BASE_CONFIG_INVALID/);

  const withAi = plan();
  Object.assign(withAi.tenants["cra-pr"], { aiAssistantConfig: { aiAssistantEnabled: false } });
  assert.throws(() => validateTenantOperationalConfigPlan({ document: withAi, expectedSourceSha256: sourceSha256, sourceTenantKeys: [] }), /PLAN_ENTRY_INVALID/);
});

test("owner-authorized CRA WAIDs must already be canonical", () => {
  const validateBaseConfig = (baseConfig: typeof craBaseConfig) => validateTenantOperationalConfigPlan({
    document: {
      schemaVersion: 1,
      sourceSha256,
      tenants: {
        "cra-pr": { provenance: "OWNER_AUTHORIZED_DB_IDENTITY", baseConfig },
      },
    },
    expectedSourceSha256: sourceSha256,
    sourceTenantKeys: [],
  });

  assert.throws(() => validateBaseConfig({ ...craBaseConfig, allowlist: ["+55 84 9999-0000"] }), /BASE_CONFIG_INVALID/);
  assert.throws(() => validateBaseConfig({ ...craBaseConfig, allowlist: [""] }), /BASE_CONFIG_INVALID/);
  assert.throws(() => validateBaseConfig({ ...craBaseConfig, allowlist: ["558499990000", "558499990000"] }), /BASE_CONFIG_INVALID/);
  assert.doesNotThrow(() => validateBaseConfig({ ...craBaseConfig, allowlist: [] }));
  assert.doesNotThrow(() => validateBaseConfig({ ...craBaseConfig, handoffAttendantWaid: "" }));
  assert.throws(() => validateBaseConfig({ ...craBaseConfig, handoffAttendantWaid: "(84) 9999-0000" }), /BASE_CONFIG_INVALID/);
  assert.doesNotThrow(() => validateBaseConfig({
    ...craBaseConfig,
    allowlist: ["558499990000", "558498880000"],
    handoffAttendantWaid: "558497770000",
  }));
});

test("arbitrary external tenant and omitted tenant are denied or excluded", () => {
  const arbitrary = plan({
    tenants: {
      external: { provenance: "OWNER_AUTHORIZED_DB_IDENTITY", baseConfig: craBaseConfig },
    },
  });
  assert.throws(() => validateTenantOperationalConfigPlan({ document: arbitrary, expectedSourceSha256: sourceSha256, sourceTenantKeys: [] }), /EXTERNAL_TENANT_DENY:external/);
  const validated = validateTenantOperationalConfigPlan({ document: plan(), expectedSourceSha256: sourceSha256, sourceTenantKeys: ["justa-advocacia"] });
  assert.deepEqual(selectedTenantOperationalConfigKeys({
    sourceTenantKeys: ["justa-advocacia"],
    plan: validated,
    selectedTenants: ["justa-advocacia"],
  }), ["justa-advocacia"]);
  assert.throws(() => selectedTenantOperationalConfigKeys({
    sourceTenantKeys: ["justa-advocacia"],
    plan: validated,
    selectedTenants: ["unknown"],
  }), /TENANT_UNKNOWN:unknown/);
});

test("unfiltered selection preserves the complete historical source set", () => {
  assert.deepEqual(selectedTenantOperationalConfigKeys({
    sourceTenantKeys: ["second", "first"],
  }), ["second", "first"]);
});
