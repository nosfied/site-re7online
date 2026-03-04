#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

type Options = {
  tenantId: string;
  name: string;
  clientKey: string;
  metaPhoneNumberId: string;
  allowlist: string[];
  handoffAttendantWaid: string;
  defaultLanguage: string;
  manualHandoffTemplate: string;
  force: boolean;
  forcePhoneId: boolean;
  baseUrl: string;
};

type TenantConfig = {
  id: string;
  name: string;
  metaPhoneNumberId: string;
  allowlist: string[];
  handoffAttendantWaid: string;
  defaultLanguage: string;
  templates: {
    manualHandoff: string;
  };
};

type TenantResponse =
  | { ok: true; tenantId: string; tenant: TenantConfig }
  | { error: string; [key: string]: unknown };

function fail(message: string): never {
  console.error(`[onboard-tenant] FAIL: ${message}`);
  process.exit(1);
}

function log(message: string) {
  console.log(`[onboard-tenant] ${message}`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    tenantId: "",
    name: "",
    clientKey: "",
    metaPhoneNumberId: "",
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
    manualHandoffTemplate: "",
    force: false,
    forcePhoneId: false,
    baseUrl: process.env.BASE_URL?.trim() || "http://127.0.0.1:3001",
  };

  for (let index = 0; index < argv.length; ) {
    const current = argv[index];
    const next = argv[index + 1];
    const requireValue = (flag: string) => {
      if (!next || next.startsWith("--")) {
        fail(`${flag} exige um valor`);
      }
      return next;
    };

    switch (current) {
      case "--tenant":
        options.tenantId = requireValue(current).trim();
        index += 2;
        break;
      case "--name":
        options.name = requireValue(current).trim();
        index += 2;
        break;
      case "--client-key":
        options.clientKey = requireValue(current).trim();
        index += 2;
        break;
      case "--meta-phone-number-id":
        options.metaPhoneNumberId = requireValue(current).trim();
        index += 2;
        break;
      case "--allowlist":
        options.allowlist = requireValue(current)
          .split(",")
          .map((item) => item.replace(/\D/g, ""))
          .filter(Boolean);
        index += 2;
        break;
      case "--handoff-attendant-waid":
        options.handoffAttendantWaid = requireValue(current).replace(/\D/g, "");
        index += 2;
        break;
      case "--default-language":
        options.defaultLanguage = requireValue(current).trim();
        index += 2;
        break;
      case "--manual-handoff-template":
        options.manualHandoffTemplate = requireValue(current).trim();
        index += 2;
        break;
      case "--force":
        options.force = true;
        index += 1;
        break;
      case "--force-phone-id":
        options.forcePhoneId = true;
        index += 1;
        break;
      case "--base-url":
        options.baseUrl = requireValue(current).trim();
        index += 2;
        break;
      default:
        fail(`flag não reconhecida: ${current}`);
    }
  }

  if (!options.tenantId) fail("--tenant é obrigatório");
  if (!options.name) fail("--name é obrigatório");
  if (!options.clientKey) fail("--client-key é obrigatório");
  if (options.forcePhoneId && !options.force) {
    fail("--force-phone-id exige --force");
  }

  return options;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    fail(`resposta inválida de ${url}: ${text.slice(0, 400)}`);
  }
  return { status: response.status, data };
}

