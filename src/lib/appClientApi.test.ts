import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAppConversation,
  fetchAppAgentAvailability,
  fetchAppCompletedServiceReport,
  fetchAppSatisfactionPolicy,
  fetchAppSatisfactionReport,
  fetchAppUsers,
  exportAppCompletedServiceReportCsv,
  formatAppWhatsappIdentityDisplay,
  heartbeatAppAgentAvailability,
  loadAppSession,
  loadPendingAppCampaignDraftCreation,
  logAppInboxEvent,
  logAppInboxEventSafely,
  savePendingAppCampaignDraftCreation,
  clearPendingAppCampaignDraftCreation,
  updateAppAgentSignatureSettings,
  updateAppSatisfactionPolicy,
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

test("pending campaign draft creation survives reload and remains tenant/user scoped", () => {
  const storage = createMemoryStorage();
  Object.assign(globalThis, { window: {}, sessionStorage: storage });
  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token-a",
    user: {
      id: "admin-a",
      name: "Admin A",
      email: "admin-a@example.test",
      clientId: "tenant-a",
      role: "ADMIN",
    },
    features: {},
    profile: "business",
  };
  const pending = {
    id: "draft-request-a",
    payload: {
      name: "Draft A",
      templateId: "template-a",
      requestId: "draft-request-a",
      selectedLeadIds: ["lead-a"],
      returnDestination: { type: "human_department" as const, departmentId: "department-a" },
    },
  };
  savePendingAppCampaignDraftCreation(session, pending);
  assert.deepEqual(loadPendingAppCampaignDraftCreation(session), pending);
  assert.equal(loadPendingAppCampaignDraftCreation({
    ...session,
    user: { ...session.user, id: "admin-b" },
  }), null);
  clearPendingAppCampaignDraftCreation(session);
  assert.equal(loadPendingAppCampaignDraftCreation(session), null);
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

test("fetchAppUsers supports persisted status filters", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ ok: true, count: 0, activeUsers: 0, maxActiveAppUsers: 5, items: [] }),
      } as Response;
    },
  });

  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token",
    user: {
      id: "admin-a",
      name: "Admin A",
      email: "admin@example.test",
      clientId: "tenant-a",
      role: "ADMIN",
    },
    features: {},
    profile: "business",
  };

  try {
    await fetchAppUsers(session);
    await fetchAppUsers(session, "all");
    await fetchAppUsers(session, "active");
    await fetchAppUsers(session, "inactive");
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.deepEqual(
    calls.map((url) => `${new URL(url).pathname}${new URL(url).search}`),
    ["/app/users", "/app/users", "/app/users?status=active", "/app/users?status=inactive"]
  );
});

