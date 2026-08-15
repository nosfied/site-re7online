import test from "node:test";
import assert from "node:assert/strict";
import {
  readWhatsappPrimaryTransportFromConfig,
  resolveHybridWhatsappIdentityStatus,
  resolveOperationalMetaWhatsappIdentity,
  saveWhatsappPrimaryTransport,
  validateWebSessionNumberAgainstMeta,
} from "./hybridIdentity.js";

function makePrisma() {
  const state = {
    operationalConfigs: [] as Array<{ clientId: string; schemaVersion: number; config: unknown }>,
    metaConfigs: [] as Array<{ clientId: string; phoneNumberId: string; rawPayload: unknown }>,
    waPhoneNumbers: [] as Array<{ clientId: string; phoneNumberId: string; display: string | null }>,
  };
  const prisma = {
    state,
    tenantOperationalConfig: {
      findUnique: async (args: { where: { clientId: string } }) =>
        state.operationalConfigs.find((item) => item.clientId === args.where.clientId) ?? null,
      upsert: async (args: {
        where: { clientId: string };
        update: { schemaVersion: number; config: unknown };
        create: { clientId: string; schemaVersion: number; config: unknown };
      }) => {
        const existing = state.operationalConfigs.find((item) => item.clientId === args.where.clientId);
        if (existing) {
          existing.schemaVersion = args.update.schemaVersion;
          existing.config = args.update.config;
          return existing;
        }
        state.operationalConfigs.push(args.create);
        return args.create;
      },
    },
    tenantMetaConfig: {
      findUnique: async (args: { where: { clientId: string } }) =>
        state.metaConfigs.find((item) => item.clientId === args.where.clientId) ?? null,
    },
    waPhoneNumber: {
      findFirst: async (args: { where: { clientId: string; phoneNumberId: string } }) =>
        state.waPhoneNumbers.find(
          (item) =>
            item.clientId === args.where.clientId &&
            item.phoneNumberId === args.where.phoneNumberId
        ) ?? null,
    },
  };
  return prisma;
}

function setMeta(prisma: ReturnType<typeof makePrisma>, clientId: string, display: string | null) {
  prisma.state.metaConfigs = prisma.state.metaConfigs.filter((item) => item.clientId !== clientId);
  prisma.state.waPhoneNumbers = prisma.state.waPhoneNumbers.filter((item) => item.clientId !== clientId);
  prisma.state.metaConfigs.push({
    clientId,
    phoneNumberId: `phone-${clientId}`,
    rawPayload: { phoneNumber: { display_phone_number: display } },
  });
  if (display) {
    prisma.state.waPhoneNumbers.push({
      clientId,
      phoneNumberId: `phone-${clientId}`,
      display,
    });
  }
}

function setWebAuthorization(prisma: ReturnType<typeof makePrisma>, clientId: string, number: string) {
  const existing = prisma.state.operationalConfigs.find((item) => item.clientId === clientId);
  const config = {
    ...((existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config))
      ? existing.config as Record<string, unknown>
      : {}),
    webSessionAuthorization: {
      status: "AUTHORIZED",
      authorizedNumberCanonical: number,
      authorizedNumberMasked: `****${number.slice(-4)}`,
      authorizedNumberHash: `hash-${number.slice(-4)}`,
      authorizedAt: "2026-08-15T00:00:00.000Z",
      authorizedBy: "unit-test",
    },
  };
  if (existing) existing.config = config;
  else prisma.state.operationalConfigs.push({ clientId, schemaVersion: 1, config });
}

test("operational Meta identity uses display number instead of phoneNumberId", async () => {
  const prisma = makePrisma();
  setMeta(prisma, "client-a", "+55 84 9999-0001");

  const meta = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "client-a",
  });

  assert.equal(meta.configured, true);
  assert.equal(meta.phoneNumberIdPresent, true);
  assert.equal(meta.canonicalNumber, "558499990001");
  assert.equal(meta.maskedNumber, "****0001");
});

