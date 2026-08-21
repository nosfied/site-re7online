import assert from "node:assert/strict";
import test from "node:test";
import { loadAppSession } from "./appClientApi";

function createMemoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

function encodeTokenPayload(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `header.${body}.signature`;
}

test("loadAppSession preserves membership department ids from storage", () => {
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  Object.assign(globalThis, {
    window: {},
    sessionStorage,
    localStorage,
  });

  localStorage.setItem(
    "wa_app_session_local_v1",
    JSON.stringify({
      token: encodeTokenPayload({
        sid: "session-a",
        sub: "agent-maria",
        name: "Maria Júlia",
        email: "maria@example.com",
        clientId: "tenant-demo",
        role: "AGENT",
        departmentId: "department-mapa",
      }),
      expiresAt: "2026-08-21T12:00:00.000Z",
      baseUrl: "",
      user: {
        id: "agent-maria",
        name: "Maria Júlia",
        email: "maria@example.com",
        clientId: "tenant-demo",
        role: "AGENT",
        departmentId: "department-mapa",
        departmentName: "Mapa",
        departmentIds: ["department-secult", "department-fundarpe", "department-mapa"],
        primaryDepartmentId: "department-mapa",
      },
    })
  );

  const session = loadAppSession();

  assert.deepEqual(session?.user.departmentIds, [
    "department-secult",
    "department-fundarpe",
    "department-mapa",
  ]);
  assert.equal(session?.user.primaryDepartmentId, "department-mapa");
});
