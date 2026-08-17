import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBotMenuOptionMarkdown } from "./webSessionOutboundService.js";

test("normalizeBotMenuOptionMarkdown bolds numbered menu options", () => {
  const result = normalizeBotMenuOptionMarkdown(
    [
      "😁 Digite o número de acordo com o assunto desejado:",
      "4. Dúvidas Técnicas - Plataforma Mapa Cultural",
      "5 - Fundarpe",
      "*7* - Cultura Viva",
    ].join("\n")
  );

  assert.equal(
    result,
    [
      "😁 Digite o número de acordo com o assunto desejado:",
      "*4* - Dúvidas Técnicas - Plataforma Mapa Cultural",
      "*5* - Fundarpe",
      "*7* - Cultura Viva",
    ].join("\n")
  );
});

test("normalizeBotMenuOptionMarkdown leaves non-menu text unchanged", () => {
  const text = ["Checklist interno:", "1. Conferir documento", "2. Salvar protocolo"].join("\n");

  assert.equal(normalizeBotMenuOptionMarkdown(text), text);
});
