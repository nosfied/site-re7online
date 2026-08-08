import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaTenantReadinessReport,
  buildMetaTenantReadinessSummary,
  maskMetaReadinessIdentifier,
  type MetaTenantReadinessCheck,
} from "./metaTenantReadiness.js";

type ModelName =
  | "client"
  | "tenantMetaConfig"
  | "waPhoneNumber"
  | "channelAccount";

type Delegate = {
  findUnique?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown[]>;
  count?: (args: unknown) => Promise<number>;
};

function prismaStub(delegates: Record<ModelName, Delegate>) {
  return delegates as never;
}

test("maskMetaReadinessIdentifier keeps only length and last four digits", () => {
  const masked = maskMetaReadinessIdentifier("+55 84 99999-6787");

  assert.equal(masked, "****6787 (len 13)");
  assert.ok(!masked?.includes("5584"));
  assert.ok(!masked?.includes("99999"));
});

test("buildMetaTenantReadinessReport returns OK with minimum tenant-scoped WhatsApp config", async () => {
  const report = await buildMetaTenantReadinessReport({
    prisma: prismaStub({
      client: {
        findUnique: async () => ({
          id: "tenant-a-id",
          clientKey: "tenant-a",
          name: "Tenant A",
          status: "ACTIVE",
        }),
      },
      tenantMetaConfig: {
        findUnique: async () => ({
          businessToken: "secret-token",
          phoneNumberId: "1234567890123456",
          wabaId: "9876543210987654",
          businessId: "112233445566",
          businessPortfolioId: "112233445566",
          updatedAt: new Date("2026-08-08T12:00:00Z"),
        }),
      },
      waPhoneNumber: {
        findMany: async () => [
          { phoneNumberId: "1234567890123456", display: "+55 84 99999-6787" },
        ],
        findUnique: async () => ({
          clientId: "tenant-a-id",
          client: { clientKey: "tenant-a" },
        }),
      },
      channelAccount: { count: async () => 0 },
    }),
    tenantKey: "tenant-a",
    now: new Date("2026-08-08T12:00:00Z"),
  });

  assert.equal(report.whatsappReadiness, "WARN");
  assert.equal(report.checks.find((check) => check.id === "channel_account_whatsapp")?.status, "WARN");
  assert.equal(report.checks.find((check) => check.id === "meta_config")?.status, "OK");
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("secret-token"));
  assert.ok(!serialized.includes("+55 84 99999-6787"));
  assert.ok(!serialized.includes("1234567890123456"));
});

test("buildMetaTenantReadinessReport classifies partial bind without WABA", async () => {
  const report = await buildMetaTenantReadinessReport({
    prisma: prismaStub({
      client: {
        findUnique: async () => ({
          id: "tenant-a-id",
          clientKey: "tenant-a",
          name: "Tenant A",
          status: "ACTIVE",
        }),
      },
      tenantMetaConfig: {
        findUnique: async () => ({
          businessToken: "secret-token",
          phoneNumberId: "1234567890123456",
          wabaId: null,
          businessId: null,
          businessPortfolioId: null,
          updatedAt: new Date("2026-08-08T12:00:00Z"),
        }),
      },
      waPhoneNumber: {
        findMany: async () => [{ phoneNumberId: "1234567890123456", display: null }],
        findUnique: async () => ({
          clientId: "tenant-a-id",
          client: { clientKey: "tenant-a" },
        }),
      },
      channelAccount: { count: async () => 0 },
    }),
    tenantKey: "tenant-a",
  });

  assert.equal(report.whatsappReadiness, "PARTIAL");
  assert.equal(report.checks.find((check) => check.id === "meta_config")?.status, "PARTIAL");
  assert.equal(report.checks.find((check) => check.id === "waba")?.status, "PARTIAL");
});

test("buildMetaTenantReadinessReport fails missing token, missing phone mapping and cross-tenant ownership", async () => {
  const missingToken = await buildMetaTenantReadinessReport({
    prisma: prismaStub({
      client: {
        findUnique: async () => ({
          id: "tenant-a-id",
          clientKey: "tenant-a",
          name: "Tenant A",
          status: "ACTIVE",
        }),
      },
      tenantMetaConfig: {
        findUnique: async () => ({
          businessToken: "",
          phoneNumberId: "1234567890123456",
          wabaId: "9876543210987654",
          businessId: null,
          businessPortfolioId: null,
          updatedAt: null,
        }),
      },
      waPhoneNumber: {
        findMany: async () => [],
        findUnique: async () => null,
      },
      channelAccount: { count: async () => 0 },
    }),
    tenantKey: "tenant-a",
  });
  assert.equal(missingToken.whatsappReadiness, "FAIL");
  assert.equal(missingToken.checks.find((check) => check.id === "meta_config")?.status, "FAIL");
  assert.equal(missingToken.checks.find((check) => check.id === "wa_phone_number")?.status, "FAIL");

  const ownershipConflict = await buildMetaTenantReadinessReport({
    prisma: prismaStub({
      client: {
        findUnique: async () => ({
          id: "tenant-a-id",
          clientKey: "tenant-a",
          name: "Tenant A",
          status: "ACTIVE",
        }),
      },
      tenantMetaConfig: {
        findUnique: async () => ({
          businessToken: "secret-token",
          phoneNumberId: "1234567890123456",
          wabaId: "9876543210987654",
          businessId: null,
          businessPortfolioId: null,
          updatedAt: null,
        }),
      },
      waPhoneNumber: {
        findMany: async () => [{ phoneNumberId: "1234567890123456", display: null }],
        findUnique: async () => ({
          clientId: "tenant-b-id",
          client: { clientKey: "tenant-b" },
        }),
      },
      channelAccount: { count: async () => 0 },
    }),
    tenantKey: "tenant-a",
  });
  assert.equal(ownershipConflict.whatsappReadiness, "FAIL");
  assert.equal(
    ownershipConflict.checks.find((check) => check.id === "wa_phone_number")?.message,
    "phoneNumberId configurado pertence a outro tenant."
  );
});

test("buildMetaTenantReadinessSummary prioritizes FAIL then PARTIAL then WAITING_EXTERNAL then WARN", () => {
  const checks: MetaTenantReadinessCheck[] = [
    { id: "ok", label: "OK", status: "OK", message: "ok" },
    { id: "external", label: "External", status: "WAITING_EXTERNAL", message: "wait" },
    { id: "warn", label: "Warn", status: "WARN", message: "warn" },
  ];
  assert.equal(buildMetaTenantReadinessSummary(checks).whatsappReadiness, "WAITING_EXTERNAL");

  checks.push({ id: "partial", label: "Partial", status: "PARTIAL", message: "partial" });
  assert.equal(buildMetaTenantReadinessSummary(checks).whatsappReadiness, "PARTIAL");

  checks.push({ id: "fail", label: "Fail", status: "FAIL", message: "fail" });
  assert.equal(buildMetaTenantReadinessSummary(checks).whatsappReadiness, "FAIL");
});
