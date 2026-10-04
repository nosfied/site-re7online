import { MessageType, PrismaClient } from "@prisma/client";
import { prepareAcceptedCampaignReturnConversation } from "./inboundConversationIdentity.js";
import { resolveCampaignRecipientConversationTarget } from "../campaigns/campaignRecipientConversationBridge.js";
import { resolveHybridWhatsappIdentityStatus } from "../web-session/hybridIdentity.js";
import { ingestBaileysWebSessionMessage } from "../web-session/webSessionInbound.js";
import { withHybridConversationIdentityLock } from "./hybridConversationIdentityLock.js";

// Test-only child: a separate Prisma pool exercises the PostgreSQL identity lock.
const input = JSON.parse(process.argv[2] ?? "{}") as {
  clientId: string; clientKey: string; waId: string;
  provider: "meta" | "web_session"; channelAccountId: string; messageId: string;
  mode?: "selection" | "web_ingest" | "lock_hold" | "lock_probe";
};
const prisma = new PrismaClient();
process.stdin.resume();
process.stdout.write("ready\n");
process.stdin.once("data", async () => {
  try {
    if (input.mode === "lock_hold" || input.mode === "lock_probe") {
      await withHybridConversationIdentityLock(prisma, input, async (tx) => {
        process.stdout.write("acquired\n");
        if (input.mode === "lock_hold") await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
        await tx.$queryRawUnsafe("SELECT 1");
      });
      process.stdout.write("lock_done\n");
      return;
    }
    if (input.mode === "web_ingest") {
      process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = "http://127.0.0.1:65535";
      globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, messageId: `synthetic.${input.messageId}` }), {
        status: 200, headers: { "content-type": "application/json" },
      })) as typeof fetch;
      const inbound = await ingestBaileysWebSessionMessage({
        clientId: input.clientId, tenantKey: input.clientKey,
        channelAccountDbId: input.channelAccountId, channelAccountId: input.channelAccountId,
        message: {
          key: { id: input.messageId, remoteJid: `${input.waId}@s.whatsapp.net`, fromMe: false },
          messageTimestamp: Math.floor(Date.now() / 1000) + 2,
          message: { conversation: "retorno sintético" },
        },
      });
      if (inbound.action !== "persisted") throw new Error(`web_ingest_${inbound.action}`);
      process.stdout.write("web_ingest_persisted\n");
      return;
    }
    const result = await prepareAcceptedCampaignReturnConversation(prisma, {
      clientId: input.clientId, clientKey: input.clientKey, waId: input.waId,
      provider: input.provider, channelAccountId: input.channelAccountId,
      inboundAt: new Date(Date.now() + 2000),
    });
    if (result.reason !== "resolved") {
      const target = await resolveCampaignRecipientConversationTarget(prisma, { clientId: input.clientId, inputWaId: input.waId });
      const candidate = target.conversationId ? await prisma.conversation.findUnique({ where: { id: target.conversationId }, select: { provider: true, phoneNumberId: true, channelAccountId: true } }) : null;
      const hybrid = await resolveHybridWhatsappIdentityStatus({ prisma, clientId: input.clientId });
      const meta = await prisma.tenantMetaConfig.findUnique({ where: { clientId: input.clientId }, select: { phoneNumberId: true } });
      const webs = await prisma.channelAccount.findMany({ where: { clientId: input.clientId, channel: "whatsapp", provider: "web_session", runtimeEnabled: true, status: { not: "archived_duplicate" } }, select: { channelAccountId: true } });
      throw new Error(`identity_${result.reason}:${JSON.stringify({ match: target.matchedBy, winner: target.winningWaId, candidate, metaPhoneNumberId: meta?.phoneNumberId, inputAccountId: input.channelAccountId, webAccounts: webs.map((x) => x.channelAccountId), metaPublic: hybrid.meta.canonicalNumber, webPublic: hybrid.web.canonicalNumber, webStatus: hybrid.web.status, conflict: hybrid.conflict, numberReplacement: hybrid.numberReplacement })}`);
    }
    await prisma.inboundMessage.create({ data: {
      clientId: input.clientId, waId: result.waId, waIdCanonical: result.waId,
      messageId: input.messageId, channel: "whatsapp", provider: input.provider,
      channelAccountId: input.channelAccountId, type: MessageType.TEXT,
      bodyText: "inbound sintético", allowlistHit: false,
    } });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "unknown_error"}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.stdin.pause();
  }
});
