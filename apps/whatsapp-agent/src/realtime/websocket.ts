import http from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { verifyClientAuthToken } from "../auth/clientAuth.js";
import { normalizeUserRole } from "../auth/clientAuthMiddleware.js";
import { logger } from "../logger/logger.js";
import { addConnection } from "./hub.js";

function closeUnauthorized(socket: Duplex, reason: string) {
  logger.warn({ event: "realtime.websocket.auth_failed", reason });
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

export function attachRealtimeWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "", `http://${host}`);
      if (url.pathname !== "/app/realtime" && url.pathname !== "/agent-api/app/realtime") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      const token = url.searchParams.get("token")?.trim();
      if (!token) {
        closeUnauthorized(socket, "missing_token");
        return;
      }

      const payload = verifyClientAuthToken(token);
      if (!payload) {
        closeUnauthorized(socket, "invalid_token");
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        addConnection(ws, {
          userId: payload.sub,
          clientId: payload.clientId,
          email: payload.email,
          role: normalizeUserRole(payload.role),
        });
      });
    } catch (error) {
      logger.warn({
        event: "realtime.websocket.auth_failed",
        reason: "upgrade_error",
        message: (error as Error).message,
      });
      socket.destroy();
    }
  });
}
