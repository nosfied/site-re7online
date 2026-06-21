import { Prisma, type PrismaClient } from "@prisma/client";

export const WEBCHAT_SITE_STATUSES = ["active", "inactive", "archived"] as const;

export type WebchatSiteStatus = (typeof WEBCHAT_SITE_STATUSES)[number];

type JsonInput = Record<string, unknown>;

const MAX_NAME_LENGTH = 160;
const MAX_SLUG_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_DOMAIN_LENGTH = 253;

function normalizeText(input: unknown, maxLength: number) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, maxLength);
}

function normalizeOptionalText(input: unknown, maxLength: number) {
  const value = normalizeText(input, maxLength);
  return value || null;
}

function normalizeBoolean(input: unknown, fallback = false) {
  return typeof input === "boolean" ? input : fallback;
}

function normalizeSiteStatus(input: unknown): WebchatSiteStatus {
  return input === "active" || input === "archived" ? input : "inactive";
}

function normalizeSlug(input: unknown) {
  return normalizeText(input, MAX_SLUG_LENGTH)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

function normalizeDomain(input: unknown) {
  return normalizeText(input, MAX_DOMAIN_LENGTH)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function normalizeTheme(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const primaryColor = normalizeText(raw.primaryColor, 32);
  const accentColor = normalizeText(raw.accentColor, 32);
  const position = normalizeText(raw.position, 32);
  return {
    ...(primaryColor ? { primaryColor } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(position ? { position } : {}),
  };
}

function serializeDate(date: Date) {
  return date.toISOString();
}

function serializeSite(item: {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    status: normalizeSiteStatus(item.status),
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  };
}

function serializeSettings(item: {
  id: string;
  siteId: string;
  theme: unknown;
  welcomeMessage: string | null;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  allowAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    siteId: item.siteId,
    theme: item.theme && typeof item.theme === "object" && !Array.isArray(item.theme) ? item.theme : {},
    welcomeMessage: item.welcomeMessage,
    collectName: item.collectName,
    collectEmail: item.collectEmail,
    collectPhone: item.collectPhone,
    allowAnonymous: item.allowAnonymous,
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  };
}

function serializeAllowedDomain(item: {
  id: string;
  siteId: string;
  domain: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    siteId: item.siteId,
    domain: item.domain,
    active: item.active,
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  };
}

async function validateSite(prisma: PrismaClient, clientId: string, siteId: string | null) {
  if (!siteId) return false;
  const site = await prisma.webchatSite.findFirst({
    where: { id: siteId, clientId },
    select: { id: true },
  });
  return Boolean(site);
}

function buildSiteData(input: JsonInput) {
  const name = normalizeText(input.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false as const, error: "webchat_site_name_required" };
  const slug = normalizeSlug(input.slug) || normalizeSlug(name);
  if (!slug) return { ok: false as const, error: "webchat_site_slug_required" };
  return {
    ok: true as const,
    data: {
      name,
      slug,
      status: normalizeSiteStatus(input.status),
    },
  };
}

function buildSettingsData(input: JsonInput) {
  const siteId = normalizeText(input.siteId, 120);
  if (!siteId) return { ok: false as const, error: "webchat_site_required" };
  return {
    ok: true as const,
    data: {
      siteId,
      theme: normalizeTheme(input.theme) ?? Prisma.JsonNull,
      welcomeMessage: normalizeOptionalText(input.welcomeMessage, MAX_MESSAGE_LENGTH),
      collectName: normalizeBoolean(input.collectName, true),
      collectEmail: normalizeBoolean(input.collectEmail, false),
      collectPhone: normalizeBoolean(input.collectPhone, false),
      allowAnonymous: normalizeBoolean(input.allowAnonymous, true),
    },
  };
}

function buildDomainData(input: JsonInput) {
  const siteId = normalizeText(input.siteId, 120);
  if (!siteId) return { ok: false as const, error: "webchat_site_required" };
  const domain = normalizeDomain(input.domain);
  if (!domain) return { ok: false as const, error: "webchat_domain_required" };
  return {
    ok: true as const,
    data: {
      siteId,
      domain,
      active: normalizeBoolean(input.active, true),
    },
  };
}

export async function listWebchat(params: { prisma: PrismaClient; clientId: string }) {
  const [sites, settings, domains] = await Promise.all([
    params.prisma.webchatSite.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 200,
    }),
    params.prisma.webchatSettings.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    }),
    params.prisma.webchatAllowedDomain.findMany({
      where: { clientId: params.clientId },
      orderBy: [{ active: "desc" }, { domain: "asc" }],
      take: 300,
    }),
  ]);
  return {
    sites: sites.map(serializeSite),
    settings: settings.map(serializeSettings),
    allowedDomains: domains.map(serializeAllowedDomain),
  };
}

export async function createWebchatSite(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildSiteData(params.input);
  if (!normalized.ok) return normalized;
  const site = await params.prisma.webchatSite.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
    },
  });
  return { ok: true as const, site: serializeSite(site) };
}

export async function updateWebchatSite(params: {
  prisma: PrismaClient;
  clientId: string;
  siteId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.webchatSite.findFirst({
    where: { id: params.siteId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "webchat_site_not_found" };
  const normalized = buildSiteData(params.input);
  if (!normalized.ok) return normalized;
  const site = await params.prisma.webchatSite.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, site: serializeSite(site) };
}

export async function upsertWebchatSettings(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildSettingsData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateSite(params.prisma, params.clientId, normalized.data.siteId))) {
    return { ok: false as const, error: "webchat_site_not_found" };
  }
  const existing = await params.prisma.webchatSettings.findFirst({
    where: { siteId: normalized.data.siteId, clientId: params.clientId },
    select: { id: true },
  });
  const settings = existing
    ? await params.prisma.webchatSettings.update({
        where: { id: existing.id },
        data: normalized.data,
      })
    : await params.prisma.webchatSettings.create({
        data: {
          clientId: params.clientId,
          ...normalized.data,
        },
      });
  return { ok: true as const, settings: serializeSettings(settings) };
}

export async function createWebchatAllowedDomain(params: {
  prisma: PrismaClient;
  clientId: string;
  input: JsonInput;
}) {
  const normalized = buildDomainData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateSite(params.prisma, params.clientId, normalized.data.siteId))) {
    return { ok: false as const, error: "webchat_site_not_found" };
  }
  const domain = await params.prisma.webchatAllowedDomain.create({
    data: {
      clientId: params.clientId,
      ...normalized.data,
    },
  });
  return { ok: true as const, domain: serializeAllowedDomain(domain) };
}

export async function updateWebchatAllowedDomain(params: {
  prisma: PrismaClient;
  clientId: string;
  domainId: string;
  input: JsonInput;
}) {
  const existing = await params.prisma.webchatAllowedDomain.findFirst({
    where: { id: params.domainId, clientId: params.clientId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "webchat_domain_not_found" };
  const normalized = buildDomainData(params.input);
  if (!normalized.ok) return normalized;
  if (!(await validateSite(params.prisma, params.clientId, normalized.data.siteId))) {
    return { ok: false as const, error: "webchat_site_not_found" };
  }
  const domain = await params.prisma.webchatAllowedDomain.update({
    where: { id: existing.id },
    data: normalized.data,
  });
  return { ok: true as const, domain: serializeAllowedDomain(domain) };
}
