import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AIQualificationState, FlowContext } from "../conversation/conversation.types.js";

export type ConversationExportCandidate = {
  id: string;
  tenantKey: string;
  description: string;
  requiresHumanReview: true;
  expectationsDraft: true;
  source: {
    type: "conversation_export";
    anonymized: boolean;
    sourceTenantKey: string;
    sourceConversationRef: string;
    exportedAt: string;
  };
  turns: Array<{
    inbound: string;
    expected?: {
      qualificationSlots?: Record<string, unknown>;
      expectedHandoff?: boolean;
      expectedPendingConfirmation?: boolean;
      expectedMode?: string;
      expectedStatus?: string;
    };
  }>;
  observedFinalState: {
    qualificationSlots?: Record<string, unknown>;
    flowContext?: FlowContext;
    handoff: boolean;
    handoffStatus?: string | null;
    mode?: string | null;
    status?: string | null;
    leadStatus?: string | null;
    leadService?: string | null;
    leadCompany?: string | null;
    tags?: string[];
    summary?: string[];
  };
};

export type ConversationExportResult =
  | ConversationExportCandidate
  | {
      exportedAt: string;
      candidates: ConversationExportCandidate[];
    };

export type ConversationExportOptions = {
  tenantKey: string;
  waId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit: number;
  anonymize: boolean;
};

type ExportSource = {
  client: { id: string; clientKey: string };
  runtime: {
    waId: string;
    waIdCanonical: string | null;
    answers: unknown;
    handoffStatus: string;
    mode: string | null;
    status: string | null;
  };
  inbound: Array<{ bodyText: string | null; createdAt: Date }>;
  lead?: {
    name: string | null;
    phone: string | null;
    city: string | null;
    service: string | null;
    email: string | null;
    company: string | null;
    status: string;
  } | null;
  leadNotes: Array<{ body: string; createdAt: Date }>;
};

type Anonymizer = {
  anonymizeText(value: unknown): string;
  anonymizeJson<T>(value: T): T;
  sourceRef(value: string): string;
};

function normalizeDigits(input: unknown) {
  return typeof input === "string" ? input.replace(/\D+/g, "") : "";
}

function normalizeText(input: unknown) {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
}

function tokenFor(prefix: string, index: number) {
  return `${prefix}_${String(index).padStart(3, "0")}`;
}

export function createConversationAnonymizer(params: {
  tenantKey: string;
  waId?: string | null;
  knownValues?: Array<{ value?: string | null; tokenPrefix: string }>;
  anonymize: boolean;
}): Anonymizer {
  const replacements: Array<{ pattern: RegExp; token: string }> = [];
  const counters = new Map<string, number>();
  const addLiteral = (value: unknown, tokenPrefix: string) => {
    const text = normalizeText(value);
    if (!text || text.length < 3) return;
    const nextIndex = (counters.get(tokenPrefix) ?? 0) + 1;
    counters.set(tokenPrefix, nextIndex);
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    replacements.push({ pattern: new RegExp(escaped, "gi"), token: tokenFor(tokenPrefix, nextIndex) });
  };

  const waDigits = normalizeDigits(params.waId);
  if (waDigits) {
    replacements.push({ pattern: new RegExp(waDigits, "g"), token: "USER_001" });
    addLiteral(params.waId, "USER");
  }
  for (const item of params.knownValues ?? []) addLiteral(item.value, item.tokenPrefix);

  const anonymizeText = (value: unknown) => {
    let text = normalizeText(value);
    if (!params.anonymize) return text;
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "EMAIL_001");
    text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "CPF_001");
    text = text.replace(/\b(?:\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}\b/g, "PHONE_001");
    text = text.replace(/https?:\/\/\S+/gi, "URL_001");
    text = text.replace(/\b\d{8,}\b/g, "NUMBER_001");
    for (const replacement of replacements) {
      text = text.replace(replacement.pattern, replacement.token);
    }
    return text;
  };

  const anonymizeJson = <T>(value: T): T => {
    if (!params.anonymize) return value;
    if (typeof value === "string") return anonymizeText(value) as T;
    if (Array.isArray(value)) return value.map((item) => anonymizeJson(item)) as T;
    if (!value || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = anonymizeJson(nested);
    }
    return output as T;
  };

  const sourceRef = (value: string) =>
    crypto.createHash("sha256").update(`${params.tenantKey}:${value}`).digest("hex").slice(0, 16);

  return { anonymizeText, anonymizeJson, sourceRef };
}

function extractAnswers(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return {};
  return answers as {
    aiQualification?: AIQualificationState;
    flowContext?: FlowContext;
    flowTags?: string[];
    aiMemory?: { summary?: string };
  };
}

