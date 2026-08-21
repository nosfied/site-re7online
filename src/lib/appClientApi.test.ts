import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAppAgentAvailability,
  heartbeatAppAgentAvailability,
  loadAppSession,
  updateAppAgentAvailability,
  type AppSession,
} from "./appClientApi";

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

test("agent availability client calls session-scoped endpoints", async () => {
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
      });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          availability: {
            available: true,
            effectiveAvailable: true,
            lastHeartbeatAt: "2026-08-21T12:00:00.000Z",
            availabilityChangedAt: "2026-08-21T11:59:00.000Z",
          },
          heartbeatIntervalMs: 10000,
          onlineTtlMs: 30000,
        }),
      };
    },
  });

  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token",
    user: {
      id: "agent-a",
      name: "Agent A",
      email: "agent@example.test",
      clientId: "tenant-a",
      role: "AGENT",
    },
    features: {},
    profile: "business",
  };

  try {
    await fetchAppAgentAvailability(session);
    await updateAppAgentAvailability(session, true);
    await heartbeatAppAgentAvailability(session);
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [
    ["GET", "/app/agent-availability"],
    ["PATCH", "/app/agent-availability"],
    ["POST", "/app/agent-availability/heartbeat"],
  ]);
  assert.equal(calls[1].body, JSON.stringify({ available: true }));
  assert.equal(calls[2].body, JSON.stringify({}));
});
