import { Prisma, type PrismaClient } from "@prisma/client";

export type CompletedServiceReportFilters = {
  clientId: string;
  from: Date;
  to: Date | null;
  departmentId?: string | null;
  departmentIds?: string[] | null;
  assignedUserId?: string | null;
  timezone: string;
  includeDetails?: boolean;
};

export type CompletedServiceReportBucket = {
  id: string | null;
  name: string;
  completedCount: number;
};

export type CompletedServiceReportDepartmentAgentBucket = {
  departmentId: string | null;
  departmentName: string;
  assignedUserId: string | null;
  agentName: string;
  completedCount: number;
};

export type CompletedServiceReportDailyBucket = {
  date: string;
  completedCount: number;
};

export type CompletedServiceReportDetailRow = {
  id: string;
  protocol: string;
  closedAt: string;
  agentName: string;
  departmentName: string;
  queueName: string;
  closeReason: string | null;
  closeSource: string | null;
};

export type CompletedServiceReportResponse = {
  ok: true;
  periodFrom: string;
  periodTo: string | null;
  departmentId: string | null;
  assignedUserId: string | null;
  timezone: string;
  availableSince: string | null;
  totalCompleted: number;
  byAgent: CompletedServiceReportBucket[];
  byDepartment: CompletedServiceReportBucket[];
  byDepartmentAgent: CompletedServiceReportDepartmentAgentBucket[];
  daily: CompletedServiceReportDailyBucket[];
  details: CompletedServiceReportDetailRow[];
  notes: string[];
};

type CompletedServiceDelegate = Prisma.TransactionClient["completedServiceSnapshot"];

function buildWhere(params: CompletedServiceReportFilters): Prisma.CompletedServiceSnapshotWhereInput {
  const and: Prisma.CompletedServiceSnapshotWhereInput[] = [
    {
      clientId: params.clientId,
      closedAt: {
        gte: params.from,
        ...(params.to ? { lte: params.to } : {}),
      },
    },
  ];
  if (params.departmentId) {
    and.push({ departmentId: params.departmentId });
  } else if (params.departmentIds) {
    and.push({ departmentId: { in: params.departmentIds } });
  }
  if (params.assignedUserId) and.push({ assignedUserId: params.assignedUserId });
  return { AND: and };
}

function countOf(value: number | { _all: number } | undefined) {
  if (typeof value === "number") return value;
  return value?._all ?? 0;
}

