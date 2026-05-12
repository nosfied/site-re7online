import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHumanizedQualificationSummary,
  buildQualificationCrmArtifacts,
  getInitialQualificationState,
  handleQualificationTurn,
  isQualificationEnabled,
  normalizeQualificationSchema,
  validateQualificationSlotValue,
} from "./qualification.js";

test("normalizeQualificationSchema accepts valid schema", () => {
  const schema = normalizeQualificationSchema({
    enabled: true,
    schemaVersion: "1",
    slots: [
      {
        key: "tipo atendimento",
        label: "Tipo de atendimento",
        type: "enum",
        required: true,
        allowedValues: ["Atacado", "Varejo"],
        question: "Você procura atendimento para atacado ou varejo?",
        captureHints: ["atacado", "varejo"],
        crmMapping: {
          leadField: "service",
          leadTemp: "quente",
          priority: "alta",
          whenValue: ["atacado"],
        },
      },
      {
        key: "detalhe",
        question: "Qual detalhe?",
        askAfter: ["tipo atendimento"],
      },
    ],
    handoffWhen: ["catalogo_solicitado"],
    outcomes: ["lead_atacado_qualificado"],
    commercialContinuation: {
      enabled: true,
      negativeReply: "Sem problema. Posso ajudar com outra opção ou encaminhar para a equipe?",
      ambiguousEnumReply: "Certo. Escolha uma das opções disponíveis.",
    },
  });
  assert.equal(schema?.enabled, true);
  assert.equal(schema?.schemaVersion, "1");
  assert.equal(schema?.slots?.[0]?.key, "tipo_atendimento");
  assert.deepEqual(schema?.slots?.[0]?.allowedValues, ["Atacado", "Varejo"]);
  assert.deepEqual(schema?.slots?.[0]?.crmMapping, {
    leadField: "service",
    leadTemp: "quente",
    priority: "alta",
    whenValue: ["atacado"],
  });
  assert.deepEqual(schema?.slots?.[1]?.askAfter, ["tipo_atendimento"]);
  assert.deepEqual(schema?.commercialContinuation, {
    enabled: true,
    negativeReply: "Sem problema. Posso ajudar com outra opção ou encaminhar para a equipe?",
    ambiguousEnumReply: "Certo. Escolha uma das opções disponíveis.",
  });
  assert.equal(isQualificationEnabled(schema), true);
});

test("normalizeQualificationSchema discards slot without key or question", () => {
  const schema = normalizeQualificationSchema({
    enabled: true,
    slots: [
      { key: "nome", question: "" },
      { key: "", question: "Como posso te chamar?" },
      { key: "produto", question: "Qual produto?" },
    ],
  });
  assert.equal(schema?.slots?.length, 1);
  assert.equal(schema?.slots?.[0]?.key, "produto");
});

test("normalizeQualificationSchema blocks sensitive keys", () => {
  const schema = normalizeQualificationSchema({
    enabled: true,
    slots: [
      { key: "cpf", question: "Qual CPF?" },
      { key: "cartão", question: "Qual cartão?" },
      { key: "interesse", question: "Qual interesse?" },
    ],
  });
  assert.deepEqual(schema?.slots?.map((slot) => slot.key), ["interesse"]);
});

test("normalizeQualificationSchema leaves missing schema disabled without changing old tenants", () => {
  assert.equal(normalizeQualificationSchema(undefined), undefined);
  assert.equal(isQualificationEnabled(undefined), false);
});

test("normalizeQualificationSchema rejects invalid top-level formats", () => {
  assert.equal(normalizeQualificationSchema({ enabled: "true" }), undefined);
  assert.equal(normalizeQualificationSchema({ slots: "tipo" }), undefined);
  assert.equal(normalizeQualificationSchema({ handoffWhen: "pedido_humano" }), undefined);
});

test("allowedValues only applies to enum slots", () => {
  const schema = normalizeQualificationSchema({
    enabled: true,
    slots: [
      {
        key: "nome",
        type: "text",
        allowedValues: ["A", "B"],
        question: "Como posso te chamar?",
      },
      {
        key: "tipo",
        type: "enum",
        allowedValues: ["Atacado", "Varejo"],
        question: "Atacado ou varejo?",
      },
    ],
  });
  assert.equal(schema?.slots?.[0]?.allowedValues, undefined);
  assert.deepEqual(schema?.slots?.[1]?.allowedValues, ["Atacado", "Varejo"]);
  assert.deepEqual(validateQualificationSlotValue(schema!.slots![1], "Atacado"), {
    ok: true,
    value: "Atacado",
  });
  assert.equal(validateQualificationSlotValue(schema!.slots![1], "Outro").ok, false);
});

