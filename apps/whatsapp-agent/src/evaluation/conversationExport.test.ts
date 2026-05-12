import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationEvaluationCandidate,
  createConversationAnonymizer,
} from "./conversationExport.js";

test("createConversationAnonymizer removes phone, email and cpf", () => {
  const anonymizer = createConversationAnonymizer({
    tenantKey: "tenant-a",
    waId: "558499049614",
    anonymize: true,
  });
  const text = anonymizer.anonymizeText(
    "Meu telefone é 558499049614, email pessoa@teste.com e CPF 123.456.789-10"
  );
  assert.equal(text.includes("558499049614"), false);
  assert.equal(text.includes("pessoa@teste.com"), false);
  assert.equal(text.includes("123.456.789-10"), false);
  assert.match(text, /USER_001|PHONE_001/);
  assert.match(text, /EMAIL_001/);
  assert.match(text, /CPF_001/);
});

test("buildConversationEvaluationCandidate generates anonymized review candidate", () => {
  const candidate = buildConversationEvaluationCandidate({
    tenantKey: "tenant-a",
    anonymize: true,
    exportedAt: "2026-01-01T00:00:00.000Z",
    source: {
      client: { id: "client-1", clientKey: "tenant-a" },
      runtime: {
        waId: "558499049614",
        waIdCanonical: "558499049614",
        handoffStatus: "ACTIVE",
        mode: "HUMAN",
        status: "WAITING",
        answers: {
          aiQualification: {
            slots: { tipo_atendimento: "varejo", empresa_loja: "loja vestimenta natal rn" },
            completedSlots: ["tipo_atendimento", "empresa_loja"],
          },
          flowContext: { empresa_loja: "loja vestimenta natal rn" },
          flowTags: ["qualification:slot:empresa_loja"],
          aiMemory: { summary: "Cliente informou loja vestimenta natal rn" },
        },
      },
      inbound: [
        { bodyText: "oi, sou da loja vestimenta natal rn", createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      lead: {
        name: "Maria Silva",
        phone: "558499049614",
        city: "Natal RN",
        service: "blusa",
        email: "maria@example.com",
        company: "loja vestimenta natal rn",
        status: "QUALIFIED",
      },
      leadNotes: [{ body: "Falar com Maria Silva", createdAt: new Date("2026-01-01T00:01:00Z") }],
    },
  });
  const serialized = JSON.stringify(candidate);
  assert.equal(candidate.requiresHumanReview, true);
  assert.equal(candidate.expectationsDraft, true);
  assert.equal(candidate.source.anonymized, true);
  assert.equal(serialized.includes("558499049614"), false);
  assert.equal(serialized.includes("maria@example.com"), false);
  assert.equal(serialized.includes("loja vestimenta natal rn"), false);
  assert.equal(candidate.observedFinalState.handoff, true);
  assert.equal(candidate.turns[candidate.turns.length - 1]?.expected?.expectedMode, "HUMAN");
});

test("buildConversationEvaluationCandidate exports tenant without qualification without slots", () => {
  const candidate = buildConversationEvaluationCandidate({
    tenantKey: "tenant-no-qualification",
    anonymize: true,
    source: {
      client: { id: "client-1", clientKey: "tenant-no-qualification" },
      runtime: {
        waId: "5511999999999",
        waIdCanonical: "5511999999999",
        handoffStatus: "NONE",
        mode: "BOT",
        status: null,
        answers: {},
      },
      inbound: [{ bodyText: "quero falar com atendente", createdAt: new Date("2026-01-01T00:00:00Z") }],
      lead: null,
      leadNotes: [],
    },
  });
  assert.equal(candidate.observedFinalState.qualificationSlots, undefined);
  assert.equal(candidate.turns[0]?.expected?.qualificationSlots, undefined);
  assert.equal(candidate.requiresHumanReview, true);
});