test("hybrid logical identity resolves Meta only, Web only, matching hybrid and legacy mismatch", async () => {
  const prisma = makePrisma();

  setMeta(prisma, "meta-only", "+55 84 9999-0001");
  const metaOnly = await resolveHybridWhatsappIdentityStatus({
    prisma: prisma as never,
    clientId: "meta-only",
  });
  assert.equal(metaOnly.conflict, false);
  assert.equal(metaOnly.logicalIdentity?.provider, "meta");
  assert.equal(metaOnly.logicalIdentity?.canonicalNumber, "558499990001");

  setWebAuthorization(prisma, "web-only", "558499990002");
  const webOnly = await resolveHybridWhatsappIdentityStatus({
    prisma: prisma as never,
    clientId: "web-only",
  });
  assert.equal(webOnly.conflict, false);
  assert.equal(webOnly.logicalIdentity?.provider, "web_session");
  assert.equal(webOnly.logicalIdentity?.canonicalNumber, "558499990002");

  setMeta(prisma, "hybrid-match", "+55 84 9999-0003");
  setWebAuthorization(prisma, "hybrid-match", "558499990003");
  const hybridMatch = await resolveHybridWhatsappIdentityStatus({
    prisma: prisma as never,
    clientId: "hybrid-match",
  });
  assert.equal(hybridMatch.conflict, false);
  assert.equal(hybridMatch.logicalIdentity?.provider, "meta");
  assert.equal(hybridMatch.logicalIdentity?.canonicalNumber, "558499990003");

  setMeta(prisma, "legacy-mismatch", "+55 84 9999-0004");
  setWebAuthorization(prisma, "legacy-mismatch", "558499990005");
  const mismatch = await resolveHybridWhatsappIdentityStatus({
    prisma: prisma as never,
    clientId: "legacy-mismatch",
  });
  assert.equal(mismatch.conflict, true);
  assert.equal(mismatch.meta.canonicalNumber, "558499990004");
  assert.equal(mismatch.web.canonicalNumber, "558499990005");
});

test("web authorization is blocked only when operational Meta has a different logical number", async () => {
  const prisma = makePrisma();
  setMeta(prisma, "client-a", "+55 84 9999-0001");

  const sameNumber = await validateWebSessionNumberAgainstMeta({
    prisma: prisma as never,
    clientId: "client-a",
    number: "+55 84 9999-0001",
  });
  assert.deepEqual(sameNumber, { ok: true, canonicalNumber: "558499990001" });

  const differentNumber = await validateWebSessionNumberAgainstMeta({
    prisma: prisma as never,
    clientId: "client-a",
    number: "+55 84 9999-0002",
  });
  assert.equal(differentNumber.ok, false);
  if (!differentNumber.ok) {
    assert.equal(differentNumber.code, "web_session_meta_identity_mismatch");
    assert.equal(differentNumber.status, 409);
    assert.equal(differentNumber.metaNumberMasked, "****0001");
    assert.equal(differentNumber.webNumberMasked, "****0002");
  }

  const webFirst = await validateWebSessionNumberAgainstMeta({
    prisma: prisma as never,
    clientId: "no-meta",
    number: "+55 84 9999-0003",
  });
  assert.deepEqual(webFirst, { ok: true, canonicalNumber: "558499990003" });
});

test("primary transport config accepts only explicit known providers and preserves sibling config", async () => {
  const prisma = makePrisma();
  prisma.state.operationalConfigs.push({
    clientId: "client-a",
    schemaVersion: 1,
    config: { supportChannel: { mode: "human" } },
  });

  assert.equal(readWhatsappPrimaryTransportFromConfig({ whatsappPrimaryTransport: "meta" }), "meta");
  assert.equal(readWhatsappPrimaryTransportFromConfig({ whatsappPrimaryTransport: "web_session" }), "web_session");
  assert.equal(readWhatsappPrimaryTransportFromConfig({ whatsappPrimaryTransport: "unknown" }), null);

  await saveWhatsappPrimaryTransport({
    prisma: prisma as never,
    clientId: "client-a",
    provider: "web_session",
  });

  assert.deepEqual(prisma.state.operationalConfigs[0]?.config, {
    supportChannel: { mode: "human" },
    whatsappPrimaryTransport: "web_session",
  });
});