test("getInitialQualificationState returns compact initial state", () => {
  const state = getInitialQualificationState(
    {
      enabled: true,
      schemaVersion: "1",
      slots: [
        {
          key: "tipo_atendimento",
          required: true,
          question: "Atacado ou varejo?",
        },
      ],
    },
    "2026-05-12T10:00:00.000Z"
  );
  assert.deepEqual(state, {
    enabledSnapshot: true,
    schemaVersion: "1",
    stage: "idle",
    currentSlot: "tipo_atendimento",
    slots: {},
    completedSlots: [],
    missingSlots: ["tipo_atendimento"],
    lastQuestion: null,
    readyForHandoff: false,
    outcome: null,
    updatedAt: "2026-05-12T10:00:00.000Z",
  });
});

test("handleQualificationTurn keeps tenants without aiQualification unchanged", () => {
  const result = handleQualificationTurn({ text: "oi" });
  assert.equal(result.enabled, false);
  assert.equal(result.handled, false);
});

test("handleQualificationTurn skips isolated initial greeting", () => {
  const result = handleQualificationTurn({
    schema: {
      enabled: true,
      slots: [
        {
          key: "tipo",
          type: "enum",
          required: true,
          allowedValues: ["atacado", "varejo"],
          question: "Atacado ou varejo?",
        },
      ],
    },
    text: "oi",
    nowIso: "2026-05-12T10:00:00.000Z",
  });
  assert.equal(result.enabled, true);
  assert.equal(result.handled, false);
  assert.equal(result.state, undefined);
});

test("handleQualificationTurn starts qualification and asks first slot", () => {
  const result = handleQualificationTurn({
    schema: {
      enabled: true,
      slots: [
        {
          key: "tipo",
          type: "enum",
          required: true,
          allowedValues: ["atacado", "varejo"],
          question: "Atacado ou varejo?",
        },
      ],
    },
    text: "preciso comprar",
    nowIso: "2026-05-12T10:00:00.000Z",
  });
  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Atacado ou varejo?");
  assert.equal(result.state?.currentSlot, "tipo");
  assert.equal(result.state?.stage, "collecting");
});

test("handleQualificationTurn captures enum allowed values and advances", () => {
  const schema = {
    enabled: true,
    slots: [
      {
        key: "tipo",
        type: "enum" as const,
        required: true,
        allowedValues: ["atacado", "varejo"],
        question: "Atacado ou varejo?",
      },
      { key: "produto", required: true, question: "Qual produto?" },
    ],
  };
  const result = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema, "2026-05-12T10:00:00.000Z"),
    text: "quero atacado",
    nowIso: "2026-05-12T10:01:00.000Z",
  });
  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Qual produto?");
  assert.equal(result.state?.slots?.tipo, "atacado");
  assert.deepEqual(result.state?.completedSlots, ["tipo"]);
});

test("handleQualificationTurn captures enum captureHints", () => {
  const schema = {
    enabled: true,
    slots: [
      {
        key: "perfil",
        type: "enum" as const,
        required: true,
        allowedValues: ["lojista"],
        captureHints: ["tenho loja"],
        question: "Você tem loja?",
      },
    ],
  };
  const result = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema),
    text: "tenho loja",
  });
  assert.equal(result.state?.slots?.perfil, "tenho loja");
  assert.equal(result.state?.stage, "completed");
});

test("handleQualificationTurn captures useful text and ignores isolated greeting", () => {
  const schema = {
    enabled: true,
    slots: [{ key: "produto", required: true, question: "Qual produto?" }],
  };
  const initial = getInitialQualificationState(schema);
  const greeting = handleQualificationTurn({ schema, state: initial, text: "bom dia" });
  assert.equal(greeting.handled, true);
  assert.equal(greeting.state?.slots?.produto, undefined);

  const product = handleQualificationTurn({ schema, state: greeting.state, text: "blusa branca" });
  assert.equal(product.state?.slots?.produto, "blusa branca");
  assert.equal(product.state?.stage, "completed");
});

test("handleQualificationTurn completes required slots without automatic handoff", () => {
  const schema = {
    enabled: true,
    handoffWhen: ["produto"],
    slots: [{ key: "produto", required: true, question: "Qual produto?" }],
  };
  const result = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema),
    text: "vestido azul",
  });
  assert.equal(result.handled, false);
  assert.equal(result.replyText, undefined);
  assert.equal(result.state?.stage, "handoff_ready");
  assert.equal(result.state?.readyForHandoff, true);
});

