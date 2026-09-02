import assert from "node:assert/strict";
import test from "node:test";
import {
  isWhatsappFreeformStartTransportReady,
  resolveConfiguredWhatsappTenantMode,
  resolveEffectiveWhatsappOutboundTransport,
  resolveCrmContactConversationStartEligibility,
  resolveWhatsappTemplateOutboundTransport,
} from "./crmConversationStart.js";

function makePrisma(overrides: {
  primaryTransport?: "web_session" | "meta" | null;
  contactLifecycle?: string;
  channel?: string | null;
  webConfigured?: boolean;
  runtimeEnabled?: boolean;
  outboundEnabled?: boolean;
  metaConfigured?: boolean;
  metaOperational?: boolean;
  whatsappTransports?: {
    meta?: { enabledForRouting: boolean };
    webSession?: { enabledForRouting: boolean };
  };
  allowInteractiveContactStartViaWebSession?: boolean;
  optOut?: boolean;
  operationallyExcluded?: boolean;
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
    waId: "558499990001",
    externalUserRef: "558499990001",
    legacyWaId: "558499990001",
    operationallyExcludedAt: overrides.operationallyExcluded ? new Date("2026-08-26T10:00:00.000Z") : null,
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
      findMany: async () => (overrides.operationallyExcluded ? [contact] : []),
    },
    tenantOperationalConfig: {
      findUnique: async () => ({
        config:
          overrides.primaryTransport === null
            ? {
                ...(overrides.allowInteractiveContactStartViaWebSession === true
                  ? { allowInteractiveContactStartViaWebSession: true }
                  : {}),
                ...(overrides.whatsappTransports
                  ? { whatsappTransports: overrides.whatsappTransports }
                  : {}),
              }
            : {
                whatsappPrimaryTransport: overrides.primaryTransport ?? "web_session",
                ...(overrides.allowInteractiveContactStartViaWebSession === true
                  ? { allowInteractiveContactStartViaWebSession: true }
                  : {}),
                ...(overrides.whatsappTransports
                  ? { whatsappTransports: overrides.whatsappTransports }
                  : {}),
              },
      }),
    },
    tenantMetaConfig: {
      findUnique: async () =>
        overrides.metaConfigured === false
          ? null
          : overrides.metaConfigured === true || overrides.metaOperational
          ? {
              phoneNumberId: "meta-phone-1",
              wabaId: "waba-1",
              businessToken: "token-1",
              rawPayload: {
                ...(overrides.metaOperational ? { source: "unit_test" } : {}),
                ...(overrides.metaOperational
                  ? { phoneNumber: { display_phone_number: "+55 84 99990-0001" } }
                  : {}),
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
      findFirst: async () =>
        overrides.webConfigured === false
          ? null
          : {
              id: "account-1",
              clientId: "client-1",
              channel: "whatsapp",
              provider: "web_session",
              channelAccountId: "web-session-1",
              enabled: true,
              outboundEnabled: overrides.outboundEnabled ?? true,
              runtimeEnabled: overrides.runtimeEnabled ?? true,
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
            },
    },
    event: {
      findMany: async () => {
        return overrides.optOut
          ? [
              {
                waId: "558499990001",
                waIdCanonical: "558499990001",
                eventName: "contact.opt_out.recorded",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ]
          : [];
      },
    },
  };
}

test("configured WhatsApp mode keeps backward-compatible defaults without routing policy", async () => {
  const hybrid = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
  });
  assert.equal(hybrid.mode, "HYBRID");
  assert.equal(hybrid.webConfigured, true);
  assert.equal(hybrid.metaConfigured, true);

  const cloudOnly = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: true,
      metaOperational: true,
    }) as never,
    clientId: "client-1",
  });
  assert.equal(cloudOnly.mode, "CLOUD_ONLY");

  const webOnly = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: false }) as never,
    clientId: "client-1",
  });
  assert.equal(webOnly.mode, "WEB_ONLY");
});

