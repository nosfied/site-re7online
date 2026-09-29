import type { PrismaClient, Prisma } from "@prisma/client";
import { resolveAllowAutomationConversationsInInbox } from "../config/tenantOperationalConfig.js";
import { logger } from "../logger/logger.js";

export type AutomationState = { mode?: string | null; status?: string | null; handoffStatus?: string | null;
  handoff?: { status?: string | null }; assignedUserId?: string | null; assignedAt?: unknown };
/** Existing Automation filter: before human handoff, never CLOSED or assigned work. */
export function isAutomationConversation(state?: AutomationState | null): boolean {
  if (!state) return false;
  const handoff = String(state.handoff?.status ?? state.handoffStatus ?? "NONE").toUpperCase();
  return state.mode === "BOT" && [null, undefined, "WAITING", "WAITING_USER"].includes(state.status)
    && handoff === "NONE" && !state.assignedUserId && !state.assignedAt;
}
export function automationRoleCanRead(role?: string | null) { return role === "ADMIN" || role === "SUPERVISOR"; }
export async function resolveAutomationReadPermission(prisma: PrismaClient | Prisma.TransactionClient, clientId: string, role?: string | null) {
  if (!automationRoleCanRead(role)) return false;
  return resolveAllowAutomationConversationsInInbox({ prisma, clientId }).catch(error => {
    logger.error({ event: "inbox.automation.permission_read_failed", clientId, message: (error as Error).message });
    return false;
  });
}
