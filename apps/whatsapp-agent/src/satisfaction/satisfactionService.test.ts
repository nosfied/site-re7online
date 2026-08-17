import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSatisfactionReport,
  buildSatisfactionReportCsv,
  createSatisfactionQuestion,
  createSatisfactionResponse,
  createSatisfactionSurvey,
  listSatisfaction,
  updateSatisfactionQuestion,
} from "./satisfactionService.js";

const now = new Date("2026-06-20T12:00:00.000Z");

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "question-1",
    key: "csat-default",
    type: "csat",
    title: "Atendimento",
    questionText: "Como voce avalia o atendimento?",
    commentPrompt: null,
    commentEnabled: true,
    status: "active",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSurvey(overrides: Record<string, unknown> = {}) {
  return {
    id: "survey-1",
    questionId: "question-1",
    conversationId: null,
    contactId: null,
    leadId: null,
    departmentId: null,
    assignedUserId: null,
    channel: "whatsapp",
    type: "csat",
    status: "draft",
    questionText: "Como voce avalia o atendimento?",
    commentEnabled: true,
    source: "manual",
    sentAt: null,
    answeredAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    response: null,
    department: null,
    assignedUser: null,
    ...overrides,
  };
}

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "response-1",
    surveyId: "survey-1",
    conversationId: null,
    contactId: null,
    leadId: null,
    score: 5,
    comment: null,
    category: "positive",
    source: "app",
    respondedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("listSatisfaction scopes all reads by clientId", async () => {
  const calls: unknown[] = [];
  const prisma = {
    satisfactionQuestion: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [makeQuestion()];
      },
    },
    satisfactionSurvey: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [makeSurvey()];
      },
    },
    satisfactionResponse: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [makeResponse()];
      },
    },
  };

  const result = await listSatisfaction({ prisma: prisma as never, clientId: "tenant-1" });

  assert.equal(result.questions.length, 1);
  assert.equal(result.surveys.length, 1);
  assert.equal(result.responses.length, 1);
  assert.deepEqual(calls.map((call) => (call as { where: { clientId: string } }).where.clientId), [
    "tenant-1",
    "tenant-1",
    "tenant-1",
  ]);
});

test("createSatisfactionQuestion writes current client and author", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    satisfactionQuestion: {
      create: async (args: { data: Record<string, unknown> }) => {
        writes.push(args.data);
        return makeQuestion(args.data);
      },
    },
  };

  const result = await createSatisfactionQuestion({
    prisma: prisma as never,
    clientId: "tenant-1",
    userId: "user-1",
    input: {
      key: "nps-default",
      type: "nps",
      title: "NPS",
      questionText: "Qual a chance de recomendar?",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(writes[0]?.clientId, "tenant-1");
  assert.equal(writes[0]?.createdByUserId, "user-1");
  assert.equal(writes[0]?.updatedByUserId, "user-1");
});

test("updateSatisfactionQuestion refuses cross-tenant records", async () => {
  const prisma = {
    satisfactionQuestion: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        assert.deepEqual(args.where, { id: "question-1", clientId: "tenant-1" });
        return null;
      },
    },
  };

  const result = await updateSatisfactionQuestion({
    prisma: prisma as never,
    clientId: "tenant-1",
    userId: "user-1",
    questionId: "question-1",
    input: { title: "NPS", questionText: "Pergunta" },
  });

  assert.deepEqual(result, { ok: false, error: "question_not_found" });
});

test("createSatisfactionSurvey validates question tenant", async () => {
  const prisma = {
    satisfactionQuestion: {
      findFirst: async () => null,
    },
  };

  const result = await createSatisfactionSurvey({
    prisma: prisma as never,
    clientId: "tenant-1",
    input: {
      questionId: "question-other-tenant",
      questionText: "Como voce avalia?",
    },
  });

  assert.deepEqual(result, { ok: false, error: "question_not_found" });
});

