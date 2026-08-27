import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMetaPublicWhatsappIdentityPayload,
  clearOperationalMetaWhatsappIdentity,
  readWhatsappPrimaryTransportFromConfig,
  resolveProviderConfirmedMetaPublicWhatsappIdentity,
  resolveHybridWhatsappIdentityStatus,
  resolveOperationalMetaWhatsappIdentity,
  resolveOperationalWhatsappDisplayIdentity,
  saveWhatsappPrimaryTransport,
  validateWebSessionNumberAgainstMeta,
} from "./hybridIdentity.js";

function makePrisma() {
  const state = {
    operationalConfigs: [] as Array<{ clientId: string; schemaVersion: number; config: unknown }>,
    metaConfigs: [] as Array<{
      clientId: string;
      phoneNumberId: string | null;
      wabaId?: string | null;
      businessToken?: string | null;
      rawPayload: unknown;
    }>,
    waPhoneNumbers: [] as Array<{ clientId: string; phoneNumberId: string; display: string | null }>,
    channelAccounts: [] as Array<{
      clientId: string;
      channel: string;
      provider: string;
      channelAccountId: string;
      status: string;
      runtimeEnabled: boolean;
      metadata: unknown;
    }>,
    events: [] as Array<{ clientId: string; requestId: string; eventName: string; payloadJson: unknown }>,
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
      update: async (args: { where: { clientId: string }; data: Partial<(typeof state.metaConfigs)[number]> }) => {
        const existing = state.metaConfigs.find((item) => item.clientId === args.where.clientId);
        if (!existing) throw new Error("not_found");
        Object.assign(existing, args.data);
        return existing;
      },
    },
    waPhoneNumber: {
      findFirst: async (args: { where: { clientId: string; phoneNumberId: string } }) =>
        state.waPhoneNumbers.find(
          (item) =>
            item.clientId === args.where.clientId &&
            item.phoneNumberId === args.where.phoneNumberId
        ) ?? null,
    },
    channelAccount: {
      findFirst: async (args: {
        where: {
          clientId: string;
          channel: string;
          provider: string;
          status?: { not: string };
          runtimeEnabled?: boolean;
        };
      }) =>
        state.channelAccounts.find(
          (item) =>
            item.clientId === args.where.clientId &&
            item.channel === args.where.channel &&
            item.provider === args.where.provider &&
            item.runtimeEnabled === args.where.runtimeEnabled &&
            (!args.where.status?.not || item.status !== args.where.status.not)
        ) ?? null,
    },
    event: {
      create: async (args: {
        data: { clientId: string; requestId: string; eventName: string; payloadJson: unknown };
      }) => {
        state.events.push(args.data);
        return args.data;
      },
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
    wabaId: `waba-${clientId}`,
    businessToken: `token-${clientId}`,
    rawPayload: { source: "unit_test", phoneNumber: { display_phone_number: display } },
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

function setWebAccount(
  prisma: ReturnType<typeof makePrisma>,
  clientId: string,
  number: string,
  state: "CONNECTED" | "DISCONNECTED" | "QR_REQUIRED" = "CONNECTED"
) {
  prisma.state.channelAccounts = prisma.state.channelAccounts.filter((item) => item.clientId !== clientId);
  prisma.state.channelAccounts.push({
    clientId,
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: number,
    status: state === "CONNECTED" ? "connected" : "pending",
    runtimeEnabled: true,
    metadata: { webSession: { observedState: state } },
  });
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

test("provider-confirmed Meta public identity preserves DDD and does not infer ninth digit", () => {
  assert.deepEqual(resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 84 9999-0001"), {
    rawDisplayPhoneNumber: "+55 84 9999-0001",
    canonicalNumber: "558499990001",
    maskedNumber: "****0001",
  });

  assert.equal(
    resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 11 9999-0001")?.canonicalNumber,
    "551199990001"
  );
  assert.notEqual(
    resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 84 9999-0001")?.canonicalNumber,
    resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 11 9999-0001")?.canonicalNumber
  );
  assert.notEqual(
    resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 84 9999-0001")?.canonicalNumber,
    resolveProviderConfirmedMetaPublicWhatsappIdentity("+55 84 99999-0001")?.canonicalNumber
  );
  assert.equal(resolveProviderConfirmedMetaPublicWhatsappIdentity(""), null);
  assert.equal(resolveProviderConfirmedMetaPublicWhatsappIdentity(null), null);
});

test("operational Meta identity prefers canonical public identity and falls back to legacy display", async () => {
  const prisma = makePrisma();
  prisma.state.metaConfigs.push({
    clientId: "canonical-meta",
    phoneNumberId: "phone-canonical-meta",
    wabaId: "waba-canonical-meta",
    businessToken: "token-canonical-meta",
    rawPayload: {
      source: "embedded_signup",
      publicWhatsappIdentity: buildMetaPublicWhatsappIdentityPayload("+55 84 9999-0006"),
      phoneNumber: { display_phone_number: "+55 84 9999-0007" },
    },
  });
  prisma.state.waPhoneNumbers.push({
    clientId: "canonical-meta",
    phoneNumberId: "phone-canonical-meta",
    display: "+55 84 9999-0008",
  });

  const canonical = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "canonical-meta",
  });

  assert.equal(canonical.configured, true);
  assert.equal(canonical.canonicalNumber, "558499990006");

  setMeta(prisma, "legacy-meta", "+55 84 9999-0009");
  const legacy = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "legacy-meta",
  });

  assert.equal(legacy.configured, true);
  assert.equal(legacy.canonicalNumber, "558499990009");
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

