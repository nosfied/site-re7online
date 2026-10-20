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