test("createSatisfactionResponse validates score range and updates survey only on valid response", async () => {
  let updated = false;
  const prisma = {
    satisfactionSurvey: {
      findFirst: async () => ({
        id: "survey-1",
        type: "nps",
        conversationId: null,
        contactId: null,
        leadId: null,
      }),
      update: async () => {
        updated = true;
        return makeSurvey({ status: "responded" });
      },
    },
    satisfactionResponse: {
      create: async () => makeResponse({ score: 10, category: "promoter" }),
    },
  };

  const invalid = await createSatisfactionResponse({
    prisma: prisma as never,
    clientId: "tenant-1",
    input: { surveyId: "survey-1", score: 11 },
  });
  assert.deepEqual(invalid, { ok: false, error: "response_score_invalid" });
  assert.equal(updated, false);

  const valid = await createSatisfactionResponse({
    prisma: prisma as never,
    clientId: "tenant-1",
    input: { surveyId: "survey-1", score: 10 },
  });
  assert.equal(valid.ok, true);
  assert.equal(updated, true);
});

test("buildSatisfactionReport keeps directed service CSAT unattributed to agents", async () => {
  const calls: Array<{ where: Record<string, unknown> }> = [];
  const surveys = [
    makeSurvey({
      id: "survey-agent",
      status: "responded",
      assignedUserId: "user-1",
      departmentId: "department-1",
      metadata: { protocol: "CVT-1" },
      sentAt: now,
      answeredAt: now,
      department: { id: "department-1", name: "Geral" },
      assignedUser: { id: "user-1", name: "Atendente 1" },
      response: makeResponse({ surveyId: "survey-agent", score: 5, comment: "Otimo" }),
    }),
    makeSurvey({
      id: "survey-directed",
      status: "responded",
      assignedUserId: null,
      departmentId: "department-1",
      metadata: { protocol: "CVT-2" },
      sentAt: now,
      answeredAt: now,
      department: { id: "department-1", name: "Geral" },
      response: makeResponse({ surveyId: "survey-directed", score: 3, comment: "Aguardando" }),
    }),
  ];
  const responses = [
    makeResponse({ surveyId: "survey-agent", score: 5, comment: "Otimo" }),
    makeResponse({ surveyId: "survey-directed", score: 3, comment: "Aguardando" }),
  ];
  const prisma = {
    satisfactionSurvey: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        calls.push(args);
        return surveys;
      },
    },
    satisfactionResponse: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        calls.push(args);
        return responses;
      },
    },
  };

  const report = await buildSatisfactionReport({
    prisma: prisma as never,
    clientId: "tenant-1",
    filters: {
      departmentId: "department-1",
      channel: "whatsapp",
      from: now,
      to: now,
    },
  });

  assert.equal(report.summary.sent, 2);
  assert.equal(report.summary.responded, 2);
  assert.equal(report.summary.averageScore, 4);
  assert.equal(report.summary.byAgent.length, 1);
  assert.equal(report.summary.byAgent[0]?.id, "user-1");
  assert.equal(report.rows.find((row) => row.surveyId === "survey-directed")?.attribution, "unattributed_directed_service");
  assert.equal(report.rows.find((row) => row.surveyId === "survey-directed")?.assignedUserName, null);
  assert.equal(report.rows.find((row) => row.surveyId === "survey-directed")?.scoreLabel, "Neutro");
  assert.equal((calls[0]?.where as { clientId?: string }).clientId, "tenant-1");
  assert.deepEqual(calls[0]?.where.departmentId, "department-1");
  assert.deepEqual(calls[0]?.where.channel, "whatsapp");
});

test("buildSatisfactionReportCsv exports comments without PII-only technical fields", async () => {
  const report = await buildSatisfactionReport({
    prisma: {
      satisfactionSurvey: {
        findMany: async () => [
          makeSurvey({
            id: "survey-1",
            status: "responded",
            assignedUserId: null,
            departmentId: "department-1",
            metadata: { protocol: "CVT-1" },
            response: makeResponse({ surveyId: "survey-1", score: 1, comment: "Precisa melhorar, por favor" }),
          }),
        ],
      },
      satisfactionResponse: {
        findMany: async () => [makeResponse({ surveyId: "survey-1", score: 1, comment: "Precisa melhorar, por favor" })],
      },
    } as never,
    clientId: "tenant-1",
  });

  const csv = buildSatisfactionReportCsv(report);
  assert.match(csv, /surveyId,protocol,channel,departmentId/);
  assert.match(csv, /Muito Insatisfeito/);
  assert.match(csv, /Precisa melhorar/);
  assert.doesNotMatch(csv, /waId|token|rawPayload|phone/i);
});
