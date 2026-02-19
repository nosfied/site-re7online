import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { healthRoute } from "./health.route.js";
import { verifyWebhook, receiveWebhook } from "../whatsapp/webhook.controller.js";
import { jsonFileStorage } from "../storage/jsonFileStorage.js";
import { env } from "../config/env.js";
import { validateMetaSignature } from "../whatsapp/webhook.signature.js";
import { logger } from "../logger/logger.js";
import { getPrisma } from "../db.js";

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  const requestId = crypto.randomUUID();
  const parsedUrl = new URL(url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "GET" && pathname === "/health") {
    return healthRoute(res);
  }

  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("whatsapp-agent running");
    return;
  }

  if (req.method === "GET" && pathname === "/debug/env" && process.env.NODE_ENV !== "production") {
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

  if (pathname.startsWith("/admin")) {
    const prisma = getPrisma();
    const query = parseQuery(parsedUrl);
    const auth = getAdminToken(req);
    if (!env.ADMIN_TOKEN || auth.token !== env.ADMIN_TOKEN) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    logger.info({
      event: "admin.auth",
      authSource: auth.source,
      requestId,
    });

    if (req.method === "GET" && pathname === "/admin/health") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        json(res, 200, { ok: true, db: true });
      } catch {
        json(res, 200, { ok: true, db: false });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/debug/reset-conversation") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const waId = String(body.waId ?? "").trim();
      if (!waId) {
        json(res, 400, { ok: false, error: "bad_request" });
        return;
      }
      await jsonFileStorage.deleteConversation(waId);
      logger.info({
        event: "admin.debug.reset_conversation",
        waId,
        requestId,
      });
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/admin/clients") {
      const clients = await prisma.client.findMany({
        include: { phoneNumbers: true },
        orderBy: { createdAt: "desc" },
      });
      json(res, 200, { items: clients });
      return;
    }

    if (req.method === "POST" && pathname === "/admin/clients") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const clientKey = String(body.clientKey ?? "").trim();
      const name = String(body.name ?? "").trim();
      const phoneNumberId = String(body.phone_number_id ?? "").trim();
      if (!clientKey || !name || !phoneNumberId) {
        json(res, 400, { error: "invalid_body" });
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
          json(res, 409, {
            error: "phone_number_conflict",
            phoneNumberId,
            clientKey: owner?.clientKey ?? null,
          });
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
        json(res, status, updatedClient);
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
            json(res, 409, {
              error: "phone_number_conflict",
              phoneNumberId,
              clientKey: owner?.clientKey ?? null,
            });
            return;
          }
          const existingClient = await prisma.client.findUnique({
            where: { clientKey },
            include: { phoneNumbers: true },
          });
          if (existingClient) {
            json(res, 200, existingClient);
            return;
          }
        }
        logger.error({
          event: "admin.clients.error",
          error: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
        return;
      }
    }

    if (req.method === "GET" && pathname === "/admin/status") {
      try {
        let dbConnected = false;
        try {
          await prisma.$queryRaw`SELECT 1`;
          dbConnected = true;
        } catch {
          dbConnected = false;
        }

        const [clientsCount, conversationsCount, inboundCount, outboundCount] = await Promise.all([
          prisma.client.count(),
          prisma.conversation.count(),
          prisma.inboundMessage.count(),
          prisma.outboundMessage.count(),
        ]);

        const lastInbound = await prisma.inboundMessage.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, requestId: true },
        });
        const lastOutbound = await prisma.outboundMessage.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, requestId: true },
        });
        const lastRequestId =
          (lastOutbound?.createdAt ?? 0) > (lastInbound?.createdAt ?? 0)
            ? lastOutbound?.requestId
            : lastInbound?.requestId;

        json(res, 200, {
          uptime: {
            nodeEnv: process.env.NODE_ENV ?? "unknown",
            port: env.PORT,
            now: new Date().toISOString(),
            pid: process.pid,
          },
          config: {
            clientKey: env.CLIENT_ID,
            phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || null,
            sandbox: env.WHATSAPP_SANDBOX,
            allowlistEnabled: env.WHATSAPP_ALLOWLIST.length > 0,
            aiEnabled: env.WHATSAPP_AI_ENABLED,
            aiModel: env.WHATSAPP_AI_MODEL,
            outboundTemplate: {
              defaultName: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
              defaultLang: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
              fallbackEnabled: env.OUTBOUND_TEMPLATE_FALLBACK,
              fallbackName: env.OUTBOUND_TEMPLATE_FALLBACK_NAME,
              fallbackLang: env.OUTBOUND_TEMPLATE_FALLBACK_LANG,
            },
          },
          db: {
            connected: dbConnected,
            counts: {
              clients: clientsCount,
              conversations: conversationsCount,
              inboundMessages: inboundCount,
              outboundMessages: outboundCount,
            },
          },
          lastActivity: {
            inboundAt: lastInbound?.createdAt ?? null,
            outboundAt: lastOutbound?.createdAt ?? null,
            lastRequestId: lastRequestId ?? null,
          },
        });
      } catch (error) {
        logger.error({
          event: "admin.status.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/templates") {
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const failed = await prisma.outboundMessage.findMany({
          where: { status: "FAILED" },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            createdAt: true,
            waId: true,
            type: true,
            templateName: true,
            templateLang: true,
            status: true,
            requestId: true,
            errorBody: true,
            metaMessageId: true,
          },
        });
        const [breakdown24h, breakdown7d] = await Promise.all([
          prisma.outboundMessage.groupBy({
            by: ["templateName", "templateLang"],
            where: {
              createdAt: { gte: since24h },
              templateName: { not: null },
            },
            _count: { templateName: true },
          }),
          prisma.outboundMessage.groupBy({
            by: ["templateName", "templateLang"],
            where: {
              createdAt: { gte: since7d },
              templateName: { not: null },
            },
            _count: { templateName: true },
          }),
        ]);

        const topTemplateKeys = new Set(
          breakdown7d
            .slice()
            .sort((a, b) => b._count.templateName - a._count.templateName)
            .slice(0, 5)
            .map((item) => `${item.templateName ?? "unknown"}::${item.templateLang ?? ""}`)
        );
        const topTemplateGroups: Record<
          string,
          Array<{ waId: string; count: number }>
        > = {};
        if (topTemplateKeys.size > 0) {
          const groups = await prisma.outboundMessage.groupBy({
            by: ["templateName", "templateLang", "waId"],
            where: {
              createdAt: { gte: since7d },
              templateName: { not: null },
            },
            _count: { waId: true },
          });
          for (const group of groups) {
            const key = `${group.templateName ?? "unknown"}::${group.templateLang ?? ""}`;
            if (!topTemplateKeys.has(key)) continue;
            if (!topTemplateGroups[key]) topTemplateGroups[key] = [];
            topTemplateGroups[key].push({
              waId: maskWaId(group.waId),
              count: group._count.waId,
            });
          }
          for (const key of Object.keys(topTemplateGroups)) {
            topTemplateGroups[key] = topTemplateGroups[key]
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);
          }
        }

        const normalizeBreakdown = (
          items: Array<{ templateName: string | null; templateLang: string | null; _count: { templateName: number } }>
        ) =>
          items.map((item) => ({
            templateName: item.templateName,
            templateLang: item.templateLang,
            count: item._count.templateName,
            topWaIds: topTemplateGroups[`${item.templateName ?? "unknown"}::${item.templateLang ?? ""}`] ?? [],
          }));
        json(res, 200, {
          defaultTemplate: {
            name: env.OUTBOUND_TEMPLATE_DEFAULT_NAME,
            language: env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
          },
          fallback: {
            enabled: env.OUTBOUND_TEMPLATE_FALLBACK,
            name: env.OUTBOUND_TEMPLATE_FALLBACK_NAME,
            language: env.OUTBOUND_TEMPLATE_FALLBACK_LANG,
          },
          failed: failed.map((item) => ({
            createdAt: item.createdAt,
            waId: maskWaId(item.waId),
            type: item.type,
            templateName: item.templateName,
            templateLang: item.templateLang,
            status: item.status,
            requestId: item.requestId,
            errorBody: item.errorBody ? item.errorBody.slice(0, 2000) : null,
            metaMessageId: item.metaMessageId,
          })),
          breakdown24h: normalizeBreakdown(breakdown24h),
          breakdown7d: normalizeBreakdown(breakdown7d),
        });
      } catch (error) {
        logger.error({
          event: "admin.templates.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/messages") {
      try {
        const waId = String(query.waId ?? "").trim();
        const statusFilter = String(query.status ?? "").trim().toUpperCase();
        const typeFilter = String(query.type ?? "").trim().toUpperCase();
        const fromRaw = String(query.from ?? "").trim();
        const toRaw = String(query.to ?? "").trim();
        const from = fromRaw ? new Date(fromRaw) : null;
        const to = toRaw ? new Date(toRaw) : null;
        if (!waId) {
          json(res, 400, { error: "waId_required" });
          return;
        }
        const limitRaw = Number(query.limit ?? 50);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
        const includeRaw = String(query.includeRaw ?? "false") === "true";
        const clientKey = String(query.clientKey ?? "default").trim() || "default";
        const client = await prisma.client.findUnique({ where: { clientKey } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }

        const inboundWhere: Record<string, unknown> = {
          clientId: client.id,
          waId,
        };
        if (from || to) {
          inboundWhere.createdAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          };
        }
        const outboundWhere: Record<string, unknown> = {
          clientId: client.id,
          waId,
        };
        if (from || to) {
          outboundWhere.createdAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          };
        }
        if (statusFilter) {
          outboundWhere.status = statusFilter;
        }
        if (typeFilter) {
          inboundWhere.type = typeFilter;
          outboundWhere.type = typeFilter;
        }

        const [inbound, outbound] = await Promise.all([
          prisma.inboundMessage.findMany({
            where: inboundWhere,
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              createdAt: true,
              messageId: true,
              type: true,
              requestId: true,
              bodyText: true,
              rawPayload: includeRaw,
            },
          }),
          prisma.outboundMessage.findMany({
            where: outboundWhere,
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
              createdAt: true,
              messageId: true,
              type: true,
              status: true,
              requestId: true,
              bodyText: true,
              templateName: true,
              templateLang: true,
              metaMessageId: true,
              errorBody: true,
              rawPayload: includeRaw,
            },
          }),
        ]);

        const combined = [
          ...inbound.map((item) => ({
            direction: "INBOUND",
            type: item.type,
            status: "RECEIVED",
            intent: null,
            bodyText: item.bodyText ? item.bodyText.slice(0, 300) : null,
            templateName: null,
            templateLang: null,
            requestId: item.requestId,
            messageId: item.messageId,
            metaMessageId: null,
            errorBody: null,
            createdAt: item.createdAt,
            rawPayload: includeRaw ? item.rawPayload : undefined,
          })),
          ...outbound.map((item) => ({
            direction: "OUTBOUND",
            type: item.type,
            status: item.status,
            intent: null,
            bodyText: item.bodyText ? item.bodyText.slice(0, 300) : null,
            templateName: item.templateName,
            templateLang: item.templateLang,
            requestId: item.requestId,
            messageId: item.messageId,
            metaMessageId: item.metaMessageId,
            errorBody: item.errorBody ? item.errorBody.slice(0, 2000) : null,
            createdAt: item.createdAt,
            rawPayload: includeRaw ? item.rawPayload : undefined,
          })),
        ]
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .slice(0, limit);

        json(res, 200, {
          ok: true,
          waIdMasked: maskWaId(waId),
          filters: {
            waId: maskWaId(waId),
            status: statusFilter || null,
            type: typeFilter || null,
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            clientKey,
            limit,
          },
          count: combined.length,
          items: combined,
        });
      } catch (error) {
        logger.error({
          event: "admin.messages.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/metrics") {
      try {
        const range = String(query.range ?? "24h");
        const now = Date.now();
        const from =
          range === "1h"
            ? new Date(now - 1 * 60 * 60 * 1000)
            : range === "7d"
              ? new Date(now - 7 * 24 * 60 * 60 * 1000)
              : range === "30d"
                ? new Date(now - 30 * 24 * 60 * 60 * 1000)
                : new Date(now - 24 * 60 * 60 * 1000);
        const to = new Date(now);
        const clientKey = String(query.clientKey ?? "default").trim() || "default";
        const client = await prisma.client.findUnique({ where: { clientKey } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }

        const [
          inboundReceived,
          outboundSentText,
          outboundSentTemplate,
          outboundFailed,
          blockedWindowClosed,
          leadRequested,
          leadCaptured,
          leadTemplateSent,
          demoRequested,
          demoScheduled,
          lastErrors,
        ] = await Promise.all([
            prisma.inboundMessage.count({
              where: { clientId: client.id, createdAt: { gte: from, lte: to } },
            }),
            prisma.outboundMessage.count({
              where: {
                clientId: client.id,
                status: "SENT",
                type: "TEXT",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.outboundMessage.count({
              where: {
                clientId: client.id,
                status: "SENT",
                type: "TEMPLATE",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.outboundMessage.count({
              where: {
                clientId: client.id,
                status: "FAILED",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "outbound.blocked.window_closed",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "lead.capture.requested",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "lead.captured",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "lead.template.sent",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "lead.demo_requested",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.event.count({
              where: {
                clientId: client.id,
                eventName: "lead.demo_scheduled",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.outboundMessage.findMany({
              where: { clientId: client.id, status: "FAILED" },
              orderBy: { createdAt: "desc" },
              take: 10,
              select: { createdAt: true, errorBody: true, requestId: true, templateName: true },
            }),
          ]);

        const sentTotal = outboundSentText + outboundSentTemplate;
        const deliveryDenominator = sentTotal + outboundFailed;
        const deliveryRate = deliveryDenominator > 0 ? sentTotal / deliveryDenominator : 0;
        const templateRate = sentTotal > 0 ? outboundSentTemplate / sentTotal : 0;
        const blockedRate = inboundReceived > 0 ? blockedWindowClosed / inboundReceived : 0;
        const leadConversionRate = leadRequested > 0 ? leadCaptured / leadRequested : 0;
        const demoConversionRate = inboundReceived > 0 ? demoScheduled / inboundReceived : 0;

        json(res, 200, {
          ok: true,
          range,
          from,
          to,
          counts: {
            inbound: { received: inboundReceived },
            outbound: {
              sent_text: outboundSentText,
              sent_template: outboundSentTemplate,
              failed: outboundFailed,
              blocked_window_closed: blockedWindowClosed,
            },
          },
          kpis: {
            delivery_rate: deliveryRate,
            template_rate: templateRate,
            blocked_rate: blockedRate,
          },
          lead: {
            requested: leadRequested,
            captured: leadCaptured,
            template_sent: leadTemplateSent,
            conversion_rate: leadConversionRate,
            demo_requested: demoRequested,
            demo_scheduled: demoScheduled,
            conversion_rate_demo: demoConversionRate,
          },
          topErrors: lastErrors.map((item) => ({
            createdAt: item.createdAt,
            requestId: item.requestId,
            templateName: item.templateName,
            errorBody: item.errorBody ? item.errorBody.slice(0, 2000) : null,
          })),
          lastUpdatedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({
          event: "admin.metrics.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/admin/clients/")) {
      const [, , , id, action] = pathname.split("/");
      if (action !== "rotate-token") {
        json(res, 404, { error: "not_found" });
        return;
      }
      const newToken = crypto.randomBytes(24).toString("hex");
      const updated = await prisma.client.update({
        where: { id },
        data: { adminToken: newToken },
      });
      json(res, 200, { id: updated.id, adminToken: newToken });
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

  json(res, 404, { error: "not_found" });
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

function parseQuery(parsed: URL) {
  const query: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function maskWaId(waId: string) {
  const tail = waId.slice(-4);
  return `***${tail}`;
}

function getAdminToken(req: IncomingMessage) {
  const headerToken = req.headers["x-admin-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return { token: headerToken.trim(), source: "x-admin-token" as const };
  }
  const authHeader = req.headers["authorization"];
  if (!authHeader) return { token: "", source: "missing" as const };
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return { token: "", source: "invalid" as const };
  }
  return { token: token.trim(), source: "authorization" as const };
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
