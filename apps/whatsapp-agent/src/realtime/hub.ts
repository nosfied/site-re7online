import { WebSocket } from "ws";
import { logger } from "../logger/logger.js";
import { InboxRealtimeEvent } from "./events.js";

type RealtimeRole = "AGENT" | "SUPERVISOR" | "ADMIN";

export type RealtimeConnectionContext = {
  userId: string;
  clientId: string;
  role: RealtimeRole;
  email: string;
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

export function publishRealtimeEvent(event: InboxRealtimeEvent) {
  let delivered = 0;
  for (const connection of connections.values()) {
    if (connection.clientId !== event.clientId) continue;
    if (connection.socket.readyState !== WebSocket.OPEN) continue;
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
}