export function buildConversationEvaluationCandidate(params: {
  source: ExportSource;
  tenantKey: string;
  exportedAt?: string;
  anonymize?: boolean;
}): ConversationExportCandidate {
  const source = params.source;
  const exportedAt = params.exportedAt ?? new Date().toISOString();
  const anonymizer = createConversationAnonymizer({
    tenantKey: params.tenantKey,
    waId: source.runtime.waIdCanonical ?? source.runtime.waId,
    anonymize: params.anonymize !== false,
    knownValues: [
      { value: source.lead?.name, tokenPrefix: "NAME" },
      { value: source.lead?.company, tokenPrefix: "COMPANY" },
      { value: source.lead?.city, tokenPrefix: "CITY" },
      { value: source.lead?.email, tokenPrefix: "EMAIL" },
      { value: source.lead?.phone, tokenPrefix: "PHONE" },
    ],
  });
  const answers = extractAnswers(source.runtime.answers);
  const qualification = answers.aiQualification;
  const slots = qualification?.slots ?? {};
  const pendingSemanticConfirmation = Boolean(qualification?.pendingSemanticConfirmation);
  const handoff = source.runtime.handoffStatus === "ACTIVE" || source.runtime.mode === "HUMAN";
  const expected =
    Object.keys(slots).length || handoff || pendingSemanticConfirmation || source.runtime.mode || source.runtime.status
      ? {
          ...(Object.keys(slots).length ? { qualificationSlots: anonymizer.anonymizeJson(slots) } : {}),
          ...(handoff ? { expectedHandoff: true } : {}),
          ...(pendingSemanticConfirmation ? { expectedPendingConfirmation: true } : {}),
          ...(source.runtime.mode ? { expectedMode: source.runtime.mode } : {}),
          ...(source.runtime.status ? { expectedStatus: source.runtime.status } : {}),
        }
      : undefined;
  const turns = source.inbound
    .filter((message) => normalizeText(message.bodyText))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((message, index, items) => ({
      inbound: anonymizer.anonymizeText(message.bodyText),
      ...(index === items.length - 1 && expected ? { expected } : {}),
    }));
  const rawSummary = [
    answers.aiMemory?.summary,
    ...source.leadNotes.slice(-3).map((note) => note.body),
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const summary =
    params.anonymize === false
      ? rawSummary.map((item) => anonymizer.anonymizeText(item)).filter(Boolean)
      : rawSummary.length
        ? ["[resumo anonimizado]"]
        : [];

  return {
    id: `candidate-${params.tenantKey}-${anonymizer.sourceRef(source.runtime.waIdCanonical ?? source.runtime.waId)}`,
    tenantKey: params.tenantKey,
    description: "Candidate generated from real conversation",
    requiresHumanReview: true,
    expectationsDraft: true,
    source: {
      type: "conversation_export",
      anonymized: params.anonymize !== false,
      sourceTenantKey: params.tenantKey,
      sourceConversationRef: anonymizer.sourceRef(source.runtime.waIdCanonical ?? source.runtime.waId),
      exportedAt,
    },
    turns,
    observedFinalState: {
      ...(Object.keys(slots).length ? { qualificationSlots: anonymizer.anonymizeJson(slots) } : {}),
      ...(answers.flowContext ? { flowContext: anonymizer.anonymizeJson(answers.flowContext) } : {}),
      handoff,
      handoffStatus: source.runtime.handoffStatus,
      mode: source.runtime.mode,
      status: source.runtime.status,
      leadStatus: source.lead?.status ?? null,
      leadService: anonymizer.anonymizeText(source.lead?.service),
      leadCompany: anonymizer.anonymizeText(source.lead?.company),
      tags: Array.isArray(answers.flowTags) ? answers.flowTags.slice(0, 20) : [],
      ...(summary.length ? { summary } : {}),
    },
  };
}

export async function exportConversationCandidates(params: {
  prisma: PrismaClient;
  options: ConversationExportOptions;
}): Promise<ConversationExportResult> {
  const { prisma, options } = params;
  const client = await prisma.client.findUnique({
    where: { clientKey: options.tenantKey },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`tenant not found: ${options.tenantKey}`);
  const waIdDigits = normalizeDigits(options.waId);
  const updatedAt =
    options.fromDate || options.toDate
      ? {
          updatedAt: {
            ...(options.fromDate ? { gte: options.fromDate } : {}),
            ...(options.toDate ? { lte: options.toDate } : {}),
          },
        }
      : {};
  const runtimeWhere = {
    clientId: client.id,
    ...(waIdDigits
      ? { OR: [{ waId: options.waId }, { waIdCanonical: waIdDigits }] }
      : {}),
    ...updatedAt,
  };
  let runtimes = await prisma.conversationRuntimeState.findMany({
    where: runtimeWhere,
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(options.limit, 100)),
    select: {
      waId: true,
      waIdCanonical: true,
      answers: true,
      handoffStatus: true,
      mode: true,
      status: true,
    },
  });
  if (options.waId && !runtimes.length && waIdDigits.length >= 4) {
    const last4 = waIdDigits.slice(-4);
    runtimes = await prisma.conversationRuntimeState.findMany({
      where: {
        clientId: client.id,
        OR: [{ waId: { contains: last4 } }, { waIdCanonical: { contains: last4 } }],
        ...updatedAt,
      },
      orderBy: { updatedAt: "desc" },
      take: Math.max(1, Math.min(options.limit, 100)),
      select: {
        waId: true,
        waIdCanonical: true,
        answers: true,
        handoffStatus: true,
        mode: true,
        status: true,
      },
    });
  }
  const candidates: ConversationExportCandidate[] = [];
  for (const runtime of runtimes) {
    const waIds = [runtime.waId, runtime.waIdCanonical].filter(Boolean) as string[];
    const [inbound, lead] = await Promise.all([
      prisma.inboundMessage.findMany({
        where: {
          clientId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
          ...(options.fromDate || options.toDate
            ? {
                createdAt: {
                  ...(options.fromDate ? { gte: options.fromDate } : {}),
                  ...(options.toDate ? { lte: options.toDate } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { bodyText: true, createdAt: true },
      }),
      prisma.lead.findFirst({
        where: {
          tenantId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          service: true,
          email: true,
          company: true,
          status: true,
        },
      }),
    ]);
    const leadNotes = lead
      ? await prisma.leadNote.findMany({
          where: { tenantId: client.id, leadId: lead.id },
          orderBy: { createdAt: "asc" },
          take: 20,
          select: { body: true, createdAt: true },
        })
      : [];
    if (!inbound.length) continue;
    candidates.push(
      buildConversationEvaluationCandidate({
        source: { client, runtime, inbound, lead, leadNotes },
        tenantKey: client.clientKey,
        anonymize: options.anonymize,
      })
    );
  }
  if (options.waId && !candidates.length) {
    let conversations = await prisma.conversation.findMany({
      where: {
        clientId: client.id,
        OR: [{ waId: options.waId }, { waIdCanonical: waIdDigits }],
        ...updatedAt,
      },
      orderBy: { updatedAt: "desc" },
      take: Math.max(1, Math.min(options.limit, 100)),
      select: {
        waId: true,
        waIdCanonical: true,
        updatedAt: true,
      },
    });
    if (!conversations.length && waIdDigits.length >= 4) {
      const last4 = waIdDigits.slice(-4);
      conversations = await prisma.conversation.findMany({
        where: {
          clientId: client.id,
          OR: [{ waId: { contains: last4 } }, { waIdCanonical: { contains: last4 } }],
          ...updatedAt,
        },
        orderBy: { updatedAt: "desc" },
        take: Math.max(1, Math.min(options.limit, 100)),
        select: {
          waId: true,
          waIdCanonical: true,
          updatedAt: true,
        },
      });
    }
    for (const conversation of conversations) {
      const waIds = [conversation.waId, conversation.waIdCanonical].filter(Boolean) as string[];
      const [inbound, lead] = await Promise.all([
        prisma.inboundMessage.findMany({
          where: {
            clientId: client.id,
            OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
            ...(options.fromDate || options.toDate
              ? {
                  createdAt: {
                    ...(options.fromDate ? { gte: options.fromDate } : {}),
                    ...(options.toDate ? { lte: options.toDate } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: { bodyText: true, createdAt: true },
        }),
        prisma.lead.findFirst({
          where: {
            tenantId: client.id,
            OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
          },
          select: {
            id: true,
            name: true,
            phone: true,
            city: true,
            service: true,
            email: true,
            company: true,
            status: true,
          },
        }),
      ]);
      const leadNotes = lead
        ? await prisma.leadNote.findMany({
            where: { tenantId: client.id, leadId: lead.id },
            orderBy: { createdAt: "asc" },
            take: 20,
            select: { body: true, createdAt: true },
          })
        : [];
      if (!inbound.length) continue;
      candidates.push(
        buildConversationEvaluationCandidate({
          source: {
            client,
            runtime: {
              waId: conversation.waId,
              waIdCanonical: conversation.waIdCanonical,
              answers: {},
              handoffStatus: "NONE",
              mode: null,
              status: null,
            },
            inbound,
            lead,
            leadNotes,
          },
          tenantKey: client.clientKey,
          anonymize: options.anonymize,
        })
      );
    }
  }
  if (options.waId && candidates.length <= 1) {
    if (!candidates[0]) throw new Error("conversation not found or has no inbound messages");
    return candidates[0];
  }
  return { exportedAt: new Date().toISOString(), candidates };
}
