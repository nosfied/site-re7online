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

test("session audit open status does not imply realtime presence", () => {
  assert.equal(getSessionAuditStatusUxLabel("OPEN"), "Aberta");
});
