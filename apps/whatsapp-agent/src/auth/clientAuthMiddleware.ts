import { IncomingMessage, ServerResponse } from "node:http";
import { verifyClientAuthToken } from "./clientAuth.js";

export type ClientAuthContext = {
  userId: string;
  clientId: string;
  role: string;
  email: string;
};

export function normalizeUserRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "ADMIN" as const;
  if (normalized === "SUPERVISOR") return "SUPERVISOR" as const;
  return "AGENT" as const;
}

function getBearerToken(req: IncomingMessage) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return "";
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return "";
  }
  return token.trim();
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  if (
    status >= 400 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    const typed = payload as { error: string; message?: unknown; details?: unknown };
    res.end(
      JSON.stringify({
        error: {
          code: typed.error,
          message:
            typeof typed.message === "string" && typed.message.trim()
              ? typed.message
              : typed.error,
        },
        ...(typeof typed.details === "string" && typed.details.trim()
          ? { details: typed.details }
          : {}),
      })
    );
    return;
  }
  res.end(JSON.stringify(payload));
}

export function resolveClientAuth(req: IncomingMessage): ClientAuthContext | null {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = verifyClientAuthToken(token);
  if (!payload) return null;
  return {
    userId: payload.sub,
    clientId: payload.clientId,
    role: normalizeUserRole(payload.role),
    email: payload.email,
  };
}

export function requireClientAuth(
  req: IncomingMessage,
  res: ServerResponse
): ClientAuthContext | null {
  const auth = resolveClientAuth(req);
  if (!auth) {
    json(res, 401, { error: "unauthorized" });
    return null;
  }
  return auth;
}
