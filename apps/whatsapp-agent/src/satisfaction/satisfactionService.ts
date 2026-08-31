import type { PrismaClient } from "@prisma/client";

export const SATISFACTION_QUESTION_STATUSES = ["active", "inactive", "archived"] as const;
export const SATISFACTION_SURVEY_STATUSES = [
  "draft",
  "pending",
  "sent",
  "responded",
  "expired",
  "cancelled",
] as const;
export const SATISFACTION_TYPES = ["csat", "nps"] as const;

export type SatisfactionQuestionStatus = (typeof SATISFACTION_QUESTION_STATUSES)[number];
export type SatisfactionSurveyStatus = (typeof SATISFACTION_SURVEY_STATUSES)[number];
export type SatisfactionType = (typeof SATISFACTION_TYPES)[number];

type JsonInput = Record<string, unknown>;
type SatisfactionReportFilters = {
  from?: Date | null;
  to?: Date | null;
  departmentId?: string | null;
  departmentIds?: string[] | null;
  assignedUserId?: string | null;
  channel?: string | null;
};

type SatisfactionReportPagination = {
  page?: number | null;
  limit?: number | null;
};

const MAX_KEY_LENGTH = 80;
const MAX_TITLE_LENGTH = 160;
const MAX_TEXT_LENGTH = 1000;
const MAX_COMMENT_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 80;
const MAX_CHANNEL_LENGTH = 40;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

