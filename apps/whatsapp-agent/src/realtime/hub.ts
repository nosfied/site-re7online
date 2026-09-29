import { resolveAutomationRealtimeReaders } from "./automationReadAccess.js";
import { getPrisma } from "../db.js";
import { resolveRealtimeAgentReaders } from "./agentReadAccess.js";
import { WebSocket } from "ws";
import { logger } from "../logger/logger.js";
import { InboxRealtimeEvent } from "./events.js";
import { dispatchWebPushForRealtimeEvent } from "../push/webPushService.js";

type RealtimeRole = "AGENT" | "SUPERVISOR" | "ADMIN";

export type RealtimeConnectionContext = {
  userId: string;
  clientId: string;
  role: RealtimeRole;
  email: string;
  supportAccess?: {
    grantId: string;
    supportSessionId: string;
    expiresAt: string;
  } | null;
};

type RealtimeConnection = RealtimeConnectionContext & {
  id: string;
  socket: WebSocket;
  alive: boolean;
};

const connections = new Map<string, RealtimeConnection>();
let nextConnectionId = 0;
let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const connection of connections.values()) {
      if (connection.socket.readyState !== WebSocket.OPEN) {
        removeConnection(connection.id, "closed");
        continue;
      }
      if (!connection.alive) {
        logger.info({
          event: "realtime.websocket.disconnected",
          reason: "heartbeat_timeout",
          connectionId: connection.id,
          userId: connection.userId,
          clientId: connection.clientId,
        });
        connection.socket.terminate();
        removeConnection(connection.id, "heartbeat_timeout");
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }, 30_000);
}

