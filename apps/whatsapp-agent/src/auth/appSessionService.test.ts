import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_AUTH_SESSION_TTL_MS,
  APP_AUTH_SESSION_TTL_SECONDS,
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetEmail,
  buildPasswordResetUrlFromBase,
  buildResendPasswordResetPayload,
  buildSessionExpiredMessage,
  hashSensitiveValue,
  validateAppSessionFromRequest,
} from "./appSessionService.js";
import { issueClientAuthToken } from "./clientAuth.js";
import { buildAppAuthSessionExpiresAt, getEffectiveAppAuthSessionExpiresAt } from "./sessionPolicy.js";

test("session governance uses 12 hour app sessions and 30 minute reset tokens", () => {
  assert.equal(APP_AUTH_SESSION_TTL_SECONDS, 12 * 60 * 60);
  assert.equal(APP_AUTH_SESSION_TTL_MS, 12 * 60 * 60 * 1000);
  assert.equal(PASSWORD_RESET_TTL_MS, 30 * 60 * 1000);
});

test("session policy builds 12 hour expiration and caps legacy permanent sessions", () => {
  const createdAt = new Date("2030-01-01T00:00:00.000Z");
  assert.equal(buildAppAuthSessionExpiresAt(createdAt).toISOString(), "2030-01-01T12:00:00.000Z");
  assert.equal(
    getEffectiveAppAuthSessionExpiresAt({
      createdAt,
      expiresAt: new Date("9999-12-31T23:59:59.999Z"),
    }).toISOString(),
    "2030-01-01T12:00:00.000Z"
  );
});

test("session rejection messages distinguish replaced and expired sessions", () => {
  assert.match(buildSessionExpiredMessage("session_replaced"), /novo login/i);
  assert.match(buildSessionExpiredMessage("session_expired"), /expirada/i);
  assert.match(buildSessionExpiredMessage("session_revoked"), /encerrada/i);
  assert.match(buildSessionExpiredMessage("support_access_expired"), /suporte expirou/i);
  assert.match(buildSessionExpiredMessage("support_access_revoked"), /suporte foi encerrado/i);
  assert.match(buildSessionExpiredMessage("user_inactive"), /conta esta inativa/i);
});

test("hashSensitiveValue is deterministic and does not expose the input", () => {
  const value = "192.0.2.10";
  const first = hashSensitiveValue(value);
  const second = hashSensitiveValue(value);
  assert.equal(first, second);
  assert.equal(first?.includes(value), false);
  assert.equal(hashSensitiveValue(""), null);
});

test("password reset email is branded and escapes user-controlled content", () => {
  const email = buildPasswordResetEmail({
    name: "<script>alert(1)</script>",
    resetUrl: "https://converta.re7online.com/app/reset-password?token=abc123",
  });

  assert.match(email.subject, /senha/i);
  assert.match(email.text, /30 minutos/i);
  assert.match(email.html, /Converta/);
  assert.match(email.html, /Redefinir senha/);
  assert.equal(email.html.includes("<script>"), false);
  assert.equal(email.html.includes("abc123"), true);
});

test("password reset url accepts base domain or full reset route", () => {
  assert.equal(
    buildPasswordResetUrlFromBase("https://converta.re7online.com", "abc 123"),
    "https://converta.re7online.com/app/reset-password?token=abc%20123"
  );
  assert.equal(
    buildPasswordResetUrlFromBase("https://converta.re7online.com/app/reset-password/", "abc"),
    "https://converta.re7online.com/app/reset-password?token=abc"
  );
});

test("resend payload keeps API key and reset token out of metadata", () => {
  const payload = buildResendPasswordResetPayload({
    from: "Converta <noreply@converta.re7online.com>",
    to: "user@example.com",
    subject: "Redefina sua senha no Converta",
    text: "Use https://converta.re7online.com/app/reset-password?token=abc123",
    html: "<a href=\"https://converta.re7online.com/app/reset-password?token=abc123\">Redefinir</a>",
  });

  assert.deepEqual(Object.keys(payload).sort(), ["from", "html", "subject", "text", "to"]);
  assert.deepEqual(payload.to, ["user@example.com"]);
  assert.equal(JSON.stringify(payload).includes("re_"), false);
});

test("session validation rejects malformed uuid-backed client id before database lookup", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId: "malformed-client-id",
      name: "User",
      email: "user@example.test",
      role: "ADMIN",
    },
    "session-1"
  );

  const result = await validateAppSessionFromRequest({
    headers: { authorization: `Bearer ${token}` },
  } as never);

  assert.deepEqual(result, { ok: false, reason: "invalid_token" });
});
