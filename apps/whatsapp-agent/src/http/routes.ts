import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
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
      try {
        let created = false;
        let createdPhone = false;
        let client = await prisma.client.findUnique({
          where: { clientKey },
          include: { phoneNumbers: true },
        });
        if (!client) {
          client = await prisma.client.create({
            data: { clientKey, name },
            include: { phoneNumbers: true },
          });
          created = true;
        }

        const existingPhone = await prisma.waPhoneNumber.findUnique({
          where: { phoneNumberId },
        });
        if (existingPhone && existingPhone.clientId !== client.id) {
          const owner = await prisma.client.findUnique({
            where: { id: existingPhone.clientId },
          });
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "phone_number_conflict",
              phoneNumberId,
              clientKey: owner?.clientKey ?? null,
            })
          );
          return;
        }

        if (!existingPhone) {
          await prisma.waPhoneNumber.create({
            data: {
              phoneNumberId,
              display: phoneNumberId,
              clientId: client.id,
            },
          });
          createdPhone = true;
        }

        const updatedClient = await prisma.client.findUnique({
          where: { id: client.id },
          include: { phoneNumbers: true },
        });
        const status = created || createdPhone ? 201 : 200;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(updatedClient));
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const existingPhone = await prisma.waPhoneNumber.findUnique({
            where: { phoneNumberId },
          });
          if (existingPhone) {
            const owner = await prisma.client.findUnique({
              where: { id: existingPhone.clientId },
            });
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "phone_number_conflict",
                phoneNumberId,
                clientKey: owner?.clientKey ?? null,
              })
            );
            return;
          }
          const existingClient = await prisma.client.findUnique({
            where: { clientKey },
            include: { phoneNumbers: true },
          });
          if (existingClient) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(existingClient));
            return;
          }
        }
        logger.error({
          event: "admin.clients.error",
          error: (error as Error).message,
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "server_error" }));
        return;
      }
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
            res.end(JSON.stringify({ error: "forbidden", reason: "signature_missing" }));
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
            res.end(JSON.stringify({ error: "forbidden", reason: "signature_invalid" }));
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