test("operational display prefers connected Web Session over residual Meta history", async () => {
  const prisma = makePrisma();
  prisma.state.metaConfigs.push({
    clientId: "demo-converta",
    phoneNumberId: "phone-residual",
    wabaId: "waba-residual",
    businessToken: "token-residual",
    rawPayload: {
      embeddedSignup: { phoneNumberId: "phone-residual", displayPhoneNumber: "+55 84 9999-5328" },
      enrich: { phoneNumber: { display_phone_number: "+55 84 9999-5328" } },
    },
  });
  prisma.state.waPhoneNumbers.push({
    clientId: "demo-converta",
    phoneNumberId: "phone-residual",
    display: "+55 84 9999-5328",
  });
  setWebAccount(prisma, "demo-converta", "558496712218");

  const identity = await resolveOperationalWhatsappDisplayIdentity({
    prisma: prisma as never,
    clientId: "demo-converta",
  });

  assert.equal(identity.provider, "web_session");
  assert.equal(identity.canonicalNumber, "558496712218");
  assert.equal(identity.maskedNumber, "****2218");
});

test("operational display does not expose authorized-only or historical WhatsApp numbers", async () => {
  const prisma = makePrisma();
  setWebAuthorization(prisma, "lab-websession", "558496712218");
  prisma.state.metaConfigs.push({
    clientId: "lab-websession",
    phoneNumberId: "phone-residual",
    wabaId: "waba-residual",
    businessToken: "token-residual",
    rawPayload: {
      embeddedSignup: { phoneNumberId: "phone-residual", displayPhoneNumber: "+55 84 9999-5328" },
    },
  });
  prisma.state.waPhoneNumbers.push({
    clientId: "lab-websession",
    phoneNumberId: "phone-residual",
    display: "+55 84 9999-5328",
  });

  const identity = await resolveOperationalWhatsappDisplayIdentity({
    prisma: prisma as never,
    clientId: "lab-websession",
  });

  assert.equal(identity.provider, "none");
  assert.equal(identity.canonicalNumber, null);
  assert.equal(identity.maskedNumber, null);
});

