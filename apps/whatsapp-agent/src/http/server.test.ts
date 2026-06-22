import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./server.js";

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
