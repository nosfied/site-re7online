import assert from "node:assert/strict";
import test from "node:test";
import {
  isWhatsappFreeformStartTransportReady,
  resolveCrmContactConversationStartEligibility,
} from "./crmConversationStart.js";

function makePrisma(overrides: {
  primaryTransport?: "web_session" | "meta" | null;
  contactLifecycle?: string;
  channel?: string | null;
  outboundEnabled?: boolean;
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
        config: {
          whatsappPrimaryTransport: overrides.primaryTransport ?? "web_session",
        },
      }),
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

test("CRM start eligibility allows only active Web Session outbound transport", async () => {
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

  const meta = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ primaryTransport: "meta" }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "ADMIN",
  });
  assert.deepEqual(meta, { allowed: false, reason: "new_freeform_requires_model" });

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