function normalizeOptionalId(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalizeBoolean(input: unknown, fallback = false) {
  return typeof input === "boolean" ? input : fallback;
}

function normalizeType(input: unknown): SatisfactionType {
  return input === "nps" ? "nps" : "csat";
}

function normalizeQuestionStatus(input: unknown): SatisfactionQuestionStatus {
  return input === "inactive" || input === "archived" ? input : "active";
}

function normalizeSurveyStatus(input: unknown): SatisfactionSurveyStatus {
  if (
    input === "pending" ||
    input === "sent" ||
    input === "responded" ||
    input === "expired" ||
    input === "cancelled"
  ) {
    return input;
  }
  return "draft";
}

function normalizeDate(input: unknown) {
  if (typeof input !== "string" && !(input instanceof Date)) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeScore(input: unknown, type: SatisfactionType) {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isInteger(value)) return null;
  const min = type === "nps" ? 0 : 1;
  const max = type === "nps" ? 10 : 5;
  if (value < min || value > max) return null;
  return value;
}

function categoryForScore(score: number, type: SatisfactionType) {
  if (type === "nps") {
    if (score <= 6) return "detractor";
    if (score <= 8) return "passive";
    return "promoter";
  }
  if (score <= 2) return "negative";
  if (score === 3) return "neutral";
  return "positive";
}

function serializeDate(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function serializeQuestion(item: {
  id: string;
  key: string;
  type: string;
  title: string;
  questionText: string;
  commentPrompt: string | null;
  commentEnabled: boolean;
  status: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    key: item.key,
    type: normalizeType(item.type),
    title: item.title,
    questionText: item.questionText,
    commentPrompt: item.commentPrompt,
    commentEnabled: item.commentEnabled,
    status: normalizeQuestionStatus(item.status),
    createdByUserId: item.createdByUserId,
    updatedByUserId: item.updatedByUserId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeSurvey(item: {
  id: string;
  questionId: string | null;
  conversationId: string | null;
  contactId: string | null;
  leadId: string | null;
  departmentId: string | null;
  assignedUserId: string | null;
  channel: string | null;
  type: string;
  status: string;
  questionText: string;
  commentEnabled: boolean;
  source: string;
  sentAt: Date | null;
  answeredAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    questionId: item.questionId,
    conversationId: item.conversationId,
    contactId: item.contactId,
    leadId: item.leadId,
    departmentId: item.departmentId,
    assignedUserId: item.assignedUserId,
    channel: item.channel,
    type: normalizeType(item.type),
    status: normalizeSurveyStatus(item.status),
    questionText: item.questionText,
    commentEnabled: item.commentEnabled,
    source: item.source,
    sentAt: serializeDate(item.sentAt),
    answeredAt: serializeDate(item.answeredAt),
    expiresAt: serializeDate(item.expiresAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeResponse(item: {
  id: string;
  surveyId: string;
  conversationId: string | null;
  contactId: string | null;
  leadId: string | null;
  score: number;
  comment: string | null;
  category: string | null;
  source: string;
  respondedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    surveyId: item.surveyId,
    conversationId: item.conversationId,
    contactId: item.contactId,
    leadId: item.leadId,
    score: item.score,
    comment: item.comment,
    category: item.category,
    source: item.source,
    respondedAt: item.respondedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function emptyScoreDistribution() {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } as Record<string, number>;
}

export function satisfactionScoreLabel(score: number) {
  if (score === 5) return "Muito Satisfeito";
  if (score === 4) return "Satisfeito";
  if (score === 3) return "Neutro";
  if (score === 2) return "Insatisfeito";
  if (score === 1) return "Muito Insatisfeito";
  return "Sem resposta";
}

function protectSpreadsheetCell(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = protectSpreadsheetCell(String(value));
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function metadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type SatisfactionBucket = {
  id: string;
  name: string | null;
  sent: number;
  responded: number;
  scoreTotal: number;
  distribution: Record<string, number>;
};

function buildSatisfactionSummary(params: {
  surveys: Array<{
    id: string;
    status: string;
    assignedUserId: string | null;
    departmentId: string | null;
    metadata?: unknown;
    department?: { name: string | null } | null;
    assignedUser?: { name: string | null } | null;
  }>;
  responses: Array<{
    surveyId: string;
    score: number;
  }>;
}) {
  const surveyById = new Map(params.surveys.map((survey) => [survey.id, survey]));
  const distribution = emptyScoreDistribution();
  const byAgent = new Map<string, SatisfactionBucket>();
  const byDepartment = new Map<string, SatisfactionBucket>();
  const byQueue = new Map<string, SatisfactionBucket>();
  const ensureBucket = (
    map: Map<string, SatisfactionBucket>,
    key: string,
    name: string | null
  ) => {
    const existing = map.get(key);
    if (existing) {
      if (!existing.name && name) existing.name = name;
      return existing;
    }
    const bucket = { id: key, name, sent: 0, responded: 0, scoreTotal: 0, distribution: emptyScoreDistribution() };
    map.set(key, bucket);
    return bucket;
  };
  const getQueueId = (metadata: unknown) => {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = (metadata as Record<string, unknown>).queueId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  for (const survey of params.surveys) {
    if (survey.assignedUserId) {
      ensureBucket(
        byAgent,
        survey.assignedUserId,
        metadataString(survey.metadata, "assignedUserName") ?? survey.assignedUser?.name ?? null
      ).sent += 1;
    }
    if (survey.departmentId) {
      ensureBucket(
        byDepartment,
        survey.departmentId,
        metadataString(survey.metadata, "departmentName") ?? survey.department?.name ?? null
      ).sent += 1;
    }
    const queueId = getQueueId(survey.metadata);
    if (queueId) ensureBucket(byQueue, queueId, metadataString(survey.metadata, "queueName")).sent += 1;
  }

  let scoreTotal = 0;
  for (const response of params.responses) {
    const survey = surveyById.get(response.surveyId);
    if (!survey) continue;
    const scoreKey = String(response.score);
    if (scoreKey in distribution) distribution[scoreKey] += 1;
    scoreTotal += response.score;
    if (survey.assignedUserId) {
      const bucket = ensureBucket(
        byAgent,
        survey.assignedUserId,
        metadataString(survey.metadata, "assignedUserName") ?? survey.assignedUser?.name ?? null
      );
      bucket.responded += 1;
      bucket.scoreTotal += response.score;
      if (scoreKey in bucket.distribution) bucket.distribution[scoreKey] += 1;
    }
    if (survey.departmentId) {
      const bucket = ensureBucket(
        byDepartment,
        survey.departmentId,
        metadataString(survey.metadata, "departmentName") ?? survey.department?.name ?? null
      );
      bucket.responded += 1;
      bucket.scoreTotal += response.score;
      if (scoreKey in bucket.distribution) bucket.distribution[scoreKey] += 1;
    }
    const queueId = getQueueId(survey.metadata);
    if (queueId) {
      const bucket = ensureBucket(byQueue, queueId, metadataString(survey.metadata, "queueName"));
      bucket.responded += 1;
      bucket.scoreTotal += response.score;
      if (scoreKey in bucket.distribution) bucket.distribution[scoreKey] += 1;
    }
  }

  const serializeBuckets = (
    map: Map<string, SatisfactionBucket>
  ) =>
    Array.from(map.values())
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        sent: bucket.sent,
        responded: bucket.responded,
        responseRate: bucket.sent > 0 ? bucket.responded / bucket.sent : 0,
        averageScore: bucket.responded > 0 ? bucket.scoreTotal / bucket.responded : null,
        distribution: bucket.distribution,
      }))
      .sort((left, right) => {
        if (right.responded !== left.responded) return right.responded - left.responded;
        return (left.name ?? left.id).localeCompare(right.name ?? right.id);
      });

  const sent = params.surveys.filter((survey) => survey.status !== "draft" && survey.status !== "cancelled").length;
  const responded = params.responses.length;
  const expired = params.surveys.filter((survey) => survey.status === "expired").length;
  const pending = params.surveys.filter((survey) => survey.status === "sent" || survey.status === "pending").length;
  return {
    sent,
    responded,
    pending,
    expired,
    responseRate: sent > 0 ? responded / sent : 0,
    averageScore: responded > 0 ? scoreTotal / responded : null,
    distribution,
    byAgent: serializeBuckets(byAgent),
    byDepartment: serializeBuckets(byDepartment),
    byQueue: serializeBuckets(byQueue),
  };
}

function buildSurveyWhere(clientId: string, filters: SatisfactionReportFilters = {}) {
  const where: Record<string, unknown> = {
    clientId,
    type: "csat",
  };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.departmentId) where.departmentId = filters.departmentId;
  else if (filters.departmentIds) where.departmentId = { in: filters.departmentIds };
  if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
  if (filters.channel) where.channel = filters.channel;
  return where;
}

export async function buildSatisfactionReport(params: {
  prisma: PrismaClient;
  clientId: string;
  filters?: SatisfactionReportFilters;
  pagination?: SatisfactionReportPagination | null;
}) {
  const filters = params.filters ?? {};
  const page = Math.max(1, Math.trunc(params.pagination?.page ?? 1));
  const rawLimit = params.pagination?.limit;
  const limit =
    rawLimit === null
      ? null
      : Math.min(100, Math.max(1, Math.trunc(rawLimit ?? 25)));
  const skip = limit === null ? undefined : (page - 1) * limit;
  const surveyWhere = buildSurveyWhere(params.clientId, filters);
  const responseWhere = {
    clientId: params.clientId,
    survey: { is: surveyWhere },
  };
  const [responseRows, responses, total, summarySurveys] = await Promise.all([
    params.prisma.satisfactionResponse.findMany({
      where: responseWhere,
      orderBy: [{ respondedAt: "desc" }],
      ...(limit === null ? {} : { skip, take: limit }),
      include: {
        survey: {
          include: {
            department: { select: { id: true, name: true } },
            assignedUser: { select: { id: true, name: true } },
          },
        },
      },
    }),
    params.prisma.satisfactionResponse.findMany({
      where: responseWhere,
      orderBy: [{ respondedAt: "desc" }],
    }),
    params.prisma.satisfactionResponse.count({
      where: responseWhere,
    }),
    params.prisma.satisfactionSurvey.findMany({
      where: surveyWhere,
      select: {
        id: true,
        status: true,
        assignedUserId: true,
        departmentId: true,
        metadata: true,
        department: { select: { name: true } },
        assignedUser: { select: { name: true } },
      },
    }),
  ]);
  const summary = buildSatisfactionSummary({ surveys: summarySurveys, responses });
  const rows = responseRows.map((response) => {
    const survey = response.survey;
    const score = response.score;
    return {
      surveyId: survey.id,
      conversationId: survey.conversationId,
      protocol: metadataString(survey.metadata, "protocol"),
      channel: survey.channel,
      departmentId: survey.departmentId,
      departmentName: metadataString(survey.metadata, "departmentName") ?? survey.department?.name ?? null,
      assignedUserId: survey.assignedUserId,
      assignedUserName: metadataString(survey.metadata, "assignedUserName") ?? survey.assignedUser?.name ?? null,
      attribution: survey.assignedUserId ? "agent" : "unattributed_directed_service",
      status: normalizeSurveyStatus(survey.status),
      sentAt: serializeDate(survey.sentAt),
      answeredAt: serializeDate(response.respondedAt ?? survey.answeredAt),
      expiresAt: serializeDate(survey.expiresAt),
      score,
      scoreLabel: satisfactionScoreLabel(score),
      comment: response.comment ?? null,
    };
  });

  return {
    ok: true as const,
    filters: {
      from: serializeDate(filters.from ?? null),
      to: serializeDate(filters.to ?? null),
      departmentId: filters.departmentId ?? null,
      assignedUserId: filters.assignedUserId ?? null,
      channel: filters.channel ?? null,
    },
    summary,
    rows,
    page,
    limit,
    total,
    totalPages: limit === null ? 1 : Math.max(1, Math.ceil(total / limit)),
    notes: [
      "Pesquisas de atendimento direcionado sem atendente atribuido nao sao contabilizadas como desempenho individual.",
      "Agregados de CSAT por atendente e setor usam o snapshot historico da SatisfactionSurvey no envio da pesquisa.",
      "Comentarios sao feedback operacional; nao incluem telefone, token, waId ou payload bruto.",
    ],
  };
}

export function buildSatisfactionReportCsv(report: Awaited<ReturnType<typeof buildSatisfactionReport>>) {
  const headers = [
    "DATA",
    "PROTOCOLO",
    "SETOR",
    "ATENDENTE",
    "CANAL",
    "NOTA",
    "COMENTÁRIO",
  ];
  return [
    headers.join(","),
    ...report.rows.map((row) =>
      [
        row.answeredAt ?? row.sentAt,
        row.protocol,
        row.departmentName,
        row.assignedUserName,
        row.channel,
        row.scoreLabel,
        row.comment,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");
}

async function validateOptionalQuestion(prisma: PrismaClient, clientId: string, questionId: string | null) {
  if (!questionId) return true;
  const question = await prisma.satisfactionQuestion.findFirst({
    where: { id: questionId, clientId },
    select: { id: true },
  });
  return Boolean(question);
}

async function validateOptionalDepartment(prisma: PrismaClient, clientId: string, departmentId: string | null) {
  if (!departmentId) return true;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, clientId },
    select: { id: true },
  });
  return Boolean(department);
}

async function validateOptionalUser(prisma: PrismaClient, clientId: string, userId: string | null) {
  if (!userId) return true;
  const user = await prisma.user.findFirst({
    where: { id: userId, clientId },
    select: { id: true },
  });
  return Boolean(user);
}

async function validateOptionalContact(prisma: PrismaClient, clientId: string, contactId: string | null) {
  if (!contactId) return true;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, clientId },
    select: { id: true },
  });
  return Boolean(contact);
}

async function validateOptionalLead(prisma: PrismaClient, clientId: string, leadId: string | null) {
  if (!leadId) return true;
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId: clientId },
    select: { id: true },
  });
  return Boolean(lead);
}

