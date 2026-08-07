import type { PrismaClient } from "@prisma/client";

export type ReadinessStatus = "OK" | "WARN" | "FAIL";

export type DemoTenantReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type DemoTenantReadinessReport = {
  tenantKey: string;
  generatedAt: string;
  overallStatus: ReadinessStatus;
  summary: Record<ReadinessStatus, number>;
  checks: DemoTenantReadinessCheck[];
};

const EXPECTED_DEMO_FEATURES = [
  "crm",
  "campaigns",
  "templates",
  "reports",
  "departments",
  "chatbot",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function countStatus(checks: DemoTenantReadinessCheck[], status: ReadinessStatus) {
  return checks.filter((check) => check.status === status).length;
}

function pushCheck(
  checks: DemoTenantReadinessCheck[],
  check: DemoTenantReadinessCheck
) {
  checks.push({
    ...check,
    details: check.details ? sanitizeDetails(check.details) : undefined,
  });
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.map((item) => (isRecord(item) ? sanitizeDetails(item) : item))];
      }
      if (isRecord(value)) return [key, sanitizeDetails(value)];
      return [key, value];
    })
  );
}

export function maskSensitiveIdentifier(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `****${digits.slice(-4)} (len ${digits.length})`;
  }
  return `masked (len ${value.length})`;
}

export function summarizeOperationalConfig(configValue: unknown) {
  const config = toObject(configValue);
  const cannedReplies = Array.isArray(config.cannedReplies)
    ? config.cannedReplies.filter((item) => isRecord(item))
    : [];
  const activeCannedReplies = cannedReplies.filter((item) => item.active !== false);
  const queueAssignmentPolicy = toObject(config.queueAssignmentPolicy);
  const metaUsagePolicy = toObject(config.metaUsagePolicy);

  return {
    cannedReplies: {
      total: cannedReplies.length,
      active: activeCannedReplies.length,
    },
    queueAssignmentPolicy: {
      configured: Object.keys(queueAssignmentPolicy).length > 0,
      enabled: queueAssignmentPolicy.enabled === true,
      mode: typeof queueAssignmentPolicy.mode === "string" ? queueAssignmentPolicy.mode : null,
      scope: typeof queueAssignmentPolicy.scope === "string" ? queueAssignmentPolicy.scope : null,
      requireOnline: queueAssignmentPolicy.requireOnline === true,
    },
    metaUsagePolicy: {
      configured: Object.keys(metaUsagePolicy).length > 0,
      enabled: metaUsagePolicy.enabled === true,
      mode: typeof metaUsagePolicy.mode === "string" ? metaUsagePolicy.mode : null,
    },
  };
}

export function buildReadinessSummary(checks: DemoTenantReadinessCheck[]) {
  const summary = {
    OK: countStatus(checks, "OK"),
    WARN: countStatus(checks, "WARN"),
    FAIL: countStatus(checks, "FAIL"),
  };
  const overallStatus: ReadinessStatus =
    summary.FAIL > 0 ? "FAIL" : summary.WARN > 0 ? "WARN" : "OK";
  return { summary, overallStatus };
}

