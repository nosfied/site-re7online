import type { PrismaClient } from "@prisma/client";
import type { InboxRealtimeEvent } from "./events.js";
import { isAutomationConversation, resolveAutomationReadPermission } from "../inbox/automationAccess.js";
import { buildWaIdLookup } from "../utils/waid.js";

/** BOT notifications carry no content: authenticated REST reapplies privacy and current authorization. */
export async function resolveAutomationRealtimeReaders(prisma: PrismaClient, event: InboxRealtimeEvent, userIds: string[]): Promise<Set<string> | null> {
  if (!("waId" in event) || !event.waId) return null;
  const identities = [...new Set([event.waId, event.waIdCanonical, ...buildWaIdLookup(event.waId).variants].filter((x): x is string => Boolean(x)))];
  const state = await prisma.conversationRuntimeState.findFirst({ where: { clientId: event.clientId, OR: [{ waId: { in: identities } }, { waIdCanonical: { in: identities } }] } });
  // Event provenance survives lifecycle transitions: never upgrade an old BOT payload to human delivery.
  const wasBot = "mode" in event && isAutomationConversation({ mode: event.mode, status: event.type === "conversation.handoff.updated" ? event.status : undefined, handoffStatus: "handoffStatus" in event ? event.handoffStatus : null,
    assignedUserId: "assignedUserId" in event ? event.assignedUserId : null });
  if (!isAutomationConversation(state) && !wasBot) return null;
  const allowed = new Set<string>();
  if (!state || !await resolveAutomationReadPermission(prisma, event.clientId, "ADMIN")) return allowed;
  const client = await prisma.client.findFirst({ where: { id: event.clientId, status: "ACTIVE" }, select: { id: true } });
  if (!client) return allowed;
  const users = await prisma.user.findMany({ where: { clientId: event.clientId, id: { in: userIds }, isActive: true, role: { in: ["ADMIN", "SUPERVISOR"] } }, select: { id: true } });
  for (const user of users) allowed.add(user.id);
  return allowed;
}
