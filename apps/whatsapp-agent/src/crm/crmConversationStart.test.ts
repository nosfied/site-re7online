import assert from "node:assert/strict";
import test from "node:test";
import {
  isWhatsappFreeformStartTransportReady,
  resolveEffectiveWhatsappOutboundTransport,
  resolveCrmContactConversationStartEligibility,
} from "./crmConversationStart.js";

function makePrisma(overrides: {
  primaryTransport?: "web_session" | "meta" | null;
  contactLifecycle?: string;
  channel?: string | null;
  outboundEnabled?: boolean;
  metaOperational?: boolean;
  optOut?: boolean;
} = {}) {
  const lead = {
    id: "lead-1",
    waId: "558499990001",
    waIdCanonical: "558499990001",
    phone: "558499990001",
    name: "Maria CRM",
    channel: overrides.channel ?? "whatsapp",
    contactChannelIdentityId: null,
  };
  const contact = {
    id: "contact-1",
    name: "Maria CRM",
    lifecycle: overrides.contactLifecycle ?? "ACTIVE",
  };
  return {
    lead: {
      findFirst: async () => lead,
    },
    contactChannelIdentity: {
      findFirst: async () => null,
    },
    contact: {
      findFirst: async () => contact,
    },
    tenantOperationalConfig: {
      findUnique: async () => ({
        config:
          overrides.primaryTransport === null
            ? {}
            : {
                whatsappPrimaryTransport: overrides.primaryTransport ?? "web_session",
              },
      }),
    },
    tenantMetaConfig: {
      findUnique: async () =>
        overrides.metaOperational
          ? {
              phoneNumberId: "meta-phone-1",
              wabaId: "waba-1",
              businessToken: "token-1",
              rawPayload: {
                source: "unit_test",
                phoneNumber: { display_phone_number: "+55 84 99990-0001" },
              },
            }
          : null,
    },
    waPhoneNumber: {
      findFirst: async () =>
        overrides.metaOperational
          ? {
              display: "+55 84 99990-0001",
            }
          : null,
    },
    channelAccount: {
      findFirst: async () => ({
        id: "account-1",
        clientId: "client-1",
        channel: "whatsapp",
        provider: "web_session",
        channelAccountId: "web-session-1",
        enabled: true,
        outboundEnabled: overrides.outboundEnabled ?? true,
        runtimeEnabled: true,
        status: "connected",
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
        client: {
          id: "client-1",
          clientKey: "tenant-1",
          status: "ACTIVE",
          features: { whatsappWebSession: true },
        },
      }),
    },
    event: {
      findMany: async () =>
        overrides.optOut
          ? [
              {
                waId: "558499990001",
                waIdCanonical: "558499990001",
                eventName: "contact.opt_out.recorded",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ]
          : [],
    },
  };
}

test("effective WhatsApp outbound transport honors explicit primary and legacy single transport fallback", async () => {
  const explicitWeb = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "web_session", outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitWeb, { status: "ready", provider: "web_session", source: "explicit" });

  const explicitMeta = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "meta", outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitMeta, { status: "ready", provider: "meta", source: "explicit" });

  const webOnly = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: false }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(webOnly, { status: "ready", provider: "web_session", source: "single_operational" });

  const metaOnly = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: false, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaOnly, { status: "ready", provider: "meta", source: "single_operational" });

  const both = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(both, { status: "ambiguous", source: "multiple_operational" });

  const none = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: false, metaOperational: false }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(none, { status: "unavailable", source: "none_operational" });

  const explicitWebUnavailable = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "web_session", outboundEnabled: false, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitWebUnavailable, { status: "unavailable", source: "explicit_unavailable" });
});

test("CRM start eligibility allows active Web Session explicit primary or legacy single transport", async () => {
  const allowed = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma() as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "SUPERVISOR",
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.allowed && allowed.waIdCanonical, "558499990001");

  const legacyWebOnly = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: false }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "SUPERVISOR",
  });
  assert.equal(legacyWebOnly.allowed, true);
  assert.equal(legacyWebOnly.allowed && legacyWebOnly.waIdCanonical, "558499990001");

  const meta = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ primaryTransport: "meta", metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "ADMIN",
  });
  assert.deepEqual(meta, { allowed: false, reason: "new_freeform_requires_model" });

  const ambiguous = await isWhatsappFreeformStartTransportReady({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(ambiguous, { allowed: false, reason: "new_freeform_requires_model" });

  const noOutbound = await isWhatsappFreeformStartTransportReady({
    prisma: makePrisma({ outboundEnabled: false }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(noOutbound, { allowed: false, reason: "channel_unavailable" });
});

test("CRM start eligibility blocks non-authorized, provisional, non-WhatsApp, and opted-out contacts", async () => {
  const agent = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma() as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "AGENT",
  });
  assert.deepEqual(agent, { allowed: false, reason: "not_authorized" });

  const provisional = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ contactLifecycle: "PROVISIONAL" }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "SUPERVISOR",
  });
  assert.deepEqual(provisional, { allowed: false, reason: "contact_not_active" });

  const instagram = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ channel: "instagram" }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "ADMIN",
  });
  assert.deepEqual(instagram, { allowed: false, reason: "invalid_identity" });

  const optOut = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ optOut: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "ADMIN",
  });
  assert.deepEqual(optOut, { allowed: false, reason: "active_send_blocked" });
});