function stopHeartbeatIfIdle() {
  if (connections.size > 0 || !heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export function addConnection(socket: WebSocket, context: RealtimeConnectionContext) {
  const id = `rt_${Date.now()}_${++nextConnectionId}`;
  const connection: RealtimeConnection = {
    ...context,
    id,
    socket,
    alive: true,
  };

  connections.set(id, connection);
  startHeartbeat();

  socket.on("pong", () => {
    connection.alive = true;
  });
  socket.on("close", () => {
    removeConnection(id, "close");
  });
  socket.on("error", () => {
    removeConnection(id, "error");
  });

  logger.info({
    event: "realtime.websocket.connected",
    connectionId: id,
    userId: context.userId,
    clientId: context.clientId,
    role: context.role,
  });
}

export function removeConnection(id: string, reason: string) {
  const connection = connections.get(id);
  if (!connection) return;
  connections.delete(id);
  logger.info({
    event: "realtime.websocket.disconnected",
    connectionId: id,
    userId: connection.userId,
    clientId: connection.clientId,
    reason,
  });
  stopHeartbeatIfIdle();
}

export function closeRealtimeConnectionsForSupportGrant(grantId: string, reason: string) {
  for (const connection of connections.values()) {
    if (connection.supportAccess?.grantId !== grantId) continue;
    connection.socket.close(4001, reason);
    removeConnection(connection.id, reason);
  }
}

export function closeRealtimeConnectionsForSupportSession(supportSessionId: string, reason: string) {
  for (const connection of connections.values()) {
    if (connection.supportAccess?.supportSessionId !== supportSessionId) continue;
    connection.socket.close(4001, reason);
    removeConnection(connection.id, reason);
  }
}

export function closeRealtimeConnectionsForClientSupport(clientId: string, reason: string) {
  for (const connection of connections.values()) {
    if (connection.clientId !== clientId || !connection.supportAccess) continue;
    connection.socket.close(4001, reason);
    removeConnection(connection.id, reason);
  }
}

export function closeRealtimeConnectionsForClient(clientId: string, reason: string) {
  for (const connection of connections.values()) {
    if (connection.clientId !== clientId) continue;
    connection.socket.close(4001, reason);
    removeConnection(connection.id, reason);
  }
}

const tenantAccessEpoch = new Map<string, number>();
const conversationAccessEpoch = new Map<string, number>();

function conversationEpochKeys(event: InboxRealtimeEvent): string[] {
  if (!("waId" in event)) return [];
  return [...new Set([event.waId, event.waIdCanonical].flatMap(value => {
    const raw = value?.trim();
    if (!raw) return [];
    // Preserve synthetic channel identities; normalize formatted phone identities only.
    const identity = /^[+\d\s()-]+$/.test(raw) ? raw.replace(/\D/g, "") : raw.toLowerCase();
    return [JSON.stringify([event.clientId, identity])];
  }))];
}

type AccessEpoch = { tenant: number; conversations: Array<[string, number]> };
function accessEpochChanged(clientId: string, epoch: AccessEpoch) {
  return (tenantAccessEpoch.get(clientId) ?? 0) !== epoch.tenant ||
    epoch.conversations.some(([key, version]) => (conversationAccessEpoch.get(key) ?? 0) !== version);
}
export function publishRealtimeEvent(event: InboxRealtimeEvent): void {
  void publishRealtimeEventAsync(event);
}

/** Same publication path; allows local behavioral tests to await actual delivery. */
export function publishRealtimeEventAsync(event: InboxRealtimeEvent) {
  const keys = conversationEpochKeys(event);
  if (event.type === "inbox.access.updated") {
    tenantAccessEpoch.set(event.clientId, (tenantAccessEpoch.get(event.clientId) ?? 0) + 1);
  } else if (event.type === "conversation.handoff.updated") {
    for (const key of keys) conversationAccessEpoch.set(key, (conversationAccessEpoch.get(key) ?? 0) + 1);
  }
  const epoch: AccessEpoch = {
    tenant: tenantAccessEpoch.get(event.clientId) ?? 0,
    conversations: keys.map(key => [key, conversationAccessEpoch.get(key) ?? 0]),
  };
  return deliverRealtimeEvent(event, epoch).catch(error => logger.warn({ event: "realtime.access.failed", clientId: event.clientId, message: (error as Error).message }));
}
async function deliverRealtimeEvent(event: InboxRealtimeEvent, epoch: AccessEpoch) {
  const managerIds = [...new Set([...connections.values()].filter(c => c.clientId === event.clientId && (c.role === "ADMIN" || c.role === "SUPERVISOR")).map(c => c.userId))];
  const automationReaders = event.type === "inbox.access.updated" ? null
    : await resolveAutomationRealtimeReaders(getPrisma(), event, managerIds);

  const agentIds = [...new Set([...connections.values()].filter(c => c.clientId === event.clientId && c.role === "AGENT").map(c => c.userId))];
  const agentReaders = event.type !== "inbox.access.updated" && agentIds.length
    ? await resolveRealtimeAgentReaders(getPrisma(), event, agentIds).catch(() => new Set<string>()) : new Set<string>();
  let delivered = 0;
  for (const connection of connections.values()) {
    if (connection.clientId !== event.clientId) continue;
    if (connection.socket.readyState !== WebSocket.OPEN) continue;
    if (
      connection.supportAccess?.expiresAt &&
      new Date(connection.supportAccess.expiresAt).getTime() <= Date.now()
    ) {
      connection.socket.close(4001, "support_access_expired");
      removeConnection(connection.id, "support_access_expired");
      continue;
    }
    if (automationReaders !== null) {
      if (!accessEpochChanged(event.clientId, epoch) && automationReaders.has(connection.userId)) {
        connection.socket.send(JSON.stringify({ type: "inbox.access.updated", clientId: event.clientId }));
        delivered++;
      }
      continue;
    }
    if (connection.role === "AGENT" && event.type !== "inbox.access.updated") {
      if (accessEpochChanged(event.clientId, epoch) || !agentReaders.has(connection.userId)) {
        if (event.type === "conversation.handoff.updated") connection.socket.send(JSON.stringify({ type: "inbox.access.updated", clientId: event.clientId }));
        continue;
      }
    }
    connection.socket.send(JSON.stringify(event));
    delivered += 1;
  }
  logger.info({
    event: "realtime.event.published",
    type: event.type,
    clientId: event.clientId,
    delivered,
  });
  if (delivered > 0) {
    logger.info({
      event: "realtime.event.delivered",
      type: event.type,
      clientId: event.clientId,
      delivered,
    });
  }
  if (automationReaders !== null) return;
  void dispatchWebPushForRealtimeEvent(event).catch((error) => {
    logger.warn({
      event: "push.failed",
      reason: "dispatch_error",
      clientId: event.clientId,
      message: (error as Error).message,
    });
  });
}
