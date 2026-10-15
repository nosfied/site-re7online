import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCrmWhatsappIdentityCandidates } from "../crm/crmWhatsappIdentity.js";
import { hybridConversationIdentityLockKey } from "../channels/hybridConversationIdentityLock.js";

export const retentionConversationSelect = {
  id: true, clientId: true, waId: true, waIdCanonical: true, channel: true,
  provider: true, channelAccountId: true, externalUserHash: true,
  createdAt: true, updatedAt: true, lastInboundAt: true, lastOutboundAt: true,
  deletedAt: true, anonymizedAt: true,
} satisfies Prisma.ConversationSelect;
type Candidate = Prisma.ConversationGetPayload<{ select: typeof retentionConversationSelect }>;
type Reader = Pick<Prisma.TransactionClient, "conversation" | "conversationRuntimeState" | "message">;
class RetentionDenied extends Error {}
const tuple = ["waId", "waIdCanonical", "channel", "provider", "channelAccountId", "externalUserHash"] as const;
const older = (date: Date | null, cutoff: Date) => !date || date < cutoff;
export function retentionIdentityKeys(c: Candidate) {
  return buildCrmWhatsappIdentityCandidates([c.waId, c.waIdCanonical]);
}
export async function inspectRetentionCandidate(db: Reader, c: Candidate, cutoff: Date) {
  const keys = retentionIdentityKeys(c);
  const related = { OR: [{ waId: { in: keys } }, { waIdCanonical: { in: keys } }] };
  const siblings = await db.conversation.findMany({ where: { clientId: c.clientId, ...related }, select: { id: true } });
  if (siblings.length !== 1 || siblings[0].id !== c.id) return { reason: "shared_or_ambiguous_conversation_identity" } as const;
  const states = await db.conversationRuntimeState.findMany({ where: { clientId: c.clientId, ...related } });
  if (states.length !== 1) return { reason: "runtime_identity_unproven" } as const;
  const runtime = states[0];
  if (runtime.mode?.toUpperCase() === "HUMAN" || runtime.status === "IN_PROGRESS" ||
      runtime.assignedUserId || runtime.assignedTo || runtime.assignedAt || runtime.queueId ||
      ["ACTIVE", "PENDING"].includes(runtime.handoffStatus)) return { reason: "human_or_queue_protected" } as const;
  if (runtime.mode?.toUpperCase() !== "BOT" || tuple.some(k => runtime[k] !== c[k])) return { reason: "runtime_identity_unproven" } as const;
  if (c.deletedAt || c.anonymizedAt || !older(c.createdAt, cutoff) || !older(c.updatedAt, cutoff) ||
      !older(c.lastInboundAt, cutoff) || !older(c.lastOutboundAt, cutoff) ||
      !older(runtime.updatedAt, cutoff) || !older(runtime.lastInboundAt, cutoff) || !older(runtime.lastOutboundAt, cutoff)) return { reason: "recent_activity" } as const;
  const recent = await db.message.findFirst({ where: { conversationId: c.id, conversation: { clientId: c.clientId }, createdAt: { gte: cutoff } }, select: { id: true } });
  if (recent) return { reason: "recent_activity" } as const;
  return { reason: null, runtime } as const;
}
function unchanged(a: Candidate, b: Candidate) {
  return tuple.every(k => a[k] === b[k]) && ["createdAt", "updatedAt", "lastInboundAt", "lastOutboundAt", "deletedAt", "anonymizedAt"].every(k => {
    const key = k as "updatedAt"; return a[key]?.getTime() === b[key]?.getTime();
  });
}
/** Scope is one conversation and its unambiguous runtime; never subject-wide cleanup. */
export async function retainConversation(db: PrismaClient, params: {
  candidate: Candidate; cutoff: Date; storageMode: string; retentionDays: number; clientKey: string;
  audit: (tx: Prisma.TransactionClient, id: string) => Promise<void>;
}) {
  if (params.storageMode !== "postgres") return { retained: false, reason: "storage_profile_unproven" } as const;
  const c = params.candidate, keys = retentionIdentityKeys(c);
  try {
    return await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT set_config('lock_timeout', '1000ms', true)`);
      const key = hybridConversationIdentityLockKey({ clientId: c.clientId, waId: c.waId });
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Conversation" WHERE "clientId"::text=${c.clientId} AND id::text=${c.id} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ConversationRuntimeState" WHERE "clientId"::text=${c.clientId} AND ("waId" IN (${Prisma.join(keys)}) OR "waIdCanonical" IN (${Prisma.join(keys)})) ORDER BY id FOR UPDATE`);
      const current = await tx.conversation.findFirst({ where: { id: c.id, clientId: c.clientId }, select: retentionConversationSelect });
      if (!current || !unchanged(c, current)) return { retained: false, reason: "concurrent_change" } as const;
      const config = await tx.retentionConfig.findUnique({ where: { clientId: c.clientId } });
      if ((config?.retentionDays ?? 90) !== params.retentionDays) return { retained: false, reason: "retention_policy_changed" } as const;
      const plan = await inspectRetentionCandidate(tx, current, params.cutoff);
      if (plan.reason) return { retained: false, reason: plan.reason } as const;
      const marker = `anon:retention:${c.id}`, now = new Date();
      const conversation = await tx.conversation.updateMany({ where: { id: c.id, clientId: c.clientId, updatedAt: c.updatedAt, deletedAt: null }, data: {
        waId: marker, waIdCanonical: marker, externalUserHash: null, externalUserRef: null, legacyWaId: null,
        anonymizedAt: now, deletedAt: now, closedAt: now, historyVisibleAfter: now, departmentId: null,
      } });
      if (conversation.count !== 1) throw new RetentionDenied("concurrent_change");
      const runtime = await tx.conversationRuntimeState.updateMany({ where: {
        id: plan.runtime.id, clientId: c.clientId, version: plan.runtime.version, updatedAt: plan.runtime.updatedAt,
      }, data: {
        waId: marker, waIdCanonical: marker, externalUserHash: null, externalUserRef: null, legacyWaId: null,
        conversationKey: `${params.clientKey}:${marker}`, answers: {}, status: "CLOSED", closedAt: now,
        mode: "BOT", departmentId: null, version: { increment: 1 },
      } });
      if (runtime.count !== 1) throw new RetentionDenied("concurrent_change");
      await tx.message.updateMany({ where: { conversationId: c.id, conversation: { clientId: c.clientId } }, data: {
        waId: marker, bodyText: "[mensagem anonimizada]", intent: null, metaMessageId: null,
      } });
      await params.audit(tx, c.id);
      return { retained: true, reason: null } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 1000, timeout: 10000 });
  } catch (error) {
    if (error instanceof RetentionDenied) return { retained: false, reason: error.message } as const;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2010", "P2028"].includes(error.code)) {
      const sqlState = String(error.meta?.code ?? "");
      if (error.code !== "P2010" || ["40001", "40P01", "55P03"].includes(sqlState)) return { retained: false, reason: "concurrent_change" } as const;
    }
    throw error; // No automatic replay; the DB transaction rolls back, including audit/messages.
  }
}
