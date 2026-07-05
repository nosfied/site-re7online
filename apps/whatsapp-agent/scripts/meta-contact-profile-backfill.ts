#!/usr/bin/env tsx
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { findTenantChannelAccount } from "../src/channels/tenantChannelAccount.js";
import { decryptMessengerExternalUserRef } from "../src/channels/messengerOutbound.js";
import { fetchMessengerUserProfile } from "../src/channels/messengerInboundPersistence.js";
import { fetchInstagramUserProfile } from "../src/channels/instagramInboundPersistence.js";
import { getTenants } from "../src/config/tenantConfig.js";

const CONFIRMATION = "BACKFILL_META_CONTACT_PROFILES";

type Channel = "messenger" | "instagram";

type Options = {
  tenant?: string;
  channel?: Channel;
  limit: number;
  execute: boolean;
  confirm?: string;
  json: boolean;
};

type Candidate = {
  id: string;
  clientId: string;
  clientKey: string;
  contactId: string | null;
  channel: Channel;
  provider: string;
  channelAccountId: string;
  channelAccountHash: string;
  externalUserHash: string;
  externalUserHashPreview: string;
  externalUserRef: string | null;
  displayName: string | null;
  lastSeenAt: Date | null;
};

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    limit: 50,
    execute: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--tenant":
      case "--client-key":
        if (!next || next.startsWith("--")) throw new Error(`${current} exige um valor`);
        options.tenant = next;
        index += 1;
        break;
      case "--channel":
        if (next !== "messenger" && next !== "instagram") {
          throw new Error("--channel deve ser messenger ou instagram");
        }
        options.channel = next;
        index += 1;
        break;
      case "--limit":
        if (!next || next.startsWith("--")) throw new Error("--limit exige um valor");
        options.limit = Number.parseInt(next, 10);
        if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) {
          throw new Error("--limit deve estar entre 1 e 500");
        }
        index += 1;
        break;
      case "--dry-run":
        options.execute = false;
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--confirm":
        if (!next || next.startsWith("--")) throw new Error("--confirm exige um valor");
        options.confirm = next;
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
  }

  if (!options.tenant) throw new Error("--tenant é obrigatório");
  if (!options.channel) throw new Error("--channel é obrigatório");
  if (options.execute && options.confirm !== CONFIRMATION) {
    throw new Error(`--execute exige --confirm ${CONFIRMATION}`);
  }

  return options;
}

function hashValue(value: string) {
  return `hash:${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function safeCandidate(candidate: Candidate) {
  return {
    id: candidate.id,
    clientKey: candidate.clientKey,
    contactId: candidate.contactId,
    channel: candidate.channel,
    provider: candidate.provider,
    channelAccountHash: candidate.channelAccountHash,
    externalUserHash: candidate.externalUserHashPreview,
    hasExternalUserRef: Boolean(candidate.externalUserRef),
    displayNamePresent: Boolean(candidate.displayName?.trim()),
    lastSeenAt: candidate.lastSeenAt?.toISOString() ?? null,
  };
}

async function loadCandidates(prisma: PrismaClient, options: Options): Promise<Candidate[]> {
  const client = await prisma.client.findUnique({
    where: { clientKey: options.tenant },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`tenant não encontrado: ${options.tenant}`);

  const rows = await prisma.contactChannelIdentity.findMany({
    where: {
      clientId: client.id,
      channel: options.channel,
      provider: "meta",
      externalUserRef: { not: null },
      OR: [{ displayName: null }, { displayName: "" }],
    },
    orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
    take: options.limit,
    select: {
      id: true,
      clientId: true,
      contactId: true,
      channel: true,
      provider: true,
      channelAccountId: true,
      externalUserHash: true,
      externalUserRef: true,
      displayName: true,
      lastSeenAt: true,
    },
  });

  return rows
    .filter((row): row is typeof row & { channel: Channel } => row.channel === "messenger" || row.channel === "instagram")
    .map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientKey: client.clientKey,
      contactId: row.contactId,
      channel: row.channel,
      provider: row.provider,
      channelAccountId: row.channelAccountId,
      channelAccountHash: hashValue(row.channelAccountId),
      externalUserHash: row.externalUserHash,
      externalUserHashPreview: hashValue(row.externalUserHash),
      externalUserRef: row.externalUserRef,
      displayName: row.displayName,
      lastSeenAt: row.lastSeenAt,
    }));
}

async function executeBackfill(prisma: PrismaClient, candidates: Candidate[]) {
  const tenants = await getTenants();
  const summary = {
    lookedUp: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    records: [] as Array<Record<string, unknown>>,
  };

  for (const candidate of candidates) {
    const tenantConfig = tenants[candidate.clientKey];
    const account = findTenantChannelAccount(tenantConfig?.channelAccounts ?? [], {
      tenantKey: candidate.clientKey,
      channel: candidate.channel,
      provider: "meta",
      channelAccountId: candidate.channelAccountId,
    });
    const externalUserId = decryptMessengerExternalUserRef(candidate.externalUserRef);

    if (!tenantConfig || !account || !externalUserId) {
      summary.skipped += 1;
      summary.records.push({
        ...safeCandidate(candidate),
        status: "skipped",
        reason: !tenantConfig ? "tenant_config_missing" : !account ? "channel_account_missing" : "external_user_ref_unavailable",
      });
      continue;
    }

    summary.lookedUp += 1;
    const profile =
      candidate.channel === "messenger"
        ? await fetchMessengerUserProfile({
            pageAccessToken: account.pageAccessToken,
            externalUserId,
          })
        : await fetchInstagramUserProfile({
            instagramBusinessAccessToken: account.instagramBusinessAccessToken,
            externalUserId,
          });

    const displayName = profile?.displayName?.trim() || null;
    if (!displayName) {
      summary.failed += 1;
      summary.records.push({
        ...safeCandidate(candidate),
        status: "failed",
        reason: "profile_display_name_unavailable",
      });
      continue;
    }

    await prisma.$transaction([
      prisma.contactChannelIdentity.update({
        where: { id: candidate.id },
        data: { displayName, lastSeenAt: new Date() },
      }),
      ...(candidate.contactId
        ? [
            prisma.contact.updateMany({
              where: { id: candidate.contactId, clientId: candidate.clientId },
              data: { name: displayName },
            }),
          ]
        : []),
      prisma.lead.updateMany({
        where: {
          tenantId: candidate.clientId,
          channel: candidate.channel,
          provider: candidate.provider,
          channelAccountId: candidate.channelAccountId,
          externalUserHash: candidate.externalUserHash,
        },
        data: { name: displayName },
      }),
    ]);

    summary.updated += 1;
    summary.records.push({
      ...safeCandidate(candidate),
      status: "updated",
      displayNameResolved: true,
    });
  }

  return summary;
}

function output(value: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(value);
  }
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const candidates = await loadCandidates(prisma, options);
    if (!options.execute) {
      output(
        {
          mode: "dry-run",
          tenant: options.tenant,
          channel: options.channel,
          limit: options.limit,
          candidates: candidates.map(safeCandidate),
          executeCommand:
            candidates.length > 0
              ? `npm run meta:profiles:backfill -- --tenant ${options.tenant} --channel ${options.channel} --limit ${options.limit} --execute --confirm ${CONFIRMATION}`
              : null,
        },
        options.json
      );
      return;
    }

    const result = await executeBackfill(prisma, candidates);
    output(
      {
        mode: "execute",
        tenant: options.tenant,
        channel: options.channel,
        limit: options.limit,
        ...result,
      },
      options.json
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
