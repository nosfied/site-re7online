import { Prisma } from "@prisma/client";

export type SessionAuditStatus = "OPEN" | "CLOSED";

export type SessionAuditFilters = {
  clientId: string;
  from: Date;
  to: Date;
  userId?: string | null;
  role?: string | null;
  status?: SessionAuditStatus | null;
  page?: number | null;
  limit?: number | null;
};

export type SessionAuditReportItem = {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginAt: string;
  endedAt: string | null;
  endReason: string | null;
  endReasonLabel: string;
  status: SessionAuditStatus;
  statusLabel: string;
  durationObservedSec: number | null;
  lastSeenAt: string | null;
};

export type SessionAuditReportResponse = {
  ok: true;
  periodFrom: string;
  periodTo: string;
  userId: string | null;
  role: string | null;
  status: SessionAuditStatus | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: SessionAuditReportItem[];
  notes: string[];
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export function normalizeSessionAuditStatus(input: unknown): SessionAuditStatus | null {
  const value = String(input ?? "").trim().toUpperCase();
  if (!value) return null;
  if (value === "OPEN" || value === "ACTIVE") return "OPEN";
  if (value === "CLOSED") return "CLOSED";
  return null;
}

export function normalizeSessionAuditRole(input: unknown) {
  const value = String(input ?? "").trim().toUpperCase();
  if (!value) return null;
  if (["ADMIN", "SUPERVISOR", "AGENT"].includes(value)) return value;
  return null;
}

export function buildSessionEndReasonLabel(reason: string | null | undefined) {
  const normalized = String(reason ?? "").trim();
  if (!normalized) return "Encerramento nao registrado";
  if (normalized === "logout") return "Logout explicito";
  if (normalized === "replaced_by_new_login") return "Substituida por novo login";
  if (normalized === "password_reset") return "Revogada apos redefinicao de senha";
  return normalized.replace(/[_-]+/g, " ");
}

export function formatObservedDurationSeconds(loginAt: Date, endedAt: Date | null) {
  if (!endedAt) return null;
  const diff = endedAt.getTime() - loginAt.getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.floor(diff / 1000);
}

function normalizePage(input?: number | null) {
  const value = Number(input ?? 1);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function normalizeLimit(input?: number | null) {
  const value = Number(input ?? DEFAULT_LIMIT);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

function buildWhere(params: SessionAuditFilters): Prisma.AppAuthSessionWhereInput {
  return {
    clientId: params.clientId,
    createdAt: {
      gte: params.from,
      lte: params.to,
    },
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.role ? { user: { role: params.role } } : {}),
    ...(params.status === "OPEN"
      ? { revokedAt: null }
      : params.status === "CLOSED"
        ? { revokedAt: { not: null } }
        : {}),
  };
}

export async function buildSessionAuditReport(
  prisma: Prisma.TransactionClient,
  params: SessionAuditFilters
): Promise<SessionAuditReportResponse> {
  const page = normalizePage(params.page);
  const limit = normalizeLimit(params.limit);
  const where = buildWhere(params);
  const [total, sessions] = await Promise.all([
    prisma.appAuthSession.count({ where }),
    prisma.appAuthSession.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        createdAt: true,
        lastSeenAt: true,
        revokedAt: true,
        revokeReason: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    }),
  ]);
  const items = sessions.map((session): SessionAuditReportItem => {
    const status: SessionAuditStatus = session.revokedAt ? "CLOSED" : "OPEN";
    const reasonLabel = buildSessionEndReasonLabel(session.revokeReason);
    return {
      id: session.id,
      userId: session.userId,
      userName: session.user.name,
      role: session.user.role,
      loginAt: session.createdAt.toISOString(),
      endedAt: session.revokedAt?.toISOString() ?? null,
      endReason: session.revokeReason ?? null,
      endReasonLabel: reasonLabel,
      status,
      statusLabel: status === "OPEN" ? "Aberta" : "Encerrada",
      durationObservedSec: formatObservedDurationSeconds(session.createdAt, session.revokedAt),
      lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    };
  });
  return {
    ok: true,
    periodFrom: params.from.toISOString(),
    periodTo: params.to.toISOString(),
    userId: params.userId ?? null,
    role: params.role ?? null,
    status: params.status ?? null,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items,
    notes: [
      "Relatorio de auditoria operacional de acesso/sessao; nao e controle de ponto.",
      "Sessoes abertas nao significam presenca online ou jornada de trabalho.",
      "Ultima atividade observada vem de atividade autenticada vista pela aplicacao.",
      "Sessoes antigas sem encerramento registrado nao recebem logout inferido.",
    ],
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildSessionAuditCsv(report: SessionAuditReportResponse) {
  const header = [
    "usuario",
    "perfil",
    "login",
    "encerramento",
    "motivo",
    "duracao_observada_segundos",
    "ultima_atividade_observada",
    "status",
  ];
  const rows = report.items.map((item) =>
    [
      item.userName,
      item.role,
      item.loginAt,
      item.endedAt ?? "",
      item.endReasonLabel,
      item.durationObservedSec ?? "",
      item.lastSeenAt ?? "",
      item.statusLabel,
    ].map(csvCell).join(",")
  );
  return [header.map(csvCell).join(","), ...rows].join("\n");
}