async function validateOptionalConversation(prisma: PrismaClient, clientId: string, conversationId: string | null) {
  if (!conversationId) return true;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clientId },
    select: { id: true },
  });
  return Boolean(conversation);
}

export async function listSatisfaction(params: { prisma: PrismaClient; clientId: string }) {
  const [questions, surveys, responses] = await Promise.all([
    params.prisma.satisfactionQuestion.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    params.prisma.satisfactionSurvey.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    params.prisma.satisfactionResponse.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ respondedAt: "desc" }],
      take: 200,
    }),
  ]);
  return {
    questions: questions.map(serializeQuestion),
    surveys: surveys.map(serializeSurvey),
    responses: responses.map(serializeResponse),
    summary: buildSatisfactionSummary({ surveys, responses }),
  };
}

function buildQuestionData(input: JsonInput) {
  const title = normalizeText(input.title, MAX_TITLE_LENGTH);
  const questionText = normalizeText(input.questionText, MAX_TEXT_LENGTH);
  const key = normalizeText(input.key, MAX_KEY_LENGTH) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!title) return { ok: false as const, error: "question_title_required" };
  if (!questionText) return { ok: false as const, error: "question_text_required" };
  if (!key) return { ok: false as const, error: "question_key_required" };
  return {
    ok: true as const,
    data: {
      key,
      type: normalizeType(input.type),
      title,
      questionText,
      commentPrompt: normalizeOptionalText(input.commentPrompt, MAX_TEXT_LENGTH),
      commentEnabled: normalizeBoolean(input.commentEnabled, true),
      status: normalizeQuestionStatus(input.status),
    },
  };
}

