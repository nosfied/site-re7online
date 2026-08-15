import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsentTextHash,
  getContactConsentState,
  normalizeConsentPurpose,
  recordContactConsent,
  revokeContactConsent,
} from "./contactConsent.js";

function makePrisma() {
  const state = {
    contacts: [
      {
        id: "contact-1",
        clientId: "11111111-1111-4111-8111-111111111111",
        waId: "support-user-1",
      },
      {
        id: "contact-other",
        clientId: "22222222-2222-4222-8222-222222222222",
        waId: "support-user-1",
      },
      {
        id: "contact-anonymized",
        clientId: "11111111-1111-4111-8111-111111111111",
        waId: "old-anonymized",
      },
    ],
    leads: [
      {
        id: "lead-1",
        tenantId: "11111111-1111-4111-8111-111111111111",
        waId: "support-user-1",
      },
      {
        id: "lead-other-subject",
        tenantId: "11111111-1111-4111-8111-111111111111",
        waId: "support-user-2",
      },
    ],
    conversations: [
      {
        id: "conversation-anonymized",
        clientId: "11111111-1111-4111-8111-111111111111",
        waId: "old-anonymized",
        anonymizedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ],
    consents: [] as any[],
    events: [] as any[],
  };
  const prisma = {
    contact: {
      findFirst: async ({ where }: any) =>
        state.contacts.find((item) => {
          if (item.clientId !== where.clientId) return false;
          if (where.id) return item.id === where.id;
          if (where.waId) return item.waId === where.waId;
          return false;
        }) ?? null,
    },
    lead: {
      findFirst: async ({ where }: any) =>
        state.leads.find((item) => {
          if (item.tenantId !== where.tenantId) return false;
          if (where.id) return item.id === where.id;
          if (where.waId) return item.waId === where.waId;
          return false;
        }) ?? null,
    },
    conversation: {
      findFirst: async ({ where }: any) =>
        state.conversations.find((item) => {
          if (item.clientId !== where.clientId || item.waId !== where.waId) return false;
          if (where.anonymizedAt?.not === null) return item.anonymizedAt !== null;
          return true;
        }) ?? null,
    },
    contactConsent: {
      findFirst: async ({ where }: any) => {
        const result = state.consents
          .filter((item) => item.clientId === where.clientId && item.purpose === where.purpose)
          .filter((item) => (where.contactId ? item.contactId === where.contactId : true))
          .filter((item) => (where.leadId ? item.leadId === where.leadId : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return result[0] ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const item of state.consents) {
          if (item.clientId !== where.clientId || item.purpose !== where.purpose) continue;
          if (where.status && item.status !== where.status) continue;
          if (where.revokedAt === null && item.revokedAt !== null) continue;
          if (where.contactId && item.contactId !== where.contactId) continue;
          if (where.leadId && item.leadId !== where.leadId) continue;
          Object.assign(item, data);
          count += 1;
        }
        return { count };
      },
      create: async ({ data }: any) => {
        const consent = {
          id: `consent-${state.consents.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          revokedAt: null,
          ...data,
        };
        state.consents.push(consent);
        return consent;
      },
    },
    event: {
      create: async ({ data }: any) => {
        state.events.push(data);
        return data;
      },
    },
  };
  return { prisma: prisma as any, state };
}

test("consent purpose and text hash are normalized without storing full copy in events", () => {
  assert.equal(normalizeConsentPurpose(" Atendimento LGPD! "), "atendimento_lgpd");
  assert.equal(buildConsentTextHash("Autorizo atendimento")?.length, 64);
  assert.equal(buildConsentTextHash(""), null);
});

test("consent can be accepted, versioned and revoked per tenant subject", async () => {
  const { prisma, state } = makePrisma();
  const missing = await getContactConsentState({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    purpose: "attendance",
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.status, "missing");

  const accepted = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-1",
    purpose: "attendance",
    sourceChannel: "web_session",
    sourceProvider: "web_session",
    source: "chatbot",
    textVersion: "v1",
    textBody: "Autorizo atendimento",
    requestId: "consent-test",
  });
  assert.equal(accepted.ok, true);
  assert.equal(state.consents.length, 1);
  assert.equal(state.consents[0].status, "accepted");
  assert.equal(JSON.stringify(state.events).includes("Autorizo atendimento"), false);

  await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-1",
    purpose: "attendance",
    textVersion: "v2",
    textBody: "Nova versao",
    requestId: "consent-test-v2",
  });
  assert.equal(state.consents.length, 2);
  assert.equal(state.consents.filter((item) => item.status === "revoked").length, 1);
  assert.equal(state.consents.filter((item) => item.status === "accepted").length, 1);

  const revoked = await revokeContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-1",
    purpose: "attendance",
    requestId: "consent-revoke",
  });
  assert.deepEqual(revoked, { ok: true, revokedCount: 1 });
  const current = await getContactConsentState({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-1",
    purpose: "attendance",
  });
  assert.equal(current.status, "revoked");

  const reaccepted = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-1",
    purpose: "attendance",
    textVersion: "v3",
    textBody: "Aceito novamente",
    requestId: "consent-reaccept",
  });
  assert.equal(reaccepted.ok, true);
  assert.equal(state.consents.length, 3);
  assert.equal(state.consents.filter((item) => item.purpose === "attendance" && item.status === "accepted").length, 1);
  assert.equal(state.consents.filter((item) => item.purpose === "attendance" && item.status === "revoked").length, 2);
});

test("consent supports independent purposes for the same subject", async () => {
  const { prisma, state } = makePrisma();
  await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    purpose: "service_contact",
    requestId: "service-contact",
  });
  await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    purpose: "marketing_informational",
    requestId: "marketing",
  });
  await revokeContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    purpose: "marketing_informational",
    requestId: "marketing-revoke",
  });
  assert.equal(
    state.consents.find((item) => item.purpose === "service_contact")?.status,
    "accepted"
  );
  assert.equal(
    state.consents.find((item) => item.purpose === "marketing_informational")?.status,
    "revoked"
  );
});

test("consent can resolve subject by waId and requires current text version", async () => {
  const { prisma, state } = makePrisma();
  const accepted = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    waId: "support-user-1",
    purpose: "attendance",
    sourceChannel: "whatsapp",
    sourceProvider: "web_session",
    source: "chatbot",
    textVersion: "v1",
    textBody: "Texto v1",
    requestId: "consent-waid",
  });
  assert.equal(accepted.ok, true);
  assert.equal(state.consents[0].contactId, "contact-1");
  assert.equal(state.consents[0].leadId, "lead-1");

  const current = await getContactConsentState({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    waId: "support-user-1",
    purpose: "attendance",
    textVersion: "v1",
    textBody: "Texto v1",
  });
  assert.equal(current.ok, true);
  assert.equal(current.status, "accepted");

  const outdated = await getContactConsentState({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    waId: "support-user-1",
    purpose: "attendance",
    textVersion: "v2",
    textBody: "Texto v2",
  });
  assert.equal(outdated.ok, true);
  assert.equal(outdated.status, "missing");

  await revokeContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    waId: "support-user-1",
    purpose: "attendance",
    source: "privacy_settings",
    requestId: "consent-waid-revoke",
  });
  const revoked = await getContactConsentState({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    waId: "support-user-1",
    purpose: "attendance",
    textVersion: "v1",
    textBody: "Texto v1",
  });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.status, "revoked");
});

test("consent preserves tenant isolation and requires a compatible subject", async () => {
  const { prisma } = makePrisma();
  const missingSubject = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    purpose: "attendance",
    requestId: "missing-subject",
  });
  assert.deepEqual(missingSubject, { ok: false, reason: "subject_required" });

  const crossTenant = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-other",
    purpose: "attendance",
    requestId: "cross-tenant",
  });
  assert.deepEqual(crossTenant, { ok: false, reason: "contact_not_found" });

  const mismatch = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-1",
    leadId: "lead-other-subject",
    purpose: "attendance",
    requestId: "mismatch",
  });
  assert.deepEqual(mismatch, { ok: false, reason: "subject_mismatch" });
});

test("consent blocks anonymized identities without rehydrating data", async () => {
  const { prisma } = makePrisma();
  const anonymized = await recordContactConsent({
    prisma,
    clientId: "11111111-1111-4111-8111-111111111111",
    contactId: "contact-anonymized",
    purpose: "attendance",
    requestId: "anon",
  });
  assert.deepEqual(anonymized, { ok: false, reason: "blocked_anonymized" });
});
