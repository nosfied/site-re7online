import test from "node:test";
import assert from "node:assert/strict";
import {
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
      },
    ],
    handoffWhen: ["catalogo_solicitado"],
    outcomes: ["lead_atacado_qualificado"],
  });
  assert.equal(schema?.enabled, true);
  assert.equal(schema?.schemaVersion, "1");
  assert.equal(schema?.slots?.[0]?.key, "tipo_atendimento");
  assert.deepEqual(schema?.slots?.[0]?.allowedValues, ["Atacado", "Varejo"]);
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
  });
  assert.equal(artifacts.nextStep, "Confirmar disponibilidade, valores ou encaminhamento com o cliente.");
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
