import assert from "node:assert/strict";
import test from "node:test";
import { formatUserDisplayName } from "./userDisplayName";

test("formats internal user display names as first and last token", () => {
  assert.equal(formatUserDisplayName("Maria Júlia Duarte Costa de Farias"), "Maria Farias");
  assert.equal(formatUserDisplayName("Leandro José Dias da Silva"), "Leandro Silva");
  assert.equal(formatUserDisplayName("João Antônio Wanderley de Araujo"), "João Araujo");
  assert.equal(formatUserDisplayName("João"), "João");
  assert.equal(formatUserDisplayName("  Ana   Operador  "), "Ana Operador");
  assert.equal(formatUserDisplayName(null, "usuario@exemplo.com"), "usuario@exemplo.com");
});
