import test from "node:test";
import assert from "node:assert/strict";
import { simulateChannelRuntimeDryRun } from "./channelRuntimeDryRun.js";
import type { NormalizedInboundEvent } from "./channel.types.js";
import type { TenantConfig } from "../config/tenantConfig.js";

const baseEvent: NormalizedInboundEvent = {
  tenantKey: "tenant-a",
  channel: "messenger",
  provider: "meta",
  channelAccountId: "page-1",
  externalUserId: "psid-test-user",
  externalMessageId: "mid-1",
};

const tenant: TenantConfig = {
  id: "tenant-a",
  name: "Tenant A",
  metaPhoneNumberId: "phone-1",
  allowlist: [],
  handoffAttendantWaid: "",
  defaultLanguage: "pt_BR",
  aiAssistantHandoffKeywords: ["atendente", "humano"],
  aiQualification: {
    enabled: true,
    semanticResolverEnabled: true,
    schemaVersion: "1",
    slots: [
      {
        key: "tipo",
        label: "Tipo",
        type: "enum",
        required: true,
        allowedValues: ["catalogo", "valores"],
        captureHints: ["modelos", "preco"],
        question: "Você quer catálogo ou valores?",
      },
    ],
  },
};

test("simulateChannelRuntimeDryRun captures qualification and CRM artifacts without persistence or outbound", () => {
  const result = simulateChannelRuntimeDryRun({
    event: {
      ...baseEvent,
      text: "quero ver os modelos",
    },
    tenant,
    externalUserHash: "hash-1",
    nowIso: "2026-01-01T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.tenantKey, "tenant-a");
  assert.equal(result.channel, "messenger");
  assert.equal(result.qualification.ran, true);
  assert.deepEqual(result.qualification.capturedSlotKeys, ["tipo"]);
  assert.equal(result.qualification.readyForHandoff, false);
  assert.equal(result.crm.enriched, true);
  assert.equal(result.persistence.wouldPersist, false);
  assert.equal(result.outbound.wouldSend, false);
  assert.equal(result.orchestrator.executed, false);
});

test("simulateChannelRuntimeDryRun marks handoff prompt without activating handoff", () => {
  const result = simulateChannelRuntimeDryRun({
    event: {
      ...baseEvent,
      text: "quero falar com atendente",
    },
    tenant,
    externalUserHash: "hash-1",
    nowIso: "2026-01-01T12:00:00.000Z",
  });

  assert.equal(result.handoff.wouldPrompt, true);
  assert.equal(result.handoff.wouldActivate, false);
  assert.equal(result.handoff.reason, "handoff_keyword");
  assert.equal(result.persistence.wouldPersist, false);
  assert.equal(result.outbound.wouldSend, false);
});

test("simulateChannelRuntimeDryRun keeps tenant without qualification passive", () => {
  const result = simulateChannelRuntimeDryRun({
    event: {
      ...baseEvent,
      text: "oi",
    },
    tenant: {
      ...tenant,
      aiQualification: undefined,
      aiAssistantHandoffKeywords: [],
    },
    nowIso: "2026-01-01T12:00:00.000Z",
  });

  assert.equal(result.qualification.ran, false);
  assert.equal(result.crm.enriched, false);
  assert.equal(result.handoff.wouldPrompt, false);
  assert.equal(result.orchestrator.wouldContinue, true);
  assert.equal(result.persistence.wouldPersist, false);
  assert.equal(result.outbound.wouldSend, false);
});

test("simulateChannelRuntimeDryRun reuses initial state across passive channel turns", () => {
  const multiTurnTenant: TenantConfig = {
    ...tenant,
    aiAssistantHandoffKeywords: ["atendente", "humano"],
    aiQualification: {
      enabled: true,
      semanticResolverEnabled: true,
      schemaVersion: "1",
      slots: [
        {
          key: "tipo_atendimento",
          label: "Tipo de atendimento",
          type: "enum",
          required: true,
          allowedValues: ["atacado", "varejo"],
          captureHints: ["atacado", "varejo", "cliente final"],
          question: "Você procura atendimento para atacado ou varejo?",
        },
        {
          key: "produto_interesse",
          label: "Produto de interesse",
          type: "text",
          required: true,
          question: "Qual peça ou acessório você procura primeiro?",
        },
        {
          key: "duvida_principal",
          label: "Dúvida principal",
          type: "enum",
          required: false,
          allowedValues: ["catalogo", "valores", "disponibilidade"],
          semanticAliases: { catalogo: ["modelos"] },
          captureHints: ["catalogo", "preco", "quanto fica"],
          askAfter: ["produto_interesse"],
          question: "Você quer confirmar catálogo, valores ou disponibilidade?",
        },
      ],
      handoffWhen: ["duvida_principal"],
    },
  };

  const first = simulateChannelRuntimeDryRun({
    event: { ...baseEvent, text: "varejo", externalMessageId: "mid-1" },
    tenant: multiTurnTenant,
    externalUserHash: "hash-1",
    nowIso: "2026-01-01T12:00:00.000Z",
  });
  const second = simulateChannelRuntimeDryRun({
    event: { ...baseEvent, text: "blusa", externalMessageId: "mid-2" },
    tenant: multiTurnTenant,
    externalUserHash: "hash-1",
    initialState: first.state,
    nowIso: "2026-01-01T12:01:00.000Z",
  });
  const third = simulateChannelRuntimeDryRun({
    event: { ...baseEvent, text: "quero ver os modelos", externalMessageId: "mid-3" },
    tenant: multiTurnTenant,
    externalUserHash: "hash-1",
    initialState: second.state,
    nowIso: "2026-01-01T12:02:00.000Z",
  });

  assert.equal(first.state.aiQualification?.slots?.tipo_atendimento, "varejo");
  assert.equal(second.state.aiQualification?.slots?.produto_interesse, "blusa");
  assert.equal(third.state.aiQualification?.slots?.duvida_principal, "catalogo");
  assert.equal(third.qualification.readyForHandoff, true);
  assert.equal(third.handoff.wouldPrompt, true);
  assert.equal(third.handoff.wouldActivate, false);
  assert.equal(third.persistence.wouldPersist, false);
  assert.equal(third.outbound.wouldSend, false);
});
