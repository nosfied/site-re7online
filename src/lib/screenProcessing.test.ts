import assert from "node:assert/strict";
import test from "node:test";
import { ScreenProcessingRegistry } from "./screenProcessing";

test("a completed operation cannot hide a newer concurrent operation", () => {
  const registry = new ScreenProcessingRegistry();
  const first = registry.begin("Contatos", "Carregando contatos…");
  const second = registry.begin("Filtros", "Aplicando filtros…");
  assert.equal(registry.current()?.id, second);
  registry.end(first);
  assert.equal(registry.size, 1);
  assert.equal(registry.current()?.message, "Aplicando filtros…");
  registry.end(second);
  assert.equal(registry.current(), null);
});

test("clear invalidates all pending operations on unmount", () => {
  const registry = new ScreenProcessingRegistry();
  registry.begin("Contatos", "Carregando contatos…");
  registry.begin("Importação", "Processando importação…");
  registry.clear();
  assert.equal(registry.size, 0);
});

test("ending an operation is idempotent and cannot close another token", () => {
  const registry = new ScreenProcessingRegistry();
  const upload = registry.begin("Upload", "Enviando mídia…");
  const submit = registry.begin("Solicitação", "Salvando solicitação…");
  assert.equal(registry.end(upload), true);
  assert.equal(registry.end(upload), false);
  assert.equal(registry.current()?.id, submit);
  assert.equal(registry.size, 1);
});
