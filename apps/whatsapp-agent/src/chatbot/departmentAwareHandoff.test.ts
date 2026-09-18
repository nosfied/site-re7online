import test from "node:test";
import assert from "node:assert/strict";
import { resolveDepartmentAwareHandoff } from "./departmentAwareHandoff.js";
import type { ChatbotPendingHandoff } from "./chatbotFlow.js";

function makePendingHandoff(overrides?: Partial<ChatbotPendingHandoff>): ChatbotPendingHandoff {
  return {
    feedbackText: "Vou encaminhar.",
    summary: "Resumo",
    suggestedReply: "Olá.",
    tags: [],
    nodeId: "handoff_1",
    departmentId: "department_1",
    queueId: "queue_1",
    closedText: "Este setor esta fechado agora.",
    ...overrides,
  };
}

function makePrismaFake(params: {
  department?: { id: string; name: string } | null;
  queue?: { id: string; name: string; departmentId: string } | null;
  queues?: Array<{ id: string; name: string; departmentId: string }>;
  businessHours?: Array<{ weekday: number; startMinute: number; endMinute: number }>;
}) {
  return {
    queue: {
      findFirst: async ({ where }: { where?: { id?: string; departmentId?: string } } = {}) => {
        if (params.queue) return params.queue;
        return (params.queues ?? []).find((queue) => {
          if (where?.id && queue.id !== where.id) return false;
          if (where?.departmentId && queue.departmentId !== where.departmentId) return false;
          return true;
        }) ?? null;
      },
      findMany: async ({ where, take }: { where?: { departmentId?: string }; take?: number } = {}) => {
        const rows = (params.queues ?? (params.queue ? [params.queue] : [])).filter((queue) => {
          if (where?.departmentId && queue.departmentId !== where.departmentId) return false;
          return true;
        });
        return typeof take === "number" ? rows.slice(0, take) : rows;
      },
    },
    department: {
      findFirst: async () => params.department
        ? { ...params.department, operationalQueue: params.queue ?? null }
        : null,
    },
    tenantOperationalConfig: {
      findUnique: async () => ({ config: { timezone: "America/Fortaleza" } }),
    },
    departmentBusinessHour: {
      findMany: async () => params.businessHours ?? [],
    },
  };
}

test("resolveDepartmentAwareHandoff blocks closed department without assignment", async () => {
  const decision = await resolveDepartmentAwareHandoff(makePrismaFake({
    department: { id: "department_1", name: "Tecnico" },
    queue: { id: "queue_1", name: "Fila Tecnica", departmentId: "department_1" },
    businessHours: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }],
  }) as never, {
    clientId: "client_1",
    pendingHandoff: makePendingHandoff(),
    at: new Date("2026-08-10T16:00:00.000-03:00"),
  });

  assert.equal(decision.kind, "closed");
  assert.equal(decision.shouldAssign, false);
  if (decision.kind === "closed") {
    assert.equal(decision.departmentId, "department_1");
    assert.equal(decision.queueId, "queue_1");
    assert.equal(decision.closedText, "Este setor esta fechado agora.");
  }
});

test("resolveDepartmentAwareHandoff preserves legacy handoff when department has no schedule", async () => {
  const decision = await resolveDepartmentAwareHandoff(makePrismaFake({
    department: { id: "department_1", name: "Tecnico" },
    queue: { id: "queue_1", name: "Fila Tecnica", departmentId: "department_1" },
    businessHours: [],
  }) as never, {
    clientId: "client_1",
    pendingHandoff: makePendingHandoff(),
    at: new Date("2026-08-10T16:00:00.000-03:00"),
  });

  assert.equal(decision.kind, "open");
  assert.equal(decision.availabilityStatus, "NO_SCHEDULE");
  assert.equal(decision.shouldAssign, true);
});

test("resolveDepartmentAwareHandoff resolves department-only handoff through the explicit operational queue", async () => {
  const decision = await resolveDepartmentAwareHandoff(makePrismaFake({
    department: { id: "department_1", name: "Campanha 2026" },
    queue: { id: "queue_1", name: "Fila Geral", departmentId: "department_1" },
    businessHours: [],
  }) as never, {
    clientId: "client_1",
    pendingHandoff: makePendingHandoff({ queueId: null }),
    at: new Date("2026-08-10T16:00:00.000-03:00"),
  });

  assert.equal(decision.kind, "open");
  assert.equal(decision.availabilityStatus, "NO_SCHEDULE");
  assert.equal(decision.departmentId, "department_1");
  assert.equal(decision.queueId, "queue_1");
  assert.equal(decision.shouldAssign, true);
});

test("resolveDepartmentAwareHandoff does not infer from multiple queues without an explicit mapping", async () => {
  const decision = await resolveDepartmentAwareHandoff(makePrismaFake({
    department: { id: "department_1", name: "Campanha 2026" },
    queues: [
      { id: "queue_1", name: "Fila Geral", departmentId: "department_1" },
      { id: "queue_2", name: "Fila Prioritaria", departmentId: "department_1" },
    ],
    businessHours: [],
  }) as never, {
    clientId: "client_1",
    pendingHandoff: makePendingHandoff({ queueId: null }),
  });

  assert.equal(decision.kind, "blocked");
  assert.equal(decision.shouldAssign, false);
  if (decision.kind === "blocked") {
    assert.equal(decision.reason, "no_queue_for_department");
  }
});

test("resolveDepartmentAwareHandoff blocks cross-tenant or inactive department safely", async () => {
  const decision = await resolveDepartmentAwareHandoff(makePrismaFake({
    department: null,
    queue: null,
    businessHours: [],
  }) as never, {
    clientId: "client_1",
    pendingHandoff: makePendingHandoff({ queueId: null }),
  });

  assert.equal(decision.kind, "blocked");
  assert.equal(decision.shouldAssign, false);
  if (decision.kind === "blocked") {
    assert.equal(decision.reason, "department_not_found");
  }
});
