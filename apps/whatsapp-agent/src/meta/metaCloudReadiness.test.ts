import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMetaCloudReadiness,
  shouldBlockMetaCloudPhoneRegister,
  validateMetaCloudReadiness,
} from "./metaCloudReadiness.js";

function buildOperationalInput(overrides: Partial<Parameters<typeof evaluateMetaCloudReadiness>[0]> = {}) {
  return {
    tokenPresent: true,
    phoneNumberId: "phone-1",
    wabaId: "waba-1",
    phoneObject: {
      id: "phone-1",
      display_phone_number: "+55 84 99999-5328",
      status: "CONNECTED",
      code_verification_status: "VERIFIED",
      platform_type: "CLOUD_API",
      quality_rating: "GREEN",
    },
    wabaObject: { id: "waba-1", name: "Tenant Test" },
    wabaPhoneNumbers: [{ id: "phone-1", display_phone_number: "+55 84 99999-5328" }],
    phoneObjectAccess: true,
    wabaObjectAccess: true,
    expectedPublicIdentity: "5584999995328",
    checkedAt: "2026-08-28T12:00:00.000Z",
    ...overrides,
  } satisfies Parameters<typeof evaluateMetaCloudReadiness>[0];
}

test("Meta Cloud readiness rejects disconnected configured phone numbers", () => {
  const readiness = evaluateMetaCloudReadiness(
    buildOperationalInput({
      phoneObject: {
        id: "phone-1",
        display_phone_number: "+55 84 99999-5328",
        status: "DISCONNECTED",
        code_verification_status: "NOT_VERIFIED",
      },
    })
  );

  assert.equal(readiness.configured, true);
  assert.equal(readiness.operational, false);
  assert.equal(readiness.reason, "phone_disconnected");
  assert.equal(readiness.phoneStatus, "DISCONNECTED");
  assert.equal(readiness.adminStage, "ACTION_REQUIRED");
  assert.equal(shouldBlockMetaCloudPhoneRegister(readiness), true);
});

test("Meta Cloud readiness rejects object access failures", () => {
  const readiness = evaluateMetaCloudReadiness(
    buildOperationalInput({
      phoneObject: null,
      wabaObject: null,
      wabaPhoneNumbers: [],
      phoneObjectAccess: false,
      wabaObjectAccess: false,
    })
  );

  assert.equal(readiness.operational, false);
  assert.equal(readiness.reason, "object_access_failed");
  assert.equal(readiness.objectAccess, false);
  assert.equal(readiness.adminStage, "ACTION_REQUIRED");
  assert.equal(shouldBlockMetaCloudPhoneRegister(readiness), true);
});

test("Meta Cloud readiness accepts fully operational Graph state", () => {
  const readiness = evaluateMetaCloudReadiness(buildOperationalInput());

  assert.equal(readiness.operational, true);
  assert.equal(readiness.objectAccess, true);
  assert.equal(readiness.phoneBelongsToWaba, true);
  assert.equal(readiness.publicIdentity?.maskedNumber, "****5328");
  assert.equal(readiness.adminStage, "OPERATIONAL");
});

test("Meta Cloud readiness allows direct register only for Graph-confirmed Cloud API numbers", () => {
  const cloudOnly = evaluateMetaCloudReadiness(
    buildOperationalInput({
      phoneObject: {
        id: "phone-1",
        display_phone_number: "+55 84 99999-5328",
        status: "DISCONNECTED",
        code_verification_status: "NOT_VERIFIED",
        platform_type: "CLOUD_API",
      },
    })
  );

  assert.equal(cloudOnly.adminStage, "ACTION_REQUIRED");
  assert.equal(shouldBlockMetaCloudPhoneRegister(cloudOnly), false);

  const unknownPlatform = evaluateMetaCloudReadiness(
    buildOperationalInput({
      phoneObject: {
        id: "phone-1",
        display_phone_number: "+55 84 99999-5328",
        status: "DISCONNECTED",
        code_verification_status: "NOT_VERIFIED",
      },
    })
  );

  assert.equal(unknownPlatform.adminStage, "ACTION_REQUIRED");
  assert.equal(shouldBlockMetaCloudPhoneRegister(unknownPlatform), true);
});

test("Meta Cloud readiness persists tenant-scoped snapshot only for requested client", async () => {
  const calls: Array<{ model: string; where: unknown }> = [];
  const prisma = {
    tenantMetaConfig: {
      findUnique: async (args: { where: { clientId: string } }) => {
        calls.push({ model: "tenantMetaConfig.findUnique", where: args.where });
        assert.equal(args.where.clientId, "client-a");
        return {
          businessToken: "token-a",
          phoneNumberId: "phone-a",
          wabaId: "waba-a",
          rawPayload: {
            publicWhatsappIdentity: {
              canonicalNumber: "5584999995328",
            },
          },
        };
      },
      update: async (args: { where: { clientId: string }; data: { rawPayload: unknown } }) => {
        calls.push({ model: "tenantMetaConfig.update", where: args.where });
        assert.equal(args.where.clientId, "client-a");
        assert.equal(
          (args.data.rawPayload as { metaReadiness?: { operational?: boolean } }).metaReadiness?.operational,
          true
        );
        return {};
      },
    },
  };
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/phone-a?")) {
      return Response.json({
        id: "phone-a",
        display_phone_number: "+55 84 99999-5328",
        status: "CONNECTED",
        code_verification_status: "VERIFIED",
        platform_type: "CLOUD_API",
        quality_rating: "GREEN",
      });
    }
    if (url.includes("/waba-a/phone_numbers")) {
      return Response.json({ data: [{ id: "phone-a", display_phone_number: "+55 84 99999-5328" }] });
    }
    if (url.includes("/waba-a?")) {
      return Response.json({ id: "waba-a", name: "Tenant A" });
    }
    return Response.json({ error: "unexpected" }, { status: 404 });
  };

  const readiness = await validateMetaCloudReadiness({
    prisma: prisma as never,
    clientId: "client-a",
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.equal(readiness.operational, true);
  assert.deepEqual(calls.map((call) => call.model), ["tenantMetaConfig.findUnique", "tenantMetaConfig.update"]);
});
