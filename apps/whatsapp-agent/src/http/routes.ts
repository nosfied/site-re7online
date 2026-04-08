import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { healthRoute } from "./health.route.js";
import { verifyWebhook, receiveWebhook } from "../whatsapp/webhook.controller.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { env, normalizeWaId } from "../config/env.js";
import { validateMetaSignature } from "../whatsapp/webhook.signature.js";
import { logger } from "../logger/logger.js";
import { getPrisma } from "../db.js";
import { getTenants, saveTenants } from "../config/tenantConfig.js";
import { checkRateLimit } from "./rateLimit.js";
import { sendTextMessage } from "../whatsapp/whatsapp.client.js";
import { isWindowOpen } from "../conversation/conversation.service.js";
import { persistEvent, persistOutboundMessage } from "../db/persist.js";
import { checkUsageGate } from "../usage/usageGate.js";
import {
  cancelCampaign,
  createCampaign,
  getCampaignById,
  listCampaigns,
} from "../campaigns/campaignService.js";
import { startCampaignRun } from "../campaigns/campaignRunner.js";
import { httpError } from "../utils/httpError.js";
import {
  exchangeEmbeddedSignupCode,
  MetaOnboardingExchangeError,
} from "../meta/onboarding.service.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";
import { hashPassword, issueClientAuthToken, verifyPassword } from "../auth/clientAuth.js";
import { requireClientAuth } from "../auth/clientAuthMiddleware.js";
import {
  buildWaIdLookup,
  canonicalizeBrazilWaId,
  compareConversationLookupPriority,
  normalizeWaIdDigits,
} from "../utils/waid.js";

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  const requestId = crypto.randomUUID();
  const parsedUrl = new URL(url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = parsedUrl.pathname;
  const query = parseQuery(parsedUrl);

  if (req.method === "GET" && pathname === "/health") {
    return healthRoute(res);
  }

  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("whatsapp-agent running");
    return;
  }

  if (req.method === "POST" && pathname === "/auth/login") {
    const prisma = getPrisma();
    try {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!email || !password) {
        json(res, 400, { error: "bad_request" });
        return;
      }

      const users = await prisma.user.findMany({
        where: { email },
        take: 2,
        select: {
          id: true,
          clientId: true,
          name: true,
          email: true,
          role: true,
          passwordHash: true,
          client: {
            select: {
              status: true,
            },
          },
        },
      });

      if (users.length === 0) {
        json(res, 401, { error: "invalid_credentials" });
        return;
      }
      if (users.length > 1) {
        json(res, 409, { error: "ambiguous_login" });
        return;
      }

      const user = users[0];
      if (user.client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      if (!verifyPassword(password, user.passwordHash)) {
        json(res, 401, { error: "invalid_credentials" });
        return;
      }

      const token = issueClientAuthToken({
        id: user.id,
        clientId: user.clientId,
        name: user.name,
        email: user.email,
        role: user.role,
      });

      json(res, 200, {
        ok: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          clientId: user.clientId,
        },
      });
    } catch (error) {
      logger.error({
        event: "auth.login.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/conversations") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const limitRaw = Number(query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const result = await buildConversationListPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        limit,
        includeAssignedUserName: true,
      });
      json(res, 200, result);
    } catch (error) {
      logger.error({
        event: "app.conversations.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/app/templates/request") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const name = String(body.name ?? "").trim();
      const content = String(body.content ?? "").trim();
      const category = String(body.category ?? "").trim();
      if (!name || !content || !category) {
        json(res, 400, { error: "bad_request" });
        return;
      }

      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }

      const created = await prisma.templateRequest.create({
        data: {
          clientId: client.id,
          name,
          content,
          category,
          status: "pending",
          createdBy: clientAuth.userId,
          ...(body.variables !== undefined
            ? { variables: body.variables as Prisma.InputJsonValue }
            : {}),
        },
        select: {
          id: true,
          name: true,
          content: true,
          variables: true,
          category: true,
          status: true,
          notes: true,
          createdBy: true,
          createdAt: true,
        },
      });

      json(res, 200, {
        ok: true,
        request: created,
      });
    } catch (error) {
      logger.error({
        event: "app.templates.request.create.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/templates/requests") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }

      const items = await prisma.templateRequest.findMany({
        where: { clientId: client.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          content: true,
          variables: true,
          category: true,
          status: true,
          notes: true,
          createdBy: true,
          createdAt: true,
        },
      });

      json(res, 200, {
        ok: true,
        count: items.length,
        items,
      });
    } catch (error) {
      logger.error({
        event: "app.templates.request.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/templates") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }

      const items = await prisma.template.findMany({
        where: {
          clientId: client.id,
          status: "approved",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          category: true,
          language: true,
          status: true,
          content: true,
          variables: true,
          metaTemplateId: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      json(res, 200, {
        ok: true,
        count: items.length,
        items,
      });
    } catch (error) {
      logger.error({
        event: "app.templates.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "GET" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 4
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const orderRaw = String(query.order ?? "asc").trim().toLowerCase();
      const order = orderRaw === "desc" ? "desc" : "asc";
      const limitRaw = Number(query.limit ?? 200);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
      const includeRaw = String(query.includeRaw ?? "false") === "true";
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }

      const result = await buildConversationDetailPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        waId,
        order,
        limit,
        includeRaw,
        includeAssignedUserName: true,
        requestId,
        source: "app_conversation_detail",
      });
      json(res, 200, result);
    } catch (error) {
      logger.error({
        event: "app.conversation.messages.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/send")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const text = String(body.text ?? "").trim();
      if (!text) {
        json(res, 400, { error: "bad_request" });
        return;
      }

      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }

      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_send",
      });
      const result = await adminSendMessage({
        waId: resolvedConversation.resolvedWaId,
        text,
        clientKey: client.clientKey,
        clientId: client.id,
        requestId,
      });
      if (!result.ok) {
        json(res, result.statusCode, { error: result.error });
        return;
      }
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      json(res, 200, {
        ok: true,
        waId: conversation?.waId ?? resolvedConversation.resolvedWaId,
        waIdCanonical: resolvedConversation.resolvedWaIdCanonical,
        mode: conversation?.mode ?? "BOT",
        assignedUserId: conversation?.assignedUserId ?? null,
        assignedTo: conversation?.assignedTo ?? null,
        assignedUserName:
          conversation?.assignedUserId
            ? await findAssignedUserName(prisma, client.id, conversation.assignedUserId)
            : null,
        assignedAt: conversation?.assignedAt ?? null,
        message: {
          messageId: result.messageId,
          status: result.status,
          metaMessageId: result.metaMessageId,
          createdAt: result.createdAt,
        },
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.send.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/users") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const users = await prisma.user.findMany({
        where: { clientId: client.id },
        orderBy: [{ createdAt: "desc" }],
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      json(res, 200, { ok: true, count: users.length, items: users });
    } catch (error) {
      logger.error({
        event: "app.users.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/claim")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_claim",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
      const assignedUser = requestedUserId
        ? await prisma.user.findFirst({
            where: { id: requestedUserId, clientId: client.id },
            select: { id: true, name: true },
          })
        : null;
      if (requestedUserId && !assignedUser) {
        json(res, 404, { error: "user_not_found" });
        return;
      }
      const nextState = {
        ...conversation,
        mode: "HUMAN" as const,
        assignedUserId: assignedUser?.id ?? clientAuth.userId,
        assignedTo: assignedUser ? `user:${assignedUser.id}` : `user:${clientAuth.userId}`,
        assignedAt: new Date().toISOString(),
      };
      await runtimeStorage.upsertConversation(nextState);
      json(res, 200, {
        ok: true,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        mode: nextState.mode,
        assignedUserId: nextState.assignedUserId,
        assignedTo: nextState.assignedTo,
        assignedUserName:
          assignedUser?.name ??
          (nextState.assignedUserId
            ? await findAssignedUserName(prisma, client.id, nextState.assignedUserId)
            : null),
        assignedAt: nextState.assignedAt,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.claim.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/release")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_release",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const nextState = {
        ...conversation,
        mode: "BOT" as const,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      json(res, 200, {
        ok: true,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        mode: nextState.mode,
        assignedUserId: nextState.assignedUserId,
        assignedTo: nextState.assignedTo,
        assignedUserName: null,
        assignedAt: nextState.assignedAt,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.release.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "PATCH" &&
    pathname.startsWith("/app/lead/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/status")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!leadId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const status = String(body.status ?? "").trim().toUpperCase();
      const allowed = new Set(["NEW", "QUALIFIED", "WAITING_ATTENDANT", "IN_ATTENDANCE", "CLOSED"]);
      if (!allowed.has(status)) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const existing = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: client.id },
        select: { id: true },
      });
      if (!existing) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      const lead = await prisma.lead.update({
        where: { id: leadId },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      });
      json(res, 200, { ok: true, lead });
    } catch (error) {
      logger.error({
        event: "app.lead.status.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/lead/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/notes")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!leadId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: client.id },
        select: { id: true },
      });
      if (!lead) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const noteBody = String(body.body ?? "").trim();
      if (!noteBody) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const note = await prisma.leadNote.create({
        data: { leadId: lead.id, tenantId: client.id, body: noteBody },
        select: { id: true, leadId: true, tenantId: true, body: true, createdAt: true },
      });
      json(res, 200, { ok: true, note });
    } catch (error) {
      logger.error({
        event: "app.lead.notes.create.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "GET" &&
    pathname.startsWith("/app/lead/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/notes")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!leadId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: client.id },
        select: { id: true },
      });
      if (!lead) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      const notes = await prisma.leadNote.findMany({
        where: { leadId: lead.id, tenantId: client.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, leadId: true, tenantId: true, body: true, createdAt: true },
      });
      json(res, 200, { ok: true, count: notes.length, items: notes });
    } catch (error) {
      logger.error({
        event: "app.lead.notes.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/campaigns") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const limitRaw = Number(query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const result = await buildCampaignListPayload(prisma, {
        clientId: client.id,
        limit,
      });
      json(res, 200, result);
    } catch (error) {
      logger.error({
        event: "app.campaign.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "GET" &&
    pathname.startsWith("/app/campaigns/") &&
    pathname.split("/").length === 4
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const campaignId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!campaignId) {
        json(res, 400, httpError("bad_request", "Campaign id is required"));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const result = await buildCampaignDetailPayload(prisma, {
        clientId: client.id,
        campaignId,
      });
      if (!result) {
        json(res, 404, httpError("campaign_not_found", "Campaign not found"));
        return;
      }
      json(res, 200, result);
    } catch (error) {
      logger.error({
        event: "app.campaign.get.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/campaigns/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/cancel")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const campaignId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!campaignId) {
        json(res, 400, httpError("bad_request", "Campaign id is required"));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const cancelled = await cancelScopedCampaign(prisma, {
        clientId: client.id,
        campaignId,
      });
      if (!cancelled) {
        json(res, 404, httpError("campaign_not_found", "Campaign not found"));
        return;
      }
      if (cancelled === "not_cancelable") {
        json(
          res,
          409,
          httpError("campaign_not_cancelable", "Campaign is not cancelable", {
            status: "not_sending",
          })
        );
        return;
      }
      json(res, 200, {
        ok: true,
        campaign: serializeCampaign(cancelled),
      });
    } catch (error) {
      logger.error({
        event: "app.campaign.cancel.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "POST" && pathname === "/app/campaigns") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const name = String(body.name ?? "").trim();
      const templateId =
        typeof body.templateId === "string" && body.templateId.trim().length > 0
          ? body.templateId.trim()
          : null;
      const requestedTemplateName = String(body.templateName ?? "").trim();
      const components = parseTemplateComponents(body.templateParams);
      const rawWaIds = Array.isArray(body.recipients)
        ? body.recipients
        : Array.isArray(body.waIds)
          ? body.waIds
          : [];
      if (!name) {
        json(res, 400, httpError("bad_request", "Campaign name is required"));
        return;
      }
      if (!templateId && !requestedTemplateName) {
        json(res, 400, httpError("invalid_template_name", "Template name is required"));
        return;
      }
      if (!Array.isArray(rawWaIds) || rawWaIds.length === 0) {
        json(res, 400, httpError("invalid_recipients", "Recipients must be a non-empty array"));
        return;
      }
      if (rawWaIds.some((value) => String(value ?? "").trim().length <= 5)) {
        json(res, 400, httpError("invalid_recipients", "Recipients must contain valid waIds"));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const waIds = dedupeCampaignRecipients(rawWaIds, {
        source: "app_campaign_create",
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
      });
      if (waIds.length === 0) {
        json(res, 400, httpError("invalid_recipients", "Recipients must contain valid waIds"));
        return;
      }
      if (waIds.length > 1000) {
        json(res, 400, httpError("too_many_recipients", "Recipients limit exceeded", { limit: 1000 }));
        return;
      }

      const resolvedTemplate = await resolveCampaignTemplateInput(prisma, {
        clientId: client.id,
        templateId,
        templateName: requestedTemplateName,
      });
      if ("error" in resolvedTemplate) {
        json(res, resolvedTemplate.status, httpError(resolvedTemplate.error, resolvedTemplate.message));
        return;
      }

      const created = await createScopedCampaign({
        clientId: client.id,
        clientKey: client.clientKey,
        name,
        templateId: resolvedTemplate.templateId,
        templateName: resolvedTemplate.templateName,
        waIds,
        components,
      });

      json(res, 200, {
        ok: true,
        campaign: {
          ...serializeCampaign(created.campaign),
          campaignId: created.campaign.id,
          campaignRunId: created.campaignRunId,
        },
      });
    } catch (error) {
      logger.error({
        event: "app.campaign.run.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
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

  if (pathname.startsWith("/admin/") || pathname.startsWith("/webhook")) {
    const rate = checkRateLimit(req, pathname);
    if (rate.limited) {
      logger.warn({
        event: "rate.limit.hit",
        ip: rate.ip,
        path: pathname,
        requestId,
        limit: rate.limit,
        class: rate.bucketClass,
        windowMs: rate.windowMs,
      });
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      json(res, 429, { ok: false, error: "rate_limited", retryAfterSec: rate.retryAfterSec });
      return;
    }
  }

  if (pathname.startsWith("/admin")) {
    const prisma = getPrisma();
    const authToken = getAdminToken(req);
    const adminAuth = await resolveAdminAuth(prisma, authToken.token);
    if (!adminAuth) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    logger.info({
      event: "admin.auth",
      authSource: authToken.source,
      role: adminAuth.role,
      clientKey: adminAuth.clientKey ?? null,
      requestId,
    });
    const tenantAdmin = adminAuth.role === "tenant";
    const requestedClientKey = getRequestedClientKey(req, query);
    const requireSuperadmin = () => {
      if (!tenantAdmin) return false;
      logger.warn({
        event: "rbac.denied",
        path: pathname,
        method: req.method ?? "GET",
        role: adminAuth.role,
        tokenType: authToken.source,
        requestedClientKey: requestedClientKey ?? null,
        clientKeyResolved: adminAuth.clientKey,
        requestId,
      });
      json(res, 403, { error: "forbidden" });
      return true;
    };
    const getScopedClientKey = async () => {
      if (tenantAdmin) {
        if (requestedClientKey && requestedClientKey !== adminAuth.clientKey) {
          logger.warn({
            event: "rbac.scope_violation",
            path: pathname,
            method: req.method ?? "GET",
            role: adminAuth.role,
            tokenType: authToken.source,
            requestedClientKey,
            clientKeyResolved: adminAuth.clientKey,
            requestId,
          });
          json(res, 403, { error: "forbidden" });
          return null;
        }
        return adminAuth.clientKey;
      }

      if (requestedClientKey) {
        return requestedClientKey;
      }

      const tenants = await getTenants();
      const tenantKeys = Object.keys(tenants);
      if (tenantKeys.length !== 1) {
        json(res, 400, { error: "missing_clientKey" });
        return null;
      }
      return tenantKeys[0];
    };

    if (req.method === "GET" && pathname === "/admin/health") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        json(res, 200, { ok: true, db: true });
      } catch {
        json(res, 200, { ok: true, db: false });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/users") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const users = await prisma.user.findMany({
          where: { clientId: client.id },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        json(res, 200, { ok: true, count: users.length, items: users });
      } catch (error) {
        logger.error({
          event: "admin.users.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/users") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const name = String(body.name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = typeof body.password === "string" ? body.password : "";
        const role = String(body.role ?? "AGENT").trim().toUpperCase();
        if (!name || !email) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        if (password && password.length < 6) {
          json(res, 400, { error: "weak_password" });
          return;
        }
        const user = await prisma.user.create({
          data: {
            clientId: client.id,
            name,
            email,
            ...(password ? { passwordHash: hashPassword(password) } : {}),
            role,
          },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        });
        json(res, 200, { ok: true, user });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          json(res, 409, { error: "user_already_exists" });
          return;
        }
        logger.error({
          event: "admin.users.create.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/users/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/reset-password")
    ) {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const userId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!userId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const password = typeof body.password === "string" ? body.password : "";
        if (!password || password.length < 6) {
          json(res, 400, { error: "weak_password" });
          return;
        }
        const existingUser = await prisma.user.findFirst({
          where: { id: userId, clientId: client.id },
          select: { id: true, email: true, name: true },
        });
        if (!existingUser) {
          json(res, 404, { error: "user_not_found" });
          return;
        }
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { passwordHash: hashPassword(password) },
        });
        json(res, 200, {
          ok: true,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
          },
        });
      } catch (error) {
        logger.error({
          event: "admin.users.reset_password.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "GET" &&
      pathname.startsWith("/admin/conversations/") &&
      pathname.split("/").length === 4
    ) {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const clientKey = await getScopedClientKey();
      if (!clientKey) return;
      const client = await prisma.client.findUnique({
        where: { clientKey },
        select: { id: true },
      });
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey,
        rawWaId: waId,
        requestId,
        source: "admin_conversation_inspect",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const assignedUser =
        conversation.assignedUserId
          ? await prisma.user.findFirst({
              where: { id: conversation.assignedUserId, client: { clientKey } },
              select: { name: true },
            })
          : null;
      logger.info({
        event: "admin.conversation.inspect",
        waId: maskWaId(waId),
        clientKey,
        authSource: authToken.source,
        requestId,
      });
      json(res, 200, {
        waId: conversation.waId,
        waIdCanonical: conversation.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        intent: conversation.intent ?? null,
        demoStatus: conversation.demoStatus ?? "none",
        demoPreferredSchedule: conversation.demoPreferredSchedule ?? null,
        handoff: conversation.handoff,
        flow: conversation.flow ?? null,
        flowStep: conversation.flowStep ?? null,
        mode: conversation.mode ?? "BOT",
        assignedUserId: conversation.assignedUserId ?? null,
        assignedTo: conversation.assignedTo ?? null,
        assignedUserName: assignedUser?.name ?? null,
        assignedAt: conversation.assignedAt ?? null,
        lastInboundAt: conversation.lastInboundAt ?? null,
        lastOutboundAt: conversation.lastOutboundAt ?? null,
      });
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/conversations/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/reset")
    ) {
      const parts = pathname.split("/");
      const waId = normalizeWaId(decodeURIComponent(parts[3] ?? ""));
      if (!waId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const clientKey = await getScopedClientKey();
      if (!clientKey) return;
      const client = await prisma.client.findUnique({
        where: { clientKey },
        select: { id: true },
      });
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey,
        rawWaId: waId,
        requestId,
        source: "admin_conversation_reset",
      });
      await runtimeStorage.deleteConversation(resolvedConversation.resolvedWaId, clientKey);
      logger.info({
        event: "admin.conversation.reset",
        waId: maskWaId(waId),
        clientKey,
        authSource: authToken.source,
        requestId,
      });
      json(res, 200, {
        ok: true,
        waId: resolvedConversation.resolvedWaId,
        waIdCanonical: resolvedConversation.resolvedWaIdCanonical,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/admin/debug/reset-conversation") {
      if (requireSuperadmin()) return;
      if (env.DISABLE_DEBUG_COMMANDS) {
        logger.warn({
          event: "admin.debug.blocked",
          reason: "disabled_by_env",
          requestId,
        });
        json(res, 403, { ok: false, error: "forbidden" });
        return;
      }
      if (process.env.NODE_ENV === "production" && !env.ALLOW_ADMIN_DEBUG_IN_PROD) {
        logger.warn({
          event: "admin.debug.blocked",
          reason: "not_allowed_in_prod",
          requestId,
        });
        json(res, 403, { ok: false, error: "forbidden" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const waId = normalizeWaId(String(body.waId ?? "").trim());
      const clientKey = String(body.clientKey ?? "default").trim() || "default";
      if (!waId) {
        json(res, 400, { ok: false, error: "bad_request" });
        return;
      }
      await runtimeStorage.deleteConversation(waId, clientKey);
      logger.info({
        event: "admin.debug.reset_conversation",
        waId,
        clientKey,
        requestId,
      });
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/admin/conversations") {
      try {
        const limitRaw = Number(query.limit ?? 100);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }

        const result = await buildConversationListPayload(prisma, {
          clientId: client.id,
          clientKey,
          limit,
          includeAssignedUserName: true,
        });
        json(res, 200, result);
      } catch (error) {
        logger.error({
          event: "admin.conversations.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/conversation/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/claim")
    ) {
      try {
        const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
        if (!waId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversation_claim",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }
        const assignedTo = resolveAssignedTo(adminAuth);
        const assignedAt = new Date().toISOString();
        const requestedUserId =
          typeof query.userId === "string" ? query.userId.trim() : "";
        const assignedUser = requestedUserId
          ? await prisma.user.findFirst({
              where: { id: requestedUserId, client: { clientKey } },
              select: { id: true, name: true },
            })
          : null;
        if (requestedUserId && !assignedUser) {
          json(res, 404, { error: "user_not_found" });
          return;
        }
        const nextState = {
          ...conversation,
          mode: "HUMAN" as const,
          assignedUserId: assignedUser?.id ?? null,
          assignedTo: assignedUser ? `user:${assignedUser.id}` : assignedTo,
          assignedAt,
        };
        await runtimeStorage.upsertConversation(nextState);
        json(res, 200, {
          ok: true,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          mode: nextState.mode,
          assignedUserId: nextState.assignedUserId,
          assignedTo: nextState.assignedTo,
          assignedUserName: assignedUser?.name ?? null,
          assignedAt: nextState.assignedAt,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversation.claim.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/conversation/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/release")
    ) {
      try {
        const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
        if (!waId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversation_release",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }
        const nextState = {
          ...conversation,
          mode: "BOT" as const,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
        };
        await runtimeStorage.upsertConversation(nextState);
        json(res, 200, {
          ok: true,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          mode: nextState.mode,
          assignedUserId: nextState.assignedUserId,
          assignedTo: nextState.assignedTo,
          assignedUserName: null,
          assignedAt: nextState.assignedAt,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversation.release.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/conversation/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/send")
    ) {
      try {
        const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
        if (!waId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const text = String(body.text ?? "").trim();
        if (!text) {
          json(res, 400, { error: "bad_request" });
          return;
        }

        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }

        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversation_send",
        });
        const result = await adminSendMessage({
          waId: resolvedConversation.resolvedWaId,
          text,
          clientKey,
          clientId: client.id,
          requestId,
        });
        if (!result.ok) {
          json(res, result.statusCode, { error: result.error });
          return;
        }
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        const assignedUser =
          conversation?.assignedUserId
            ? await prisma.user.findFirst({
                where: { id: conversation.assignedUserId, clientId: client.id },
                select: { name: true },
              })
            : null;
        json(res, 200, {
          ok: true,
          waId: conversation?.waId ?? resolvedConversation.resolvedWaId,
          waIdCanonical: resolvedConversation.resolvedWaIdCanonical,
          mode: conversation?.mode ?? "BOT",
          assignedUserId: conversation?.assignedUserId ?? null,
          assignedTo: conversation?.assignedTo ?? null,
          assignedUserName: assignedUser?.name ?? null,
          assignedAt: conversation?.assignedAt ?? null,
          message: {
            messageId: result.messageId,
            status: result.status,
            metaMessageId: result.metaMessageId,
            createdAt: result.createdAt,
          },
        });
      } catch (error) {
        logger.error({
          event: "admin.conversation.send.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "GET" &&
      pathname.startsWith("/admin/conversation/") &&
      pathname.split("/").length === 4
    ) {
      try {
        const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
        if (!waId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const orderRaw = String(query.order ?? "asc").trim().toLowerCase();
        const order = orderRaw === "desc" ? "desc" : "asc";
        const limitRaw = Number(query.limit ?? 200);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
        const includeRaw = String(query.includeRaw ?? "false") === "true";
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const result = await buildConversationDetailPayload(prisma, {
          clientId: client.id,
          clientKey,
          waId,
          order,
          limit,
          includeRaw,
          includeAssignedUserName: true,
          requestId,
          source: "admin_conversation_detail",
        });
        json(res, 200, result);
      } catch (error) {
        logger.error({
          event: "admin.conversation.messages.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "PATCH" &&
      pathname.startsWith("/admin/lead/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/status")
    ) {
      try {
        const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!leadId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const status = String(body.status ?? "").trim().toUpperCase();
        const allowed = new Set([
          "NEW",
          "QUALIFIED",
          "WAITING_ATTENDANT",
          "IN_ATTENDANCE",
          "CLOSED",
        ]);
        if (!allowed.has(status)) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const existing = await prisma.lead.findFirst({
          where: { id: leadId, tenantId: client.id },
          select: { id: true },
        });
        if (!existing) {
          json(res, 404, { error: "lead_not_found" });
          return;
        }
        const lead = await prisma.lead.update({
          where: { id: leadId },
          data: { status },
          select: { id: true, status: true, updatedAt: true },
        });
        json(res, 200, { ok: true, lead });
      } catch (error) {
        logger.error({
          event: "admin.lead.status.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/lead/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/notes")
    ) {
      try {
        const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!leadId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const lead = await prisma.lead.findFirst({
          where: { id: leadId, tenantId: client.id },
          select: { id: true },
        });
        if (!lead) {
          json(res, 404, { error: "lead_not_found" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const noteBody = String(body.body ?? "").trim();
        if (!noteBody) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const note = await prisma.leadNote.create({
          data: {
            leadId: lead.id,
            tenantId: client.id,
            body: noteBody,
          },
          select: {
            id: true,
            leadId: true,
            tenantId: true,
            body: true,
            createdAt: true,
          },
        });
        json(res, 200, { ok: true, note });
      } catch (error) {
        logger.error({
          event: "admin.lead.notes.create.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "GET" &&
      pathname.startsWith("/admin/lead/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/notes")
    ) {
      try {
        const leadId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!leadId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const lead = await prisma.lead.findFirst({
          where: { id: leadId, tenantId: client.id },
          select: { id: true },
        });
        if (!lead) {
          json(res, 404, { error: "lead_not_found" });
          return;
        }
        const notes = await prisma.leadNote.findMany({
          where: { leadId: lead.id, tenantId: client.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            leadId: true,
            tenantId: true,
            body: true,
            createdAt: true,
          },
        });
        json(res, 200, {
          ok: true,
          count: notes.length,
          items: notes,
        });
      } catch (error) {
        logger.error({
          event: "admin.lead.notes.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/clients") {
      if (requireSuperadmin()) return;
      const clients = await prisma.client.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          clientKey: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      json(res, 200, { items: clients });
      return;
    }

    if (req.method === "GET" && pathname === "/admin/tenants") {
      if (requireSuperadmin()) return;
      const tenants = await getTenants();
      json(res, 200, {
        ok: true,
        count: Object.keys(tenants).length,
        tenants,
        items: Object.values(tenants),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/admin/tenants/summary") {
      if (requireSuperadmin()) return;
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
        const monthStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1, 0, 0, 0, 0));
        const quotaPeriod = `${to.getUTCFullYear()}-${String(to.getUTCMonth() + 1).padStart(2, "0")}`;

        const tenants = await getTenants();
        const tenantKeys = Object.keys(tenants);
        const clients = await prisma.client.findMany({
          where: { clientKey: { in: tenantKeys } },
          select: { id: true, clientKey: true, name: true },
        });
        const clientIds = clients.map((client) => client.id);
        const quotaExcludeByTenantKey = new Map(
          tenantKeys.map((tenantKey) => {
            const excludes = Array.isArray(tenants[tenantKey]?.quotaExcludeWaIds)
              ? Array.from(
                  new Set(
                    (tenants[tenantKey]?.quotaExcludeWaIds ?? [])
                      .map((waId) => waId.replace(/\D/g, ""))
                      .filter(Boolean)
                  )
                )
              : [];
            return [tenantKey, excludes];
          })
        );
        const quotaExcludeUnion = Array.from(
          new Set(Array.from(quotaExcludeByTenantKey.values()).flat())
        );

        let monthlyUsageAll: Array<{ clientId: string; used: bigint | number }> = [];
        let monthlyUsageExcluded: Array<{ clientId: string; used: bigint | number }> = [];
        if (clientIds.length) {
          try {
            const clientIdsArray = Prisma.sql`ARRAY[${Prisma.join(
              clientIds.map((id) => Prisma.sql`${id}::uuid`)
            )}]`;
            monthlyUsageAll = await prisma.$queryRaw<Array<{ clientId: string; used: bigint | number }>>(
              Prisma.sql`
                SELECT "clientId"::text AS "clientId", COUNT(DISTINCT "waId")::int AS "used"
                FROM "InboundMessage"
                WHERE "clientId" = ANY(${clientIdsArray})
                  AND "allowlistHit" = true
                  AND "createdAt" >= ${monthStart}
                  AND "createdAt" <= ${to}
                GROUP BY "clientId"
              `
            );
            if (quotaExcludeUnion.length > 0) {
              const excludedWaIdsArray = Prisma.sql`ARRAY[${Prisma.join(
                quotaExcludeUnion.map((waId) => Prisma.sql`${waId}`)
              )}]`;
              monthlyUsageExcluded = await prisma.$queryRaw<Array<{ clientId: string; used: bigint | number }>>(
                Prisma.sql`
                  SELECT "clientId"::text AS "clientId", COUNT(DISTINCT "waId")::int AS "used"
                  FROM "InboundMessage"
                  WHERE "clientId" = ANY(${clientIdsArray})
                    AND "allowlistHit" = true
                    AND "waId" = ANY(${excludedWaIdsArray})
                    AND "createdAt" >= ${monthStart}
                    AND "createdAt" <= ${to}
                  GROUP BY "clientId"
                `
              );
            }
          } catch (error) {
            logger.warn({
              event: "quota.calc_error",
              message: (error as Error).message,
              requestId,
            });
            monthlyUsageAll = [];
            monthlyUsageExcluded = [];
          }
        }

        const [inboundCounts, outboundCounts, lastInbound, lastOutbound] = clientIds.length
          ? await Promise.all([
              prisma.inboundMessage.groupBy({
                by: ["clientId"],
                where: { clientId: { in: clientIds }, createdAt: { gte: from, lte: to } },
                _count: { _all: true },
              }),
              prisma.outboundMessage.groupBy({
                by: ["clientId", "status", "type"],
                where: { clientId: { in: clientIds }, createdAt: { gte: from, lte: to } },
                _count: { _all: true },
              }),
              prisma.inboundMessage.groupBy({
                by: ["clientId"],
                where: { clientId: { in: clientIds } },
                _max: { createdAt: true },
              }),
              prisma.outboundMessage.groupBy({
                by: ["clientId"],
                where: { clientId: { in: clientIds } },
                _max: { createdAt: true },
              }),
            ])
          : [[], [], [], []];

        const inboundByClient = new Map(
          inboundCounts.map((row) => [row.clientId, row._count._all])
        );
        const lastInboundByClient = new Map(
          lastInbound.map((row) => [row.clientId, row._max.createdAt ?? null])
        );
        const lastOutboundByClient = new Map(
          lastOutbound.map((row) => [row.clientId, row._max.createdAt ?? null])
        );
        const monthlyUsageAllByClient = new Map(
          monthlyUsageAll.map((row) => [row.clientId, Number(row.used)])
        );
        const monthlyUsageExcludedByClient = new Map(
          monthlyUsageExcluded.map((row) => [row.clientId, Number(row.used)])
        );
        const outboundByClient = new Map<
          string,
          { sent_text: number; sent_template: number; failed: number }
        >();

        for (const row of outboundCounts) {
          const current = outboundByClient.get(row.clientId) ?? {
            sent_text: 0,
            sent_template: 0,
            failed: 0,
          };

          if (row.status === "FAILED") {
            current.failed += row._count._all;
          } else if (row.status === "SENT" && row.type === "TEMPLATE") {
            current.sent_template += row._count._all;
          } else if (row.status === "SENT" && row.type === "TEXT") {
            current.sent_text += row._count._all;
          }

          outboundByClient.set(row.clientId, current);
        }

        const clientByKey = new Map(clients.map((client) => [client.clientKey, client]));
        const items = tenantKeys.map((tenantKey) => {
          const client = clientByKey.get(tenantKey);
          const tenantConfig = tenants[tenantKey];
          const counts = client
            ? outboundByClient.get(client.id) ?? {
                sent_text: 0,
                sent_template: 0,
                failed: 0,
              }
            : {
                sent_text: 0,
                sent_template: 0,
                failed: 0,
              };
          const inboundReceived = client ? inboundByClient.get(client.id) ?? 0 : 0;
          const inboundAt = client ? lastInboundByClient.get(client.id) ?? null : null;
          const outboundAt = client ? lastOutboundByClient.get(client.id) ?? null : null;
          const lastMessageAt =
            inboundAt && outboundAt
              ? inboundAt > outboundAt
                ? inboundAt
                : outboundAt
              : inboundAt ?? outboundAt ?? null;
          const monthlyUsedAll = client ? monthlyUsageAllByClient.get(client.id) ?? 0 : 0;
          const monthlyUsedExcluded =
            client && (quotaExcludeByTenantKey.get(tenantKey)?.length ?? 0) > 0
              ? monthlyUsageExcludedByClient.get(client.id) ?? 0
              : 0;
          const monthlyUsed = Math.max(0, monthlyUsedAll - monthlyUsedExcluded);
          const monthlyLimit =
            typeof tenantConfig?.quotaMonthlyConversations === "number"
              ? tenantConfig.quotaMonthlyConversations
              : null;
          const warnAtPct =
            monthlyLimit === null
              ? null
              : typeof tenantConfig?.quotaWarnAtPct === "number"
                ? tenantConfig.quotaWarnAtPct
                : 0.8;
          const pct = monthlyLimit && monthlyLimit > 0 ? monthlyUsed / monthlyLimit : null;
          const warning =
            monthlyLimit !== null && warnAtPct !== null && pct !== null ? pct >= warnAtPct : false;

          if (warning) {
            logger.warn({
              event: "quota.warning",
              tenantId: tenantKey,
              clientKey: tenantKey,
              limit: monthlyLimit,
              used: monthlyUsed,
              pct,
              period: quotaPeriod,
              requestId,
            });
          }

          return {
            tenantId: tenantKey,
            clientKey: tenantKey,
            name: client?.name ?? tenantConfig?.name ?? tenantKey,
            counts: {
              inbound: { received: inboundReceived },
              outbound: counts,
            },
            lastMessageAt,
            quota: {
              period: quotaPeriod,
              limit: monthlyLimit,
              used: monthlyUsed,
              pct,
              warnAtPct,
              warning,
            },
          };
        });

        logger.info({
          event: "admin.tenants.summary",
          range,
          tenantCount: items.length,
          requestId,
        });
        json(res, 200, {
          ok: true,
          range,
          from,
          to,
          tenants: items,
        });
      } catch (error) {
        logger.error({
          event: "admin.tenants.summary.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "GET" &&
      pathname.startsWith("/admin/tenants/") &&
      pathname.split("/").length === 4
    ) {
      if (requireSuperadmin()) return;
      const tenantId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!tenantId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const tenants = await getTenants();
      const tenant = tenants[tenantId];
      if (!tenant) {
        json(res, 404, { error: "tenant_not_found" });
        return;
      }
      const client = await prisma.client.findUnique({
        where: { clientKey: tenantId },
        select: { id: true, clientKey: true, status: true },
      });
      json(res, 200, { ok: true, tenantId, tenant, client });
      return;
    }

    if (req.method === "PUT" && pathname === "/admin/tenants") {
      if (requireSuperadmin()) return;
      const body = await readJsonBody(req, res);
      if (!body) return;
      try {
        const saved = await saveTenants(body);
        logger.info({
          event: "admin.tenant.update",
          authSource: authToken.source,
          tenantCount: Object.keys(saved.tenants).length,
          backupPath: saved.backupPath,
          requestId,
        });
        json(res, 200, {
          ok: true,
          count: Object.keys(saved.tenants).length,
          backupPath: saved.backupPath,
          tenants: saved.tenants,
          items: Object.values(saved.tenants),
        });
      } catch (error) {
        logger.warn({
          event: "admin.tenant.update",
          authSource: authToken.source,
          status: "rejected",
          message: (error as Error).message,
          requestId,
        });
        json(res, 400, { error: "invalid_tenants_config", message: (error as Error).message });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/tenants/") &&
      pathname.split("/").length === 6 &&
      pathname.endsWith("/onboarding/exchange-code")
    ) {
      if (requireSuperadmin()) return;
      const tenantId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!tenantId) {
        json(res, 400, httpError("bad_request", "Tenant id is required"));
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const code = String(body.code ?? "").trim();
      if (!code) {
        json(res, 400, httpError("bad_request", "Code is required"));
        return;
      }
      const embeddedSignupInput =
        body.embeddedSignup && typeof body.embeddedSignup === "object"
          ? (body.embeddedSignup as Record<string, unknown>)
          : null;

      const tenants = await getTenants();
      const tenant = tenants[tenantId];
      if (!tenant) {
        json(res, 404, httpError("tenant_not_found", "Tenant not found"));
        return;
      }

      const client = await prisma.client.findUnique({
        where: { clientKey: tenantId },
        select: { id: true, clientKey: true },
      });
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }

      logger.info({
        event: "onboarding.started",
        tenantId,
        clientKey: client.clientKey,
        requestId,
      });

      try {
        const exchange = await exchangeEmbeddedSignupCode({ code });
        const finalBusinessId =
          normalizeOptionalString(embeddedSignupInput?.businessId) ?? exchange.businessId;
        const finalBusinessPortfolioId =
          normalizeOptionalString(embeddedSignupInput?.businessPortfolioId) ??
          exchange.businessPortfolioId;
        const finalWabaId =
          normalizeOptionalString(embeddedSignupInput?.wabaId) ?? exchange.wabaId;
        const finalPhoneNumberId =
          normalizeOptionalString(embeddedSignupInput?.phoneNumberId) ??
          exchange.phoneNumberId;
        const rawPayload = {
          exchange: exchange.rawPayload,
          embeddedSignup: embeddedSignupInput
            ? {
                businessId: normalizeOptionalString(embeddedSignupInput.businessId),
                businessPortfolioId: normalizeOptionalString(
                  embeddedSignupInput.businessPortfolioId
                ),
                wabaId: normalizeOptionalString(embeddedSignupInput.wabaId),
                phoneNumberId: normalizeOptionalString(embeddedSignupInput.phoneNumberId),
                raw: embeddedSignupInput.raw ?? null,
              }
            : null,
        };

        await prisma.tenantMetaConfig.upsert({
          where: { clientId: client.id },
          update: {
            businessToken: exchange.businessToken ?? undefined,
            businessId: finalBusinessId ?? undefined,
            businessPortfolioId: finalBusinessPortfolioId ?? undefined,
            wabaId: finalWabaId ?? undefined,
            phoneNumberId: finalPhoneNumberId ?? undefined,
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
          create: {
            clientId: client.id,
            businessToken: exchange.businessToken ?? undefined,
            businessId: finalBusinessId ?? undefined,
            businessPortfolioId: finalBusinessPortfolioId ?? undefined,
            wabaId: finalWabaId ?? undefined,
            phoneNumberId: finalPhoneNumberId ?? undefined,
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
        });

        let phoneMappingAction: "created" | "existing" | null = null;
        let tenantUpdate:
          | { backupPath: string; fieldsChanged: string[]; tenant: Record<string, unknown> }
          | undefined;

        if (finalPhoneNumberId) {
          const syncResult = await syncTenantPhoneNumberMapping({
            clientId: client.id,
            phoneNumberId: finalPhoneNumberId,
          });
          phoneMappingAction = syncResult.action;
          tenantUpdate = await saveTenantPatch(tenantId, {
            metaPhoneNumberId: finalPhoneNumberId,
          });
        }

        logger.info({
          event: "onboarding.exchange.success",
          tenantId,
          clientKey: client.clientKey,
          requestId,
          phoneNumberId: finalPhoneNumberId,
          wabaId: finalWabaId,
          businessId: finalBusinessId,
          businessPortfolioId: finalBusinessPortfolioId,
          businessTokenStored: Boolean(exchange.businessToken),
          phoneMappingAction,
          fieldsChanged: tenantUpdate?.fieldsChanged ?? [],
        });

        json(res, 200, {
          success: true,
          businessTokenStored: Boolean(exchange.businessToken),
          phoneNumberId: finalPhoneNumberId,
          wabaId: finalWabaId,
          businessId: finalBusinessId,
          businessPortfolioId: finalBusinessPortfolioId,
        });
      } catch (error) {
        logger.error({
          event: "onboarding.exchange.failed",
          tenantId,
          clientKey: client.clientKey,
          requestId,
          message: (error as Error).message,
          ...(error instanceof MetaOnboardingExchangeError
            ? {
                status: error.status ?? null,
                errorBody: error.errorBody ?? null,
              }
            : {}),
        });

        if (error instanceof MetaOnboardingExchangeError) {
          json(
            res,
            error.status && error.status >= 400 && error.status < 600 ? error.status : 502,
            httpError("meta_exchange_failed", error.message, {
              status: error.status ?? null,
              errorBody: error.errorBody ?? null,
            })
          );
          return;
        }

        if ((error as Error).message.includes("already mapped")) {
          json(res, 409, httpError("phone_number_conflict", (error as Error).message));
          return;
        }

        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      req.method === "PUT" &&
      pathname.startsWith("/admin/tenants/") &&
      pathname.split("/").length === 4
    ) {
      if (requireSuperadmin()) return;
      const tenantId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!tenantId) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      try {
        const saved = await saveTenantPatch(tenantId, body as Record<string, unknown>);
        logger.info({
          event: "admin.tenant.update",
          tenantId,
          authSource: authToken.source,
          fieldsChanged: saved.fieldsChanged,
          backupPath: saved.backupPath,
          requestId,
        });
        json(res, 200, {
          ok: true,
          tenantId,
          backupPath: saved.backupPath,
          fieldsChanged: saved.fieldsChanged,
          tenant: saved.tenant,
        });
      } catch (error) {
        logger.warn({
          event: "admin.tenant.update",
          tenantId,
          authSource: authToken.source,
          status: "rejected",
          message: (error as Error).message,
          requestId,
        });
        json(res, 400, { error: "invalid_tenants_config", message: (error as Error).message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/clients") {
      if (requireSuperadmin()) return;
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

        const tenantWhere = tenantAdmin ? { clientId: adminAuth.clientId } : undefined;
        const [clientsCount, conversationsCount, inboundCount, outboundCount] = await Promise.all([
          tenantAdmin ? Promise.resolve(1) : prisma.client.count(),
          prisma.conversation.count({ where: tenantWhere }),
          prisma.inboundMessage.count({ where: tenantWhere }),
          prisma.outboundMessage.count({ where: tenantWhere }),
        ]);

        const lastInbound = await prisma.inboundMessage.findFirst({
          where: tenantWhere,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, requestId: true },
        });
        const lastOutbound = await prisma.outboundMessage.findFirst({
          where: tenantWhere,
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
            clientKey: tenantAdmin ? adminAuth.clientKey : env.CLIENT_ID,
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

    if (req.method === "GET" && pathname === "/admin/campaigns") {
      try {
        const limitRaw = Number(query.limit ?? 50);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const campaigns = await listCampaigns({ clientId: client.id, limit });
        const campaignIds = new Set(campaigns.map((item) => item.id));
        const oldestCreatedAt = campaigns.reduce<Date | null>((min, item) => {
          if (!min || item.createdAt < min) return item.createdAt;
          return min;
        }, null);
        const outboundMessages =
          oldestCreatedAt && campaignIds.size > 0
            ? await prisma.outboundMessage.findMany({
                where: {
                  clientId: client.id,
                  type: "TEMPLATE",
                  createdAt: { gte: oldestCreatedAt },
                },
                select: {
                  waId: true,
                  templateName: true,
                  status: true,
                  errorBody: true,
                  rawPayload: true,
                },
              })
            : [];
        const campaignMetaMap = new Map<string, CampaignMetaSummary>();
        for (const outbound of outboundMessages) {
          const outboundCampaignId = extractCampaignIdFromRawPayload(outbound.rawPayload);
          if (!outboundCampaignId || !campaignIds.has(outboundCampaignId)) continue;
          const nextItem = buildCampaignMetaStatusItem(outbound);
          const current = campaignMetaMap.get(outboundCampaignId) ?? {
            totalSent: 0,
            totalDelivered: 0,
            totalRead: 0,
            totalFailed: 0,
          };
          switch (nextItem.status) {
            case "read":
              current.totalRead += 1;
              break;
            case "delivered":
              current.totalDelivered += 1;
              break;
            case "failed":
              current.totalFailed += 1;
              break;
            case "sent":
            default:
              current.totalSent += 1;
              break;
          }
          campaignMetaMap.set(outboundCampaignId, current);
        }
        json(res, 200, {
          ok: true,
          count: campaigns.length,
          items: campaigns.map((campaign) => ({
            ...serializeCampaign(campaign),
            metaSummary: campaignMetaMap.get(campaign.id) ?? {
              totalSent: 0,
              totalDelivered: 0,
              totalRead: 0,
              totalFailed: 0,
            },
          })),
        });
      } catch (error) {
        logger.error({
          event: "admin.campaign.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "GET" &&
      pathname.startsWith("/admin/campaigns/") &&
      pathname.split("/").length === 4
    ) {
      try {
        const campaignId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!campaignId) {
          json(res, 400, httpError("bad_request", "Campaign id is required"));
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const result = await buildCampaignDetailPayload(prisma, {
          clientId: client.id,
          campaignId,
        });
        if (!result) {
          json(res, 404, httpError("campaign_not_found", "Campaign not found"));
          return;
        }
        json(res, 200, result);
      } catch (error) {
        logger.error({
          event: "admin.campaign.get.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/campaigns/") &&
      pathname.split("/").length === 5 &&
      pathname.endsWith("/cancel")
    ) {
      try {
        const campaignId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!campaignId) {
          json(res, 400, httpError("bad_request", "Campaign id is required"));
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const campaign = await getCampaignById(campaignId, client.id);
        if (!campaign) {
          json(res, 404, httpError("campaign_not_found", "Campaign not found"));
          return;
        }
        if (campaign.status !== "sending") {
          json(
            res,
            409,
            httpError("campaign_not_cancelable", "Campaign is not cancelable", {
              status: campaign.status,
            })
          );
          return;
        }
        const cancelled = await cancelCampaign({ campaignId, clientId: client.id });
        json(res, 200, {
          ok: true,
          campaign: serializeCampaign(cancelled),
        });
      } catch (error) {
        logger.error({
          event: "admin.campaign.cancel.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      req.method === "POST" &&
      (pathname === "/admin/campaigns" || pathname === "/admin/campaigns/run")
    ) {
      try {
        const body = await readJsonBody(req, res);
        if (!body) return;
        const name = String(body.name ?? "").trim();
        const templateId =
          typeof body.templateId === "string" && body.templateId.trim().length > 0
            ? body.templateId.trim()
            : null;
        const requestedTemplateName = String(body.templateName ?? "").trim();
        const components = parseTemplateComponents(body.templateParams);
        const rawWaIds = Array.isArray(body.recipients)
          ? body.recipients
          : Array.isArray(body.waIds)
            ? body.waIds
            : [];
        if (!name) {
          json(res, 400, httpError("bad_request", "Campaign name is required"));
          return;
        }
        if (!templateId && !requestedTemplateName) {
          json(res, 400, httpError("invalid_template_name", "Template name is required"));
          return;
        }
        if (!Array.isArray(rawWaIds) || rawWaIds.length === 0) {
          json(res, 400, httpError("invalid_recipients", "Recipients must be a non-empty array"));
          return;
        }
        if (rawWaIds.some((value) => String(value ?? "").trim().length <= 5)) {
          json(res, 400, httpError("invalid_recipients", "Recipients must contain valid waIds"));
          return;
        }
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const dedupedWaIds = dedupeCampaignRecipients(rawWaIds, {
          source: "admin_campaign_create",
          clientId: client.id,
          clientKey,
          requestId,
        });
        if (dedupedWaIds.length === 0) {
          json(res, 400, httpError("invalid_recipients", "Recipients must contain valid waIds"));
          return;
        }
        if (dedupedWaIds.length > 1000) {
          json(res, 400, httpError("too_many_recipients", "Recipients limit exceeded", { limit: 1000 }));
          return;
        }

        const resolvedTemplate = await resolveCampaignTemplateInput(prisma, {
          clientId: client.id,
          templateId,
          templateName: requestedTemplateName,
        });
        if ("error" in resolvedTemplate) {
          json(res, resolvedTemplate.status, httpError(resolvedTemplate.error, resolvedTemplate.message));
          return;
        }

        const created = await createScopedCampaign({
          clientId: client.id,
          clientKey,
          name,
          templateId: resolvedTemplate.templateId,
          templateName: resolvedTemplate.templateName,
          waIds: dedupedWaIds,
          components,
        });

        if (pathname === "/admin/campaigns") {
          json(res, 200, {
            campaignId: created.campaign.id,
            templateId: created.campaign.templateId,
            status: "sending",
            totalRecipients: dedupedWaIds.length,
          });
        } else {
          json(res, 200, {
            ok: true,
            campaign: {
              ...serializeCampaign(created.campaign),
              campaignId: created.campaign.id,
              campaignRunId: created.campaignRunId,
            },
          });
        }
      } catch (error) {
        logger.error({
          event: "admin.campaign.run.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/templates") {
      try {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const tenantWhere = tenantAdmin ? { clientId: adminAuth.clientId } : {};
        const failed = await prisma.outboundMessage.findMany({
          where: { ...tenantWhere, status: "FAILED" },
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
            rawPayload: true,
          },
        });
        const recent = await prisma.outboundMessage.findMany({
          where: {
            ...tenantWhere,
            type: "TEMPLATE",
          },
          orderBy: { createdAt: "desc" },
          take: 30,
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
            rawPayload: true,
          },
        });
        const [breakdown24h, breakdown7d] = await Promise.all([
          prisma.outboundMessage.groupBy({
            by: ["templateName", "templateLang"],
            where: {
              ...tenantWhere,
              createdAt: { gte: since24h },
              templateName: { not: null },
            },
            _count: { templateName: true },
          }),
          prisma.outboundMessage.groupBy({
            by: ["templateName", "templateLang"],
            where: {
              ...tenantWhere,
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
              ...tenantWhere,
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
        const catalogWhere = tenantAdmin
          ? { clientId: adminAuth.clientId }
          : requestedClientKey
            ? { client: { clientKey: requestedClientKey } }
            : {};
        const catalog = await prisma.template.findMany({
          where: catalogWhere,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            clientId: true,
            name: true,
            category: true,
            language: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            client: {
              select: {
                clientKey: true,
                name: true,
              },
            },
          },
        });

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
            ...extractMetaStatus(item.rawPayload),
          })),
          recent: recent.map((item) => ({
            createdAt: item.createdAt,
            waId: maskWaId(item.waId),
            type: item.type,
            templateName: item.templateName,
            templateLang: item.templateLang,
            status: item.status,
            requestId: item.requestId,
            errorBody: item.errorBody ? item.errorBody.slice(0, 2000) : null,
            metaMessageId: item.metaMessageId,
            ...extractMetaStatus(item.rawPayload),
          })),
          breakdown24h: normalizeBreakdown(breakdown24h),
          breakdown7d: normalizeBreakdown(breakdown7d),
          catalog: catalog.map((item) => ({
            id: item.id,
            clientId: item.clientId,
            clientKey: item.client.clientKey,
            clientName: item.client.name,
            name: item.name,
            category: item.category,
            language: item.language,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
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

    if (req.method === "GET" && pathname === "/admin/templates/requests") {
      try {
        const where = tenantAdmin
          ? { clientId: adminAuth.clientId }
          : requestedClientKey
            ? { client: { clientKey: requestedClientKey } }
            : {};
        const items = await prisma.templateRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            clientId: true,
            name: true,
            content: true,
            variables: true,
            category: true,
            status: true,
            notes: true,
            createdBy: true,
            createdAt: true,
            client: {
              select: {
                clientKey: true,
                name: true,
              },
            },
          },
        });
        json(res, 200, {
          ok: true,
          count: items.length,
          items: items.map((item) => ({
            id: item.id,
            clientId: item.clientId,
            clientKey: item.client.clientKey,
            clientName: item.client.name,
            name: item.name,
            content: item.content,
            variables: item.variables,
            category: item.category,
            status: item.status,
            notes: item.notes,
            createdBy: item.createdBy,
            createdAt: item.createdAt,
          })),
        });
      } catch (error) {
        logger.error({
          event: "admin.templates.requests.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/templates/requests/") &&
      pathname.split("/").length === 6 &&
      pathname.endsWith("/approve")
    ) {
      try {
        const templateRequestId = decodeURIComponent(pathname.split("/")[4] ?? "").trim();
        if (!templateRequestId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const templateRequest = await prisma.templateRequest.findFirst({
          where: {
            id: templateRequestId,
            ...(tenantAdmin ? { clientId: adminAuth.clientId } : {}),
          },
          select: {
            id: true,
            clientId: true,
            name: true,
            content: true,
            variables: true,
            category: true,
          },
        });
        if (!templateRequest) {
          json(res, 404, { error: "template_request_not_found" });
          return;
        }

        const result = await prisma.$transaction(async (tx) => {
          const template = await tx.template.create({
            data: {
              clientId: templateRequest.clientId,
              name: templateRequest.name,
              content: templateRequest.content,
              category: templateRequest.category,
              language: "pt_BR",
              status: "approved",
              ...(templateRequest.variables !== null && templateRequest.variables !== undefined
                ? {
                    variables: templateRequest.variables as Prisma.InputJsonValue,
                  }
                : {}),
            },
            select: {
              id: true,
              clientId: true,
              name: true,
              content: true,
              variables: true,
              category: true,
              language: true,
              status: true,
              metaTemplateId: true,
              rejectionReason: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          await tx.templateRequest.update({
            where: { id: templateRequest.id },
            data: { status: "approved" },
          });
          return template;
        });

        json(res, 200, {
          ok: true,
          template: result,
        });
      } catch (error) {
        logger.error({
          event: "admin.templates.requests.approve.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/templates/requests/") &&
      pathname.split("/").length === 6 &&
      pathname.endsWith("/reject")
    ) {
      try {
        const templateRequestId = decodeURIComponent(pathname.split("/")[4] ?? "").trim();
        if (!templateRequestId) {
          json(res, 400, { error: "bad_request" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const notes =
          typeof body.notes === "string" && body.notes.trim().length > 0
            ? body.notes.trim()
            : undefined;
        const updated = await prisma.templateRequest.updateMany({
          where: {
            id: templateRequestId,
            ...(tenantAdmin ? { clientId: adminAuth.clientId } : {}),
          },
          data: {
            status: "rejected",
            ...(notes ? { notes } : {}),
          },
        });
        if (updated.count === 0) {
          json(res, 404, { error: "template_request_not_found" });
          return;
        }
        json(res, 200, { ok: true });
      } catch (error) {
        logger.error({
          event: "admin.templates.requests.reject.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/templates") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const name = String(body.name ?? "").trim();
        const content = String(body.content ?? "").trim();
        const category = String(body.category ?? "").trim();
        const language = String(body.language ?? "").trim();
        if (!name || !content || !category || !language) {
          json(res, 400, { error: "bad_request" });
          return;
        }

        const created = await prisma.template.create({
          data: {
            clientId: client.id,
            name,
            content,
            category,
            language,
            status: "approved",
            ...(body.variables !== undefined
              ? { variables: body.variables as Prisma.InputJsonValue }
              : {}),
          },
          select: {
            id: true,
            clientId: true,
            name: true,
            content: true,
            variables: true,
            category: true,
            language: true,
            status: true,
            metaTemplateId: true,
            rejectionReason: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        json(res, 200, {
          ok: true,
          template: created,
        });
      } catch (error) {
        logger.error({
          event: "admin.templates.create.error",
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
        const templateNameFilter = String(query.templateName ?? "").trim();
        const orderRaw = String(query.order ?? "desc").trim().toLowerCase();
        const order = orderRaw === "asc" ? "asc" : "desc";
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
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
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
        if (templateNameFilter) {
          outboundWhere.templateName = templateNameFilter;
        }

        const [inbound, outbound] = await Promise.all([
          prisma.inboundMessage.findMany({
            where: inboundWhere,
            orderBy: { createdAt: order },
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
            orderBy: { createdAt: order },
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
          .sort((a, b) => {
            const aTs =
              a.createdAt instanceof Date ? a.createdAt.getTime() : Date.parse(String(a.createdAt));
            const bTs =
              b.createdAt instanceof Date ? b.createdAt.getTime() : Date.parse(String(b.createdAt));
            const aValid = Number.isFinite(aTs);
            const bValid = Number.isFinite(bTs);
            if (!aValid && !bValid) return 0;
            if (!aValid) return 1;
            if (!bValid) return -1;
            return order === "asc" ? aTs - bTs : bTs - aTs;
          })
          .slice(0, limit);

        json(res, 200, {
          ok: true,
          waIdMasked: maskWaId(waId),
          filters: {
            waId: maskWaId(waId),
            status: statusFilter || null,
            type: typeFilter || null,
            templateName: templateNameFilter || null,
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            clientKey,
            limit,
            order,
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

    if (req.method === "GET" && pathname === "/admin/leads") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;

        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });

        if (!client) {
          json(res, 404, { error: "client_not_found" });
          return;
        }

        const leads = await prisma.lead.findMany({
          where: { tenantId: client.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        });

        json(res, 200, {
          ok: true,
          count: leads.length,
          items: leads.map((l) => ({
            id: l.id,
            waId: l.waId,
            name: l.name,
            city: l.city,
            service: l.service,
            status: l.status,
            createdAt: l.createdAt,
          })),
        });
      } catch (error) {
        logger.error({
          event: "admin.leads.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "internal_error" });
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
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
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
      const [, , , clientRef, action] = pathname.split("/");
      if (action !== "rotate-token") {
        json(res, 404, { error: "not_found" });
        return;
      }
      const client =
        (await prisma.client.findUnique({
          where: { clientKey: clientRef },
          select: { id: true, clientKey: true },
        })) ??
        (await prisma.client.findUnique({
          where: { id: clientRef },
          select: { id: true, clientKey: true },
        }));
      if (!client) {
        json(res, 404, { error: "not_found" });
        return;
      }
      const newToken = crypto.randomBytes(32).toString("hex");
      await prisma.client.update({
        where: { id: client.id },
        data: { adminToken: newToken },
      });
      logger.info({
        event: "admin.client.token.rotate",
        clientKey: client.clientKey,
        requestId,
      });
      json(res, 200, {
        ok: true,
        clientKey: client.clientKey,
        rotatedAt: new Date().toISOString(),
        adminToken: newToken,
      });
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

function getRequestedClientKey(req: IncomingMessage, query: Record<string, string>) {
  const headerClientKey = req.headers["x-client-key"];
  if (typeof headerClientKey === "string" && headerClientKey.trim()) {
    return headerClientKey.trim();
  }
  const queryClientKey = String(query.clientKey ?? "").trim();
  return queryClientKey || null;
}

function diffTenantFields(
  previousTenant: Record<string, unknown> | undefined,
  nextTenant: Record<string, unknown>
) {
  const fieldsChanged: string[] = [];
  const previousTemplates =
    previousTenant && typeof previousTenant.templates === "object" && previousTenant.templates
      ? (previousTenant.templates as Record<string, unknown>)
      : {};
  const nextTemplates =
    typeof nextTenant.templates === "object" && nextTenant.templates
      ? (nextTenant.templates as Record<string, unknown>)
      : {};

  const compareField = (field: string) => {
    const previousValue = previousTenant?.[field] ?? null;
    const nextValue = nextTenant[field] ?? null;
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      fieldsChanged.push(field);
    }
  };

  compareField("id");
  compareField("name");
  compareField("metaPhoneNumberId");
  compareField("allowlist");
  compareField("handoffAttendantWaid");
  compareField("defaultLanguage");
  compareField("planName");
  compareField("messagesLimit");
  compareField("quotaMonthlyConversations");
  compareField("quotaWarnAtPct");
  compareField("quotaBlockedReplyText");
  compareField("quotaExcludeWaIds");
  if (
    JSON.stringify(previousTemplates.manualHandoff ?? null) !==
    JSON.stringify(nextTemplates.manualHandoff ?? null)
  ) {
    fieldsChanged.push("templates.manualHandoff");
  }
  return fieldsChanged;
}

async function saveTenantPatch(tenantId: string, body: Record<string, unknown>) {
  const currentTenants = await getTenants();
  const previousTenant = currentTenants[tenantId];
  const nextTenant = {
    ...(previousTenant ?? {}),
    ...body,
    id: String((body.id ?? tenantId)).trim() || tenantId,
  };
  const nextTenants = {
    ...currentTenants,
    [tenantId]: nextTenant,
  };
  const fieldsChanged = diffTenantFields(previousTenant, nextTenant);
  const saved = await saveTenants(nextTenants);
  return {
    backupPath: saved.backupPath,
    fieldsChanged,
    tenant: saved.tenants[tenantId],
  };
}

async function syncTenantPhoneNumberMapping(params: {
  clientId: string;
  phoneNumberId: string;
}) {
  const prisma = getPrisma();
  const existingPhone = await prisma.waPhoneNumber.findUnique({
    where: { phoneNumberId: params.phoneNumberId },
    include: {
      client: {
        select: { clientKey: true },
      },
    },
  });

  if (!existingPhone) {
    await prisma.waPhoneNumber.create({
      data: {
        clientId: params.clientId,
        phoneNumberId: params.phoneNumberId,
        display: params.phoneNumberId,
      },
    });
    return { action: "created" as const };
  }

  if (existingPhone.clientId !== params.clientId) {
    throw new Error(
      `phoneNumberId ${params.phoneNumberId} already mapped to ${existingPhone.client?.clientKey ?? existingPhone.clientId}`
    );
  }

  await prisma.waPhoneNumber.update({
    where: { phoneNumberId: params.phoneNumberId },
    data: { display: params.phoneNumberId },
  });
  return { action: "existing" as const };
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function maskWaId(waId: string) {
  const tail = waId.slice(-4);
  return `***${tail}`;
}

function parseTemplateComponents(
  input: unknown
): Array<{
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}> | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) return undefined;
  const parameters = input
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0)
    .map((text) => ({ type: "text" as const, text }));
  if (parameters.length === 0) return undefined;
  return [{ type: "body", parameters }];
}

function serializeCampaign(campaign: {
  id: string;
  clientId: string;
  templateId: string | null;
  name: string;
  templateName: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  blockedCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: campaign.id,
    clientId: campaign.clientId,
    templateId: campaign.templateId,
    name: campaign.name,
    templateName: campaign.templateName,
    status: campaign.status,
    totalRecipients: campaign.totalRecipients,
    sentCount: campaign.sentCount,
    blockedCount: campaign.blockedCount,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    progress: {
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      blockedCount: campaign.blockedCount,
      pendingCount: Math.max(
        campaign.totalRecipients - campaign.sentCount - campaign.blockedCount,
        0
      ),
    },
  };
}

type CampaignMetaStatus = {
  waId: string;
  templateName: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  pricingCategory: string | null;
  pricingBillable: boolean | null;
  pricingModel: string | null;
  conversationId: string | null;
  error: string | null;
};

type CampaignMetaSummary = {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
};

type CampaignDraftSeed = {
  name: string;
  templateName: string;
  recipients: string[];
  templateParams: string[];
};

function extractMetaStatus(rawPayload: unknown) {
  const typed =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;
  const metaStatus =
    typed?.metaStatus && typeof typed.metaStatus === "object" && !Array.isArray(typed.metaStatus)
      ? (typed.metaStatus as Record<string, unknown>)
      : null;
  return {
    lastStatus: typeof metaStatus?.lastStatus === "string" ? metaStatus.lastStatus : null,
    pricingCategory:
      typeof metaStatus?.pricingCategory === "string" ? metaStatus.pricingCategory : null,
    pricingBillable:
      typeof metaStatus?.pricingBillable === "boolean" ? metaStatus.pricingBillable : null,
    pricingModel: typeof metaStatus?.pricingModel === "string" ? metaStatus.pricingModel : null,
    conversationId:
      typeof metaStatus?.conversationId === "string" ? metaStatus.conversationId : null,
    statusDetail: typeof metaStatus?.statusDetail === "string" ? metaStatus.statusDetail : null,
    errorData:
      metaStatus?.errorData && typeof metaStatus.errorData === "object" ? metaStatus.errorData : null,
    errors: Array.isArray(metaStatus?.errors) ? metaStatus.errors : null,
  };
}

function extractCampaignIdFromRawPayload(rawPayload: unknown) {
  const typed =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;
  return typeof typed?.campaignId === "string" ? typed.campaignId : null;
}

function extractTemplateParamsFromComponents(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const firstBody = components.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return (item as Record<string, unknown>).type === "body";
  });
  if (!firstBody || typeof firstBody !== "object" || Array.isArray(firstBody)) return [];
  const parameters = (firstBody as Record<string, unknown>).parameters;
  if (!Array.isArray(parameters)) return [];
  return parameters
    .map((parameter) => {
      if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) return null;
      const typed = parameter as Record<string, unknown>;
      return typeof typed.text === "string" ? typed.text : null;
    })
    .filter((value): value is string => Boolean(value));
}

function extractCampaignDraftSeed(rawPayload: unknown): CampaignDraftSeed | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const typed = rawPayload as Record<string, unknown>;
  const name = typeof typed.name === "string" ? typed.name : null;
  const templateName = typeof typed.templateName === "string" ? typed.templateName : null;
  const recipients = Array.isArray(typed.recipients)
    ? typed.recipients
        .map((value) => (typeof value === "string" ? normalizeWaId(value) : ""))
        .filter((value): value is string => Boolean(value))
    : [];
  const templateParams = Array.isArray(typed.templateParams)
    ? typed.templateParams
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value): value is string => Boolean(value))
    : [];
  if (!name || !templateName) return null;
  return {
    name,
    templateName,
    recipients,
    templateParams,
  };
}

function normalizeCampaignMessageStatus(
  lastStatus: string | null,
  fallbackStatus: string
): CampaignMetaStatus["status"] {
  const value = (lastStatus || fallbackStatus || "").trim().toLowerCase();
  switch (value) {
    case "read":
      return "read";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "sent":
    default:
      return fallbackStatus === "FAILED" ? "failed" : "sent";
  }
}

function stringifyCampaignError(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildCampaignMetaStatusItem(item: {
  waId: string;
  templateName: string | null;
  status: string;
  errorBody: string | null;
  rawPayload: Prisma.JsonValue | null;
}): CampaignMetaStatus {
  const metaStatus = extractMetaStatus(item.rawPayload);
  const status = normalizeCampaignMessageStatus(metaStatus.lastStatus, item.status);
  return {
    waId: item.waId,
    templateName: item.templateName,
    status,
    pricingCategory: metaStatus.pricingCategory,
    pricingBillable: metaStatus.pricingBillable,
    pricingModel: metaStatus.pricingModel,
    conversationId: metaStatus.conversationId,
    error:
      item.errorBody ||
      metaStatus.statusDetail ||
      stringifyCampaignError(metaStatus.errorData) ||
      stringifyCampaignError(metaStatus.errors),
  };
}

function summarizeCampaignMetaStatuses(items: CampaignMetaStatus[]): CampaignMetaSummary {
  return items.reduce<CampaignMetaSummary>(
    (acc, item) => {
      switch (item.status) {
        case "read":
          acc.totalRead += 1;
          break;
        case "delivered":
          acc.totalDelivered += 1;
          break;
        case "failed":
          acc.totalFailed += 1;
          break;
        case "sent":
        default:
          acc.totalSent += 1;
          break;
      }
      return acc;
    },
    {
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
    }
  );
}

type ScopedClientRecord = {
  id: string;
  clientKey: string;
  status: "ACTIVE" | "INACTIVE";
};

async function getScopedClientById(
  prisma: ReturnType<typeof getPrisma>,
  clientId: string
): Promise<ScopedClientRecord | null> {
  return prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, clientKey: true, status: true },
  });
}

async function resolveCampaignTemplateInput(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    templateId: string | null;
    templateName: string;
  }
): Promise<
  | { templateId: string | null; templateName: string; language: string | null }
  | { status: 400 | 404; error: string; message: string }
> {
  if (!params.templateId) {
    return {
      templateId: null,
      templateName: params.templateName,
      language: null,
    };
  }

  const template = await prisma.template.findFirst({
    where: {
      id: params.templateId,
      clientId: params.clientId,
      status: "approved",
    },
    select: {
      id: true,
      name: true,
      language: true,
    },
  });

  if (!template) {
    return {
      status: 404,
      error: "template_not_found",
      message: "Approved template not found",
    };
  }

  return {
    templateId: template.id,
    templateName: template.name,
    language: template.language,
  };
}

async function findAssignedUserName(
  prisma: ReturnType<typeof getPrisma>,
  clientId: string,
  assignedUserId: string
) {
  const user = await prisma.user.findFirst({
    where: { id: assignedUserId, clientId },
    select: { name: true },
  });
  return user?.name ?? null;
}

function buildScopedWaIdWhere(rawWaId: string) {
  const lookup = buildWaIdLookup(rawWaId);
  return {
    OR: [{ waIdCanonical: lookup.canonical }, { waId: lookup.raw }],
  };
}

function getWaIdGroupKey(waId: string, waIdCanonical?: string | null) {
  return waIdCanonical ?? canonicalizeBrazilWaId(waId);
}

async function resolveConversationTarget(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    rawWaId: string;
    requestId: string;
    source: string;
  }
) {
  const lookup = buildWaIdLookup(params.rawWaId);
  const matches = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      ...buildScopedWaIdWhere(lookup.raw),
    },
    select: {
      waId: true,
      waIdCanonical: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });
  const sortedMatches = matches.sort((left, right) => compareConversationLookupPriority(left, right));
  if (sortedMatches.length > 1) {
    logger.warn({
      event: "waid.canonical.collision",
      clientId: params.clientId,
      clientKey: params.clientKey,
      waId: params.rawWaId,
      waIdCanonical: lookup.canonical,
      matchCount: sortedMatches.length,
      source: params.source,
      requestId: params.requestId,
    });
  }
  const winner = sortedMatches[0] ?? null;
  return {
    lookup,
    winner,
    resolvedWaId: winner?.waId ?? lookup.raw,
    resolvedWaIdCanonical: winner?.waIdCanonical ?? lookup.canonical,
    matchedWaIds: Array.from(new Set(sortedMatches.map((item) => item.waId))),
  };
}

function dedupeCampaignRecipients(
  recipients: unknown[],
  params: {
    source: "app_campaign_create" | "admin_campaign_create";
    clientId?: string | null;
    clientKey?: string | null;
    requestId: string;
  }
) {
  const canonicalToRaw = new Map<string, string>();
  const canonicalToOriginals = new Map<string, string[]>();

  for (const value of recipients) {
    const normalized = normalizeWaIdDigits(String(value ?? "").trim());
    if (!normalized) continue;
    const canonical = canonicalizeBrazilWaId(normalized);
    if (!canonical) continue;

    const originals = canonicalToOriginals.get(canonical) ?? [];
    originals.push(normalized);
    canonicalToOriginals.set(canonical, originals);

    if (!canonicalToRaw.has(canonical)) {
      canonicalToRaw.set(canonical, normalized);
    }
  }

  for (const [canonical, originals] of canonicalToOriginals.entries()) {
    const uniqueOriginals = Array.from(new Set(originals));
    if (uniqueOriginals.length > 1) {
      logger.info({
        event: "campaign.recipient.deduped",
        canonical,
        originals: uniqueOriginals,
        clientId: params.clientId ?? null,
        clientKey: params.clientKey ?? null,
        source: params.source,
        requestId: params.requestId,
      });
    }
  }

  return Array.from(canonicalToRaw.values());
}

async function buildConversationListPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    limit: number;
    includeAssignedUserName: boolean;
  }
) {
  const conversationFetchLimit = Math.min(params.limit * 3, 600);
  const messageFetchLimit = Math.min(params.limit * 6, 1200);
  const conversations = await prisma.conversation.findMany({
    where: { clientId: params.clientId },
    orderBy: { updatedAt: "desc" },
    take: conversationFetchLimit,
    select: {
      waId: true,
      waIdCanonical: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });
  if (conversations.length === 0) {
    return { ok: true, count: 0, items: [] };
  }

  const groupedConversations = new Map<
    string,
    {
      waId: string;
      waIdCanonical: string;
      updatedAt: Date;
      lastInboundAt: Date | null;
      lastOutboundAt: Date | null;
    }
  >();
  for (const conversation of conversations) {
    const key = getWaIdGroupKey(conversation.waId, conversation.waIdCanonical);
    const current = groupedConversations.get(key);
    if (!current || compareConversationLookupPriority(conversation, current) < 0) {
      groupedConversations.set(key, {
        waId: conversation.waId,
        waIdCanonical: key,
        updatedAt: conversation.updatedAt,
        lastInboundAt: conversation.lastInboundAt,
        lastOutboundAt: conversation.lastOutboundAt,
      });
    }
  }
  const winners = Array.from(groupedConversations.values())
    .sort((left, right) => compareConversationLookupPriority(left, right))
    .slice(0, params.limit);
  const waIds = Array.from(new Set(winners.map((item) => item.waId)));
  const canonicalWaIds = Array.from(new Set(winners.map((item) => item.waIdCanonical)));

  const [leads, inbound, outbound] = await Promise.all([
    prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [{ waIdCanonical: { in: canonicalWaIds } }, { waId: { in: waIds } }],
      },
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        name: true,
        phone: true,
        city: true,
        service: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.inboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waIdCanonical: { in: canonicalWaIds } }, { waId: { in: waIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: messageFetchLimit,
      select: {
        waId: true,
        waIdCanonical: true,
        type: true,
        bodyText: true,
        createdAt: true,
      },
    }),
    prisma.outboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waIdCanonical: { in: canonicalWaIds } }, { waId: { in: waIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: messageFetchLimit,
      select: {
        waId: true,
        waIdCanonical: true,
        type: true,
        status: true,
        bodyText: true,
        templateName: true,
        createdAt: true,
      },
    }),
  ]);
  const runtimeConversations = await Promise.all(
    winners.map(async (item) => ({
      waIdCanonical: item.waIdCanonical,
      conversation: await runtimeStorage.getConversation(item.waId, params.clientKey),
    }))
  );
  const runtimeByWaId = new Map(
    runtimeConversations.map((item) => [item.waIdCanonical, item.conversation])
  );
  const assignedUserIds = params.includeAssignedUserName
    ? Array.from(
        new Set(
          runtimeConversations
            .map((item) => item.conversation?.assignedUserId ?? null)
            .filter((value): value is string => Boolean(value))
        )
      )
    : [];
  const assignedUsers =
    params.includeAssignedUserName && assignedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { clientId: params.clientId, id: { in: assignedUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const assignedUserById = new Map(assignedUsers.map((item) => [item.id, item.name]));

  const leadByWaId = new Map<string, (typeof leads)[number]>();
  for (const item of leads) {
    const key = getWaIdGroupKey(item.waId, item.waIdCanonical);
    const current = leadByWaId.get(key);
    if (
      !current ||
      compareConversationLookupPriority(
        {
          updatedAt: item.updatedAt,
          lastInboundAt: item.updatedAt,
          lastOutboundAt: item.createdAt,
        },
        {
          updatedAt: current.updatedAt,
          lastInboundAt: current.updatedAt,
          lastOutboundAt: current.createdAt,
        }
      ) < 0
    ) {
      leadByWaId.set(key, item);
    }
  }
  const latestInboundByWaId = new Map<string, (typeof inbound)[number]>();
  for (const item of inbound) {
    const key = getWaIdGroupKey(item.waId, item.waIdCanonical);
    if (!latestInboundByWaId.has(key)) {
      latestInboundByWaId.set(key, item);
    }
  }
  const latestOutboundByWaId = new Map<string, (typeof outbound)[number]>();
  for (const item of outbound) {
    const key = getWaIdGroupKey(item.waId, item.waIdCanonical);
    if (!latestOutboundByWaId.has(key)) {
      latestOutboundByWaId.set(key, item);
    }
  }

  const items = winners.map((conversation) => {
    const key = conversation.waIdCanonical;
    const lead = leadByWaId.get(key);
    const latestInbound = latestInboundByWaId.get(key);
    const latestOutbound = latestOutboundByWaId.get(key);
    const runtimeState = runtimeByWaId.get(key);
    const inboundAt = latestInbound?.createdAt?.getTime() ?? -1;
    const outboundAt = latestOutbound?.createdAt?.getTime() ?? -1;
    const lastMessage =
      inboundAt >= outboundAt
        ? latestInbound
          ? {
              direction: "INBOUND",
              type: latestInbound.type,
              status: "RECEIVED",
              bodyText: latestInbound.bodyText ? latestInbound.bodyText.slice(0, 300) : null,
              templateName: null,
              createdAt: latestInbound.createdAt,
            }
          : null
        : latestOutbound
          ? {
              direction: "OUTBOUND",
              type: latestOutbound.type,
              status: latestOutbound.status,
              bodyText: latestOutbound.bodyText ? latestOutbound.bodyText.slice(0, 300) : null,
              templateName: latestOutbound.templateName ?? null,
              createdAt: latestOutbound.createdAt,
            }
          : null;

    return {
      waId: conversation.waId,
      waIdCanonical: conversation.waIdCanonical,
      lastMessage,
      leadId: lead?.id ?? null,
      leadStatus: lead?.status ?? null,
      leadName: lead?.name ?? null,
      leadPhone: lead?.phone ?? null,
      leadCity: lead?.city ?? null,
      leadService: lead?.service ?? null,
      mode: runtimeState?.mode ?? "BOT",
      assignedUserId: runtimeState?.assignedUserId ?? null,
      assignedTo: runtimeState?.assignedTo ?? null,
      assignedUserName:
        params.includeAssignedUserName && runtimeState?.assignedUserId
          ? assignedUserById.get(runtimeState.assignedUserId) ?? null
          : null,
      assignedAt: runtimeState?.assignedAt ?? null,
      updatedAt: conversation.updatedAt,
    };
  });

  return {
    ok: true,
    count: items.length,
    items,
  };
}

async function buildConversationDetailPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    waId: string;
    order: "asc" | "desc";
    limit: number;
    includeRaw: boolean;
    includeAssignedUserName: boolean;
    requestId: string;
    source: string;
  }
) {
  const resolved = await resolveConversationTarget(prisma, {
    clientId: params.clientId,
    clientKey: params.clientKey,
    rawWaId: params.waId,
    requestId: params.requestId,
    source: params.source,
  });
  const conversation = await runtimeStorage.getConversation(resolved.resolvedWaId, params.clientKey);
  const assignedUser =
    params.includeAssignedUserName && conversation?.assignedUserId
      ? await prisma.user.findFirst({
          where: { id: conversation.assignedUserId, clientId: params.clientId },
          select: { name: true },
        })
      : null;

  const [inbound, outbound] = await Promise.all([
    prisma.inboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          { waIdCanonical: resolved.resolvedWaIdCanonical },
          { waId: { in: Array.from(new Set([params.waId, ...resolved.matchedWaIds])) } },
        ],
      },
      orderBy: { createdAt: params.order },
      take: params.limit,
      select: {
        createdAt: true,
        messageId: true,
        type: true,
        requestId: true,
        bodyText: true,
        rawPayload: params.includeRaw,
      },
    }),
    prisma.outboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [
          { waIdCanonical: resolved.resolvedWaIdCanonical },
          { waId: { in: Array.from(new Set([params.waId, ...resolved.matchedWaIds])) } },
        ],
      },
      orderBy: { createdAt: params.order },
      take: params.limit,
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
        rawPayload: params.includeRaw,
      },
    }),
  ]);

  const items = [
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
      rawPayload: params.includeRaw ? item.rawPayload : undefined,
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
      rawPayload: params.includeRaw ? item.rawPayload : undefined,
    })),
  ]
    .sort((a, b) => {
      const aTs = a.createdAt instanceof Date ? a.createdAt.getTime() : Date.parse(String(a.createdAt));
      const bTs = b.createdAt instanceof Date ? b.createdAt.getTime() : Date.parse(String(b.createdAt));
      const aValid = Number.isFinite(aTs);
      const bValid = Number.isFinite(bTs);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return params.order === "asc" ? aTs - bTs : bTs - aTs;
    })
    .slice(0, params.limit);

  return {
    ok: true,
    waId: conversation?.waId ?? resolved.resolvedWaId,
    waIdCanonical: resolved.resolvedWaIdCanonical,
    mode: conversation?.mode ?? "BOT",
    assignedUserId: conversation?.assignedUserId ?? null,
    assignedTo: conversation?.assignedTo ?? null,
    assignedUserName: assignedUser?.name ?? null,
    assignedAt: conversation?.assignedAt ?? null,
    count: items.length,
    items,
  };
}

async function buildCampaignListPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: { clientId: string; limit: number }
) {
  const campaigns = await listCampaigns({ clientId: params.clientId, limit: params.limit });
  const campaignIds = new Set(campaigns.map((item) => item.id));
  const oldestCreatedAt = campaigns.reduce<Date | null>((min, item) => {
    if (!min || item.createdAt < min) return item.createdAt;
    return min;
  }, null);
  const outboundMessages =
    oldestCreatedAt && campaignIds.size > 0
      ? await prisma.outboundMessage.findMany({
          where: {
            clientId: params.clientId,
            type: "TEMPLATE",
            createdAt: { gte: oldestCreatedAt },
          },
          select: {
            waId: true,
            templateName: true,
            status: true,
            errorBody: true,
            rawPayload: true,
          },
        })
      : [];
  const campaignMetaMap = new Map<string, CampaignMetaSummary>();
  for (const outbound of outboundMessages) {
    const outboundCampaignId = extractCampaignIdFromRawPayload(outbound.rawPayload);
    if (!outboundCampaignId || !campaignIds.has(outboundCampaignId)) continue;
    const nextItem = buildCampaignMetaStatusItem(outbound);
    const current = campaignMetaMap.get(outboundCampaignId) ?? {
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
    };
    switch (nextItem.status) {
      case "read":
        current.totalRead += 1;
        break;
      case "delivered":
        current.totalDelivered += 1;
        break;
      case "failed":
        current.totalFailed += 1;
        break;
      case "sent":
      default:
        current.totalSent += 1;
        break;
    }
    campaignMetaMap.set(outboundCampaignId, current);
  }
  return {
    ok: true,
    count: campaigns.length,
    items: campaigns.map((campaign) => ({
      ...serializeCampaign(campaign),
      metaSummary: campaignMetaMap.get(campaign.id) ?? {
        totalSent: 0,
        totalDelivered: 0,
        totalRead: 0,
        totalFailed: 0,
      },
    })),
  };
}

async function buildCampaignDetailPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: { clientId: string; campaignId: string }
) {
  const campaign = await getCampaignById(params.campaignId, params.clientId);
  if (!campaign) return null;
  const outboundMessages = await prisma.outboundMessage.findMany({
    where: {
      clientId: params.clientId,
      type: "TEMPLATE",
      createdAt: { gte: campaign.createdAt },
    },
    orderBy: { createdAt: "asc" },
    select: {
      waId: true,
      templateName: true,
      status: true,
      errorBody: true,
      rawPayload: true,
    },
  });
  const messagesMetaStatus = outboundMessages
    .filter((item) => extractCampaignIdFromRawPayload(item.rawPayload) === campaign.id)
    .map(buildCampaignMetaStatusItem);
  const draftSeed = await buildCampaignDraftSeed(prisma, {
    clientId: params.clientId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    templateName: campaign.templateName,
    outboundMessages,
  });
  return {
    ok: true,
    campaign: {
      ...serializeCampaign(campaign),
      metaSummary: summarizeCampaignMetaStatuses(messagesMetaStatus),
      messagesMetaStatus,
      draftSeed,
    },
  };
}

async function createScopedCampaign(params: {
  clientId: string;
  clientKey: string;
  templateId?: string | null;
  name: string;
  templateName: string;
  waIds: string[];
  components: Array<{
    type: "body";
    parameters: Array<{ type: "text"; text: string }>;
  }> | undefined;
}) {
  const campaign = await createCampaign({
    clientId: params.clientId,
    templateId: params.templateId ?? null,
    name: params.name,
    templateName: params.templateName,
    totalRecipients: params.waIds.length,
  });
  const campaignRunId = startCampaignRun({
    campaignId: campaign.id,
    clientId: params.clientId,
    clientKey: params.clientKey,
    name: params.name,
    templateName: params.templateName,
    waIds: params.waIds,
    components: params.components,
  });
  await persistCampaignDraftSeed({
    clientId: params.clientId,
    campaignId: campaign.id,
    name: params.name,
    templateName: params.templateName,
    waIds: params.waIds,
    components: params.components,
  });
  return { campaign, campaignRunId };
}

async function cancelScopedCampaign(
  prisma: ReturnType<typeof getPrisma>,
  params: { clientId: string; campaignId: string }
) {
  const campaign = await getCampaignById(params.campaignId, params.clientId);
  if (!campaign) return null;
  if (campaign.status !== "sending") return "not_cancelable" as const;
  return cancelCampaign({ campaignId: params.campaignId, clientId: params.clientId });
}

async function persistCampaignDraftSeed(params: {
  clientId: string;
  campaignId: string;
  name: string;
  templateName: string;
  waIds: string[];
  components?: Array<{
    type: "body";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
}) {
  await persistEvent({
    clientId: params.clientId,
    messageId: params.campaignId,
    requestId: `campaign-seed:${params.campaignId}`,
    eventName: "campaign.seed.saved",
    payloadJson: {
      campaignId: params.campaignId,
      name: params.name,
      templateName: params.templateName,
      recipients: params.waIds,
      templateParams: extractTemplateParamsFromComponents(params.components ?? null),
    },
  });
}

async function buildCampaignDraftSeed(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    campaignId: string;
    campaignName: string;
    templateName: string;
    outboundMessages: Array<{
      waId: string;
      templateName: string | null;
      status: string;
      errorBody: string | null;
      rawPayload: Prisma.JsonValue | null;
    }>;
  }
): Promise<CampaignDraftSeed> {
  const persistedSeed = await prisma.event.findFirst({
    where: {
      clientId: params.clientId,
      eventName: "campaign.seed.saved",
      messageId: params.campaignId,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  const parsedSeed = extractCampaignDraftSeed(persistedSeed?.payloadJson);
  if (parsedSeed) {
    return parsedSeed;
  }

  const matchingOutbound = params.outboundMessages.filter(
    (item) => extractCampaignIdFromRawPayload(item.rawPayload) === params.campaignId
  );
  const recipients = Array.from(new Set(matchingOutbound.map((item) => item.waId).filter(Boolean)));
  const rawPayloadWithComponents = matchingOutbound.find((item) => {
    if (!item.rawPayload || typeof item.rawPayload !== "object" || Array.isArray(item.rawPayload)) {
      return false;
    }
    return "components" in (item.rawPayload as Record<string, unknown>);
  })?.rawPayload;
  const templateParams = extractTemplateParamsFromComponents(
    rawPayloadWithComponents &&
      typeof rawPayloadWithComponents === "object" &&
      !Array.isArray(rawPayloadWithComponents)
      ? (rawPayloadWithComponents as Record<string, unknown>).components ?? null
      : null
  );

  return {
    name: params.campaignName,
    templateName: params.templateName,
    recipients,
    templateParams,
  };
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

async function resolveAdminAuth(
  prisma: ReturnType<typeof getPrisma>,
  token: string
): Promise<{ role: "superadmin"; clientId: null; clientKey: null } | { role: "tenant"; clientId: string; clientKey: string } | null> {
  if (!token) return null;
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
    return { role: "superadmin", clientId: null, clientKey: null };
  }
  const client = await prisma.client.findFirst({
    where: { adminToken: token },
    select: { id: true, clientKey: true },
  });
  if (!client) return null;
  return { role: "tenant", clientId: client.id, clientKey: client.clientKey };
}

function resolveAssignedTo(
  adminAuth: { role: "superadmin"; clientId: null; clientKey: null } | { role: "tenant"; clientId: string; clientKey: string }
) {
  if (adminAuth.role === "superadmin") {
    return "superadmin";
  }
  return `tenant:${adminAuth.clientKey}`;
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

async function adminSendMessage(params: {
  waId: string;
  text: string;
  clientKey: string;
  clientId: string;
  requestId: string;
}): Promise<
  | {
      ok: true;
      status: "SENT" | "FAILED";
      messageId: string;
      metaMessageId: string | null;
      createdAt: string;
    }
  | { ok: false; statusCode: number; error: string }
> {
  if (!env.outboundEnabled) {
    return { ok: false, statusCode: 503, error: "outbound_disabled" };
  }
  const nowMs = Date.now();
  const conversation = await runtimeStorage.getConversation(params.waId, params.clientKey);
  if (conversation && !isWindowOpen(conversation, nowMs)) {
    return { ok: false, statusCode: 409, error: "window_closed" };
  }
  const usageGate = await checkUsageGate({
    clientId: params.clientId,
    clientKey: params.clientKey,
    messageType: "text",
    requestId: params.requestId,
    waId: params.waId,
  });
  if (!usageGate.allowed) {
    return { ok: false, statusCode: 429, error: "usage_limit_reached" };
  }

  const credentials = await resolveTenantOutboundCredentials({
    clientId: params.clientId,
    clientKey: params.clientKey,
  });
  if (!credentials) {
    logger.error({
      event: "admin.conversation.send.credentials_missing",
      waId: maskWaId(params.waId),
      clientKey: params.clientKey,
      requestId: params.requestId,
    });
    return { ok: false, statusCode: 503, error: "tenant_outbound_credentials_missing" };
  }

  const sendResult = await sendTextMessage(params.waId, params.text, {
    accessToken: credentials.accessToken,
    phoneNumberId: credentials.phoneNumberId,
  });
  const status = sendResult.ok ? "SENT" : "FAILED";
  const messageId = `admin.send.${params.requestId}`;
  const createdAt = new Date().toISOString();
  const tenants = await getTenants();
  const phoneNumberId =
    credentials.phoneNumberId || tenants[params.clientKey]?.metaPhoneNumberId || undefined;

  await persistOutboundMessage({
    clientId: params.clientId,
    phoneNumberId,
    waId: params.waId,
    messageId,
    type: "TEXT",
    status,
    bodyText: params.text,
    requestId: params.requestId,
    metaMessageId: sendResult.messageId ?? null,
    errorBody: sendResult.errorBody ?? null,
    rawPayload: {
      source: "admin_inbox",
      status: sendResult.status ?? null,
      errorBody: sendResult.errorBody ?? null,
    },
  });

  if (conversation) {
    await runtimeStorage.upsertConversation({
      ...conversation,
      lastOutboundAt: createdAt,
    });
  }

  logger.info({
    event: sendResult.ok ? "admin.conversation.send.sent" : "admin.conversation.send.failed",
    waId: maskWaId(params.waId),
    clientKey: params.clientKey,
    requestId: params.requestId,
    status: sendResult.status ?? null,
    resolvedPhoneNumberId: credentials.phoneNumberId,
    credentialSource: credentials.source,
  });

  return {
    ok: true,
    status,
    messageId,
    metaMessageId: sendResult.messageId ?? null,
    createdAt,
  };
}