async function loadNameMaps(
  prisma: Prisma.TransactionClient | PrismaClient,
  clientId: string,
  params: {
    userIds: Array<string | null>;
    departmentIds: Array<string | null>;
    queueIds?: Array<string | null>;
  }
) {
  const userIds = Array.from(new Set(params.userIds.filter((id): id is string => Boolean(id))));
  const departmentIds = Array.from(new Set(params.departmentIds.filter((id): id is string => Boolean(id))));
  const queueIds = Array.from(new Set((params.queueIds ?? []).filter((id): id is string => Boolean(id))));
  const [users, departments, queues] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { clientId, id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
    departmentIds.length
      ? prisma.department.findMany({
          where: { clientId, id: { in: departmentIds } },
          select: { id: true, name: true },
        })
      : [],
    queueIds.length
      ? prisma.queue.findMany({
          where: { clientId, id: { in: queueIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  return {
    userNameById: new Map(users.map((user) => [user.id, user.name || user.email || "Usuario removido"])),
    departmentNameById: new Map(departments.map((department) => [department.id, department.name || "Setor removido"])),
    queueNameById: new Map(queues.map((queue) => [queue.id, queue.name || "Fila removida"])),
  };
}

function agentName(userId: string | null, userNameById: Map<string, string>) {
  if (!userId) return "Sem atendente";
  return userNameById.get(userId) ?? "Usuario removido";
}

function departmentName(departmentId: string | null, departmentNameById: Map<string, string>) {
  if (!departmentId) return "Sem setor";
  return departmentNameById.get(departmentId) ?? "Setor removido";
}

function queueName(queueId: string | null, queueNameById: Map<string, string>) {
  if (!queueId) return "Sem fila";
  return queueNameById.get(queueId) ?? "Fila removida";
}

function sortBuckets<T extends { completedCount: number; name?: string; agentName?: string; departmentName?: string }>(
  rows: T[]
) {
  return rows.sort((left, right) => {
    if (right.completedCount !== left.completedCount) return right.completedCount - left.completedCount;
    return (left.name ?? left.departmentName ?? left.agentName ?? "").localeCompare(
      right.name ?? right.departmentName ?? right.agentName ?? "",
      "pt-BR"
    );
  });
}

async function loadDailyBuckets(
  prisma: Prisma.TransactionClient | PrismaClient,
  params: CompletedServiceReportFilters
): Promise<CompletedServiceReportDailyBucket[]> {
  if (!params.departmentId && params.departmentIds?.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ date: string; completed_count: bigint | number }>>(
    Prisma.sql`
      SELECT to_char("closedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${params.timezone}, 'YYYY-MM-DD') AS date,
             COUNT(*) AS completed_count
      FROM "CompletedServiceSnapshot"
      WHERE "clientId" = ${params.clientId}::uuid
        AND "closedAt" >= ${params.from}
        ${params.to ? Prisma.sql`AND "closedAt" <= ${params.to}` : Prisma.empty}
        ${params.departmentId ? Prisma.sql`AND "departmentId" = ${params.departmentId}` : Prisma.empty}
        ${
          !params.departmentId && params.departmentIds
            ? Prisma.sql`AND "departmentId" IN (${Prisma.join(params.departmentIds)})`
            : Prisma.empty
        }
        ${params.assignedUserId ? Prisma.sql`AND "assignedUserId" = ${params.assignedUserId}` : Prisma.empty}
      GROUP BY date
      ORDER BY date ASC
    `
  );
  return rows.map((row) => ({
    date: row.date,
    completedCount: Number(row.completed_count),
  }));
}

export async function buildCompletedServiceReport(
  prisma: Prisma.TransactionClient | PrismaClient,
  params: CompletedServiceReportFilters
): Promise<CompletedServiceReportResponse> {
  const where = buildWhere(params);
  const [tenantCutoff, totalCompleted, byAgentRaw, byDepartmentRaw, byDepartmentAgentRaw, daily, detailRaw] =
    await Promise.all([
      (prisma.completedServiceSnapshot as CompletedServiceDelegate).aggregate({
        where: { clientId: params.clientId },
        _min: { closedAt: true },
      }),
      (prisma.completedServiceSnapshot as CompletedServiceDelegate).count({ where }),
      (prisma.completedServiceSnapshot as CompletedServiceDelegate).groupBy({
        by: ["assignedUserId"],
        where,
        _count: { _all: true },
      }),
      (prisma.completedServiceSnapshot as CompletedServiceDelegate).groupBy({
        by: ["departmentId"],
        where,
        _count: { _all: true },
      }),
      (prisma.completedServiceSnapshot as CompletedServiceDelegate).groupBy({
        by: ["departmentId", "assignedUserId"],
        where,
        _count: { _all: true },
      }),
      loadDailyBuckets(prisma, params),
      params.includeDetails
        ? (prisma.completedServiceSnapshot as CompletedServiceDelegate).findMany({
            where,
            orderBy: [{ closedAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              protocol: true,
              closedAt: true,
              assignedUserId: true,
              departmentId: true,
              queueId: true,
              closeReason: true,
              closeSource: true,
            },
          })
        : [],
    ]);

  const { userNameById, departmentNameById, queueNameById } = await loadNameMaps(prisma, params.clientId, {
    userIds: [
      ...byAgentRaw.map((row) => row.assignedUserId),
      ...byDepartmentAgentRaw.map((row) => row.assignedUserId),
      ...detailRaw.map((row) => row.assignedUserId),
    ],
    departmentIds: [
      ...byDepartmentRaw.map((row) => row.departmentId),
      ...byDepartmentAgentRaw.map((row) => row.departmentId),
      ...detailRaw.map((row) => row.departmentId),
    ],
    queueIds: detailRaw.map((row) => row.queueId),
  });

  return {
    ok: true,
    periodFrom: params.from.toISOString(),
    periodTo: params.to?.toISOString() ?? null,
    departmentId: params.departmentId ?? null,
    assignedUserId: params.assignedUserId ?? null,
    timezone: params.timezone,
    availableSince: tenantCutoff._min.closedAt?.toISOString() ?? null,
    totalCompleted,
    byAgent: sortBuckets(
      byAgentRaw.map((row) => ({
        id: row.assignedUserId,
        name: agentName(row.assignedUserId, userNameById),
        completedCount: countOf(row._count),
      }))
    ),
    byDepartment: sortBuckets(
      byDepartmentRaw.map((row) => ({
        id: row.departmentId,
        name: departmentName(row.departmentId, departmentNameById),
        completedCount: countOf(row._count),
      }))
    ),
    byDepartmentAgent: sortBuckets(
      byDepartmentAgentRaw.map((row) => ({
        departmentId: row.departmentId,
        departmentName: departmentName(row.departmentId, departmentNameById),
        assignedUserId: row.assignedUserId,
        agentName: agentName(row.assignedUserId, userNameById),
        completedCount: countOf(row._count),
      }))
    ),
    daily,
    details: detailRaw.map((row) => ({
      id: row.id,
      protocol: row.protocol,
      closedAt: row.closedAt.toISOString(),
      agentName: agentName(row.assignedUserId, userNameById),
      departmentName: departmentName(row.departmentId, departmentNameById),
      queueName: queueName(row.queueId, queueNameById),
      closeReason: row.closeReason ?? null,
      closeSource: row.closeSource ?? null,
    })),
    notes: [
      "Cada atendimento concluido corresponde a um ciclo/protocolo encerrado, contabilizado no momento do fechamento.",
      tenantCutoff._min.closedAt
        ? `Dados disponiveis a partir de ${tenantCutoff._min.closedAt.toISOString()}.`
        : "Este indicador ainda nao possui historico disponivel.",
    ],
  };
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCompletedServiceReportCsv(
  report: CompletedServiceReportResponse,
  view: "by-agent" | "department-agent" | "detail"
) {
  if (view === "detail") {
    const rows = [
      ["PROTOCOLO", "DATA/HORA FECHAMENTO", "ATENDENTE", "SETOR", "FILA", "MOTIVO FECHAMENTO", "ORIGEM FECHAMENTO"],
      ...report.details.map((item) => [
        item.protocol,
        item.closedAt,
        item.agentName,
        item.departmentName,
        item.queueName,
        item.closeReason ?? "",
        item.closeSource ?? "",
      ]),
    ];
    return `${rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n")}\n`;
  }
  const rows =
    view === "by-agent"
      ? [["ATENDENTE", "TOTAL"], ...report.byAgent.map((item) => [item.name, item.completedCount] as const)]
      : [
          ["SETOR", "ATENDENTE", "TOTAL"],
          ...report.byDepartmentAgent.map(
            (item) => [item.departmentName, item.agentName, item.completedCount] as const
          ),
        ];
  return `${rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\n")}\n`;
}
