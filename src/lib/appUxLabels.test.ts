import assert from "node:assert/strict";
import test from "node:test";
import { getAppErrorUxMessage, getSessionAuditStatusUxLabel } from "./appUxLabels";

test("claim capacity errors use a friendly limit message", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 409,
      errorCode: "max_active_reached",
      message: "O usuario de destino atingiu o limite de atendimentos ativos.",
      fallback: "Não foi possível assumir a conversa.",
    }),
    "Você atingiu o limite de atendimentos simultâneos. Encerre um atendimento antes de assumir outro."
  );
});

test("other claim errors keep the caller fallback", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 409,
      errorCode: "conversation_not_waiting",
      message: "",
      fallback: "Não foi possível assumir a conversa.",
    }),
    "Não foi possível assumir a conversa."
  );
});

test("template category policy errors use a friendly message", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 403,
      errorCode: "template_category_not_allowed",
      message: "template_category_not_allowed",
      fallback: "Não foi possível enviar o modelo.",
    }),
    "Categoria não habilitada para este tenant."
  );
});

test("invalid manual WhatsApp phone uses a specific PT-BR validation message", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 400,
      errorCode: "invalid_phone",
      message: "Invalid WhatsApp number",
      fallback: "Não foi possível salvar o contato.",
    }),
    "Informe um número de WhatsApp válido com código do país 55 e DDD."
  );
});

test("invalid campaign test recipient explains national Brazilian input", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 400,
      errorCode: "invalid_test_recipient",
      message: "invalid_test_recipient",
      fallback: "Não foi possível enviar o teste.",
    }),
    "Informe um número de WhatsApp válido. Para números do Brasil, use DDD; o 55 pode ser omitido."
  );
});

test("contact operationally excluded message remains specific", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 409,
      errorCode: "contact_operationally_excluded",
      message: "Contact is outside operation",
      fallback: "Não foi possível salvar o contato.",
    }),
    "Este contato foi retirado da operação."
  );
});

test("active send block uses a specific opt-out message", () => {
  assert.equal(
    getAppErrorUxMessage({
      status: 409,
      errorCode: "active_send_blocked",
      message: "Contato bloqueado para envio ativo.",
      fallback: "Não foi possível enviar o modelo.",
    }),
    "Este contato optou por não receber envios ativos."
  );
});

test("session audit open status does not imply realtime presence", () => {
  assert.equal(getSessionAuditStatusUxLabel("OPEN"), "Aberta");
});


test("flow write errors use safe Portuguese messages instead of raw server details", () => {
  for (const [errorCode, expected] of [
    ["forbidden", "Você não tem permissão"],
    ["chatbot_flow_editing_locked_by_admin", "Criação e edição de fluxos estão bloqueadas"],
    ["invalid_chatbot_definition", "A definição do fluxo é inválida"],
    ["invalid_chatbot_reference", "Revise os departamentos"],
    ["chatbot_flow_not_found", "Fluxo não encontrado"],
    ["tenant_not_found", "Não foi possível acessar a configuração"],
    ["internal_server_error", "Não foi possível"],
  ]) {
    const result = getAppErrorUxMessage({ errorCode, status: errorCode === "internal_server_error" ? 500 : 400, message: "PRIVATE /data/tenants.json payload", fallback: "Falha ao salvar" });
    assert.ok(result.includes(expected), result);
    assert.ok(!result.includes("PRIVATE") && !result.includes("tenants.json"));
  }
});