test("handleQualificationTurn asks and captures optional follow-up slots declared with askAfter", () => {
  const schema = {
    enabled: true,
    slots: [
      {
        key: "tipo_atendimento",
        type: "enum" as const,
        required: true,
        allowedValues: ["atacado", "varejo"],
        question: "Atacado ou varejo?",
      },
      {
        key: "produto_interesse",
        required: true,
        question: "Qual produto?",
      },
      {
        key: "detalhe_produto",
        question: "Qual detalhe?",
        askAfter: ["produto_interesse"],
      },
    ],
  };
  const afterType = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema, "2026-05-12T10:00:00.000Z"),
    text: "varejo",
  });
  const afterProduct = handleQualificationTurn({
    schema,
    state: afterType.state,
    text: "blusa branca",
  });
  assert.equal(afterProduct.handled, true);
  assert.equal(afterProduct.replyText, "Qual detalhe?");
  assert.equal(afterProduct.state?.currentSlot, "detalhe_produto");

  const afterDetail = handleQualificationTurn({
    schema,
    state: afterProduct.state,
    text: "varias cores e tamanhos",
  });
  assert.equal(afterDetail.state?.slots?.detalhe_produto, "varias cores e tamanhos");
  assert.equal(afterDetail.state?.stage, "completed");
});

test("handleQualificationTurn does not capture explicit human request as text slot", () => {
  const schema = {
    enabled: true,
    slots: [{ key: "detalhe_produto", askAfter: ["produto"], question: "Qual detalhe?" }],
  };
  const result = handleQualificationTurn({
    schema,
    state: {
      ...getInitialQualificationState({
        enabled: true,
        slots: [
          { key: "produto", required: true, question: "Qual produto?" },
          { key: "detalhe_produto", askAfter: ["produto"], question: "Qual detalhe?" },
        ],
      }),
      slots: { produto: "blusa" },
      completedSlots: ["produto"],
      currentSlot: "detalhe_produto",
      lastQuestion: "Qual detalhe?",
    },
    text: "quero falar com atendente",
    handoffKeywords: ["falar com atendente", "atendente"],
  });
  assert.equal(result.handled, false);
  assert.equal(result.state?.slots?.detalhe_produto, undefined);
});

test("handleQualificationTurn uses configured negative continuation for optional slot", () => {
  const schema = {
    enabled: true,
    commercialContinuation: {
      enabled: true,
      negativeReply: "Sem problema. Posso ajudar com outra opção ou encaminhar para a equipe?",
    },
    slots: [
      { key: "produto", required: true, question: "Qual produto?" },
      { key: "detalhe", askAfter: ["produto"], question: "Qual detalhe?" },
      {
        key: "duvida",
        type: "enum" as const,
        allowedValues: ["catalogo", "valores"],
        askAfter: ["detalhe", "produto"],
        question: "Catalogo ou valores?",
      },
    ],
  };
  const result = handleQualificationTurn({
    schema,
    state: {
      ...getInitialQualificationState(schema),
      slots: { produto: "blusa" },
      completedSlots: ["produto"],
      currentSlot: "detalhe",
      lastQuestion: "Qual detalhe?",
    },
    text: "não",
  });
  assert.equal(result.handled, true);
  assert.equal(
    result.replyText,
    "Sem problema. Posso ajudar com outra opção ou encaminhar para a equipe?"
  );
  assert.equal(result.state?.slots?.detalhe, undefined);
  assert.equal(result.state?.currentSlot, "duvida");
});

test("handleQualificationTurn repeats configured enum options for ambiguous positive ack", () => {
  const schema = {
    enabled: true,
    commercialContinuation: {
      enabled: true,
      ambiguousEnumReply: "Certo. Escolha catalogo ou valores.",
    },
    slots: [
      {
        key: "duvida",
        type: "enum" as const,
        required: true,
        allowedValues: ["catalogo", "valores"],
        question: "Catalogo ou valores?",
      },
    ],
  };
  const result = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema),
    text: "sim",
  });
  assert.equal(result.handled, true);
  assert.equal(result.replyText, "Certo. Escolha catalogo ou valores.");
  assert.equal(result.state?.slots?.duvida, undefined);
});

test("handleQualificationTurn marks handoff_ready from generic handoff expressions without activating handoff", () => {
  const schema = {
    enabled: true,
    handoffWhen: ["all:produto_interesse+detalhe_produto"],
    slots: [
      { key: "produto_interesse", required: true, question: "Qual produto?" },
      { key: "detalhe_produto", askAfter: ["produto_interesse"], question: "Qual detalhe?" },
    ],
  };
  const product = handleQualificationTurn({
    schema,
    state: getInitialQualificationState(schema),
    text: "vestido",
  });
  const detail = handleQualificationTurn({
    schema,
    state: product.state,
    text: "varias cores",
  });
  assert.equal(detail.handled, false);
  assert.equal(detail.state?.stage, "handoff_ready");
  assert.equal(detail.state?.readyForHandoff, true);
});