export async function buildDemoTenantReadinessReport(params: {
  prisma: PrismaClient;
  tenantKey: string;
  now?: Date;
}): Promise<DemoTenantReadinessReport> {
  const generatedAt = (params.now ?? new Date()).toISOString();
  const checks: DemoTenantReadinessCheck[] = [];
  const client = await params.prisma.client.findUnique({
    where: { clientKey: params.tenantKey },
    select: {
      id: true,
      clientKey: true,
      name: true,
      status: true,
      features: true,
      profile: true,
    },
  });

  if (!client) {
    pushCheck(checks, {
      id: "tenant",
      label: "Tenant",
      status: "FAIL",
      message: "Tenant nao encontrado.",
      details: { tenantKey: params.tenantKey },
    });
    const { summary, overallStatus } = buildReadinessSummary(checks);
    return { tenantKey: params.tenantKey, generatedAt, overallStatus, summary, checks };
  }

  pushCheck(checks, {
    id: "tenant",
    label: "Tenant",
    status: client.status === "ACTIVE" ? "OK" : "FAIL",
    message:
      client.status === "ACTIVE"
        ? "Tenant encontrado e ativo."
        : "Tenant existe, mas nao esta ativo.",
    details: {
      tenantKey: client.clientKey,
      tenantName: client.name,
      status: client.status,
      profile: client.profile,
    },
  });

  const features = toObject(client.features);
  const disabledFeatures = EXPECTED_DEMO_FEATURES.filter((feature) => features[feature] === false);
  const explicitlyEnabledFeatures = EXPECTED_DEMO_FEATURES.filter((feature) => features[feature] === true);
  const implicitFeatures = EXPECTED_DEMO_FEATURES.filter(
    (feature) => features[feature] !== true && features[feature] !== false
  );
  pushCheck(checks, {
    id: "features",
    label: "Features e capabilities",
    status: disabledFeatures.length > 0 ? "FAIL" : implicitFeatures.length > 0 ? "WARN" : "OK",
    message:
      disabledFeatures.length > 0
        ? "Ha features esperadas explicitamente desativadas."
        : implicitFeatures.length > 0
          ? "Ha features esperadas sem declaracao explicita; confirmar heranca/padrao do produto."
          : "Features esperadas estao explicitamente habilitadas.",
    details: {
      expected: [...EXPECTED_DEMO_FEATURES],
      enabled: explicitlyEnabledFeatures,
      implicit: implicitFeatures,
      disabled: disabledFeatures,
    },
  });

  const [
    operationalConfig,
    metaConfig,
    waPhoneNumbers,
    channelAccounts,
    templates,
    users,
    departments,
    queues,
    leadCount,
    contactCount,
    recentCriticalEvents,
  ] = await Promise.all([
    params.prisma.tenantOperationalConfig.findUnique({
      where: { clientId: client.id },
      select: { config: true, schemaVersion: true, updatedAt: true },
    }),
    params.prisma.tenantMetaConfig.findUnique({
      where: { clientId: client.id },
      select: {
        businessId: true,
        businessPortfolioId: true,
        wabaId: true,
        phoneNumberId: true,
        updatedAt: true,
      },
    }),
    params.prisma.waPhoneNumber.findMany({
      where: { clientId: client.id },
      select: { phoneNumberId: true, display: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    params.prisma.channelAccount.findMany({
      where: { clientId: client.id },
      select: {
        channel: true,
        provider: true,
        channelAccountId: true,
        enabled: true,
        runtimeEnabled: true,
        inboundPersistenceEnabled: true,
        outboundEnabled: true,
        status: true,
        tokenStatus: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    params.prisma.template.findMany({
      where: { clientId: client.id },
      select: { status: true, category: true, language: true, updatedAt: true },
    }),
    params.prisma.user.findMany({
      where: { clientId: client.id },
      select: { role: true, isActive: true },
    }),
    params.prisma.department.findMany({
      where: { clientId: client.id },
      select: { isActive: true },
    }),
    params.prisma.queue.findMany({
      where: { clientId: client.id },
      select: { id: true },
    }),
    params.prisma.lead.count({ where: { tenantId: client.id } }),
    params.prisma.contact.count({ where: { clientId: client.id } }),
    params.prisma.event.count({
      where: {
        clientId: client.id,
        eventName: {
          in: [
            "meta.usage.limit_exceeded",
            "privacy.anonymized_rehydration_blocked",
            "queue.assignment.no_eligible_agent",
            "template.request.notification_failed",
          ],
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const configSummary = summarizeOperationalConfig(operationalConfig?.config);
  pushCheck(checks, {
    id: "operational_config",
    label: "TenantOperationalConfig",
    status: operationalConfig ? "OK" : "WARN",
    message: operationalConfig
      ? "Configuracao operacional encontrada."
      : "Configuracao operacional ainda nao encontrada.",
    details: {
      schemaVersion: operationalConfig?.schemaVersion ?? null,
      updatedAt: operationalConfig?.updatedAt?.toISOString() ?? null,
      cannedReplies: configSummary.cannedReplies,
      queueAssignmentPolicy: configSummary.queueAssignmentPolicy,
      metaUsagePolicy: configSummary.metaUsagePolicy,
    },
  });

  pushCheck(checks, {
    id: "meta_config",
    label: "TenantMetaConfig",
    status: metaConfig?.phoneNumberId && metaConfig.wabaId ? "OK" : "FAIL",
    message:
      metaConfig?.phoneNumberId && metaConfig.wabaId
        ? "Configuracao Meta minima encontrada."
        : "Configuracao Meta minima ausente ou incompleta.",
    details: {
      businessId: maskSensitiveIdentifier(metaConfig?.businessId),
      businessPortfolioId: maskSensitiveIdentifier(metaConfig?.businessPortfolioId),
      wabaId: maskSensitiveIdentifier(metaConfig?.wabaId),
      phoneNumberId: maskSensitiveIdentifier(metaConfig?.phoneNumberId),
      updatedAt: metaConfig?.updatedAt?.toISOString() ?? null,
    },
  });

  pushCheck(checks, {
    id: "wa_phone_number",
    label: "WaPhoneNumber",
    status: waPhoneNumbers.length > 0 ? "OK" : "FAIL",
    message:
      waPhoneNumbers.length > 0
        ? "Numero WhatsApp vinculado ao tenant encontrado."
        : "Nenhum numero WhatsApp vinculado ao tenant.",
    details: {
      count: waPhoneNumbers.length,
      numbers: waPhoneNumbers.slice(0, 3).map((number) => ({
        phoneNumberId: maskSensitiveIdentifier(number.phoneNumberId),
        display: maskSensitiveIdentifier(number.display),
      })),
    },
  });

  const whatsappAccounts = channelAccounts.filter((account) => account.channel === "whatsapp");
  pushCheck(checks, {
    id: "channel_accounts",
    label: "ChannelAccount",
    status: whatsappAccounts.length > 0 ? "OK" : "WARN",
    message:
      whatsappAccounts.length > 0
        ? "Conta de canal WhatsApp encontrada no modelo multicanal."
        : "Sem ChannelAccount WhatsApp; verificar se este tenant usa apenas TenantMetaConfig/WaPhoneNumber.",
    details: {
      total: channelAccounts.length,
      whatsapp: whatsappAccounts.map((account) => ({
        provider: account.provider,
        channelAccountId: maskSensitiveIdentifier(account.channelAccountId),
        enabled: account.enabled,
        runtimeEnabled: account.runtimeEnabled,
        inboundPersistenceEnabled: account.inboundPersistenceEnabled,
        outboundEnabled: account.outboundEnabled,
        status: account.status,
        tokenStatus: account.tokenStatus,
      })),
    },
  });

  const approvedTemplates = templates.filter((template) => template.status.toLowerCase() === "approved");
  pushCheck(checks, {
    id: "templates",
    label: "Templates Meta",
    status: approvedTemplates.length > 0 ? "OK" : templates.length > 0 ? "WARN" : "FAIL",
    message:
      approvedTemplates.length > 0
        ? "Ha templates aprovados sincronizados."
        : templates.length > 0
          ? "Ha templates, mas nenhum aprovado localmente."
          : "Nenhum template encontrado.",
    details: {
      total: templates.length,
      approved: approvedTemplates.length,
      byStatus: countBy(templates.map((template) => template.status.toLowerCase())),
      byCategory: countBy(templates.map((template) => template.category.toLowerCase())),
    },
  });

  const activeUsers = users.filter((user) => user.isActive);
  const activeRoles = countBy(activeUsers.map((user) => user.role));
  const missingRoles = ["ADMIN", "SUPERVISOR", "AGENT"].filter((role) => !activeRoles[role]);
  pushCheck(checks, {
    id: "users",
    label: "Usuarios e papeis",
    status: missingRoles.length === 0 ? "OK" : "WARN",
    message:
      missingRoles.length === 0
        ? "Usuarios ativos cobrem ADMIN, SUPERVISOR e AGENT."
        : "Faltam papeis ativos recomendados para demonstracao.",
    details: {
      activeTotal: activeUsers.length,
      inactiveTotal: users.length - activeUsers.length,
      activeRoles,
      missingRoles,
    },
  });

  const activeDepartments = departments.filter((department) => department.isActive);
  pushCheck(checks, {
    id: "departments",
    label: "Departamentos e filas",
    status: activeDepartments.length > 0 ? "OK" : "WARN",
    message:
      activeDepartments.length > 0
        ? "Departamentos ativos encontrados."
        : "Nenhum departamento ativo encontrado.",
    details: {
      activeDepartments: activeDepartments.length,
      inactiveDepartments: departments.length - activeDepartments.length,
      queues: queues.length,
    },
  });

  pushCheck(checks, {
    id: "canned_replies",
    label: "Mensagens prontas",
    status: configSummary.cannedReplies.active > 0 ? "OK" : "WARN",
    message:
      configSummary.cannedReplies.active > 0
        ? "Mensagens prontas ativas configuradas."
        : "Mensagens prontas ativas ausentes.",
    details: configSummary.cannedReplies,
  });

  pushCheck(checks, {
    id: "queue_assignment_policy",
    label: "Politica de atribuicao",
    status: configSummary.queueAssignmentPolicy.configured ? "OK" : "WARN",
    message: configSummary.queueAssignmentPolicy.configured
      ? "Politica de fila configurada; ativacao depende do tenant."
      : "Politica de fila ausente; comportamento efetivo permanece manual.",
    details: configSummary.queueAssignmentPolicy,
  });

  pushCheck(checks, {
    id: "crm_demo_data",
    label: "CRM demo",
    status: leadCount + contactCount > 0 ? "WARN" : "WARN",
    message:
      leadCount + contactCount > 0
        ? "Ha registros CRM; confirmar que sao ficticios e sem PII real antes da apresentacao."
        : "Sem registros CRM para demonstracao.",
    details: { leads: leadCount, contacts: contactCount },
  });

  pushCheck(checks, {
    id: "critical_events",
    label: "Eventos criticos recentes",
    status: recentCriticalEvents === 0 ? "OK" : "WARN",
    message:
      recentCriticalEvents === 0
        ? "Nenhum evento critico conhecido nas ultimas 24 horas."
        : "Ha eventos criticos recentes; revisar antes da demonstracao.",
    details: { recentCriticalEvents },
  });

  const { summary, overallStatus } = buildReadinessSummary(checks);
  return { tenantKey: params.tenantKey, generatedAt, overallStatus, summary, checks };
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
