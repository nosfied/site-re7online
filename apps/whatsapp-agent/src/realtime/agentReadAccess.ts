import { getLastClosedServiceCycle } from "../conversation/serviceCycle.js";
import type { PrismaClient } from "@prisma/client";
import type { InboxRealtimeEvent } from "./events.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { buildWaIdLookup, compareConversationLookupPriority } from "../utils/waid.js";
import { loadOwnClosedConversationIds } from "../inbox/ownClosedAccess.js";
import { shouldUserSeeConversationInInbox } from "../inbox/messageVisibility.js";
import { resolveInboxVisibilityPolicy } from "../config/tenantOperationalConfig.js";

/** One current-state/config/user batch per event, shared by all sockets. No grant cache. */
export async function resolveRealtimeAgentReaders(prisma: PrismaClient, event: InboxRealtimeEvent, userIds: string[]) {
  const allowed = new Set<string>();
  if (!userIds.length || !("waId" in event) || !event.waId) return allowed;
  const client = await prisma.client.findFirst({ where: { id: event.clientId, status: "ACTIVE" }, select: { clientKey: true } });
  if (!client) return allowed;
  const lookup = buildWaIdLookup(event.waId);
  const identities = [...new Set([event.waId, event.waIdCanonical ?? "", ...lookup.variants].filter(Boolean))];
  const matches = await prisma.conversation.findMany({ where: { clientId: event.clientId, deletedAt: null, anonymizedAt: null, OR: [{ waId: { in: identities } }, { waIdCanonical: { in: identities } }] } });
  const conversation = matches.sort(compareConversationLookupPriority)[0];
  if (!conversation) return allowed;
  const state = await runtimeStorage.getConversation(conversation.waId, client.clientKey) ?? await prisma.conversationRuntimeState.findFirst({ where: { clientId: event.clientId, waId: conversation.waId } });
  if (!state) return allowed;
  if (event.type === "message.created" && (event.message.inboxVisibility === "management_only" || (conversation.historyVisibleAfter && Date.parse(event.message.createdAt) <= conversation.historyVisibleAfter.getTime()))) return allowed;
  const [users, memberships, visibility] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, clientId: event.clientId, isActive: true, role: "AGENT" }, select: { id: true, departmentId: true, department: { select: { isActive: true } } } }),
    prisma.userDepartmentMembership.findMany({ where: { clientId: event.clientId, userId: { in: userIds }, isActive: true }, select: { userId: true, departmentId: true, department: { select: { isActive: true } } } }),
    resolveInboxVisibilityPolicy({ prisma, clientId: event.clientId }),
  ]);
  // Two bounded snapshot reads for CLOSED, independent of socket/user count.
  if (state.status === "CLOSED") {
    // CLOSED consultation has no unread work; do not expose aggregate read-state maps.
    if (event.type === "conversation.read_state.updated") return allowed;
    const cycle = getLastClosedServiceCycle(state);
    if (!cycle) return allowed;
    const cycleOwners = await prisma.completedServiceSnapshot.findMany({ where: { clientId: event.clientId, conversationId: conversation.id, cycleId: cycle.cycleId, assignedUserId: { in: users.map(u => u.id) } }, orderBy: { closedAt: "desc" }, take: 1, select: { assignedUserId: true } });
    const owner = cycleOwners[0]?.assignedUserId;
    if (owner && (await loadOwnClosedConversationIds(prisma, { clientId: event.clientId, userId: owner, candidates: [{ id: conversation.id, state }] })).has(conversation.id)) allowed.add(owner);
    return allowed;
  }
  for (const user of users) {
    const memberRows = memberships.filter(m => m.userId === user.id);
    const departmentIds = memberRows.length ? memberRows.filter(m => m.department.isActive).map(m => m.departmentId) : user.departmentId && user.department?.isActive !== false ? [user.departmentId] : [];
    if (shouldUserSeeConversationInInbox({ ...state, assignedAt: state.assignedAt?.toString(), handoffStatus: "handoff" in state ? state.handoff.status : state.handoffStatus, userRole: "AGENT", currentUserId: user.id, userDepartmentIds: departmentIds, policy: visibility.policy })) allowed.add(user.id);
  }
  return allowed;
}