test("buildQualificationCrmArtifacts creates human summary lines from captured slots", () => {
  const state = {
    enabledSnapshot: true,
    schemaVersion: "1",
    stage: "completed" as const,
    slots: {
      tipo_atendimento: "Varejo",
      produto_interesse: "Blusa branca",
    },
    completedSlots: ["tipo_atendimento", "produto_interesse"],
    missingSlots: [],
    readyForHandoff: false,
    updatedAt: "2026-05-12T10:00:00.000Z",
  };
  const artifacts = buildQualificationCrmArtifacts({
    state,
    schema: {
      enabled: true,
      schemaVersion: "1",
      slots: [
        {
          key: "tipo_atendimento",
          label: "Tipo de atendimento",
          question: "Atacado ou varejo?",
        },
        {
          key: "produto_interesse",
          label: "Produto de interesse",
          question: "Qual produto?",
        },
      ],
    },
    nowIso: "2026-05-12T10:02:00.000Z",
  });
  assert.deepEqual(artifacts.summaryLines, [
    "Tipo de atendimento: Varejo",
    "Produto de interesse: Blusa branca",
  ]);
  assert.equal(artifacts.flowContextPatch?.tipo_atendimento, "Varejo");
  assert.deepEqual(artifacts.flowTagsToAdd?.sort(), [
    "qualification:completed",
    "qualification:slot:produto_interesse",
    "qualification:slot:tipo_atendimento",
  ]);
});

test("buildQualificationCrmArtifacts applies crmMapping rank escalation safely", () => {
  const artifacts = buildQualificationCrmArtifacts({
    state: {
      stage: "completed",
      slots: { tipo_atendimento: "atacado" },
      completedSlots: ["tipo_atendimento"],
      missingSlots: [],
    },
    schema: {
      enabled: true,
      slots: [
        {
          key: "tipo_atendimento",
          label: "Tipo de atendimento",
          question: "Tipo?",
          crmMapping: {
            leadField: "service",
            leadTemp: "quente",
            priority: "alta",
            whenValue: ["atacado"],
          },
        },
      ],
    },
    answers: { flowContext: { lead_temp: "morno", prioridade: "media" } },
  });
  assert.equal(artifacts.flowContextPatch?.lead_temp, "quente");
  assert.equal(artifacts.flowContextPatch?.prioridade, "alta");
  assert.deepEqual(artifacts.leadPatch, { service: "atacado" });
});

test("buildQualificationCrmArtifacts does not apply crmMapping when value condition does not match", () => {
  const artifacts = buildQualificationCrmArtifacts({
    state: {
      stage: "completed",
      slots: { tipo_atendimento: "varejo" },
      completedSlots: ["tipo_atendimento"],
      missingSlots: [],
    },
    schema: {
      enabled: true,
      slots: [
        {
          key: "tipo_atendimento",
          question: "Tipo?",
          crmMapping: {
            leadTemp: "quente",
            priority: "alta",
            whenValue: ["atacado"],
          },
        },
      ],
    },
  });
  assert.equal(artifacts.flowContextPatch?.lead_temp, undefined);
  assert.equal(artifacts.flowContextPatch?.prioridade, undefined);
});

test("buildQualificationCrmArtifacts preserves existing flowContext values and records conflicts", () => {
  const artifacts = buildQualificationCrmArtifacts({
    state: {
      stage: "completed",
      slots: { produto_interesse: "Blusa branca" },
      completedSlots: ["produto_interesse"],
      missingSlots: [],
    },
    schema: {
      enabled: true,
      slots: [{ key: "produto_interesse", label: "Produto", question: "Qual produto?" }],
    },
    answers: { flowContext: { produto_interesse: "Vestido" } },
  });
  assert.equal(artifacts.flowContextPatch?.produto_interesse, undefined);
  assert.deepEqual(artifacts.conflicts, ["produto_interesse"]);
});

