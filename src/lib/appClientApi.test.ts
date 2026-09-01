import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAppConversation,
  fetchAppAgentAvailability,
  fetchAppCompletedServiceReport,
  fetchAppSatisfactionReport,
  formatAppWhatsappIdentityDisplay,
  heartbeatAppAgentAvailability,
  loadAppSession,
  updateAppAgentAvailability,
  type AppApiError,
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

test("app WhatsApp identity display hides transport labels from end-user UX", () => {
  assert.equal(
    formatAppWhatsappIdentityDisplay({
      phoneDisplay: "558184942630",
      whatsappIdentityProvider: "web_session",
    }),
    "+55 (81) 8494-2630"
  );
  assert.equal(
    formatAppWhatsappIdentityDisplay({
      phoneDisplay: "558184942630",
      whatsappIdentityProvider: "meta",
    }),
    "+55 (81) 8494-2630"
  );
  assert.equal(
    formatAppWhatsappIdentityDisplay({
      phoneDisplay: "558184942630",
      whatsappIdentityProvider: "hybrid",
    }),
    "+55 (81) 8494-2630"
  );
  assert.equal(
    formatAppWhatsappIdentityDisplay({
      phoneDisplay: null,
      whatsappIdentityProvider: "none",
    }),
    "Nenhum número conectado"
  );
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

test("conversation detail request forwards caller abort signal", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let fetchSignal: AbortSignal | null = null;
  Object.assign(globalThis, {
    fetch: (_url: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        fetchSignal = init?.signal ?? null;
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
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
    const request = fetchAppConversation(session, "conversation-a", {
      signal: controller.signal,
    });
    assert.ok(fetchSignal);
    controller.abort();
    await assert.rejects(request, (error: unknown) => {
      const typed = error as AppApiError;
      assert.equal(typed.errorCode, "request_aborted");
      assert.equal(typed.status, 0);
      return true;
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }
});

test("satisfaction report client sends business filters to app endpoint", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          filters: {},
          summary: {
            sent: 0,
            responded: 0,
            pending: 0,
            expired: 0,
            responseRate: 0,
            averageScore: null,
            distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
            byAgent: [],
            byDepartment: [],
            byQueue: [],
          },
          rows: [],
          page: 2,
          limit: 25,
          total: 0,
          totalPages: 1,
          notes: [],
        }),
      };
    },
  });

  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token",
    user: {
      id: "supervisor-a",
      name: "Supervisor A",
      email: "supervisor@example.test",
      clientId: "tenant-a",
      role: "SUPERVISOR",
    },
    features: {},
    profile: "business",
  };

  try {
    await fetchAppSatisfactionReport(session, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      departmentId: "department-1",
      assignedUserId: "user-1",
      channel: "whatsapp",
      page: 2,
      limit: 25,
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  const url = new URL(calls[0]);
  assert.equal(url.pathname, "/app/reports/satisfaction");
  assert.equal(url.searchParams.get("from"), "2026-08-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-08-31T23:59:59.999Z");
  assert.equal(url.searchParams.get("departmentId"), "department-1");
  assert.equal(url.searchParams.get("assignedUserId"), "user-1");
  assert.equal(url.searchParams.get("channel"), "whatsapp");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("limit"), "25");
});

test("completed service report client sends snapshot filters to app endpoint", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          periodFrom: "2026-08-01T00:00:00.000Z",
          periodTo: "2026-08-31T23:59:59.999Z",
          departmentId: "department-1",
          assignedUserId: "user-1",
          timezone: "America/Fortaleza",
          availableSince: null,
          totalCompleted: 0,
          byAgent: [],
          byDepartment: [],
          byDepartmentAgent: [],
          daily: [],
          notes: [],
        }),
      };
    },
  });

  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token",
    user: {
      id: "supervisor-a",
      name: "Supervisor A",
      email: "supervisor@example.test",
      clientId: "tenant-a",
      role: "SUPERVISOR",
    },
    features: {},
    profile: "business",
  };

  try {
    await fetchAppCompletedServiceReport(session, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      departmentId: "department-1",
      assignedUserId: "user-1",
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  const url = new URL(calls[0]);
  assert.equal(url.pathname, "/app/reports/completed-services");
  assert.equal(url.searchParams.get("from"), "2026-08-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-08-31T23:59:59.999Z");
  assert.equal(url.searchParams.get("departmentId"), "department-1");
  assert.equal(url.searchParams.get("assignedUserId"), "user-1");
});
