import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { healthRoute } from "./health.route.js";
import { verifyWebhook, receiveWebhook } from "../whatsapp/webhook.controller.js";
import { env } from "../config/env.js";
import { validateMetaSignature } from "../whatsapp/webhook.signature.js";
import { logger } from "../logger/logger.js";
import { prisma } from "../db.js";

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
    return healthRoute(res);
  }

  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("whatsapp-agent running");
    return;
  }

  if (req.method === "GET" && url === "/debug/env" && process.env.NODE_ENV !== "production") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        verifyTokenPresent: env.verifyTokenPresent,
        accessTokenPresent: env.accessTokenPresent,
        phoneNumberIdPresent: env.phoneNumberIdPresent,
        apiVersion: env.WHATSAPP_API_VERSION,
        allowlistCount: env.WHATSAPP_ALLOWLIST.length,
      })
    );
    return;
  }

  if (url.startsWith("/admin")) {
    const token = getAdminToken(req);
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.method === "GET" && url === "/admin/health") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, db: true }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, db: false }));
      }
      return;
    }

    if (req.method === "GET" && url === "/admin/clients") {
      const clients = await prisma.client.findMany({
        include: { phoneNumbers: true },
        orderBy: { createdAt: "desc" },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: clients }));
      return;
    }

    if (req.method === "POST" && url === "/admin/clients") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const clientKey = String(body.clientKey ?? "").trim();
      const name = String(body.name ?? "").trim();
      const phoneNumberId = String(body.phone_number_id ?? "").trim();
      if (!clientKey || !name || !phoneNumberId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
        return;
      }
      const client = await prisma.client.create({
        data: {
          clientKey,
          name,
          phoneNumbers: {
            create: {
              phoneNumberId,
              display: phoneNumberId,
            },
          },
        },
        include: { phoneNumbers: true },
      });
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(client));
      return;
    }

    if (req.method === "POST" && url.startsWith("/admin/clients/")) {
      const [, , , id, action] = url.split("/");
      if (action !== "rotate-token") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const newToken = crypto.randomBytes(24).toString("hex");
      const updated = await prisma.client.update({
        where: { id },
        data: { adminToken: newToken },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: updated.id, adminToken: newToken }));
      return;
    }
  }

  if (url.startsWith("/webhook")) {
    if (req.method === "GET") {
      const requestId = crypto.randomUUID();
      return verifyWebhook(req, res, {
        requestId,
        route: "/webhook",
        method: "GET",
      });
    }
    if (req.method === "POST") {
      const requestId = crypto.randomUUID();
      readRawBody(req, (rawBody) => {
        const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
        const requireSignature =
          process.env.NODE_ENV === "production" && env.META_APP_SECRET.length > 0;

        if (requireSignature) {
          if (!signatureHeader) {
            logger.warn({
              event: "webhook.signature.missing",
              route: "/webhook",
              method: "POST",
              requestId,
            });
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          const signature = validateMetaSignature(rawBody, signatureHeader, env.META_APP_SECRET);
          if (!signature.ok) {
            logger.warn({
              event: "webhook.signature.invalid",
              route: "/webhook",
              method: "POST",
              requestId,
              reason: signature.reason,
            });
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "forbidden" }));
            return;
          }
          logger.info({
            event: "webhook.signature.valid",
            route: "/webhook",
            method: "POST",
            requestId,
          });
        } else {
          logger.info({
            event: "webhook.signature.skipped",
            route: "/webhook",
            method: "POST",
            requestId,
            reason: process.env.NODE_ENV !== "production" ? "not_production" : "missing_secret",
          });
        }

        let payload: unknown = null;
        try {
          payload = JSON.parse(rawBody.toString("utf8"));
        } catch (error) {
          logger.warn({
            event: "webhook.invalid",
            route: "/webhook",
            method: "POST",
            requestId,
            error: (error as Error).message,
          });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_json" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

        const meta = {
          requestId,
          rawBodyLength: rawBody.length,
          ip: req.socket.remoteAddress,
          route: "/webhook",
          method: "POST",
        };
        setImmediate(() => {
          receiveWebhook(payload, meta).catch((error) => {
            logger.error({
              event: "webhook.process.error",
              route: "/webhook",
              method: "POST",
              requestId,
              error: (error as Error).message,
            });
          });
        });
      }).catch((error: Error) => {
        logger.error({
          event: "webhook.read_error",
          route: "/webhook",
          method: "POST",
          requestId,
          error: error.message,
        });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      });
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
}

function readRawBody(req: IncomingMessage, onEnd: (rawBody: Buffer) => void) {
  return new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      onEnd(Buffer.concat(chunks));
      resolve();
    });
    req.on("error", reject);
  });
}

function getAdminToken(req: IncomingMessage) {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7);
  }
  const token = req.headers["x-admin-token"];
  return typeof token === "string" ? token : "";
}

async function readJsonBody(req: IncomingMessage, res: ServerResponse) {
  return new Promise<Record<string, unknown> | null>((resolve) => {
    readRawBody(req, (rawBody) => {
      try {
        const parsed = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
        resolve(parsed);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        resolve(null);
      }
    }).catch(() => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_body" }));
      resolve(null);
    });
  });
}