test("operational display reports Meta and matching hybrid identities", async () => {
  const prisma = makePrisma();
  setMeta(prisma, "meta-only", "+55 84 9999-0001");
  const metaOnly = await resolveOperationalWhatsappDisplayIdentity({
    prisma: prisma as never,
    clientId: "meta-only",
  });
  assert.equal(metaOnly.provider, "meta");
  assert.equal(metaOnly.canonicalNumber, "558499990001");
  assert.equal(metaOnly.maskedNumber, "****0001");

  setMeta(prisma, "hybrid", "+55 84 9999-0002");
  setWebAccount(prisma, "hybrid", "558499990002");
  const hybrid = await resolveOperationalWhatsappDisplayIdentity({
    prisma: prisma as never,
    clientId: "hybrid",
  });
  assert.equal(hybrid.provider, "hybrid");
  assert.equal(hybrid.canonicalNumber, "558499990002");
  assert.equal(hybrid.maskedNumber, "****0002");
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

test("cleared or partial Meta config is not treated as operational identity", async () => {
  const prisma = makePrisma();
  setMeta(prisma, "client-a", "+55 84 9999-0001");

  const cleared = await clearOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "client-a",
    actorUserId: "admin:test",
    requestId: "unit-test",
    reason: "admin_channel_account_removed",
  });
  assert.equal(cleared.cleared, true);

  const metaAfterRemoval = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "client-a",
  });
  assert.equal(metaAfterRemoval.configured, false);
  assert.equal(metaAfterRemoval.canonicalNumber, null);
  assert.equal(metaAfterRemoval.phoneNumberIdPresent, false);
  assert.equal(prisma.state.metaConfigs[0]?.rawPayload && typeof prisma.state.metaConfigs[0].rawPayload, "object");
  assert.equal(prisma.state.events[0]?.eventName, "whatsapp.meta.operational_identity_cleared");

  const webAfterRemoval = await validateWebSessionNumberAgainstMeta({
    prisma: prisma as never,
    clientId: "client-a",
    number: "+55 84 9999-0002",
  });
  assert.deepEqual(webAfterRemoval, { ok: true, canonicalNumber: "558499990002" });

  setMeta(prisma, "client-a", "+55 84 9999-0003");
  const metaAfterReconfigure = await resolveHybridWhatsappIdentityStatus({
    prisma: prisma as never,
    clientId: "client-a",
  });
  assert.equal(metaAfterReconfigure.logicalIdentity?.provider, "meta");
  assert.equal(metaAfterReconfigure.logicalIdentity?.canonicalNumber, "558499990003");

  prisma.state.metaConfigs.push({
    clientId: "partial-meta",
    phoneNumberId: "phone-partial",
    wabaId: null,
    businessToken: "token-partial",
    rawPayload: { phoneNumber: { display_phone_number: "+55 84 9999-0004" } },
  });
  prisma.state.waPhoneNumbers.push({
    clientId: "partial-meta",
    phoneNumberId: "phone-partial",
    display: "+55 84 9999-0004",
  });
  const partialMeta = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "partial-meta",
  });
  assert.equal(partialMeta.configured, false);
  assert.equal(partialMeta.canonicalNumber, null);
  assert.equal(partialMeta.phoneNumberIdPresent, true);

  prisma.state.metaConfigs.push({
    clientId: "residual-meta",
    phoneNumberId: "phone-residual",
    wabaId: "waba-residual",
    businessToken: "token-residual",
    rawPayload: {
      embeddedSignup: { phoneNumberId: "phone-residual", displayPhoneNumber: "+55 84 9999-0005" },
      enrich: { phoneNumber: { display_phone_number: "+55 84 9999-0005" } },
    },
  });
  prisma.state.waPhoneNumbers.push({
    clientId: "residual-meta",
    phoneNumberId: "phone-residual",
    display: "+55 84 9999-0005",
  });
  const residualMeta = await resolveOperationalMetaWhatsappIdentity({
    prisma: prisma as never,
    clientId: "residual-meta",
  });
  assert.equal(residualMeta.configured, false);
  assert.equal(residualMeta.canonicalNumber, null);
  assert.equal(residualMeta.phoneNumberIdPresent, true);
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