async function main() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });

  const options = parseArgs(process.argv.slice(2));
  const adminToken = (process.env.ADMIN_TOKEN ?? "").trim();
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();

  if (!adminToken) fail("ADMIN_TOKEN ausente no .env");
  if (!databaseUrl) fail("DATABASE_URL ausente no .env");

  const prisma = new PrismaClient();
  const tenantUrl = `${options.baseUrl}/admin/tenants/${encodeURIComponent(options.tenantId)}`;
  let createdNewToken = false;
  let issuedAdminToken = "";

  try {
    log(`tenant=${options.tenantId} clientKey=${options.clientKey} baseUrl=${options.baseUrl}`);

    const tenantGet = await fetchJson<TenantResponse>(tenantUrl, {
      headers: { "X-Admin-Token": adminToken },
    });

    let existingTenant: TenantConfig | null = null;
    const tenantGetData = tenantGet.data as { ok?: boolean; tenant?: TenantConfig };
    if (tenantGet.status === 200 && tenantGetData.ok === true && tenantGetData.tenant) {
      existingTenant = tenantGetData.tenant;
    } else if (tenantGet.status !== 404) {
      fail(`GET /admin/tenants/${options.tenantId} falhou com status=${tenantGet.status}`);
    }

    if (existingTenant && !options.force) {
      fail(`tenant ${options.tenantId} já existe; use --force para atualizar`);
    }

    const existingClient = await prisma.client.findUnique({
      where: { clientKey: options.clientKey },
      include: { phoneNumbers: true },
    });

    if (existingClient && !options.force && !existingTenant) {
      fail(`client ${options.clientKey} já existe; use --force para atualizar`);
    }

    const currentMetaPhoneNumberId = (existingTenant?.metaPhoneNumberId ?? "").trim();
    const nextMetaPhoneNumberId = options.metaPhoneNumberId || currentMetaPhoneNumberId;
    if (
      existingTenant &&
      options.metaPhoneNumberId &&
      currentMetaPhoneNumberId &&
      currentMetaPhoneNumberId !== options.metaPhoneNumberId &&
      !options.forcePhoneId
    ) {
      fail(
        `tenant ${options.tenantId} já possui metaPhoneNumberId=${currentMetaPhoneNumberId}; use --force --force-phone-id para alterar`
      );
    }

    if (nextMetaPhoneNumberId) {
      const existingPhone = await prisma.waPhoneNumber.findUnique({
        where: { phoneNumberId: nextMetaPhoneNumberId },
        include: { client: true },
      });
      if (
        existingPhone &&
        existingPhone.client.clientKey !== options.clientKey &&
        !options.forcePhoneId
      ) {
        fail(
          `phoneNumberId ${nextMetaPhoneNumberId} já está mapeado para ${existingPhone.client.clientKey}; use --force --force-phone-id para reatribuir`
        );
      }
    }

    let client = existingClient;
    if (!client) {
      issuedAdminToken = crypto.randomBytes(32).toString("hex");
      createdNewToken = true;
      client = await prisma.client.create({
        data: {
          clientKey: options.clientKey,
          name: options.name,
          adminToken: issuedAdminToken,
        },
        include: { phoneNumbers: true },
      });
      log(`client criado (${options.clientKey})`);
    } else {
      const nextData: { name?: string; adminToken?: string } = {};
      if (options.force && client.name !== options.name) {
        nextData.name = options.name;
      }
      if (!client.adminToken) {
        issuedAdminToken = crypto.randomBytes(32).toString("hex");
        createdNewToken = true;
        nextData.adminToken = issuedAdminToken;
      } else {
        issuedAdminToken = client.adminToken;
      }
      if (Object.keys(nextData).length > 0) {
        client = await prisma.client.update({
          where: { id: client.id },
          data: nextData,
          include: { phoneNumbers: true },
        });
      }
      log(`client existente (${options.clientKey})`);
    }

    const desiredTenant: TenantConfig = {
      id: options.tenantId,
      name: options.name,
      metaPhoneNumberId: nextMetaPhoneNumberId,
      allowlist: options.allowlist.length > 0 ? options.allowlist : existingTenant?.allowlist ?? [],
      handoffAttendantWaid:
        options.handoffAttendantWaid || existingTenant?.handoffAttendantWaid || "",
      defaultLanguage: options.defaultLanguage || existingTenant?.defaultLanguage || "pt_BR",
      templates: {
        manualHandoff:
          options.manualHandoffTemplate ||
          existingTenant?.templates?.manualHandoff ||
          process.env.HANDOFF_TEMPLATE_NAME ||
          "re7_atendente_manual_v1",
      },
    };

    const tenantPut = await fetchJson<{
      ok?: boolean;
      error?: string;
      backupPath?: string;
      fieldsChanged?: string[];
      tenant?: TenantConfig;
    }>(tenantUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": adminToken,
      },
      body: JSON.stringify(desiredTenant),
    });

    if (tenantPut.status !== 200 || tenantPut.data.ok !== true) {
      fail(`PUT /admin/tenants/${options.tenantId} falhou com status=${tenantPut.status}`);
    }

    if (nextMetaPhoneNumberId) {
      const existingPhone = await prisma.waPhoneNumber.findUnique({
        where: { phoneNumberId: nextMetaPhoneNumberId },
      });
      if (!existingPhone) {
        await prisma.waPhoneNumber.create({
          data: {
            clientId: client.id,
            phoneNumberId: nextMetaPhoneNumberId,
            display: nextMetaPhoneNumberId,
          },
        });
      } else if (existingPhone.clientId !== client.id) {
        if (!options.forcePhoneId) {
          fail(`phoneNumberId ${nextMetaPhoneNumberId} não pôde ser atualizado sem --force --force-phone-id`);
        }
        await prisma.waPhoneNumber.update({
          where: { phoneNumberId: nextMetaPhoneNumberId },
          data: { clientId: client.id, display: nextMetaPhoneNumberId },
        });
      } else if (existingPhone.display !== nextMetaPhoneNumberId) {
        await prisma.waPhoneNumber.update({
          where: { phoneNumberId: nextMetaPhoneNumberId },
          data: { display: nextMetaPhoneNumberId },
        });
      }
    }

    const allowlistFinal = desiredTenant.allowlist;
    const validationWaId = allowlistFinal[0] ?? "<allowlist-first>";

    console.log("");
    log("Onboarding concluído");
    console.log(`tenantId=${options.tenantId}`);
    console.log(`clientKey=${options.clientKey}`);
    console.log(`adminToken=${issuedAdminToken}`);
    console.log(`adminTokenNew=${createdNewToken}`);
    console.log(`allowlist=${JSON.stringify(allowlistFinal)}`);
    console.log("ALERTA: salvar adminToken em local seguro.");
    console.log("");
    console.log("Comandos de validação:");
    console.log(`curl -sS \"${options.baseUrl}/admin/messages?waId=${validationWaId}&limit=20\" -H \"X-Admin-Token: ${issuedAdminToken}\"`);
    console.log(`curl -sS -i \"${options.baseUrl}/admin/tenants\" -H \"X-Admin-Token: ${issuedAdminToken}\" | sed -n '1,20p'`);
    console.log(`curl -sS \"${options.baseUrl}/admin/metrics?range=1h\" -H \"X-Admin-Token: ${adminToken}\" -H \"X-Client-Key: ${options.clientKey}\"`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail((error as Error).message);
});
