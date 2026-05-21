import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_AUTH_SESSION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  buildSessionExpiredMessage,
  hashSensitiveValue,
} from "./appSessionService.js";

test("session governance uses 12 hour app sessions and 30 minute reset tokens", () => {
  assert.equal(APP_AUTH_SESSION_TTL_MS, 12 * 60 * 60 * 1000);
  assert.equal(PASSWORD_RESET_TTL_MS, 30 * 60 * 1000);
});

test("session rejection messages distinguish replaced and expired sessions", () => {
  assert.match(buildSessionExpiredMessage("session_replaced"), /novo login/i);
  assert.match(buildSessionExpiredMessage("session_expired"), /expirada/i);
  assert.match(buildSessionExpiredMessage("session_revoked"), /encerrada/i);
});

test("hashSensitiveValue is deterministic and does not expose the input", () => {
  const value = "192.0.2.10";
  const first = hashSensitiveValue(value);
  const second = hashSensitiveValue(value);
  assert.equal(first, second);
  assert.equal(first?.includes(value), false);
  assert.equal(hashSensitiveValue(""), null);
});
