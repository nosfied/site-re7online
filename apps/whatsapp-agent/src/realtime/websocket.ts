import http from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { validateAppSessionFromRequest } from "../auth/appSessionService.js";
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
      req.headers.authorization = `Bearer ${token}`;

      void validateAppSessionFromRequest(req)
        .then((validation) => {
          if (!validation.ok) {
            closeUnauthorized(socket, validation.reason);
            return;
          }
          wss.handleUpgrade(req, socket, head, (ws) => {
            addConnection(ws, {
              userId: validation.auth.userId,
              clientId: validation.auth.clientId,
              email: validation.auth.email,
              role: validation.auth.role,
            });
          });
        })
        .catch((error) => {
          logger.warn({
            event: "realtime.websocket.auth_failed",
            reason: "session_validation_error",
            message: (error as Error).message,
          });
          socket.destroy();
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