test("configured WhatsApp mode honors explicit non-destructive routing toggles", async () => {
  const cloudOnly = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: true },
        webSession: { enabledForRouting: false },
      },
    }) as never,
    clientId: "client-1",
  });
  assert.deepEqual(
    {
      mode: cloudOnly.mode,
      webConfigured: cloudOnly.webConfigured,
      metaConfigured: cloudOnly.metaConfigured,
      webTechnicallyConfigured: cloudOnly.webTechnicallyConfigured,
      metaTechnicallyConfigured: cloudOnly.metaTechnicallyConfigured,
      webEnabledForRouting: cloudOnly.webEnabledForRouting,
      metaEnabledForRouting: cloudOnly.metaEnabledForRouting,
    },
    {
      mode: "CLOUD_ONLY",
      webConfigured: false,
      metaConfigured: true,
      webTechnicallyConfigured: true,
      metaTechnicallyConfigured: true,
      webEnabledForRouting: false,
      metaEnabledForRouting: true,
    }
  );

  const webOnly = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: false },
        webSession: { enabledForRouting: true },
      },
    }) as never,
    clientId: "client-1",
  });
  assert.equal(webOnly.mode, "WEB_ONLY");

  const none = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: false },
        webSession: { enabledForRouting: false },
      },
    }) as never,
    clientId: "client-1",
  });
  assert.equal(none.mode, "NONE");
});

test("configured WhatsApp mode separates technical Web configuration from legacy routing default", async () => {
  const legacyRuntimeOff = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      runtimeEnabled: false,
      metaConfigured: false,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
  });
  assert.equal(legacyRuntimeOff.webTechnicallyConfigured, true);
  assert.equal(legacyRuntimeOff.webEnabledForRouting, false);
  assert.equal(legacyRuntimeOff.mode, "NONE");

  const explicitlyEnabledRuntimeOff = await resolveConfiguredWhatsappTenantMode({
    prisma: makePrisma({
      primaryTransport: null,
      runtimeEnabled: false,
      metaConfigured: false,
      metaOperational: false,
      whatsappTransports: {
        webSession: { enabledForRouting: true },
      },
    }) as never,
    clientId: "client-1",
  });
  assert.equal(explicitlyEnabledRuntimeOff.webTechnicallyConfigured, true);
  assert.equal(explicitlyEnabledRuntimeOff.webEnabledForRouting, true);
  assert.equal(explicitlyEnabledRuntimeOff.mode, "WEB_ONLY");
});

