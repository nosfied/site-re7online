#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    tenant: "",
    baseUrl: process.env.BASE_URL?.trim() || "http://127.0.0.1:3001",
  };

  for (let i = 0; i < argv.length; ) {
    const current = argv[i];
    const next = argv[i + 1];
    const requireValue = () => {
      if (!next || next.startsWith("--")) {
        fail(`${current} exige um valor`);
      }
      return next;
    };

    switch (current) {
      case "--tenant":
        options.tenant = requireValue().trim();
        i += 2;
        break;
      case "--base-url":
        options.baseUrl = requireValue().trim();
        i += 2;
        break;
      default:
        fail(`flag não reconhecida: ${current}`);
    }
  }

  if (!options.tenant) {
    fail("--tenant é obrigatório");
  }

  return options;
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

async function main() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });

  const options = parseArgs(process.argv.slice(2));
  const adminToken = (process.env.ADMIN_TOKEN ?? "").trim();
  if (!adminToken) {
    fail("ADMIN_TOKEN ausente no .env");
  }

  const response = await fetch(
    `${options.baseUrl}/admin/tenants/${encodeURIComponent(options.tenant)}`,
    {
      headers: { "X-Admin-Token": adminToken },
    }
  );

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`resposta inválida de /admin/tenants/${options.tenant}`);
  }

  if (!response.ok || data?.ok !== true || !data?.tenant) {
    fail(`tenant ${options.tenant} não encontrado ou admin API recusou /admin/tenants/${options.tenant}`);
  }

  const tenant = data.tenant;
  const phoneNumberId = String(tenant.metaPhoneNumberId ?? "").trim();
  const handoffAttendantWaid = String(tenant.handoffAttendantWaid ?? "").replace(/\D/g, "");
  const manualHandoffTemplate = String(tenant.templates?.manualHandoff ?? "").trim();

  if (!phoneNumberId) {
    fail(`tenant ${options.tenant} sem metaPhoneNumberId`);
  }

  process.stdout.write(
    [
      `TENANT_ID=${shellEscape(options.tenant)}`,
      `META_PHONE_NUMBER_ID=${shellEscape(phoneNumberId)}`,
      `HANDOFF_ATTENDANT_WAID=${shellEscape(handoffAttendantWaid)}`,
      `MANUAL_HANDOFF_TEMPLATE=${shellEscape(manualHandoffTemplate)}`,
    ].join("\n") + "\n"
  );
}

main().catch((error) => fail((error && error.message) || "erro desconhecido"));
