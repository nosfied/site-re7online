import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./server.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { issueClientAuthToken } from "../auth/clientAuth.js";

async function requestOptions(pathname: string, origin: string) {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${pathname}`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
  } finally {
    server.close();
  }
}

test("public webchat preflight reflects embedding origin", async () => {
  const response = await requestOptions("/webchat/v1/session", "https://portal.example.com");
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://portal.example.com");
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
});

test("internal app routes do not reflect arbitrary origins", async () => {
  const response = await requestOptions("/app/inbox", "https://portal.example.com");
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("server catches rejected request handlers and returns sanitized 500", async () => {
  let unhandled = false;
  const onUnhandled = () => {
    unhandled = true;
  };
  process.once("unhandledRejection", onUnhandled);

  const server = createServer(async (_req: IncomingMessage, _res: ServerResponse) => {
    throw new Error("forced handler failure");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/app/crm`, {
      headers: { "x-request-id": "request-boundary-test" },
    });
    const body = (await response.json()) as { error?: string; requestId?: string; stack?: string };
    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: "server_error", requestId: "request-boundary-test" });
    assert.equal(String(JSON.stringify(body)).includes("forced handler failure"), false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled, false);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    server.close();
  }
});

test("app routes reject signed tokens with malformed uuid-backed client id without unhandled rejection", async () => {
  process.env.APP_AUTH_SECRET = "test-secret";
  let unhandled = false;
  const onUnhandled = () => {
    unhandled = true;
  };
  process.once("unhandledRejection", onUnhandled);

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
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/app/crm/contacts`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "invalid_token");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled, false);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
    server.close();
  }
});