test("effective WhatsApp outbound transport honors explicit primary and legacy single transport fallback", async () => {
  const explicitWeb = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "web_session", outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitWeb, {
    status: "ready",
    provider: "web_session",
    source: "explicit",
    configuredMode: "HYBRID",
  });

  const explicitMeta = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "meta", outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitMeta, {
    status: "ready",
    provider: "meta",
    source: "explicit",
    configuredMode: "HYBRID",
  });

  const webOnly = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: false }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(webOnly, {
    status: "ready",
    provider: "web_session",
    source: "configured_web_only",
    configuredMode: "WEB_ONLY",
  });

  const metaOnly = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: true,
      metaOperational: true,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaOnly, {
    status: "ready",
    provider: "meta",
    source: "configured_cloud_only",
    configuredMode: "CLOUD_ONLY",
  });

  const hybridAuto = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(hybridAuto, {
    status: "ready",
    provider: "web_session",
    source: "hybrid_auto",
    configuredMode: "HYBRID",
  });

  const degradedHybrid = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: false,
      metaConfigured: true,
      metaOperational: true,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(degradedHybrid, {
    status: "unavailable",
    source: "configured_unavailable",
    configuredMode: "HYBRID",
  });

  const metaDownHybrid = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaConfigured: true,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaDownHybrid, {
    status: "ready",
    provider: "web_session",
    source: "hybrid_auto",
    configuredMode: "HYBRID",
  });

  const bothDownHybrid = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: false,
      metaConfigured: true,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(bothDownHybrid, {
    status: "unavailable",
    source: "configured_unavailable",
    configuredMode: "HYBRID",
  });

  const webRoutingDisabled = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: true },
        webSession: { enabledForRouting: false },
      },
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(webRoutingDisabled, {
    status: "ready",
    provider: "meta",
    source: "configured_cloud_only",
    configuredMode: "CLOUD_ONLY",
  });

  const metaRoutingDisabled = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: false },
        webSession: { enabledForRouting: true },
      },
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaRoutingDisabled, {
    status: "ready",
    provider: "web_session",
    source: "configured_web_only",
    configuredMode: "WEB_ONLY",
  });

  const none = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: false,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(none, { status: "unavailable", source: "none_operational", configuredMode: "NONE" });

  const explicitWebUnavailable = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({ primaryTransport: "web_session", outboundEnabled: false, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitWebUnavailable, {
    status: "unavailable",
    source: "explicit_unavailable",
    configuredMode: "HYBRID",
  });

  const explicitMetaUnavailable = await resolveEffectiveWhatsappOutboundTransport({
    prisma: makePrisma({
      primaryTransport: "meta",
      outboundEnabled: true,
      metaConfigured: true,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(explicitMetaUnavailable, {
    status: "unavailable",
    source: "explicit_unavailable",
    configuredMode: "HYBRID",
  });
});

test("template outbound transport is Meta-only by configured tenant mode", async () => {
  const metaOnly = await resolveWhatsappTemplateOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: true,
      metaOperational: true,
    }) as never,
    clientId: "client-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaOnly, {
    status: "ready",
    provider: "meta",
    source: "configured_cloud_only",
    configuredMode: "CLOUD_ONLY",
  });

  const hybrid = await resolveWhatsappTemplateOutboundTransport({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(hybrid, {
    status: "ready",
    provider: "meta",
    source: "hybrid_template",
    configuredMode: "HYBRID",
  });

  const webOnly = await resolveWhatsappTemplateOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      whatsappTransports: {
        meta: { enabledForRouting: false },
        webSession: { enabledForRouting: true },
      },
    }) as never,
    clientId: "client-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(webOnly, {
    status: "unavailable",
    source: "configured_unavailable",
    configuredMode: "WEB_ONLY",
    reason: "web_only",
  });

  const none = await resolveWhatsappTemplateOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: false,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(none, {
    status: "unavailable",
    source: "none_operational",
    configuredMode: "NONE",
    reason: "none",
  });

  const metaUnavailable = await resolveWhatsappTemplateOutboundTransport({
    prisma: makePrisma({
      primaryTransport: null,
      webConfigured: false,
      metaConfigured: true,
      metaOperational: false,
    }) as never,
    clientId: "client-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(metaUnavailable, {
    status: "unavailable",
    source: "configured_unavailable",
    configuredMode: "CLOUD_ONLY",
    reason: "meta_not_operational",
  });
});

test("CRM start eligibility requires explicit policy for Web Session freeform contact start", async () => {
  const blockedByDefault = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma() as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "SUPERVISOR",
  });
  assert.deepEqual(blockedByDefault, { allowed: false, reason: "new_freeform_requires_model" });

  const allowed = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ allowInteractiveContactStartViaWebSession: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "SUPERVISOR",
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.allowed && allowed.waIdCanonical, "558499990001");

  const legacyWebOnly = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: false,
      allowInteractiveContactStartViaWebSession: true,
    }) as never,
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

  const hybridDefault = await isWhatsappFreeformStartTransportReady({
    prisma: makePrisma({ primaryTransport: null, outboundEnabled: true, metaOperational: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(hybridDefault, { allowed: false, reason: "new_freeform_requires_model" });

  const noOutbound = await isWhatsappFreeformStartTransportReady({
    prisma: makePrisma({ outboundEnabled: false, allowInteractiveContactStartViaWebSession: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(noOutbound, { allowed: false, reason: "channel_unavailable" });

  const webRoutingOff = await isWhatsappFreeformStartTransportReady({
    prisma: makePrisma({
      primaryTransport: null,
      outboundEnabled: true,
      metaOperational: true,
      allowInteractiveContactStartViaWebSession: true,
      whatsappTransports: {
        meta: { enabledForRouting: true },
        webSession: { enabledForRouting: false },
      },
    }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
  });
  assert.deepEqual(webRoutingOff, { allowed: false, reason: "new_freeform_requires_model" });
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

  const excluded = await resolveCrmContactConversationStartEligibility({
    prisma: makePrisma({ operationallyExcluded: true }) as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    clientStatus: "ACTIVE",
    leadId: "lead-1",
    actorRole: "ADMIN",
  });
  assert.deepEqual(excluded, { allowed: false, reason: "contact_operationally_excluded" });
});
