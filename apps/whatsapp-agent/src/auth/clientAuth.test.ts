import assert from "node:assert/strict";
import test from "node:test";

const clientId = "11111111-1111-4111-8111-111111111111";

test("client auth token includes session id and a 12 hour expiration", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { APP_AUTH_SESSION_TTL_SECONDS, issueClientAuthToken, verifyClientAuthToken } =
    await import("./clientAuth.js");
  const expiresAt = new Date(Date.now() + APP_AUTH_SESSION_TTL_SECONDS * 1000);
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId,
      name: "User",
      email: "user@example.test",
      role: "AGENT",
    },
    "session-1",
    expiresAt
  );
  const payload = verifyClientAuthToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.sid, "session-1");
  assert.equal(payload.exp, Math.floor(expiresAt.getTime() / 1000));
});

test("client auth token rejects legacy payload without session id", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { issueClientAuthToken, verifyClientAuthTokenDetailed } = await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId,
      name: "User",
      email: "user@example.test",
      role: "AGENT",
    },
    "session-1"
  );
  const [header, payload, signature] = token.split(".");
  const decoded = JSON.parse(
    Buffer.from((payload ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  ) as Record<string, unknown>;
  delete decoded.sid;
  const encodedLegacyPayload = Buffer.from(JSON.stringify(decoded))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const legacyToken = `${header}.${encodedLegacyPayload}.${signature}`;
  assert.equal(verifyClientAuthTokenDetailed(legacyToken).ok, false);
});

test("client auth token verifier rejects expired tokens", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { issueClientAuthToken, verifyClientAuthTokenDetailed } = await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId,
      name: "User",
      email: "user@example.test",
      role: "AGENT",
    },
    "session-1",
    new Date("2030-01-01T00:00:00.000Z")
  );
  const result = verifyClientAuthTokenDetailed(token, new Date("2030-01-01T00:00:01.000Z"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "token_expired");
});

test("client auth token verifier rejects malformed uuid-backed client ids", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { issueClientAuthToken, verifyClientAuthTokenDetailed } = await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId: "not-a-uuid",
      name: "User",
      email: "user@example.test",
      role: "AGENT",
    },
    "session-1"
  );

  const result = verifyClientAuthTokenDetailed(token);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_payload");
});

test("client auth token verifier rejects malformed uuid-backed support client ids", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { issueClientAuthToken, verifyClientAuthTokenDetailed } = await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "support-user-1",
      clientId,
      name: "Support",
      email: "support@example.test",
      role: "ADMIN",
      supportAccess: {
        accessType: "platform_support",
        grantId: "grant-1",
        supportClientId: "not-a-uuid",
        supportUserId: "support-user-1",
      },
    },
    "support-session-1"
  );

  const result = verifyClientAuthTokenDetailed(token);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_payload");
});
