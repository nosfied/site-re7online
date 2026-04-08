#!/usr/bin/env -S node --import tsx
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { canonicalizeBrazilWaId } from "../src/utils/waid.js";

type Options = {
  batchSize: number;
};

type BatchRow = {
  id: string;
  waId: string | null;
};

function parseArgs(argv: string[]): Options {
  let batchSize = 500;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--batch":
      case "--batch-size": {
        if (!next || next.startsWith("--")) {
          throw new Error(`${current} exige um valor`);
        }
        const parsed = Number(next);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`${current} inválido: ${next}`);
        }
        batchSize = Math.floor(parsed);
        index += 1;
        break;
      }
      default:
        throw new Error(`flag não reconhecida: ${current}`);
    }
  }

  return { batchSize };
}

function loadEnv() {
  const appDir = path.resolve(process.cwd(), "apps/whatsapp-agent");
  const envPath = process.cwd().endsWith("apps/whatsapp-agent")
    ? path.join(process.cwd(), ".env")
    : path.join(appDir, ".env");
  dotenv.config({ path: envPath });
}

function log(message: string) {
  console.log(`[backfill-waid-canonical] ${message}`);
}

async function backfillConversation(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows = await prisma.conversation.findMany({
      where: { waIdCanonical: null },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.conversation.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`Conversation: +${rows.length} (total=${total})`);
  }
  return total;
}

async function backfillConversationRuntimeState(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows = await prisma.conversationRuntimeState.findMany({
      where: { waIdCanonical: null },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.conversationRuntimeState.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`ConversationRuntimeState: +${rows.length} (total=${total})`);
  }
  return total;
}

async function backfillInboundMessage(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows = await prisma.inboundMessage.findMany({
      where: { waIdCanonical: null },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.inboundMessage.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`InboundMessage: +${rows.length} (total=${total})`);
  }
  return total;
}

async function backfillOutboundMessage(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows = await prisma.outboundMessage.findMany({
      where: { waIdCanonical: null },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.outboundMessage.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`OutboundMessage: +${rows.length} (total=${total})`);
  }
  return total;
}

async function backfillEvent(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows: BatchRow[] = await prisma.event.findMany({
      where: {
        waIdCanonical: null,
        waId: { not: null },
      },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (!row.waId) {
        continue;
      }
      await prisma.event.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`Event: +${rows.length} (total=${total})`);
  }
  return total;
}

async function backfillLead(prisma: PrismaClient, batchSize: number) {
  let total = 0;
  for (;;) {
    const rows = await prisma.lead.findMany({
      where: { waIdCanonical: null },
      select: { id: true, waId: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.lead.update({
        where: { id: row.id },
        data: { waIdCanonical: canonicalizeBrazilWaId(row.waId) },
      });
    }
    total += rows.length;
    log(`Lead: +${rows.length} (total=${total})`);
  }
  return total;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  log(`starting batchSize=${options.batchSize}`);

  try {
    const results = {
      Conversation: await backfillConversation(prisma, options.batchSize),
      ConversationRuntimeState: await backfillConversationRuntimeState(prisma, options.batchSize),
      InboundMessage: await backfillInboundMessage(prisma, options.batchSize),
      OutboundMessage: await backfillOutboundMessage(prisma, options.batchSize),
      Event: await backfillEvent(prisma, options.batchSize),
      Lead: await backfillLead(prisma, options.batchSize),
    };

    log(`done ${JSON.stringify(results)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[backfill-waid-canonical] FAIL: ${(error as Error).message}`);
  process.exit(1);
});
