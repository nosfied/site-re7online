import assert from "node:assert/strict";
import test from "node:test";

test("client auth token includes session id and a permanent expiration marker", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { CLIENT_AUTH_TOKEN_EXPIRES_AT_SECONDS, issueClientAuthToken, verifyClientAuthToken } =
    await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId: "client-1",
      name: "User",
      email: "user@example.test",
      role: "AGENT",
    },
    "session-1"
  );
  const payload = verifyClientAuthToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.sid, "session-1");
  assert.equal(payload.exp, CLIENT_AUTH_TOKEN_EXPIRES_AT_SECONDS);
});

test("client auth token rejects legacy payload without session id", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  const { issueClientAuthToken, verifyClientAuthTokenDetailed } = await import("./clientAuth.js");
  const token = issueClientAuthToken(
    {
      id: "user-1",
      clientId: "client-1",
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
