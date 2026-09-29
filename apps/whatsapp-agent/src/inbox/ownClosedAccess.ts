import type { PrismaClient } from "@prisma/client";
import { getActiveServiceCycle, getLastClosedServiceCycle } from "../conversation/serviceCycle.js";
import { resolveAllowAgentOwnClosedConversations } from "../config/tenantOperationalConfig.js";

type ClosedState = { status?: string | null; closedAt?: string | Date | null; answers?: unknown };
export type ClosedAccessCandidate = { id: string; state: ClosedState | null | undefined };

/** Snapshot proves ownership of this closure only. It never grants access to a new cycle. */
export async function loadOwnClosedConversationIds(prisma: PrismaClient, params: {
  clientId: string;
  userId: string;
  candidates: ClosedAccessCandidate[];
  enabled?: boolean;
}): Promise<Set<string>> {
  const allowed = new Set<string>();
  const enabled = params.enabled ?? await resolveAllowAgentOwnClosedConversations({ prisma, clientId: params.clientId });
  if (!enabled) return allowed;
  const candidates = params.candidates.flatMap(({ id, state }) => {
    if (!id || state?.status !== "CLOSED" || getActiveServiceCycle(state)) return [];
    const cycle = getLastClosedServiceCycle(state);
    if (!cycle || !state.closedAt || Date.parse(cycle.closedAt) !== new Date(state.closedAt).getTime()) return [];
    return [{ id, cycle }];
  });
  if (!candidates.length) return allowed;
  const snapshots = await prisma.completedServiceSnapshot.findMany({
    where: { clientId: params.clientId, assignedUserId: params.userId, cycleId: { in: candidates.map(x => x.cycle.cycleId) } },
    select: { conversationId: true, cycleId: true, protocol: true, closedAt: true },
  });
  const byCycle = new Map(snapshots.map(snapshot => [snapshot.cycleId, snapshot]));
  for (const { id, cycle } of candidates) {
    const snapshot = byCycle.get(cycle.cycleId);
    if (snapshot?.conversationId === id && snapshot.protocol === cycle.protocol && snapshot.closedAt.getTime() === Date.parse(cycle.closedAt)) allowed.add(id);
  }
  return allowed;
}
