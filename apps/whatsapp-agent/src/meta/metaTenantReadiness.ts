import type { PrismaClient } from "@prisma/client";

export type MetaTenantReadinessStatus =
  | "OK"
  | "INFO"
  | "WARN"
  | "PARTIAL"
  | "WAITING_EXTERNAL"
  | "FAIL";

export type MetaTenantReadinessCheck = {
  id: string;
  label: string;
  status: MetaTenantReadinessStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type MetaTenantReadinessReport = {
  tenantKey: string;
  generatedAt: string;
  whatsappReadiness: MetaTenantReadinessStatus;
  summary: Record<MetaTenantReadinessStatus, number>;
  checks: MetaTenantReadinessCheck[];
};

type BuildMetaTenantReadinessReportInput = {
  prisma: PrismaClient;
  tenantKey: string;
  now?: Date;
  legacyFallbacksAvailable?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function pushCheck(checks: MetaTenantReadinessCheck[], check: MetaTenantReadinessCheck) {
  checks.push({
    ...check,
    details: check.details ? sanitizeDetails(check.details) : undefined,
  });
}

export function maskMetaReadinessIdentifier(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) return `****${digits.slice(-4)} (len ${digits.length})`;
  return `masked (len ${value.length})`;
}

export function buildMetaTenantReadinessSummary(checks: MetaTenantReadinessCheck[]) {
  const summary: Record<MetaTenantReadinessStatus, number> = {
    OK: 0,
    INFO: 0,
    WARN: 0,
    PARTIAL: 0,
    WAITING_EXTERNAL: 0,
    FAIL: 0,
  };
  for (const check of checks) summary[check.status] += 1;

  const whatsappReadiness: MetaTenantReadinessStatus =
    summary.FAIL > 0
      ? "FAIL"
      : summary.PARTIAL > 0
        ? "PARTIAL"
        : summary.WAITING_EXTERNAL > 0
          ? "WAITING_EXTERNAL"
          : summary.WARN > 0
            ? "WARN"
            : "OK";

  return { summary, whatsappReadiness };
}

export async function buildMetaTenantReadinessReport(
  input: BuildMetaTenantReadinessReportInput
): Promise<MetaTenantReadinessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const checks: MetaTenantReadinessCheck[] = [];
  const client = await input.prisma.client.findUnique({
    where: { clientKey: input.tenantKey },
    select: { id: true, clientKey: true, name: true, status: true },
  });

  if (!client) {
    pushCheck(checks, {
      id: "tenant",
      label: "Tenant",
      status: "FAIL",
      message: "Tenant nao encontrado.",
      details: { tenantKey: input.tenantKey },
    });
    const { summary, whatsappReadiness } = buildMetaTenantReadinessSummary(checks);
    return { tenantKey: input.tenantKey, generatedAt, whatsappReadiness, summary, checks };
  }

  pushCheck(checks, {
    id: "tenant",
    label: "Tenant",
    status: client.status === "ACTIVE" ? "OK" : "FAIL",
    message:
      client.status === "ACTIVE"
        ? "Client ativo encontrado."
        : "Client existe, mas nao esta ativo.",
    details: { tenantKey: client.clientKey, tenantName: client.name, status: client.status },
  });

  const [metaConfig, waPhoneNumbers, whatsappChannelAccountCount] = await Promise.all([
    input.prisma.tenantMetaConfig.findUnique({
      where: { clientId: client.id },
      select: {
        businessId: true,
        businessPortfolioId: true,
        businessToken: true,
        phoneNumberId: true,
        wabaId: true,
        updatedAt: true,
      },
    }),
    input.prisma.waPhoneNumber.findMany({
      where: { clientId: client.id },
      select: { phoneNumberId: true, display: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    input.prisma.channelAccount.count({
      where: { clientId: client.id, channel: "whatsapp", provider: "meta" },
    }),
  ]);

  const hasToken = Boolean(String(metaConfig?.businessToken ?? "").trim());
  const configuredPhoneNumberId = String(metaConfig?.phoneNumberId ?? "").trim();
  const hasConfiguredPhone = Boolean(configuredPhoneNumberId);
  const hasWaba = Boolean(String(metaConfig?.wabaId ?? "").trim());

  pushCheck(checks, {
    id: "meta_config",
    label: "TenantMetaConfig",
    status: !metaConfig || !hasToken || !hasConfiguredPhone ? "FAIL" : hasWaba ? "OK" : "PARTIAL",
    message:
      !metaConfig
        ? "TenantMetaConfig ausente."
        : !hasToken
          ? "Token Meta ausente."
          : !hasConfiguredPhone
            ? "phoneNumberId ausente."
            : hasWaba
              ? "Configuracao Meta minima para WhatsApp encontrada."
              : "Token e phoneNumberId presentes, mas WABA nao esta confirmada localmente.",
    details: {
      tokenPresent: hasToken,
      phoneNumberId: maskMetaReadinessIdentifier(metaConfig?.phoneNumberId),
      wabaId: maskMetaReadinessIdentifier(metaConfig?.wabaId),
      updatedAt: metaConfig?.updatedAt?.toISOString() ?? null,
    },
  });

  const configuredPhoneOwner = configuredPhoneNumberId
    ? await input.prisma.waPhoneNumber.findUnique({
        where: { phoneNumberId: configuredPhoneNumberId },
        select: { clientId: true, client: { select: { clientKey: true } } },
      })
    : null;
  const phoneOwnedByTenant = configuredPhoneOwner?.clientId === client.id;
  const phoneOwnedByOtherTenant = Boolean(configuredPhoneOwner && !phoneOwnedByTenant);

  pushCheck(checks, {
    id: "wa_phone_number",
    label: "WaPhoneNumber",
    status:
      !hasConfiguredPhone || !configuredPhoneOwner
        ? "FAIL"
        : phoneOwnedByOtherTenant
          ? "FAIL"
          : "OK",
    message:
      !hasConfiguredPhone
        ? "Sem phoneNumberId configurado para validar mapeamento."
        : !configuredPhoneOwner
          ? "phoneNumberId configurado nao existe em WaPhoneNumber."
          : phoneOwnedByOtherTenant
            ? "phoneNumberId configurado pertence a outro tenant."
            : "phoneNumberId esta mapeado para o mesmo tenant.",
    details: {
      configuredPhoneNumberId: maskMetaReadinessIdentifier(configuredPhoneNumberId),
      tenantPhoneNumberCount: waPhoneNumbers.length,
      configuredOwnerTenantKey: configuredPhoneOwner?.client?.clientKey ?? null,
      sampleTenantPhoneNumbers: waPhoneNumbers.slice(0, 3).map((number) => ({
        phoneNumberId: maskMetaReadinessIdentifier(number.phoneNumberId),
        display: maskMetaReadinessIdentifier(number.display),
      })),
    },
  });

  pushCheck(checks, {
    id: "waba",
    label: "WABA",
    status: hasWaba ? "OK" : hasToken && hasConfiguredPhone ? "PARTIAL" : "FAIL",
    message: hasWaba
      ? "WABA ID presente. Subscription deve ser validada operacionalmente sem assumir Graph API nesta checagem."
      : hasToken && hasConfiguredPhone
        ? "WABA ausente; estado parcial pode permitir outbound, mas requer validacao operacional."
        : "WABA ausente junto com configuracao Meta minima incompleta.",
    details: {
      wabaId: maskMetaReadinessIdentifier(metaConfig?.wabaId),
      subscriptionVerifiedLocally: false,
      externalValidationRequired: true,
    },
  });

  pushCheck(checks, {
    id: "business_identity",
    label: "Business ID / Portfolio",
    status: metaConfig?.businessId && metaConfig.businessPortfolioId ? "OK" : "WARN",
    message:
      metaConfig?.businessId && metaConfig.businessPortfolioId
        ? "Business ID e Business Portfolio presentes."
        : "Business ID/Portfolio ausentes ou incompletos; isso nao e FAIL por si so para WhatsApp.",
    details: {
      businessId: maskMetaReadinessIdentifier(metaConfig?.businessId),
      businessPortfolioId: maskMetaReadinessIdentifier(metaConfig?.businessPortfolioId),
    },
  });

  pushCheck(checks, {
    id: "channel_account_whatsapp",
    label: "ChannelAccount WhatsApp",
    status: whatsappChannelAccountCount > 0 ? "INFO" : "WARN",
    message:
      whatsappChannelAccountCount > 0
        ? "Ha ChannelAccount WhatsApp cadastrado, mas o modelo atual usa TenantMetaConfig/WaPhoneNumber para WhatsApp."
        : "Sem ChannelAccount WhatsApp; isso nao bloqueia o WhatsApp no modelo atual.",
    details: {
      whatsappChannelAccountCount,
      requiredForWhatsAppCurrentModel: false,
    },
  });

  if (input.legacyFallbacksAvailable) {
    pushCheck(checks, {
      id: "legacy_fallbacks",
      label: "Fallbacks legados",
      status: "WARN",
      message:
        "Caminhos legados de fallback existem no runtime e podem mascarar ausencia de configuracao tenant-specific.",
      details: {
        exposesSecrets: false,
        failureCondition: false,
      },
    });
  }

  const { summary, whatsappReadiness } = buildMetaTenantReadinessSummary(checks);
  return { tenantKey: input.tenantKey, generatedAt, whatsappReadiness, summary, checks };
}