test("buildQualificationCrmArtifacts adds metadata with missing and handoff readiness", () => {
  const artifacts = buildQualificationCrmArtifacts({
    state: {
      schemaVersion: "1",
      stage: "handoff_ready",
      slots: { tipo: "atacado" },
      completedSlots: ["tipo"],
      missingSlots: ["produto"],
      readyForHandoff: true,
      outcome: "lead_atacado",
    },
    schema: {
      enabled: true,
      schemaVersion: "1",
      slots: [{ key: "tipo", question: "Tipo?" }],
    },
    nowIso: "2026-05-12T10:10:00.000Z",
  });
  assert.deepEqual(artifacts.flowContextPatch?.qualification, {
    source: "aiQualification",
    schemaVersion: "1",
    updatedAt: "2026-05-12T10:10:00.000Z",
    completedSlots: ["tipo"],
    missingSlots: ["produto"],
    outcome: "lead_atacado",
    readyForHandoff: true,
    summaryLines: ["Tipo: atacado"],
    nextStep: "Revisar a qualificação capturada e confirmar o próximo passo com o cliente.",
  });
  assert.equal(
    artifacts.nextStep,
    "Revisar a qualificação capturada e confirmar o próximo passo com o cliente."
  );
});

test("buildQualificationCrmArtifacts does not put sensitive values in tags or context", () => {
  const artifacts = buildQualificationCrmArtifacts({
    state: {
      stage: "completed",
      slots: { nome: "CPF 123.456.789-10" },
      completedSlots: ["nome"],
      missingSlots: [],
    },
    schema: {
      enabled: true,
      slots: [{ key: "nome", question: "Nome?" }],
    },
  });
  assert.equal(artifacts.flowContextPatch?.nome, undefined);
  assert.equal(artifacts.flowTagsToAdd?.some((tag) => tag.includes("123")), false);
  assert.deepEqual(artifacts.summaryLines, []);
});

test("buildQualificationCrmArtifacts skips when there is no aiQualification state", () => {
  const artifacts = buildQualificationCrmArtifacts({
    schema: { enabled: true, slots: [{ key: "tipo", question: "Tipo?" }] },
  });
  assert.equal(artifacts.skippedReason, "missing_qualification_slots");
  assert.equal(artifacts.flowContextPatch, undefined);
});

test("buildHumanizedQualificationSummary creates natural operator narrative", () => {
  const result = buildHumanizedQualificationSummary({
    state: {
      stage: "handoff_ready",
      slots: {
        tipo_atendimento: "varejo",
        produto_interesse: "blusa",
        duvida_principal: "catalogo",
      },
      completedSlots: ["tipo_atendimento", "produto_interesse", "duvida_principal"],
      missingSlots: [],
      readyForHandoff: true,
    },
    schema: {
      enabled: true,
      slots: [
        {
          key: "tipo_atendimento",
          label: "Tipo de atendimento",
          type: "enum",
          allowedValues: ["atacado", "varejo"],
          question: "Tipo?",
        },
        {
          key: "produto_interesse",
          label: "Produto de interesse",
          question: "Produto?",
          crmMapping: { leadField: "service" },
        },
        {
          key: "duvida_principal",
          label: "Dúvida principal",
          type: "enum",
          allowedValues: ["catalogo"],
          question: "Dúvida?",
        },
      ],
    },
  });

  assert.match(result.operatorSummary ?? "", /procura atendimento do tipo varejo para blusa/i);
  assert.match(result.operatorSummary ?? "", /Demonstrou interesse em catalogo/i);
  assert.match(result.operatorSummary ?? "", /Solicitou atendimento da equipe/i);
  assert.doesNotMatch(result.suggestionContext ?? "", /Tipo Atendimento/i);
  assert.doesNotMatch(result.suggestionContext ?? "", /produto_interesse/i);
});

test("buildHumanizedQualificationSummary uses configured labels without tenant hardcode", () => {
  const result = buildHumanizedQualificationSummary({
    state: {
      stage: "handoff_ready",
      slots: {
        perfil: "corporativo",
        empresa: "Acme Ltda",
        servico: "implantacao",
        observacao: "urgente",
      },
      completedSlots: ["perfil", "empresa", "servico", "observacao"],
      missingSlots: [],
      readyForHandoff: true,
    },
    schema: {
      enabled: true,
      slots: [
        {
          key: "perfil",
          label: "Perfil de atendimento",
          type: "enum",
          allowedValues: ["corporativo"],
          question: "Perfil?",
        },
        {
          key: "empresa",
          label: "Empresa",
          question: "Empresa?",
          crmMapping: { leadField: "company" },
        },
        {
          key: "servico",
          label: "Serviço",
          question: "Serviço?",
          crmMapping: { leadField: "service" },
        },
        {
          key: "observacao",
          label: "Observação",
          question: "Observação?",
        },
      ],
    },
  });

  assert.match(result.operatorSummary ?? "", /Acme Ltda/i);
  assert.match(result.operatorSummary ?? "", /implantacao/i);
  assert.doesNotMatch(result.operatorSummary ?? "", /varejo|atacado|blusa|vestido/i);
});
