#!/usr/bin/env tsx
import crypto from "node:crypto";
import { once } from "node:events";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

type Options = {
  databaseUrl?: string;
  port: number;
  waId: string;
  phoneNumberId: string;
  messageId: string;
  text: string;
  metaAppSecret: string;
};

const DEFAULT_CONFIRMATION_PATTERN = /(staging|copy|copia|multichannel)/i;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    port: 0,
    waId: "559999990066",
    phoneNumberId: "1018032104719713",
    messageId: `wamid.staging.${Date.now()}`,
    text: "smoke staging multichannel",
    metaAppSecret: "staging-smoke-secret",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--database-url":
        if (!next || next.startsWith("--")) throw new Error("--database-url exige um valor");
        options.databaseUrl = next;
        index += 1;
        break;
      case "--port": {
        if (!next || next.startsWith("--")) throw new Error("--port exige um valor");
        const parsed = Number(next);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          throw new Error(`--port inválido: ${next}`);
        }
        options.port = parsed;
        index += 1;
        break;
      }
      case "--waid":
        if (!next || next.startsWith("--")) throw new Error("--waid exige um valor");
        options.waId = next;
        index += 1;
        break;
      case "--phone-number-id":
        if (!next || next.startsWith("--")) throw new Error("--phone-number-id exige um valor");
        options.phoneNumberId = next;
        index += 1;
        break;
      case "--message-id":
        if (!next || next.startsWith("--")) throw new Error("--message-id exige um valor");
        options.messageId = next;
        index += 1;
        break;
      case "--text":
        if (!next || next.startsWith("--")) throw new Error("--text exige um valor");
        options.text = next;
        index += 1;
        break;
      case "--meta-app-secret":
        if (!next || next.startsWith("--")) throw new Error("--meta-app-secret exige um valor");
        options.metaAppSecret = next;
        index += 1;
        break;
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
  }

  return options;
}

function loadEnv() {
  dotenv.config({ path: ".env", override: false });
}

function assertSafeDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL inválida");
  }
  const database = parsed.pathname.replace(/^\//, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("smoke:webhook:staging bloqueado em NODE_ENV=production");
  }
  if (!DEFAULT_CONFIRMATION_PATTERN.test(database)) {
    throw new Error(
      `DATABASE_URL bloqueada: database precisa indicar staging/copy/copia/multichannel. database=${database}`
    );
  }
  return { host: parsed.hostname, database };
}

function buildPayload(options: Options) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-staging-smoke",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: options.phoneNumberId,
              },
              contacts: [
                {
                  wa_id: options.waId,
                  profile: { name: "Staging Smoke" },
                },
              ],
              messages: [
                {
                  id: options.messageId,
                  from: options.waId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: options.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function waitForCondition<T>(fn: () => Promise<T | null>, timeoutMs = 5000): Promise<T | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const db = assertSafeDatabaseUrl(databaseUrl);

  process.env.DATABASE_URL = databaseUrl;
  process.env.PORT = String(options.port);
  process.env.NODE_ENV = "staging";
  process.env.ENV = "staging";
  process.env.STORAGE_MODE = "postgres";
  process.env.CONV_STATE_READ_SOURCE = "postgres";
  process.env.CONV_STATE_JSON_WRITE_ENABLED = "false";
  process.env.META_APP_SECRET = options.metaAppSecret;
  process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "staging-verify-token";
  process.env.WHATSAPP_ACCESS_TOKEN = "";
  process.env.WHATSAPP_PHONE_NUMBER_ID = options.phoneNumberId;
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.AI_ASSISTANT_ENABLED = "false";
  process.env.FLOW_INTENT_CLASSIFIER_ENABLED = "false";
  process.env.HANDOFF_ENABLED = "false";
  process.env.FOLLOWUP_ENABLED = "false";
  process.env.OUTBOUND_TEXT_ENABLED = "false";
  process.env.WHATSAPP_DEFAULT_REPLY = "";
  process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "staging-smoke-app-secret";

  let graphFetchCalls = 0;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (/graph\.facebook\.com/i.test(url)) {
      graphFetchCalls += 1;
      throw new Error("blocked_graph_api_in_staging_smoke");
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const currentDb = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const currentDatabase = currentDb[0]?.current_database ?? "";
  if (currentDatabase !== db.database) {
    throw new Error(`database mismatch: expected=${db.database} got=${currentDatabase}`);
  }

  const beforeInbound = await prisma.inboundMessage.count({ where: { messageId: options.messageId } });
  const beforeRuntime = await prisma.conversationRuntimeState.count({ where: { waId: options.waId } });
  const beforeOutbound = await prisma.outboundMessage.count({ where: { waId: options.waId } });

  const [{ createServer }] = await Promise.all([
    import("../src/http/server.js"),
    import("../src/bootstrap-env.js"),
  ]);
  const server = createServer();
  server.listen(options.port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    if (!health.ok) {
      throw new Error(`health failed: ${health.status}`);
    }

    const rawBody = JSON.stringify(buildPayload(options));
    const signature = crypto.createHmac("sha256", options.metaAppSecret).update(rawBody).digest("hex");
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${signature}`,
      },
      body: rawBody,
    });
    const responseText = await response.text();
    if (response.status !== 200) {
      throw new Error(`webhook failed: status=${response.status} body=${responseText.slice(0, 200)}`);
    }

    const inbound = await waitForCondition(() =>
      prisma.inboundMessage.findFirst({
        where: { messageId: options.messageId },
        select: {
          id: true,
          clientId: true,
          waId: true,
          messageId: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          legacyWaId: true,
        },
      })
    );
    if (!inbound) {
      throw new Error("inbound message was not persisted in staging");
    }

    const runtime = await waitForCondition(() =>
      prisma.conversationRuntimeState.findFirst({
        where: { waId: options.waId },
        select: {
          id: true,
          waId: true,
          channel: true,
          provider: true,
          channelAccountId: true,
          externalUserHash: true,
          legacyWaId: true,
        },
      })
    );
    if (!runtime) {
      throw new Error("runtime state was not created/updated in staging");
    }

    const afterOutbound = await prisma.outboundMessage.count({ where: { waId: options.waId } });
    if (graphFetchCalls > 0) {
      throw new Error(`outbound Graph API call attempted: count=${graphFetchCalls}`);
    }

    const result = {
      ok: true,
      database: currentDatabase,
      port,
      health: "ok",
      webhookStatus: response.status,
      inboundPersisted: true,
      runtimePersisted: true,
      before: {
        inbound: beforeInbound,
        runtime: beforeRuntime,
        outbound: beforeOutbound,
      },
      after: {
        outbound: afterOutbound,
      },
      outboundGraphCalls: graphFetchCalls,
      inbound: {
        id: inbound.id,
        clientId: inbound.clientId,
        messageId: inbound.messageId,
        channel: inbound.channel,
        provider: inbound.provider,
        channelAccountId: inbound.channelAccountId,
        hasExternalUserHash: Boolean(inbound.externalUserHash),
        hasLegacyWaId: Boolean(inbound.legacyWaId),
      },
      runtime: {
        id: runtime.id,
        channel: runtime.channel,
        provider: runtime.provider,
        channelAccountId: runtime.channelAccountId,
        hasExternalUserHash: Boolean(runtime.externalUserHash),
        hasLegacyWaId: Boolean(runtime.legacyWaId),
      },
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