export async function createSatisfactionQuestion(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  input: JsonInput;
}) {
  const normalized = buildQuestionData(params.input);
  if (!normalized.ok) return normalized;
  const question = await params.prisma.satisfactionQuestion.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
      createdByUserId: params.userId,
      updatedByUserId: params.userId,
    },
  });
  return { ok: true as const, question: serializeQuestion(question) };
}

export async function updateSatisfactionQuestion(params: {
  prisma: PrismaClient;
  clientId: string;
  userId: string;
  questionId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.satisfactionQuestion.findFirst({
    where: { id: params.questionId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "question_not_found" };
  const normalized = buildQuestionData(params.input);
  if (!normalized.ok) return normalized;
  const question = await params.prisma.satisfactionQuestion.update({
    where: { id: existing.id },
    data: { ...normalized.data, updatedByUserId: params.userId },
  });
  return { ok: true as const, question: serializeQuestion(question) };
}

function buildSurveyData(input: JsonInput) {
  const questionText = normalizeText(input.questionText, MAX_TEXT_LENGTH);
  if (!questionText) return { ok: false as const, error: "survey_question_text_required" };
  return {
    ok: true as const,
    data: {
      questionId: normalizeOptionalId(input.questionId),
      conversationId: normalizeOptionalId(input.conversationId),
      contactId: normalizeOptionalId(input.contactId),
      leadId: normalizeOptionalId(input.leadId),
      departmentId: normalizeOptionalId(input.departmentId),
      assignedUserId: normalizeOptionalId(input.assignedUserId),
      channel: normalizeOptionalText(input.channel, MAX_CHANNEL_LENGTH),
      type: normalizeType(input.type),
      status: normalizeSurveyStatus(input.status),
      questionText,
      commentEnabled: normalizeBoolean(input.commentEnabled, true),
      source: normalizeText(input.source, MAX_SOURCE_LENGTH) || "manual",
      sentAt: normalizeDate(input.sentAt),
      answeredAt: normalizeDate(input.answeredAt),
      expiresAt: normalizeDate(input.expiresAt),
    },
  };
}

async function validateSurveyReferences(prisma: PrismaClient, clientId: string, data: {
  questionId: string | null;
  conversationId: string | null;
  contactId: string | null;
  leadId: string | null;
  departmentId: string | null;
  assignedUserId: string | null;
}) {
  if (!(await validateOptionalQuestion(prisma, clientId, data.questionId))) return "question_not_found";
  if (!(await validateOptionalConversation(prisma, clientId, data.conversationId))) return "conversation_not_found";
  if (!(await validateOptionalContact(prisma, clientId, data.contactId))) return "contact_not_found";
  if (!(await validateOptionalLead(prisma, clientId, data.leadId))) return "lead_not_found";
  if (!(await validateOptionalDepartment(prisma, clientId, data.departmentId))) return "department_not_found";
  if (!(await validateOptionalUser(prisma, clientId, data.assignedUserId))) return "user_not_found";
  return null;
}

export async function createSatisfactionSurvey(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildSurveyData(params.input);
  if (!normalized.ok) return normalized;
  const referenceError = await validateSurveyReferences(params.prisma, params.clientId, normalized.data);
  if (referenceError) return { ok: false as const, error: referenceError };
  const survey = await params.prisma.satisfactionSurvey.create({
    data: { clientId: params.clientId, ...normalized.data },
  });
  return { ok: true as const, survey: serializeSurvey(survey) };
}

export async function updateSatisfactionSurvey(params: {
  prisma: PrismaClient;
  clientId: string;
  surveyId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.satisfactionSurvey.findFirst({
    where: { id: params.surveyId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "survey_not_found" };
  const normalized = buildSurveyData(params.input);
  if (!normalized.ok) return normalized;
  const referenceError = await validateSurveyReferences(params.prisma, params.clientId, normalized.data);
  if (referenceError) return { ok: false as const, error: referenceError };
  const survey = await params.prisma.satisfactionSurvey.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, survey: serializeSurvey(survey) };
}

function buildResponseData(input: JsonInput, type: SatisfactionType) {
  const score = normalizeScore(input.score, type);
  if (score === null) return { ok: false as const, error: "response_score_invalid" };
  return {
    ok: true as const,
    data: {
      score,
      comment: normalizeOptionalText(input.comment, MAX_COMMENT_LENGTH),
      category: categoryForScore(score, type),
      source: normalizeText(input.source, MAX_SOURCE_LENGTH) || "app",
      respondedAt: normalizeDate(input.respondedAt) ?? new Date(),
    },
  };
}

export async function createSatisfactionResponse(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const surveyId = normalizeOptionalId(params.input.surveyId);
  if (!surveyId) return { ok: false as const, error: "survey_not_found" };
  const survey = await params.prisma.satisfactionSurvey.findFirst({
    where: { id: surveyId, clientId: params.clientId },
    select: {
      id: true,
      type: true,
      conversationId: true,
      contactId: true,
      leadId: true,
    },
  });
  if (!survey) return { ok: false as const, error: "survey_not_found" };
  const normalized = buildResponseData(params.input, normalizeType(survey.type));
  if (!normalized.ok) return normalized;
  const response = await params.prisma.satisfactionResponse.create({
    data: {
      clientId: params.clientId,
      surveyId: survey.id,
      conversationId: survey.conversationId,
      contactId: survey.contactId,
      leadId: survey.leadId,
      ...normalized.data,
    },
  });
  await params.prisma.satisfactionSurvey.update({
    where: { id: survey.id },
    data: { status: "responded", answeredAt: response.respondedAt },
  });
  return { ok: true as const, response: serializeResponse(response) };
}