test("inbox action telemetry uses the existing app inbox event endpoint", async () => {
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
        json: async () => ({ ok: true }),
      } as Response;
    },
  });

  const session: AppSession = {
    token: encodeTokenPayload({
      sid: "session-action",
      sub: "agent-action",
      clientId: "tenant-action",
      role: "AGENT",
    }),
    expiresAt: "2026-08-21T12:00:00.000Z",
    baseUrl: "https://app.example.test",
    user: {
      id: "agent-action",
      name: "Agent",
      email: "agent@example.test",
      clientId: "tenant-action",
      role: "AGENT",
      departmentId: null,
      departmentName: null,
      departmentIds: [],
      primaryDepartmentId: null,
    },
  };

  try {
    await logAppInboxEvent(session, "inbox.action.send.failed", {
      actionId: "inbox-send-1",
      conversationKey: "conversation-1",
      conversationId: "conversation-1",
      provider: "web_session",
      httpStatus: 409,
      errorCode: "conversation_not_assigned",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://app.example.test/app/inbox/events");
  assert.equal(calls[0]?.method, "POST");
  const payload = JSON.parse(calls[0]?.body ?? "{}") as {
    event?: string;
    payload?: Record<string, unknown>;
  };
  assert.equal(payload.event, "inbox.action.send.failed");
  assert.equal(payload.payload?.actionId, "inbox-send-1");
  assert.equal(payload.payload?.httpStatus, 409);
  assert.equal(payload.payload?.errorCode, "conversation_not_assigned");
  assert.equal("text" in (payload.payload ?? {}), false);
  assert.equal("body" in (payload.payload ?? {}), false);
});

test("inbox action telemetry can be safely awaited with keepalive", async () => {
  const calls: Array<{ url: string; keepalive: boolean | undefined; body: string | null }> = [];
  const originalFetch = globalThis.fetch;
  let resolveFetch: ((response: Response) => void) | null = null;
  Object.assign(globalThis, {
    fetch: (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        keepalive: init?.keepalive,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    },
  });

  const session: AppSession = {
    token: encodeTokenPayload({
      sid: "session-close",
      sub: "agent-close",
      clientId: "tenant-close",
      role: "AGENT",
    }),
    expiresAt: "2026-08-21T12:00:00.000Z",
    baseUrl: "https://app.example.test",
    user: {
      id: "agent-close",
      name: "Agent",
      email: "agent@example.test",
      clientId: "tenant-close",
      role: "AGENT",
    },
  };

  try {
    let settled = false;
    const result = logAppInboxEventSafely(
      session,
      "inbox.action.close.succeeded",
      {
        actionId: "inbox-close-1",
        conversationKey: "conversation-1",
        conversationId: "****1234",
      },
      { keepalive: true }
    ).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://app.example.test/app/inbox/events");
    assert.equal(calls[0]?.keepalive, true);

    const payload = JSON.parse(calls[0]?.body ?? "{}") as {
      event?: string;
      payload?: Record<string, unknown>;
    };
    assert.equal(payload.event, "inbox.action.close.succeeded");
    assert.equal(payload.payload?.actionId, "inbox-close-1");
    assert.equal("text" in (payload.payload ?? {}), false);
    assert.equal("body" in (payload.payload ?? {}), false);

    resolveFetch?.({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    assert.equal(await result, true);
    assert.equal(settled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("inbox action telemetry safe helper does not throw on logging failure", async () => {
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async () => {
      throw new Error("network down");
    },
  });

  const session: AppSession = {
    token: encodeTokenPayload({
      sid: "session-close-failure",
      sub: "agent-close",
      clientId: "tenant-close",
      role: "AGENT",
    }),
    expiresAt: "2026-08-21T12:00:00.000Z",
    baseUrl: "https://app.example.test",
    user: {
      id: "agent-close",
      name: "Agent",
      email: "agent@example.test",
      clientId: "tenant-close",
      role: "AGENT",
    },
  };

  try {
    const result = await logAppInboxEventSafely(
      session,
      "inbox.action.close.failed",
      {
        actionId: "inbox-close-2",
        conversationKey: "conversation-2",
        errorCode: "server_error",
      },
      { keepalive: true }
    );
    assert.equal(result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
            details: [],
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

test("completed service CSV export supports detailed snapshot view", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL) => {
      calls.push(String(url));
      return {
        ok: true,
        text: async () => "\"PROTOCOLO\"\n",
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
    await exportAppCompletedServiceReportCsv(session, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      departmentId: "department-1",
      assignedUserId: "user-1",
      view: "detail",
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  const url = new URL(calls[0]);
  assert.equal(url.pathname, "/app/reports/completed-services/export");
  assert.equal(url.searchParams.get("from"), "2026-08-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-08-31T23:59:59.999Z");
  assert.equal(url.searchParams.get("departmentId"), "department-1");
  assert.equal(url.searchParams.get("assignedUserId"), "user-1");
  assert.equal(url.searchParams.get("view"), "detail");
});

test("satisfaction policy helpers use the canonical policy route", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          policy: {
            enabled: true,
            questionText: "Como voce avalia?",
            commentEnabled: true,
            commentOfferText: "Quer comentar?",
            commentPromptText: "Digite o comentario",
            thankYouText: "Obrigado",
            newServiceGateText: "Novo atendimento?",
            ttlMinutes: 20,
            eligibility: "HUMAN_ONLY",
          },
          configSource: "db",
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
    features: { satisfaction: true },
    profile: "business",
  };

  try {
    await fetchAppSatisfactionPolicy(session);
    await updateAppSatisfactionPolicy(session, {
      enabled: true,
      questionText: "Como voce avalia?",
      commentEnabled: true,
      ttlMinutes: 20,
      eligibility: "HUMAN_ONLY",
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.equal(new URL(calls[0].url).pathname, "/app/satisfaction/policy");
  assert.equal(calls[0].init?.method, undefined);
  assert.equal(new URL(calls[1].url).pathname, "/app/satisfaction/policy");
  assert.equal(calls[1].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    enabled: true,
    questionText: "Como voce avalia?",
    commentEnabled: true,
    ttlMinutes: 20,
    eligibility: "HUMAN_ONLY",
  });
});

test("agent signature settings helper can persist operational service messages", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    fetch: async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          settings: { enabled: false, mode: "user_name", format: "bold_line" },
          source: "db",
          serviceMessages: {
            value: {
              protocolNotice: { enabled: false, text: "Protocolo {{protocol}}" },
              queuePositionNotice: { enabled: false, text: "Fila {position}" },
              closeNotice: { enabled: false },
            },
            source: "db",
            closeMessage: {
              value: "Atendimento encerrado {protocol}",
              source: "db",
            },
          },
          preview: { bodyText: "*Maria*\nOla" },
          permissions: { canUpdate: true, canUpdateServiceMessages: true },
        }),
      };
    },
  });

  const session: AppSession = {
    baseUrl: "https://app.example.test",
    token: "token",
    user: {
      id: "admin-a",
      name: "Admin A",
      email: "admin@example.test",
      clientId: "tenant-a",
      role: "ADMIN",
    },
    features: { operationalServiceMessages: true },
    profile: "business",
  };

  try {
    await updateAppAgentSignatureSettings(session, {
      enabled: false,
      mode: "user_name",
      format: "bold_line",
      serviceMessages: {
        protocolNotice: { enabled: false, text: "Protocolo {{protocol}}" },
        queuePositionNotice: { enabled: false, text: "Fila {position}" },
        closeNotice: { enabled: false, text: "Atendimento encerrado {protocol}" },
      },
    });
  } finally {
    Object.assign(globalThis, { fetch: originalFetch });
  }

  assert.equal(new URL(calls[0].url).pathname, "/app/settings/agent-signature");
  assert.equal(calls[0].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)).serviceMessages, {
    protocolNotice: { enabled: false, text: "Protocolo {{protocol}}" },
    queuePositionNotice: { enabled: false, text: "Fila {position}" },
    closeNotice: { enabled: false, text: "Atendimento encerrado {protocol}" },
  });
});
