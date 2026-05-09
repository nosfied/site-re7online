import { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ConversationOperationalStatus, MessageType, Prisma } from "@prisma/client";
import { healthRoute } from "./health.route.js";
import { verifyWebhook, receiveWebhook } from "../whatsapp/webhook.controller.js";
import { runtimeStorage } from "../storage/runtimeStorage.js";
import { env, normalizeWaId } from "../config/env.js";
import { validateMetaSignature } from "../whatsapp/webhook.signature.js";
import { logger } from "../logger/logger.js";
import { getPrisma } from "../db.js";
import {
  getAiAssistantConfigurationStatus,
  getTenants,
  isAiAssistantConfigured,
  saveTenants,
} from "../config/tenantConfig.js";
import { checkRateLimit } from "./rateLimit.js";
import {
  fetchMediaContent,
  sendMediaMessage,
  sendTextMessage,
  uploadMedia,
  type SendMediaKind,
} from "../whatsapp/whatsapp.client.js";
import { transcodeAudioToOggOpus } from "../media/audioTranscode.js";
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
  enrichMetaOnboardingResult,
  exchangeEmbeddedSignupCode,
  MetaOnboardingExchangeError,
} from "../meta/onboarding.service.js";
import {
  submitTemplateToMeta,
  MetaTemplateServiceError,
  MetaTemplateValidationError,
  syncTemplateStatus,
  validateTemplateForMeta,
} from "../meta/template.service.js";
import { resolveTenantOutboundCredentials } from "../whatsapp/tenantCredentials.js";
import { hashPassword, issueClientAuthToken, verifyPassword } from "../auth/clientAuth.js";
import { normalizeUserRole, requireClientAuth } from "../auth/clientAuthMiddleware.js";
import {
  recordConversationAgentOutboundMetrics,
  recordConversationClosedMetrics,
} from "../metrics/conversationMetrics.js";
import {
  getClientProfile,
  getFeatures,
  hasFeature,
  type ClientFeatureKey,
  type ClientProfile,
} from "../features/clientFeatures.js";
import {
  buildWaIdLookup,
  canonicalizeBrazilWaId,
  compareConversationLookupPriority,
  normalizeWaIdDigits,
} from "../utils/waid.js";
import { normalizeDepartmentSlug } from "../utils/departmentSlug.js";
import {
  DEFAULT_OPERATIONAL_QUEUE_NAME,
  ensureDefaultOperationalDepartmentAndQueue,
  resolveOperationalDepartmentId,
} from "../bootstrap/defaultOperationalDepartment.js";
import { ensureDefaultDepartments } from "../bootstrap/seedDepartments.js";
import { validateChatbotFlowDefinition } from "../chatbot/chatbotFlow.js";
import {
  AI_ASSISTANT_GLOBAL_BLOCKED_TERMS,
  AI_ASSISTANT_GLOBAL_HANDOFF_TERMS,
  AI_ASSISTANT_GLOBAL_TOPIC_TERMS,
  AI_ASSISTANT_MAX_INPUT_CHARS,
  AI_ASSISTANT_SIMPLE_QUESTION_STARTERS,
} from "../agent/controlledAssistant.js";
import { buildInboxMessageMedia, extractRawMediaId } from "./inboxMedia.js";
import {
  getInboxReadState,
  markInboxConversationRead,
  markInboxConversationUnread,
} from "../inbox/readStateStore.js";
import { publishRealtimeEvent } from "../realtime/hub.js";

const IMMUTABLE_PRIVACY_AUDIT_EVENTS = [
  "conversation.deleted",
  "conversation.anonymized",
  "retention.executed",
  "conversation.reactivated_after_retention",
] as const;

const LEGACY_OPERATIONAL_DEPARTMENT_FILTER = {
  NOT: [
    { name: "Atendimento" },
    { slug: "atendimento" },
    { name: { startsWith: "Departamento legado" } },
    { slug: { startsWith: "departamento-legado" } },
  ],
};

const noisyLogState = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();

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
          isActive: true,
          departmentId: true,
          department: {
            select: {
              name: true,
            },
          },
          client: {
            select: {
              status: true,
              features: true,
              profile: true,
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
      if (!user.isActive) {
        logger.info({
          event: "auth.login.inactive_user_blocked",
          userId: user.id,
          clientId: user.clientId,
          email: user.email,
          requestId,
        });
        json(res, 403, {
          error: "user_inactive",
          message: "Usuario inativo. Fale com o administrador da conta.",
        });
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
          departmentId: user.departmentId,
          departmentName: user.department?.name ?? null,
        },
        features: getFeatures(user.client),
        profile: getClientProfile(user.client),
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

  if (
    req.method === "GET" &&
    (pathname === "/app/privacy/retention" || pathname === "/app/privacy")
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    if (!isAdminRole(clientAuth.role)) {
      json(res, 403, { error: "forbidden", message: "Apenas ADMIN pode gerenciar privacidade." });
      return;
    }
    try {
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const retention = await getOrCreateRetentionConfig(prisma, client.id);
      json(res, 200, { ok: true, retentionDays: retention.retentionDays, createdAt: retention.createdAt });
    } catch (error) {
      logger.error({ event: "privacy.retention.get.error", requestId, message: (error as Error).message });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/tenant") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const client = await prisma.client.findFirst({
        where: {
          id: clientAuth.clientId,
          status: "ACTIVE",
        },
        include: {
          metaConfig: true,
          phoneNumbers: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const phone = client.phoneNumbers[0] ?? null;
      const tenants = await getTenants();
      const tenantConfig = tenants[client.clientKey];
      const metaDisplayPhone = extractTenantDisplayPhoneFromRawPayload(client.metaConfig?.rawPayload);
      const phoneDisplay =
        tenantConfig?.displayPhoneNumber?.trim() ||
        metaDisplayPhone ||
        phone?.display ||
        phone?.phoneNumberId ||
        null;
      json(res, 200, {
        ok: true,
        tenant: {
          id: client.id,
          name: tenantConfig?.name || client.name,
          phoneNumberId: client.metaConfig?.phoneNumberId ?? phone?.phoneNumberId ?? null,
          phoneDisplay,
          features: getFeatures(client),
          profile: getClientProfile(client),
        },
      });
    } catch (error) {
      logger.error({
        event: "app.tenant.get.error",
        requestId,
        message: (error as Error).message,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/app/inbox/events") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const eventName = String(body.event ?? "").trim();
      if (!isAllowedInboxUxEvent(eventName)) {
        json(res, 400, { error: "invalid_event" });
        return;
      }
      const payload = sanitizeInboxUxEventPayload(body.payload);
      const timestamp = new Date().toISOString();
      logger.info({
        event: eventName,
        clientId: clientAuth.clientId,
        userId: clientAuth.userId,
        requestId,
        ...payload,
      });
      try {
        await prisma.event.create({
          data: {
            clientId: clientAuth.clientId,
            requestId: `${requestId}:${eventName}`,
            eventName,
            payloadJson: {
              action: eventName,
              clientId: clientAuth.clientId,
              userId: clientAuth.userId,
              timestamp,
              ...payload,
            },
          },
        });
      } catch (error) {
        logger.warn({
          event: "inbox.ux_event.audit_failed",
          clientId: clientAuth.clientId,
          userId: clientAuth.userId,
          requestId,
          eventName,
          message: (error as Error).message,
        });
      }
      json(res, 200, { ok: true });
    } catch (error) {
      logger.error({
        event: "app.inbox.events.error",
        requestId,
        message: (error as Error).message,
      });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "PUT" && pathname === "/app/privacy/retention") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    if (!isAdminRole(clientAuth.role)) {
      json(res, 403, { error: "forbidden", message: "Apenas ADMIN pode gerenciar privacidade." });
      return;
    }
    try {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const retentionDays = normalizeRetentionDays((body as { retentionDays?: unknown }).retentionDays);
      if (!retentionDays) {
        json(res, 400, { error: "bad_request", message: "Informe dias de retencao entre 1 e 3650." });
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const retention = await prisma.retentionConfig.upsert({
        where: { clientId: client.id },
        update: { retentionDays },
        create: { clientId: client.id, retentionDays },
      });
      json(res, 200, { ok: true, retentionDays: retention.retentionDays, createdAt: retention.createdAt });
    } catch (error) {
      logger.error({ event: "privacy.retention.update.error", requestId, message: (error as Error).message });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/app/privacy/retention/execute") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    if (!isAdminRole(clientAuth.role)) {
      json(res, 403, { error: "forbidden", message: "Apenas ADMIN pode executar retencao." });
      return;
    }
    try {
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const result = await executeRetentionForClient(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        userId: clientAuth.userId,
        requestId,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logger.error({ event: "privacy.retention.execute.error", requestId, message: (error as Error).message });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (
    (req.method === "DELETE" || req.method === "POST") &&
    /^\/app\/conversations\/[^/]+(?:\/anonymize)?$/.test(pathname)
  ) {
    const isAnonymize = req.method === "POST" && pathname.endsWith("/anonymize");
    const isDelete = req.method === "DELETE" && !pathname.endsWith("/anonymize");
    if (!isAnonymize && !isDelete) {
      json(res, 405, { error: "method_not_allowed" });
      return;
    }
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    if (!isAdminRole(clientAuth.role)) {
      json(res, 403, { error: "forbidden", message: "Apenas ADMIN pode executar acoes LGPD." });
      return;
    }
    try {
      const parts = pathname.split("/");
      const rawConversationId = decodeURIComponent(parts[3] ?? "").trim();
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const target = await findPrivacyConversationTarget(prisma, client.id, rawConversationId);
      if (!target) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      if (isDelete) {
        const result = await deleteConversationPrivacyData(prisma, {
          clientId: client.id,
          clientKey: client.clientKey,
          conversation: target,
          userId: clientAuth.userId,
          requestId,
          audit: true,
        });
        json(res, 200, { ok: true, ...result });
        return;
      }
      const result = await anonymizeConversationPrivacyData(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: target,
        userId: clientAuth.userId,
        requestId,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logger.error({ event: "privacy.conversation_action.error", requestId, message: (error as Error).message });
      json(res, 500, { error: "server_error" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/dashboard/overview") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(
          res,
          403,
          httpError("forbidden", "Only supervisor or admin can view the operational dashboard.")
        );
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "dashboard",
        endpoint: pathname,
        requestId,
      }))) return;
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (departmentAccess.requiresDepartmentScope && !departmentAccess.departmentId) {
        json(res, 200, buildEmptyDashboardOverview());
        return;
      }
      const overview = await buildAppDashboardOverview(prisma, {
        clientId: client.id,
        departmentId: departmentAccess.requiresDepartmentScope
          ? departmentAccess.departmentId
          : String(query.departmentId ?? "").trim() || null,
        assignedUserId: String(query.assignedUserId ?? "").trim() || null,
        status: normalizeConversationStatusFilter(query.status),
      });
      json(res, 200, overview);
    } catch (error) {
      logger.error({
        event: "app.dashboard.overview.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/conversations") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const limitRaw = Number(query.limit ?? 30);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
      const cursor = decodeConversationListCursor(String(query.cursor ?? "").trim());
      const statusFilter = normalizeConversationStatusFilter(query.status);
      const departmentIdFilter = String(query.departmentId ?? "").trim() || null;
      const assignedUserIdFilter = String(query.assignedUserId ?? "").trim() || null;
      const unassignedFilter = String(query.unassigned ?? "").trim() === "true";
      const searchFilter = String(query.search ?? "").trim();
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (departmentAccess.requiresDepartmentScope && !departmentAccess.departmentId) {
        json(res, 200, {
          ok: true,
          count: 0,
          items: [],
          conversations: [],
          filterCounts: buildEmptyConversationFilterCounts(),
          nextCursor: null,
          readState: {
            lastReadAtByConversationKey: {},
            manuallyUnreadByConversationKey: {},
          },
        });
        return;
      }
      const result = await buildConversationListPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        userId: clientAuth.userId,
        limit,
        cursor,
        filters: {
          status: statusFilter,
          departmentId: departmentAccess.requiresDepartmentScope
            ? departmentAccess.departmentId
            : departmentIdFilter,
          assignedUserId: assignedUserIdFilter,
          unassigned: unassignedFilter,
          search: searchFilter,
        },
        includeAssignedUserName: true,
        profile: getClientProfile(client),
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
      const autoSubmit = body.autoSubmit === true;
      if (!name || !content || !category) {
        json(res, 400, {
          error: "validation_error",
          message: "Preencha nome, conteudo e categoria.",
        });
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "templates",
        endpoint: pathname,
        requestId,
      }))) return;

      if (autoSubmit) {
        try {
          validateTemplateForMeta({
            name,
            content,
            category,
            language: "pt_BR",
            ...(body.variables !== undefined ? { variables: body.variables } : {}),
          });
        } catch (error) {
          if (error instanceof MetaTemplateValidationError) {
            json(res, 400, {
              error: "validation_error",
              message: mapTemplateValidationMessage(error.message),
              details: error.message,
            });
            return;
          }
          throw error;
        }
      }

      const existingTemplateByName = await prisma.template.findFirst({
        where: {
          clientId: client.id,
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          name: true,
          status: true,
          rejectionReason: true,
        },
      });
      const canReuseFailedTemplate = isRetryableLocalTemplateFailure(
        existingTemplateByName?.status,
        existingTemplateByName?.rejectionReason
      );

      if (existingTemplateByName && canReuseFailedTemplate) {
        await prisma.$transaction([
          prisma.template.delete({
            where: { id: existingTemplateByName.id },
          }),
          prisma.templateRequest.deleteMany({
            where: {
              clientId: client.id,
              name: {
                equals: name,
                mode: "insensitive",
              },
              status: { in: ["pending", "submitting"] },
            },
          }),
        ]);
      }

      const existingPendingRequest = await prisma.templateRequest.findFirst({
        where: {
          clientId: client.id,
          name: {
            equals: name,
            mode: "insensitive",
          },
          status: { in: ["pending", "submitting"] },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existingPendingRequest) {
        logger.warn({
          event: "app.templates.request.pending_conflict",
          requestId,
          clientId: client.id,
          clientKey: client.clientKey,
          templateName: name,
          source: "template_request",
        });
        json(res, 409, {
          error: "template_already_pending",
          message: "Ja existe um template com esse nome em analise.",
        });
        return;
      }

      if (existingTemplateByName && !canReuseFailedTemplate) {
        const isPendingLike = isTemplatePendingLike(existingTemplateByName.status);
        logger.warn({
          event: isPendingLike
            ? "app.templates.request.pending_conflict"
            : "app.templates.request.conflict",
          requestId,
          clientId: client.id,
          clientKey: client.clientKey,
          templateId: existingTemplateByName.id,
          templateName: existingTemplateByName.name,
          source: "template",
          status: existingTemplateByName.status,
        });
        json(res, 409, {
          error: isPendingLike ? "template_already_pending" : "template_name_exists",
          message: isPendingLike
            ? "Ja existe um template com esse nome em analise."
            : "Ja existe um template com esse nome.",
        });
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

      let submission:
        | {
            attempted: boolean;
            submitted: boolean;
            mode: "assisted" | "self_service";
            templateId: string | null;
            status: string | null;
            errorMessage: string | null;
          }
        | undefined;

      if (autoSubmit) {
        const tenantMetaConfig = await prisma.tenantMetaConfig.findUnique({
          where: { clientId: client.id },
          select: {
            businessToken: true,
            wabaId: true,
          },
        });

        const hasMetaConfig = Boolean(
          String(tenantMetaConfig?.businessToken ?? "").trim() &&
            String(tenantMetaConfig?.wabaId ?? "").trim()
        );

        if (!hasMetaConfig) {
          submission = {
            attempted: false,
            submitted: false,
            mode: "assisted",
            templateId: null,
            status: "pending",
            errorMessage: "meta_config_missing",
          };
        } else {
          const template = await prisma.template.create({
            data: {
              clientId: client.id,
              name,
              content,
              category,
              submittedCategory: category,
              wasRecategorized: false,
              language: "pt_BR",
              status: "submitting",
              ...(body.variables !== undefined
                ? { variables: body.variables as Prisma.InputJsonValue }
                : {}),
            },
            select: {
              id: true,
              name: true,
              category: true,
              language: true,
              content: true,
              variables: true,
            },
          });

          try {
            logger.info({
              event: "template.submit.started",
              requestId,
              clientId: client.id,
              clientKey: client.clientKey,
              templateId: template.id,
              templateName: template.name,
            });

            if (!tenantMetaConfig) {
              throw new MetaTemplateServiceError(
                "meta_config_missing",
                "meta_config_missing"
              );
            }

            const result = await submitTemplateToMeta({
              tenantConfig: tenantMetaConfig,
              template,
            });

            if (result.ok) {
              const updated = await prisma.template.update({
                where: { id: template.id },
                data: {
                  metaTemplateId: result.metaTemplateId ?? undefined,
                  status: result.status || "PENDING",
                  submittedCategory: category,
                  wasRecategorized: false,
                  rejectionReason: null,
                },
                select: {
                  id: true,
                  category: true,
                  submittedCategory: true,
                  wasRecategorized: true,
                  status: true,
                },
              });

              submission = {
                attempted: true,
                submitted: true,
                mode: "self_service",
                templateId: updated.id,
                status: updated.status,
                errorMessage: null,
              };

              logger.info({
                event: "template.submit.success",
                requestId,
                clientId: client.id,
                clientKey: client.clientKey,
                templateId: updated.id,
                templateName: template.name,
                metaTemplateId: result.metaTemplateId,
                status: updated.status,
              });
            } else {
              const updated = await prisma.template.update({
                where: { id: template.id },
                data: {
                  status: "failed",
                  rejectionReason: result.errorMessage,
                },
                select: {
                  id: true,
                  status: true,
                },
              });

              submission = {
                attempted: true,
                submitted: false,
                mode: "self_service",
                templateId: updated.id,
                status: updated.status,
                errorMessage: result.errorMessage,
              };

              logger.warn({
                event: "template.submit.failed",
                requestId,
                clientId: client.id,
                clientKey: client.clientKey,
                templateId: updated.id,
                templateName: template.name,
                status: updated.status,
                message: result.errorMessage,
              });

              json(res, 400, {
                error: "meta_error",
                message: "Nao foi possivel enviar o template para a Meta.",
                details: summarizeMetaErrorMessage(result.errorMessage),
                request: created,
                submission,
              });
              return;
            }
          } catch (error) {
            const errorMessage =
              error instanceof MetaTemplateValidationError ||
              error instanceof MetaTemplateServiceError
                ? error.message
                : (error as Error).message;

            const updated = await prisma.template.update({
              where: { id: template.id },
              data: {
                status: "failed",
                rejectionReason: errorMessage,
              },
              select: {
                id: true,
                status: true,
              },
            });

            submission = {
              attempted: true,
              submitted: false,
              mode: "self_service",
              templateId: updated.id,
              status: updated.status,
              errorMessage,
            };

            logger.warn({
              event: isTimeoutLikeError(error)
                ? "template.submit.timeout_like"
                : "template.submit.failed",
              requestId,
              clientId: client.id,
              clientKey: client.clientKey,
              templateId: updated.id,
              templateName: template.name,
              status: updated.status,
              message: errorMessage,
            });

            if (error instanceof MetaTemplateValidationError) {
              json(res, 400, {
                error: "validation_error",
                message: mapTemplateValidationMessage(error.message),
                details: error.message,
                request: created,
                submission,
              });
              return;
            }

            if (error instanceof MetaTemplateServiceError) {
              if (error.code === "meta_config_missing") {
                json(res, 400, {
                  error: "meta_config_missing",
                  message: "Conecte seu WhatsApp antes de enviar templates.",
                  details: error.message,
                  request: created,
                  submission,
                });
                return;
              }

              json(res, 400, {
                error: "meta_error",
                message: "Nao foi possivel enviar o template para a Meta.",
                details: summarizeMetaErrorMessage(error.errorBody || error.message),
                request: created,
                submission,
              });
              return;
            }

            throw error;
          }
        }
      }

      json(res, 200, {
        ok: true,
        request: created,
        ...(submission ? { submission } : {}),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        logger.warn({
          event: "app.templates.request.conflict",
          clientId: clientAuth.clientId,
          requestId,
          target: error.meta?.target,
        });
        json(res, 409, {
          error: "template_name_exists",
          message: "Ja existe um template com esse nome.",
        });
        return;
      }
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "templates",
        endpoint: pathname,
        requestId,
      }))) return;

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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "templates",
        endpoint: pathname,
        requestId,
      }))) return;

      const items = await prisma.template.findMany({
        where: {
          clientId: client.id,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          category: true,
          submittedCategory: true,
          wasRecategorized: true,
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

      triggerTemplateStatusSync({
        templateIds: await findTemplatesNeedingSync(prisma, { clientId: client.id }),
        source: "app.templates",
        requestId,
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
    req.method === "POST" &&
    /^\/app\/templates\/[^/]+\/sync$/.test(pathname)
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const templateId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!templateId) {
        json(res, 404, {
          error: "template_not_found",
          message: "Template nao encontrado.",
        });
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "templates",
        endpoint: pathname,
        requestId,
      }))) return;

      const existingTemplate = await prisma.template.findUnique({
        where: { id: templateId },
        select: {
          id: true,
          clientId: true,
          name: true,
        },
      });

      if (!existingTemplate) {
        json(res, 404, {
          error: "template_not_found",
          message: "Template nao encontrado.",
        });
        return;
      }

      if (existingTemplate.clientId !== client.id) {
        json(res, 403, {
          error: "forbidden",
          message: "Acesso negado.",
        });
        return;
      }

      logger.info({
        event: "template.sync.manual.started",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        templateId: existingTemplate.id,
        templateName: existingTemplate.name,
      });

      await syncTemplateStatus(existingTemplate.id);

      const updatedTemplate = await prisma.template.findUnique({
        where: { id: existingTemplate.id },
        select: {
          id: true,
          name: true,
          category: true,
          submittedCategory: true,
          wasRecategorized: true,
          status: true,
          rejectionReason: true,
          updatedAt: true,
        },
      });

      if (!updatedTemplate) {
        json(res, 404, {
          error: "template_not_found",
          message: "Template nao encontrado.",
        });
        return;
      }

      logger.info({
        event: "template.sync.manual.success",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        templateId: updatedTemplate.id,
        templateName: updatedTemplate.name,
        status: updatedTemplate.status,
        category: updatedTemplate.category,
      });

      json(res, 200, {
        ok: true,
        template: updatedTemplate,
      });
    } catch (error) {
      logger.warn({
        event: "template.sync.manual.failed",
        requestId,
        clientId: clientAuth.clientId,
        message: (error as Error).message,
      });
      if (error instanceof MetaTemplateServiceError) {
        if (error.code === "meta_template_sync_not_found") {
          json(res, 404, {
            error: "template_not_found",
            message: "Template nao encontrado.",
          });
          return;
        }
        if (error.code === "meta_config_missing") {
          json(res, 400, {
            error: "meta_config_missing",
            message: "Conecte seu WhatsApp antes de enviar templates.",
            details: error.message,
          });
          return;
        }
        json(res, 400, {
          error: "meta_error",
          message: "Nao foi possivel atualizar o status do template.",
          details: summarizeMetaErrorMessage(error.errorBody || error.message),
        });
        return;
      }
      logger.error({
        event: "app.templates.sync.error",
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
    pathname.split("/").length === 5 &&
    pathname.split("/")[4] === "timeline"
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
      const limitRaw = Number(query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
      const cursor = decodeContactTimelineCursor(String(query.cursor ?? "").trim());
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, { error: "client_inactive" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_timeline_department_check",
      });
      if (!resolvedConversation.winner) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const scopedConversation = materializeConversationOperationalState(
        await runtimeStorage.getConversation(resolvedConversation.resolvedWaId, client.clientKey),
        await ensureDefaultDepartmentAndQueue(prisma, client.id)
      );
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/timeline",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }

      const result = await buildContactTimelinePayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        waId,
        limit,
        cursor,
        requestId,
        source: "app_conversation_timeline",
      });
      json(res, 200, result);
    } catch (error) {
      logger.error({
        event: "app.conversation.timeline.error",
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
      const afterRaw = String(query.after ?? "").trim();
      const after =
        afterRaw && Number.isFinite(Date.parse(afterRaw)) ? new Date(afterRaw) : null;
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
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_detail_department_check",
      });
      if (!resolvedConversation.winner) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const scopedConversation = materializeConversationOperationalState(
        await runtimeStorage.getConversation(resolvedConversation.resolvedWaId, client.clientKey),
        await ensureDefaultDepartmentAndQueue(prisma, client.id)
      );
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }

      const result = await buildConversationDetailPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        waId,
        order,
        after,
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
    pathname.split("/")[4] === "read-state"
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
      const unread = body.unread === true;
      const activityAt = String(body.activityAt ?? "").trim();
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, { error: "client_not_found" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_read_state",
      });
      const conversationKey = resolvedConversation.resolvedWaIdCanonical;
      const nextState = unread
        ? await markInboxConversationUnread({
            clientId: client.id,
            userId: clientAuth.userId,
            conversationKey,
          })
        : await markInboxConversationRead({
            clientId: client.id,
            userId: clientAuth.userId,
            conversationKey,
            activityAt: activityAt || new Date().toISOString(),
          });
      json(res, 200, { ok: true, readState: nextState });
    } catch (error) {
      logger.error({
        event: "app.conversation.read_state.error",
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
    pathname.split("/").length === 7 &&
    pathname.split("/")[4] === "messages" &&
    pathname.split("/")[6] === "media"
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
      const messageId = decodeURIComponent(pathname.split("/")[5] ?? "").trim();
      if (!waId || !messageId) {
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

      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_media_department_check",
      });
      const scopedConversation = materializeConversationOperationalState(
        await runtimeStorage.getConversation(resolvedConversation.resolvedWaId, client.clientKey),
        await ensureDefaultDepartmentAndQueue(prisma, client.id)
      );
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/messages/:messageId/media",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: scopedConversation?.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }

      const conversationWhere = {
        clientId: client.id,
        messageId,
        type: { in: ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"] as MessageType[] },
        OR: [
          { waIdCanonical: resolvedConversation.resolvedWaIdCanonical },
          { waId: { in: Array.from(new Set([waId, ...resolvedConversation.matchedWaIds])) } },
        ],
      };
      const [inbound, outbound] = await Promise.all([
        prisma.inboundMessage.findFirst({
          where: conversationWhere,
          select: {
            messageId: true,
            rawPayload: true,
          },
        }),
        prisma.outboundMessage.findFirst({
          where: conversationWhere,
          select: {
            messageId: true,
            rawPayload: true,
          },
        }),
      ]);

      const mediaMessage = inbound ?? outbound;
      if (!mediaMessage) {
        json(res, 404, { error: "media_not_found" });
        return;
      }

      const mediaId = extractRawMediaId(mediaMessage.rawPayload);
      const localMedia = await resolveStoredOutboundMedia(mediaMessage.rawPayload);
      if (localMedia) {
        const fileName = sanitizeDownloadFileName(localMedia.fileName) || `${messageId}`;
        const headers: Record<string, string> = {
          "Content-Type": localMedia.mimeType || "application/octet-stream",
          "Cache-Control": "private, max-age=31536000, immutable",
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Content-Length": String(localMedia.size),
        };
        res.writeHead(200, headers);
        createReadStream(localMedia.absolutePath)
          .on("error", (error) => {
            logger.error({
              event: "app.conversation.media.local_stream_error",
              requestId,
              clientId: client.id,
              messageId,
              message: (error as Error).message,
            });
            if (!res.writableEnded) {
              res.destroy(error as Error);
            }
          })
          .pipe(res);
        return;
      }

      if (!mediaId) {
        json(res, 404, { error: "media_not_found" });
        return;
      }

      const credentials = await resolveTenantOutboundCredentials({
        clientId: client.id,
        clientKey: client.clientKey,
      });
      if (!credentials) {
        json(res, 503, { error: "tenant_outbound_credentials_missing" });
        return;
      }

      const media = await fetchMediaContent(mediaId, {
        accessToken: credentials.accessToken,
      });
      if (!media.ok) {
        if (media.status === 404) {
          json(res, 404, { error: "media_not_found" });
          return;
        }
        logger.error({
          event: "app.conversation.media.fetch_failed",
          requestId,
          clientId: client.id,
          messageId,
          status: media.status ?? null,
          errorBody: media.errorBody ?? null,
        });
        json(res, 502, { error: "media_fetch_failed" });
        return;
      }

      const contentType = media.contentType || "application/octet-stream";
      const fileName = sanitizeDownloadFileName(media.fileName) || `${messageId}`;
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${fileName}"`,
      };
      if (media.contentLength) {
        headers["Content-Length"] = media.contentLength;
      }
      res.writeHead(200, headers);

      if (!media.response.body) {
        res.end();
        return;
      }

      Readable.fromWeb(media.response.body as never)
        .on("error", (error) => {
          logger.error({
            event: "app.conversation.media.stream_error",
            requestId,
            clientId: client.id,
            messageId,
            message: (error as Error).message,
          });
          if (!res.writableEnded) {
            res.destroy(error as Error);
          }
        })
        .pipe(res);
    } catch (error) {
      logger.error({
        event: "app.conversation.media.error",
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
      const currentConversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!currentConversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: currentConversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/send",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: currentConversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        currentConversation.mode !== "HUMAN" ||
        !canManageOwnedConversation(clientAuth.role, currentConversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/send",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: currentConversation.mode !== "HUMAN" ? "not_human_mode" : "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 409, {
          error: "conversation_not_assigned",
          message: "Assuma a conversa antes de responder manualmente.",
        });
        return;
      }
      const result = await adminSendMessage({
        waId: resolvedConversation.resolvedWaId,
        text,
        clientKey: client.clientKey,
        clientId: client.id,
        requestId,
      });
      if (!result.ok) {
        if (result.error === "window_closed" && result.errorPayload) {
          json(res, result.statusCode, { error: result.errorPayload });
          return;
        }
        json(res, result.statusCode, { error: result.error });
        return;
      }
      const defaults = await ensureDefaultDepartmentAndQueue(prisma, client.id);
      const conversation = await ensureConversationOperationalState(prisma, {
        clientId: client.id,
        defaults,
        conversation: {
          ...currentConversation,
          mode: "HUMAN" as const,
          status: ConversationOperationalStatus.IN_PROGRESS,
          closedAt: null,
        },
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? resolvedConversation.resolvedWaId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
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

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/send-media")
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

      const body = await readMultipartBody(req, res);
      if (!body) return;
      if (!body.file || body.file.content.length <= 0) {
        json(res, 400, {
          error: {
            code: "bad_request",
            message: "Selecione um arquivo valido para enviar.",
          },
        });
        return;
      }
      if (body.file.content.length > MAX_MEDIA_UPLOAD_BYTES) {
        json(res, 400, {
          error: {
            code: "file_too_large",
            message: "Arquivo excede o limite permitido de 10 MB.",
          },
        });
        return;
      }
      if (!isAllowedOutboundMediaMimeType(body.file.mimeType)) {
        json(res, 400, {
          error: {
            code: "unsupported_media_type",
            message: "Tipo de arquivo ainda nao suportado no inbox.",
          },
        });
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
        source: "app_conversation_send_media",
      });
      const currentConversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!currentConversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: currentConversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/send-media",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: currentConversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        currentConversation.mode !== "HUMAN" ||
        !canManageOwnedConversation(clientAuth.role, currentConversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/send-media",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: currentConversation.mode !== "HUMAN" ? "not_human_mode" : "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 409, {
          error: "conversation_not_assigned",
          message: "Assuma a conversa antes de responder manualmente.",
        });
        return;
      }

      const result = await adminSendMediaMessage({
        waId: resolvedConversation.resolvedWaId,
        clientKey: client.clientKey,
        clientId: client.id,
        requestId,
        mimeType: body.file.mimeType,
        fileName: body.file.fileName,
        caption: body.caption,
        content: body.file.content,
      });
      if (!result.ok) {
        if (result.error === "window_closed" && result.errorPayload) {
          json(res, result.statusCode, { error: result.errorPayload });
          return;
        }
        if (result.error === "unsupported_media_type") {
          json(res, result.statusCode, {
            error: {
              code: "unsupported_media_type",
              message: "Tipo de arquivo ainda nao suportado no inbox.",
            },
          });
          return;
        }
        if (result.error === "media_upload_failed") {
          json(res, result.statusCode, {
            error: {
              code: "media_upload_failed",
              message: "Nao foi possivel enviar o arquivo para a Meta.",
              details: summarizeMetaErrorMessage(result.errorDetails || ""),
            },
          });
          return;
        }
        if (result.error === "media_send_failed") {
          json(res, result.statusCode, {
            error: {
              code: "media_send_failed",
              message: "A Meta recusou o envio desta midia.",
              details: summarizeMetaErrorMessage(result.errorDetails || ""),
            },
          });
          return;
        }
        if (result.error === "audio_transcode_failed") {
          json(res, result.statusCode, {
            error: {
              code: "audio_transcode_failed",
              message: "Nao foi possivel normalizar o audio gravado para envio.",
              details: summarizeMetaErrorMessage(result.errorDetails || ""),
            },
          });
          return;
        }
        json(res, result.statusCode, { error: result.error });
        return;
      }

      const defaults = await ensureDefaultDepartmentAndQueue(prisma, client.id);
      const conversation = await ensureConversationOperationalState(prisma, {
        clientId: client.id,
        defaults,
        conversation: {
          ...currentConversation,
          mode: "HUMAN" as const,
          status: ConversationOperationalStatus.IN_PROGRESS,
          closedAt: null,
        },
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? resolvedConversation.resolvedWaId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        message: {
          messageId: result.messageId,
          status: result.status,
          metaMessageId: result.metaMessageId,
          createdAt: result.createdAt,
          type: result.mediaType,
          bodyText: result.bodyText,
          media: result.media,
        },
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.send_media.error",
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
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (departmentAccess.requiresDepartmentScope && !departmentAccess.departmentId) {
        json(res, 200, { ok: true, count: 0, items: [] });
        return;
      }
      const users = await prisma.user.findMany({
        where: {
          clientId: client.id,
          isActive: true,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          departmentId: true,
          department: {
            select: {
              name: true,
            },
          },
          isActive: true,
          createdAt: true,
        },
      });
      json(res, 200, {
        ok: true,
        count: users.length,
        items: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          departmentName: user.department?.name ?? null,
          isActive: user.isActive,
          createdAt: user.createdAt,
        })),
      });
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

  if (req.method === "POST" && pathname === "/app/users") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(res, 403, httpError("forbidden", "Only supervisor or admin can manage users."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (departmentAccess.requiresDepartmentScope && !departmentAccess.departmentId) {
        json(res, 403, httpError("forbidden", "Supervisor requires a department."));
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const parsed = await parseAdminUserUpsertPayload(prisma, {
        clientId: client.id,
        body,
        requireName: true,
        requireEmail: true,
        requireRole: false,
      });
      if (!parsed.ok) {
        json(res, parsed.status, httpError(parsed.code, parsed.message));
        return;
      }
      if (
        departmentAccess.requiresDepartmentScope &&
        (parsed.data.departmentId ?? null) !== departmentAccess.departmentId
      ) {
        json(
          res,
          403,
          httpError("forbidden", "Supervisor can only manage users from the same department.")
        );
        return;
      }
      const password = typeof body.password === "string" ? body.password : "";
      if (password && password.length < 6) {
        json(res, 400, httpError("weak_password", "Password must be at least 6 characters"));
        return;
      }
      if ((parsed.data.isActive ?? true) === true) {
        const activeLimit = await assertTenantActiveUserLimitAvailable(prisma, {
          clientId: client.id,
          clientKey: client.clientKey,
          requestId,
        });
        if (!activeLimit.ok) {
          json(
            res,
            409,
            httpError(
              "user_limit_exceeded",
              `Limite de usuarios ativos atingido (${activeLimit.maxActiveAppUsers}).`
            )
          );
          return;
        }
      }
      const user = await prisma.user.create({
        data: {
          clientId: client.id,
          name: parsed.data.name as string,
          email: parsed.data.email as string,
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(Object.prototype.hasOwnProperty.call(parsed.data, "departmentId")
            ? { departmentId: parsed.data.departmentId }
            : {}),
          ...(typeof parsed.data.isActive === "boolean" ? { isActive: parsed.data.isActive } : {}),
          ...(password ? { passwordHash: hashPassword(password) } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          departmentId: true,
          isActive: true,
          createdAt: true,
        },
      });
      logger.info({
        event: "user.created",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        targetUserId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        isActive: user.isActive,
      });
      if (user.departmentId) {
        logger.info({
          event: "user.department.assigned",
          requestId,
          clientId: client.id,
          userId: clientAuth.userId,
          targetUserId: user.id,
          departmentId: user.departmentId,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        });
      }
      json(res, 200, { ok: true, user });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        json(res, 409, httpError("user_already_exists", "User email already exists"));
        return;
      }
      logger.error({
        event: "app.users.create.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (
    req.method === "PUT" &&
    pathname.startsWith("/app/users/") &&
    pathname.split("/").length === 4
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(res, 403, httpError("forbidden", "Only supervisor or admin can manage users."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (departmentAccess.requiresDepartmentScope && !departmentAccess.departmentId) {
        json(res, 403, httpError("forbidden", "Supervisor requires a department."));
        return;
      }
      const userId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!userId) {
        json(res, 400, httpError("bad_request", "User id is required"));
        return;
      }
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          clientId: client.id,
          ...(departmentAccess.requiresDepartmentScope
            ? { departmentId: departmentAccess.departmentId }
            : {}),
        },
        select: { id: true, departmentId: true, role: true, isActive: true },
      });
      if (!existingUser) {
        json(res, 404, httpError("user_not_found", "User not found"));
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const parsed = await parseAdminUserUpsertPayload(prisma, {
        clientId: client.id,
        body,
        requireName: false,
        requireEmail: false,
        requireRole: false,
        currentRole: existingUser.role,
        currentDepartmentId: existingUser.departmentId,
      });
      if (!parsed.ok) {
        json(res, parsed.status, httpError(parsed.code, parsed.message));
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        json(
          res,
          400,
          httpError(
            "bad_request",
            "Provide at least one of name, email, role, departmentId or isActive"
          )
        );
        return;
      }
      const nextDepartmentId =
        Object.prototype.hasOwnProperty.call(parsed.data, "departmentId")
          ? (parsed.data.departmentId ?? null)
          : existingUser.departmentId ?? null;
      if (
        departmentAccess.requiresDepartmentScope &&
        nextDepartmentId !== departmentAccess.departmentId
      ) {
        json(
          res,
          403,
          httpError("forbidden", "Supervisor can only manage users from the same department.")
        );
        return;
      }
      if (parsed.data.isActive === true && existingUser.isActive === false) {
        const activeLimit = await assertTenantActiveUserLimitAvailable(prisma, {
          clientId: client.id,
          clientKey: client.clientKey,
          requestId,
        });
        if (!activeLimit.ok) {
          json(
            res,
            409,
            httpError(
              "user_limit_exceeded",
              `Limite de usuarios ativos atingido (${activeLimit.maxActiveAppUsers}).`
            )
          );
          return;
        }
      }
      const user = await prisma.user.update({
        where: { id: existingUser.id },
        data: parsed.data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          departmentId: true,
          isActive: true,
          createdAt: true,
        },
      });
      logger.info({
        event: "user.updated",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        targetUserId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        isActive: user.isActive,
      });
      if (existingUser.departmentId !== user.departmentId && user.departmentId) {
        logger.info({
          event: "user.department.assigned",
          requestId,
          clientId: client.id,
          userId: clientAuth.userId,
          targetUserId: user.id,
          departmentId: user.departmentId,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        });
      }
      json(res, 200, { ok: true, user });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        json(res, 409, httpError("user_already_exists", "User email already exists"));
        return;
      }
      logger.error({
        event: "app.users.update.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/departments") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(
          res,
          403,
          httpError("forbidden", "Only supervisor or admin can manage departments.")
        );
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "departments",
        endpoint: pathname,
        requestId,
      }))) return;
      const includeInactive =
        clientAuth.role === "ADMIN" && parsedUrl.searchParams.get("includeInactive") === "true";
      const departments = await prisma.department.findMany({
        where: {
          clientId: client.id,
          ...(includeInactive ? {} : { isActive: true }),
          ...LEGACY_OPERATIONAL_DEPARTMENT_FILTER,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
        },
      });
      json(res, 200, {
        ok: true,
        count: departments.length,
        items: departments,
      });
    } catch (error) {
      logger.error({
        event: "app.departments.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "POST" && pathname === "/app/departments") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role) || clientAuth.role === "SUPERVISOR") {
        json(res, 403, httpError("forbidden", "Only admin can manage departments."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "departments",
        endpoint: pathname,
        requestId,
      }))) return;
      const body = await readJsonBody(req, res);
      if (!body) return;
      const parsed = parseDepartmentUpsertPayload(body);
      if (!parsed.ok) {
        json(res, parsed.status, httpError(parsed.code, parsed.message));
        return;
      }
      const existingBySlug = await prisma.department.findFirst({
        where: {
          clientId: client.id,
          slug: parsed.data.slug,
        },
        select: { id: true },
      });
      if (existingBySlug) {
        json(
          res,
          409,
          httpError("department_slug_conflict", "Department slug already exists for this tenant")
        );
        return;
      }
      const department = await prisma.department.create({
        data: {
          clientId: client.id,
          name: parsed.data.name as string,
          slug: parsed.data.slug as string,
          ...(typeof parsed.data.isActive === "boolean"
            ? { isActive: parsed.data.isActive }
            : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
        },
      });
      logger.info({
        event: "department.created",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        departmentId: department.id,
        isActive: department.isActive,
      });
      json(res, 200, { ok: true, department });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        json(
          res,
          409,
          httpError("department_slug_conflict", "Department slug already exists for this tenant")
        );
        return;
      }
      logger.error({
        event: "app.departments.create.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (
    req.method === "PUT" &&
    pathname.startsWith("/app/departments/") &&
    pathname.split("/").length === 4
  ) {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role) || clientAuth.role === "SUPERVISOR") {
        json(res, 403, httpError("forbidden", "Only admin can manage departments."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "departments",
        endpoint: pathname,
        requestId,
      }))) return;
      const departmentId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!departmentId) {
        json(res, 400, httpError("bad_request", "Department id is required"));
        return;
      }
      const existing = await prisma.department.findFirst({
        where: {
          id: departmentId,
          clientId: client.id,
        },
        select: { id: true, name: true, slug: true, isActive: true },
      });
      if (!existing) {
        json(res, 404, httpError("department_not_found", "Department not found"));
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const parsed = parseDepartmentUpsertPayload(body, {
        requireName: false,
        currentName: existing.name,
      });
      if (!parsed.ok) {
        json(res, parsed.status, httpError(parsed.code, parsed.message));
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        json(res, 400, httpError("bad_request", "Provide name and/or isActive"));
        return;
      }
      if (parsed.data.slug && parsed.data.slug !== existing.slug) {
        const conflictingDepartment = await prisma.department.findFirst({
          where: {
            clientId: client.id,
            slug: parsed.data.slug,
            NOT: { id: existing.id },
          },
          select: { id: true },
        });
        if (conflictingDepartment) {
          json(
            res,
            409,
            httpError("department_slug_conflict", "Department slug already exists for this tenant")
          );
          return;
        }
      }
      const department = await prisma.department.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.slug ? { slug: parsed.data.slug } : {}),
          ...(typeof parsed.data.isActive === "boolean"
            ? { isActive: parsed.data.isActive }
            : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          createdAt: true,
        },
      });
      logger.info({
        event: "department.updated",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        departmentId: department.id,
        isActive: department.isActive,
      });
      if (
        typeof parsed.data.isActive === "boolean" &&
        existing.isActive !== department.isActive
      ) {
        logger.info({
          event: "department.toggled",
          requestId,
          clientId: client.id,
          userId: clientAuth.userId,
          departmentId: department.id,
          isActive: department.isActive,
        });
      }
      json(res, 200, { ok: true, department });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        json(
          res,
          409,
          httpError("department_slug_conflict", "Department slug already exists for this tenant")
        );
        return;
      }
      logger.error({
        event: "app.departments.update.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/chatbot/flows") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(res, 403, httpError("forbidden", "Only supervisor or admin can manage chatbot flows."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "chatbot",
        endpoint: pathname,
        requestId,
      }))) return;
      const items = await prisma.chatbotFlow.findMany({
        where: { clientId: client.id },
        orderBy: [{ entryPoint: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          clientId: true,
          name: true,
          isActive: true,
          entryPoint: true,
          definition: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      json(res, 200, { ok: true, count: items.length, items });
    } catch (error) {
      logger.error({
        event: "app.chatbot.flows.list.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/chatbot/settings") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(res, 403, httpError("forbidden", "Only supervisor or admin can view chatbot settings."));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "chatbot",
        endpoint: pathname,
        requestId,
      }))) return;
      const tenants = await getTenants();
      const tenant = tenants[client.clientKey];
      if (!tenant) {
        json(res, 404, httpError("tenant_not_found", "Tenant not found"));
        return;
      }
      const aiConfigurationStatus = getAiAssistantConfigurationStatus(tenant);
      const aiConfigured = aiConfigurationStatus.ready;
      const chatbotLocked = Boolean(tenant.disableChatbot);
      const aiLocked = Boolean(tenant.disableAiFallback);
      json(res, 200, {
        ok: true,
        tenantId: client.clientKey,
        settings: {
          disableAutoReply: tenant.disableAutoReply ?? false,
          disableChatbot: Boolean(tenant.disableChatbot),
          disableAiFallback: Boolean(tenant.disableAiFallback),
          disableIntentClassifier: Boolean(tenant.disableIntentClassifier),
          aiAssistantEnabled: tenant.aiAssistantEnabled === true,
          aiAssistantMaxReplies: tenant.aiAssistantMaxReplies ?? 2,
          aiAssistantProfile: tenant.aiAssistantProfile ?? "business",
          aiAssistantFallbackToHandoff: tenant.aiAssistantFallbackToHandoff === true,
          aiAssistantAllowedTopics: tenant.aiAssistantAllowedTopics ?? [],
          aiAssistantSecondaryTopics: tenant.aiAssistantSecondaryTopics ?? [],
          aiAssistantBlockedTerms: tenant.aiAssistantBlockedTerms ?? [],
          aiAssistantHandoffKeywords: tenant.aiAssistantHandoffKeywords ?? [],
          aiAssistantFallbackMessage: tenant.aiAssistantFallbackMessage ?? "",
          aiAssistantHandoffPrompt: tenant.aiAssistantHandoffPrompt ?? "",
          aiAssistantGlobalSafety: getAiAssistantGlobalSafetyConfig(),
          aiAssistantConfigurationStatus: aiConfigurationStatus,
          aiConfigured,
          chatbotLocked,
          flowEditingLocked: Boolean(tenant.disableChatbotFlowEditing),
          aiLocked,
          aiAssistantLocked:
            !env.AI_ASSISTANT_ENABLED ||
            !env.WHATSAPP_AI_ENABLED ||
            tenant.disableAiFallback === true ||
            !aiConfigured,
          intentClassifierLocked: !env.FLOW_INTENT_CLASSIFIER_ENABLED,
        },
      });
    } catch (error) {
      logger.error({
        event: "app.chatbot.settings.get.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "PUT" && pathname === "/app/chatbot/settings") {
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    logger.warn({
      event: "app.chatbot.settings.update.denied",
      requestId,
      clientId: clientAuth.clientId,
      userId: clientAuth.userId,
      reason: "managed_by_internal_admin",
    });
    json(
      res,
      403,
      httpError("managed_by_internal_admin", "Automacoes sao gerenciadas no console interno.")
    );
    return;
  }

  if (req.method === "POST" && pathname === "/app/chatbot/flows") {
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    logger.warn({
      event: "app.chatbot.flows.create.denied",
      requestId,
      clientId: clientAuth.clientId,
      userId: clientAuth.userId,
      reason: "managed_by_internal_admin",
    });
    json(
      res,
      403,
      httpError("managed_by_internal_admin", "Flows do chatbot sao gerenciados no console interno.")
    );
    return;
  }

  if (
    req.method === "PUT" &&
    pathname.startsWith("/app/chatbot/flows/") &&
    pathname.split("/").length === 5
  ) {
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    logger.warn({
      event: "app.chatbot.flows.update.denied",
      requestId,
      clientId: clientAuth.clientId,
      userId: clientAuth.userId,
      reason: "managed_by_internal_admin",
    });
    json(
      res,
      403,
      httpError("managed_by_internal_admin", "Flows do chatbot sao gerenciados no console interno.")
    );
    return;
  }

  if (req.method === "GET" && pathname === "/app/reports/conversations") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(
          res,
          403,
          httpError("forbidden", "Only supervisor or admin can view reports.")
        );
        return;
      }
      const range = parseConversationReportRange(query.range);
      if (!range) {
        json(res, 400, httpError("invalid_range", "Invalid range"));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "reports",
        endpoint: pathname,
        requestId,
      }))) return;
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const requestedUserId = typeof query.userId === "string" ? query.userId.trim() : "";
      const requestedDepartmentId =
        clientAuth.role === "SUPERVISOR"
          ? departmentAccess.departmentId ?? ""
          : typeof query.departmentId === "string"
            ? query.departmentId.trim()
            : "";
      if (clientAuth.role === "SUPERVISOR" && !requestedDepartmentId) {
        json(res, 200, {
          ok: true,
          range: range.key,
          userId: requestedUserId || null,
          departmentId: null,
          totalConversations: 0,
          avgFirstResponseTimeSec: null,
          avgResolutionTimeSec: null,
          slaBreaches: 0,
          byAgent: [],
          byDepartment: [],
        });
        return;
      }
      const reportData = await loadConversationReportData(prisma, {
        clientId: client.id,
        since: range.since,
        requestedDepartmentId: requestedDepartmentId || null,
      });
      if (!reportData.ok) {
        json(res, reportData.status, httpError(reportData.code, "Department not found"));
        return;
      }
      const filteredMetrics = requestedUserId
        ? reportData.metrics.filter(
            (item) =>
              reportData.stateByWaId
                .get(item.conversation.waId)
                ?.assignedUserIds.includes(requestedUserId)
          )
        : reportData.metrics;
      json(
        res,
        200,
        buildConversationReportSummary({
          rangeKey: range.key,
          requestedUserId: requestedUserId || null,
          requestedDepartmentId: requestedDepartmentId || null,
          filteredMetrics,
          stateByWaId: reportData.stateByWaId,
          slaConfig: reportData.slaConfig,
          departmentNameById: reportData.departmentNameById,
        })
      );
      logger.info({
        event: "app.reports.conversations.viewed",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
        departmentId: requestedDepartmentId || null,
      });
    } catch (error) {
      logger.error({
        event: "app.reports.conversations.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/app/reports/conversations/export") {
    const prisma = getPrisma();
    const clientAuth = requireClientAuth(req, res);
    if (!clientAuth) return;
    try {
      if (isAgentRole(clientAuth.role)) {
        json(
          res,
          403,
          httpError("forbidden", "Only supervisor or admin can view reports.")
        );
        return;
      }
      const range = parseConversationReportRange(query.range);
      if (!range) {
        json(res, 400, httpError("invalid_range", "Invalid range"));
        return;
      }
      const client = await getScopedClientById(prisma, clientAuth.clientId);
      if (!client) {
        json(res, 404, httpError("client_not_found", "Client not found"));
        return;
      }
      if (client.status !== "ACTIVE") {
        json(res, 403, httpError("client_inactive", "Client inactive"));
        return;
      }
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "reports",
        endpoint: pathname,
        requestId,
      }))) return;
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const requestedUserId = typeof query.userId === "string" ? query.userId.trim() : "";
      const requestedDepartmentId =
        clientAuth.role === "SUPERVISOR"
          ? departmentAccess.departmentId ?? ""
          : typeof query.departmentId === "string"
            ? query.departmentId.trim()
            : "";
      if (clientAuth.role === "SUPERVISOR" && !requestedDepartmentId) {
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"conversation-report-app-${range.key}.csv\"`,
        });
        res.end(
          [
            [
              "conversationId",
              "waId",
              "departmentId",
              "departmentName",
              "assignedUserId",
              "status",
              "firstResponseTimeSec",
              "resolutionTimeSec",
              "createdAt",
              "closedAt",
            ].join(","),
          ].join("\n")
        );
        return;
      }
      const reportData = await loadConversationReportData(prisma, {
        clientId: client.id,
        since: range.since,
        requestedDepartmentId: requestedDepartmentId || null,
        includeClosedAt: true,
      });
      if (!reportData.ok) {
        json(res, reportData.status, httpError(reportData.code, "Department not found"));
        return;
      }
      const filteredMetrics = requestedUserId
        ? reportData.metrics.filter(
            (item) =>
              reportData.stateByWaId
                .get(item.conversation.waId)
                ?.assignedUserIds.includes(requestedUserId)
          )
        : reportData.metrics;
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"conversation-report-app-${range.key}.csv\"`,
      });
      res.end(
        buildConversationReportCsv({
          metrics: filteredMetrics,
          stateByWaId: reportData.stateByWaId,
          departmentNameById: reportData.departmentNameById,
        })
      );
      logger.info({
        event: "app.reports.conversations.exported",
        requestId,
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
        departmentId: requestedDepartmentId || null,
      });
    } catch (error) {
      logger.error({
        event: "app.reports.conversations_export.error",
        message: (error as Error).message,
        requestId,
      });
      json(res, 500, httpError("server_error", "Server error"));
    }
    return;
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    (pathname.endsWith("/claim") || pathname.endsWith("/assign"))
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
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/claim",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;
      const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (
        requestedUserId &&
        requestedUserId !== clientAuth.userId &&
        !canManageAnyConversation(clientAuth.role)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/claim",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "assign_other_user_without_privilege",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, { error: "forbidden", message: "Voce so pode assumir para si." });
        return;
      }
      if (
        conversation.assignedUserId &&
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/claim",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 409, {
          error: "conversation_already_assigned",
          message: "A conversa ja esta atribuida a outro atendente.",
        });
        return;
      }
      const assignedUser = requestedUserId
        ? await prisma.user.findFirst({
            where: { id: requestedUserId, clientId: client.id, isActive: true },
            select: { id: true, name: true, departmentId: true },
          })
        : null;
      if (requestedUserId && !assignedUser) {
        json(res, 404, { error: "user_not_found" });
        return;
      }
      const routing = await resolveAssignmentRouting(prisma, {
        clientId: client.id,
        assignedUserDepartmentId: assignedUser?.departmentId ?? departmentAccess.departmentId,
        fallbackDepartmentId: conversation.departmentId ?? null,
      });
      const assignedAt = new Date().toISOString();
      const nextState = {
        ...conversation,
        mode: "HUMAN" as const,
        handoff: {
          ...conversation.handoff,
          status: "active" as const,
          activatedAt: assignedAt,
        },
        assignedUserId: assignedUser?.id ?? clientAuth.userId,
        assignedTo: assignedUser ? `user:${assignedUser.id}` : `user:${clientAuth.userId}`,
        assignedAt,
        departmentId: routing.departmentId,
        queueId: routing.queueId,
        status: ConversationOperationalStatus.IN_PROGRESS,
        closedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      await persistConversationDepartment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        departmentId: routing.departmentId,
      });
      await recordConversationAssignment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        fromUserId: conversation.assignedUserId ?? null,
        toUserId: nextState.assignedUserId ?? null,
        assignedAt,
      });
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.assigned",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromUserId: conversation.assignedUserId ?? null,
          toUserId: nextState.assignedUserId ?? null,
          assignedAt,
          departmentId: routing.departmentId,
          queueId: routing.queueId,
          status: nextState.status,
        },
      });
      logger.info({
        event: "conversation.assigned",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        waId: nextState.waIdCanonical ?? nextState.waId,
        assignedUserId: nextState.assignedUserId,
        fromUserId: conversation.assignedUserId ?? null,
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
        assignedUserName:
          assignedUser?.name ??
          (nextState.assignedUserId
            ? await findAssignedUserName(prisma, client.id, nextState.assignedUserId)
            : null),
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
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
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/release",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/release",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode liberar conversas atribuidas a voce.",
        });
        return;
      }
      const nextState = {
        ...conversation,
        mode: "BOT" as const,
        handoff: {
          ...conversation.handoff,
          status: "none" as const,
          releasedAt: new Date().toISOString(),
        },
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        status: null,
        closedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      await persistConversationDepartment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        departmentId: null,
      });
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.released",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromMode: conversation.mode ?? null,
          toMode: nextState.mode,
          fromStatus: conversation.status ?? null,
          toStatus: nextState.status ?? null,
          fromDepartmentId: conversation.departmentId ?? null,
          toDepartmentId: nextState.departmentId ?? null,
          fromAssignedUserId: conversation.assignedUserId ?? null,
          toAssignedUserId: nextState.assignedUserId ?? null,
        },
      });
      logger.info({
        event: "conversation.released",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        waId: nextState.waIdCanonical ?? nextState.waId,
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
        assignedUserName: null,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
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
    req.method === "POST" &&
    pathname.startsWith("/app/conversation/") &&
    pathname.split("/").length === 5 &&
    pathname.endsWith("/release-to-general")
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
        source: "app_conversation_release_to_general",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/release-to-general",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/release-to-general",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode liberar conversas atribuidas a voce.",
        });
        return;
      }

      const defaults = await ensureDefaultDepartmentAndQueue(prisma, client.id);
      const releasedAt = new Date().toISOString();
      const nextState = {
        ...conversation,
        mode: "HUMAN" as const,
        handoff: {
          ...conversation.handoff,
          status: "active" as const,
          releasedAt,
        },
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: defaults.department.id,
        queueId: defaults.queue.id,
        status: ConversationOperationalStatus.WAITING,
        closedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      await persistConversationDepartment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        departmentId: defaults.department.id,
      });
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.released_to_general",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromMode: conversation.mode ?? null,
          toMode: nextState.mode,
          fromStatus: conversation.status ?? null,
          toStatus: nextState.status ?? null,
          fromDepartmentId: conversation.departmentId ?? null,
          toDepartmentId: defaults.department.id,
          fromAssignedUserId: conversation.assignedUserId ?? null,
          toAssignedUserId: nextState.assignedUserId ?? null,
        },
      });
      logger.info({
        event: "conversation.released_to_general",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        waId: nextState.waIdCanonical ?? nextState.waId,
        departmentId: defaults.department.id,
      });
      publishRealtimeEvent({
        type: "conversation.handoff.updated",
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        mode: "HUMAN",
        handoffStatus: "active",
        assignedUserId: nextState.assignedUserId ?? null,
        departmentId: defaults.department.id,
        updatedAt: releasedAt,
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
        assignedUserName: null,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.release_to_general.error",
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
    pathname.endsWith("/transfer")
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
      const toUserId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!toUserId) {
        json(res, 400, { error: "bad_request", message: "Informe o usuario de destino." });
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
      const assignedUser = await prisma.user.findFirst({
        where: { id: toUserId, clientId: client.id, isActive: true },
        select: { id: true, name: true, departmentId: true },
      });
      if (!assignedUser) {
        json(res, 404, { error: "user_not_found" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_transfer",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const hasDepartmentAccess = hasConversationDepartmentAccess({
        role: clientAuth.role,
        userDepartmentId: departmentAccess.departmentId,
        conversationDepartmentId: conversation.departmentId ?? null,
      });
      const isCurrentAssignedOwner = conversation.assignedUserId === clientAuth.userId;
      if (!hasDepartmentAccess && !isCurrentAssignedOwner) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/transfer",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        !isAdminRole(clientAuth.role) &&
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/transfer",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode transferir conversas atribuidas a voce.",
        });
        return;
      }
      const routing = await resolveAssignmentRouting(prisma, {
        clientId: client.id,
        assignedUserDepartmentId: assignedUser.departmentId,
        fallbackDepartmentId: conversation.departmentId ?? null,
      });
      const assignedAt = new Date().toISOString();
      const nextState = {
        ...conversation,
        mode: "HUMAN" as const,
        assignedUserId: assignedUser.id,
        assignedTo: `user:${assignedUser.id}`,
        assignedAt,
        departmentId: routing.departmentId,
        queueId: routing.queueId,
        status: ConversationOperationalStatus.IN_PROGRESS,
        closedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      await persistConversationDepartment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        departmentId: routing.departmentId,
      });
      await recordConversationAssignment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        fromUserId: conversation.assignedUserId ?? null,
        toUserId: assignedUser.id,
        assignedAt,
      });
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.transferred",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromUserId: conversation.assignedUserId ?? null,
          toUserId: assignedUser.id,
          assignedAt,
          departmentId: routing.departmentId,
          queueId: routing.queueId,
          status: nextState.status,
        },
      });
      logger.info({
        event: "conversation.transferred",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        waId: nextState.waIdCanonical ?? nextState.waId,
        fromUserId: conversation.assignedUserId ?? null,
        toUserId: assignedUser.id,
      });
      publishRealtimeEvent({
        type: "conversation.handoff.updated",
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        mode: "HUMAN",
        handoffStatus:
          nextState.handoff.status === "pending" || nextState.handoff.status === "active"
            ? nextState.handoff.status
            : "active",
        assignedUserId: nextState.assignedUserId ?? null,
        departmentId: routing.departmentId,
        updatedAt: assignedAt,
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
        assignedUserName: assignedUser.name,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.transfer.error",
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
    pathname.endsWith("/transfer-department")
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
      const nextDepartmentId =
        typeof body.departmentId === "string" ? body.departmentId.trim() : "";
      if (!nextDepartmentId) {
        json(res, 400, {
          error: "bad_request",
          message: "Informe o setor de destino.",
        });
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
      const department = await prisma.department.findFirst({
        where: {
          id: nextDepartmentId,
          clientId: client.id,
          isActive: true,
          ...LEGACY_OPERATIONAL_DEPARTMENT_FILTER,
        },
        select: { id: true, name: true },
      });
      if (!department) {
        json(res, 404, { error: "department_not_found" });
        return;
      }
      const resolvedConversation = await resolveConversationTarget(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        rawWaId: waId,
        requestId,
        source: "app_conversation_transfer_department",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      const hasDepartmentAccess = hasConversationDepartmentAccess({
        role: clientAuth.role,
        userDepartmentId: departmentAccess.departmentId,
        conversationDepartmentId: conversation.departmentId ?? null,
      });
      const isCurrentAssignedOwner = conversation.assignedUserId === clientAuth.userId;
      if (!hasDepartmentAccess && !isCurrentAssignedOwner) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/transfer-department",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        !isAdminRole(clientAuth.role) &&
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/transfer-department",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode mover conversas atribuidas a voce.",
        });
        return;
      }
      const queue = await ensureQueueForDepartment(prisma, {
        clientId: client.id,
        departmentId: department.id,
      });
      const previousDepartmentId = conversation.departmentId ?? null;
      const nextState = {
        ...conversation,
        mode: "HUMAN" as const,
        departmentId: department.id,
        queueId: queue.id,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        status: ConversationOperationalStatus.WAITING,
        closedAt: null,
      };
      await runtimeStorage.upsertConversation(nextState);
      await persistConversationDepartment(prisma, {
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        departmentId: department.id,
      });
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.department.transferred",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromDepartmentId: previousDepartmentId,
          toDepartmentId: department.id,
          fromAssignedUserId: conversation.assignedUserId ?? null,
          toAssignedUserId: nextState.assignedUserId ?? null,
          status: nextState.status,
          queueId: queue.id,
        },
      });
      logger.info({
        event: "conversation.department.transferred",
        requestId,
        clientId: client.id,
        conversationId: nextState.waId,
        waId: nextState.waIdCanonical ?? nextState.waId,
        fromDepartmentId: previousDepartmentId,
        toDepartmentId: department.id,
        userId: clientAuth.userId,
      });
      publishRealtimeEvent({
        type: "conversation.handoff.updated",
        clientId: client.id,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        mode: "HUMAN",
        handoffStatus:
          nextState.handoff.status === "pending" || nextState.handoff.status === "active"
            ? nextState.handoff.status
            : "active",
        assignedUserId: null,
        departmentId: department.id,
        updatedAt: new Date().toISOString(),
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
        assignedUserName: null,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.transfer_department.error",
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
    pathname.endsWith("/status")
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
      const nextStatus = normalizeConversationOperationalStatus(
        typeof body.status === "string" ? body.status.trim() : ""
      );
      if (!nextStatus || !CONVERSATION_OPERATIONAL_STATUS_VALUES.includes(nextStatus)) {
        json(res, 400, { error: "bad_request", message: "Status operacional invalido." });
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
        source: "app_conversation_status",
      });
      const conversation = await runtimeStorage.getConversation(
        resolvedConversation.resolvedWaId,
        client.clientKey
      );
      if (!conversation) {
        json(res, 404, { error: "conversation_not_found" });
        return;
      }
      const departmentAccess = await loadAppDepartmentAccess(prisma, {
        clientId: client.id,
        userId: clientAuth.userId,
        role: clientAuth.role,
      });
      if (
        !hasConversationDepartmentAccess({
          role: clientAuth.role,
          userDepartmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
        })
      ) {
        logAppDepartmentDenied({
          requestId,
          route: "/app/conversation/:waId/status",
          userId: clientAuth.userId,
          clientId: client.id,
          departmentId: departmentAccess.departmentId,
          conversationDepartmentId: conversation.departmentId ?? null,
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: {
            code: "forbidden",
            message: "Conversa fora do seu departamento.",
          },
        });
        return;
      }
      if (
        !canManageOwnedConversation(clientAuth.role, conversation.assignedUserId, clientAuth.userId)
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/conversation/:waId/status",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          waId: resolvedConversation.resolvedWaIdCanonical,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode atualizar status de conversas atribuidas a voce.",
        });
        return;
      }
      const defaults = await ensureDefaultDepartmentAndQueue(prisma, client.id);
      const nextState = {
        ...conversation,
        mode:
          nextStatus === ConversationOperationalStatus.CLOSED
            ? (conversation.mode ?? "HUMAN")
            : "HUMAN" as const,
        departmentId: conversation.departmentId ?? defaults.department.id,
        queueId: conversation.queueId ?? defaults.queue.id,
        status: nextStatus,
        closedAt:
          nextStatus === ConversationOperationalStatus.CLOSED
            ? new Date().toISOString()
            : null,
      };
      await runtimeStorage.upsertConversation(nextState);
      if (nextStatus === ConversationOperationalStatus.CLOSED && nextState.closedAt) {
        await recordConversationClosedMetrics({
          prisma,
          clientId: client.id,
          waId: nextState.waId,
          closedAt: new Date(nextState.closedAt),
          assignedUserId: nextState.assignedUserId ?? null,
          requestId,
        });
      }
      await recordConversationAuditEvent(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        requestId,
        eventName: "conversation.status_changed",
        actorUserId: clientAuth.userId,
        waId: nextState.waId,
        waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        conversationId: nextState.conversationKey ?? nextState.waId,
        payload: {
          fromStatus: conversation.status ?? null,
          toStatus: nextStatus,
          closedAt: nextState.closedAt ?? null,
          assignedUserId: nextState.assignedUserId ?? null,
          departmentId: nextState.departmentId ?? null,
          queueId: nextState.queueId ?? null,
          mode: nextState.mode ?? null,
          handoffStatus: nextState.handoff?.status ?? null,
        },
      });
      logger.info({
        event: "conversation.status_changed",
        requestId,
        clientId: client.id,
        clientKey: client.clientKey,
        waId: nextState.waIdCanonical ?? nextState.waId,
        status: nextStatus,
      });
      const payload = await buildConversationActionPayload(prisma, {
        clientId: client.id,
        clientKey: client.clientKey,
        conversation: nextState,
      });
      json(res, 200, {
        ...payload,
        waId: payload.waId ?? nextState.waId,
        waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
      });
    } catch (error) {
      logger.error({
        event: "app.conversation.status.error",
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
    pathname.split("/").length === 4
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
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const email = typeof body.email === "string" ? body.email.trim().slice(0, 160) : undefined;
      const company = typeof body.company === "string" ? body.company.trim().slice(0, 160) : undefined;
      const existing = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: client.id },
        select: { id: true, waId: true, waIdCanonical: true },
      });
      if (!existing) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      if (!(await canManageLead(prisma, client, clientAuth, existing, requestId, "app_lead_update"))) {
        logAppRbacDenied({
          requestId,
          route: "/app/lead/:id",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          leadId,
          waId: existing.waIdCanonical ?? existing.waId,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode editar leads de conversas atribuidas a voce.",
        });
        return;
      }
      const lead = await prisma.lead.update({
        where: { id: leadId },
        data: {
          name: name || null,
          ...(email !== undefined ? { email: email || null } : {}),
          ...(company !== undefined ? { company: company || null } : {}),
        },
        select: { id: true, name: true, email: true, company: true, updatedAt: true },
      });
      json(res, 200, { ok: true, lead });
    } catch (error) {
      logger.error({
        event: "app.lead.update.error",
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
      const allowed = new Set([
        "NEW",
        "QUALIFIED",
        "WAITING_ATTENDANT",
        "IN_ATTENDANCE",
        "CLOSED",
        "OPEN",
        "WON",
        "LOST",
        "FOLLOW_UP",
        "NO_RESPONSE",
        "NURTURE",
      ]);
      if (!allowed.has(status)) {
        json(res, 400, { error: "bad_request" });
        return;
      }
      const existing = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: client.id },
        select: { id: true, waId: true, waIdCanonical: true },
      });
      if (!existing) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      if (!(await canManageLead(prisma, client, clientAuth, existing, requestId, "app_lead_status"))) {
        logAppRbacDenied({
          requestId,
          route: "/app/lead/:id/status",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          leadId,
          waId: existing.waIdCanonical ?? existing.waId,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode alterar o status de leads de conversas atribuidas a voce.",
        });
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
        select: { id: true, waId: true, waIdCanonical: true },
      });
      if (!lead) {
        json(res, 404, { error: "lead_not_found" });
        return;
      }
      if (
        !(await canManageLead(prisma, client, clientAuth, lead, requestId, "app_lead_notes_create"))
      ) {
        logAppRbacDenied({
          requestId,
          route: "/app/lead/:id/notes",
          userId: clientAuth.userId,
          clientId: client.id,
          role: clientAuth.role,
          reason: "not_owner",
          leadId,
          waId: lead.waIdCanonical ?? lead.waId,
        });
        json(res, 403, {
          error: "forbidden",
          message: "Voce so pode adicionar notas em leads de conversas atribuidas a voce.",
        });
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "campaigns",
        endpoint: pathname,
        requestId,
      }))) return;
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "campaigns",
        endpoint: pathname,
        requestId,
      }))) return;
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "campaigns",
        endpoint: pathname,
        requestId,
      }))) return;
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
      if (!(await enforceAppFeature(prisma, res, {
        client,
        userId: clientAuth.userId,
        feature: "campaigns",
        endpoint: pathname,
        requestId,
      }))) return;
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
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const users = await prisma.user.findMany({
          where: { clientId: client.id },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departmentId: true,
            isActive: true,
            createdAt: true,
          },
        });
        json(res, 200, { ok: true, count: users.length, items: users });
      } catch (error) {
        logger.error({
          event: "admin.users.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/users") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const parsed = await parseAdminUserUpsertPayload(prisma, {
          clientId: client.id,
          body,
          requireName: true,
          requireEmail: true,
          requireRole: false,
        });
        if (!parsed.ok) {
          json(res, parsed.status, httpError(parsed.code, parsed.message));
          return;
        }
        const { data } = parsed;
        const password = typeof body.password === "string" ? body.password : "";
        if (password && password.length < 6) {
          json(res, 400, httpError("weak_password", "Password must be at least 6 characters"));
          return;
        }
        if ((data.isActive ?? true) === true) {
          const activeLimit = await assertTenantActiveUserLimitAvailable(prisma, {
            clientId: client.id,
            clientKey,
            requestId,
          });
          if (!activeLimit.ok) {
            json(
              res,
              409,
              httpError(
                "user_limit_exceeded",
                `Limite de usuarios ativos atingido (${activeLimit.maxActiveAppUsers}).`
              )
            );
            return;
          }
        }
        const user = await prisma.user.create({
          data: {
            clientId: client.id,
            name: data.name as string,
            email: data.email as string,
            ...(data.role ? { role: data.role } : {}),
            ...(Object.prototype.hasOwnProperty.call(data, "departmentId")
              ? { departmentId: data.departmentId }
              : {}),
            ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
            ...(password ? { passwordHash: hashPassword(password) } : {}),
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departmentId: true,
            isActive: true,
            createdAt: true,
          },
        });
        logger.info({
          event: "user.created",
          requestId,
          clientId: client.id,
          userId: user.id,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          isActive: user.isActive,
        });
        if (user.departmentId) {
          logger.info({
            event: "user.department.assigned",
            requestId,
            clientId: client.id,
            userId: user.id,
            departmentId: user.departmentId,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
          });
        }
        json(res, 200, { ok: true, user });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          json(res, 409, httpError("user_already_exists", "User email already exists"));
          return;
        }
        logger.error({
          event: "admin.users.create.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      (req.method === "PATCH" || req.method === "PUT") &&
      pathname.startsWith("/admin/users/") &&
      pathname.split("/").length === 4
    ) {
      try {
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
        const userId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!userId) {
          json(res, 400, httpError("bad_request", "User id is required"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const existingUser = await prisma.user.findFirst({
          where: { id: userId, clientId: client.id },
          select: { id: true, departmentId: true, role: true, isActive: true },
        });
        if (!existingUser) {
          json(res, 404, httpError("user_not_found", "User not found"));
          return;
        }
        const parsed = await parseAdminUserUpsertPayload(prisma, {
          clientId: client.id,
          body,
          requireName: false,
          requireEmail: false,
          requireRole: false,
          currentRole: existingUser.role,
          currentDepartmentId: existingUser.departmentId,
        });
        if (!parsed.ok) {
          json(res, parsed.status, httpError(parsed.code, parsed.message));
          return;
        }
        if (Object.keys(parsed.data).length === 0) {
          json(
            res,
            400,
            httpError(
              "bad_request",
              "Provide at least one of name, email, role, departmentId or isActive"
            )
          );
          return;
        }
        if (parsed.data.isActive === true && existingUser.isActive === false) {
          const activeLimit = await assertTenantActiveUserLimitAvailable(prisma, {
            clientId: client.id,
            clientKey,
            requestId,
          });
          if (!activeLimit.ok) {
            json(
              res,
              409,
              httpError(
                "user_limit_exceeded",
                `Limite de usuarios ativos atingido (${activeLimit.maxActiveAppUsers}).`
              )
            );
            return;
          }
        }
        const user = await prisma.user.update({
          where: { id: existingUser.id },
          data: parsed.data,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departmentId: true,
            isActive: true,
            createdAt: true,
          },
        });
        logger.info({
          event: "user.updated",
          requestId,
          clientId: client.id,
          userId: user.id,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
          isActive: user.isActive,
        });
        if (existingUser.departmentId !== user.departmentId && user.departmentId) {
          logger.info({
            event: "user.department.assigned",
            requestId,
            clientId: client.id,
            userId: user.id,
            departmentId: user.departmentId,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
          });
        }
        json(res, 200, { ok: true, user });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          json(res, 409, httpError("user_already_exists", "User email already exists"));
          return;
        }
        logger.error({
          event: "admin.users.update.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
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

    if (req.method === "GET" && pathname === "/admin/reports/conversations") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const range = parseConversationReportRange(query.range);
        if (!range) {
          json(res, 400, httpError("invalid_range", "Invalid range"));
          return;
        }
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const requestedUserId = typeof query.userId === "string" ? query.userId.trim() : "";
        const requestedDepartmentId =
          typeof query.departmentId === "string" ? query.departmentId.trim() : "";
        if (requestedDepartmentId) {
          const department = await prisma.department.findFirst({
            where: {
              id: requestedDepartmentId,
              clientId: client.id,
            },
            select: { id: true },
          });
          if (!department) {
            json(res, 404, httpError("department_not_found", "Department not found"));
            return;
          }
        }
        const metrics = await prisma.conversationMetrics.findMany({
          where: {
            clientId: client.id,
            startedAt: { gte: range.since },
            ...(requestedDepartmentId
              ? {
                  conversation: {
                    departmentId: requestedDepartmentId,
                  },
                }
              : {}),
          },
          select: {
            conversationId: true,
            firstResponseTimeSec: true,
            totalResponseTimeSec: true,
            responseCount: true,
            avgResponseTimeSec: true,
            resolutionTimeSec: true,
            conversation: {
              select: {
                waId: true,
                departmentId: true,
              },
            },
          },
        });
        const waIds = Array.from(new Set(metrics.map((item) => item.conversation.waId)));
        const runtimeStates = waIds.length
          ? await prisma.conversationRuntimeState.findMany({
              where: {
                clientId: client.id,
                waId: { in: waIds },
              },
              select: {
                waId: true,
                assignedUserId: true,
                assignments: {
                  select: {
                    toUserId: true,
                  },
                },
              },
            })
          : [];
        const slaConfig = await prisma.sLAConfig.findUnique({
          where: { clientId: client.id },
          select: {
            firstResponseLimitSec: true,
            resolutionTimeLimitSec: true,
          },
        });
        const departmentIds = Array.from(
          new Set(
            metrics
              .map((item) => item.conversation.departmentId ?? null)
              .filter((value): value is string => typeof value === "string" && value.length > 0)
          )
        );
        const departments = departmentIds.length
          ? await prisma.department.findMany({
              where: {
                clientId: client.id,
                id: { in: departmentIds },
              },
              select: {
                id: true,
                name: true,
              },
            })
          : [];
        const departmentNameById = new Map(departments.map((item) => [item.id, item.name]));
        const stateByWaId = buildReportRuntimeStateMap(runtimeStates);
        const filteredMetrics = requestedUserId
          ? metrics.filter(
              (item) => stateByWaId.get(item.conversation.waId)?.assignedUserIds.includes(requestedUserId)
            )
          : metrics;
        const totalConversations = filteredMetrics.length;
        const firstResponseValues = filteredMetrics
          .map((item) => item.firstResponseTimeSec)
          .filter((value): value is number => typeof value === "number");
        const resolutionValues = filteredMetrics
          .map((item) => item.resolutionTimeSec)
          .filter((value): value is number => typeof value === "number");
        const avgFirstResponseTimeSec =
          firstResponseValues.length > 0
            ? Math.round(firstResponseValues.reduce((sum, value) => sum + value, 0) / firstResponseValues.length)
            : null;
        const avgResolutionTimeSec =
          resolutionValues.length > 0
            ? Math.round(resolutionValues.reduce((sum, value) => sum + value, 0) / resolutionValues.length)
            : null;
        const firstResponseLimitSec =
          slaConfig && slaConfig.firstResponseLimitSec > 0 ? slaConfig.firstResponseLimitSec : null;
        const resolutionTimeLimitSec =
          slaConfig && slaConfig.resolutionTimeLimitSec > 0 ? slaConfig.resolutionTimeLimitSec : null;
        const slaBreaches = filteredMetrics.reduce((count, item) => {
          const firstResponseBreached =
            firstResponseLimitSec !== null &&
            item.firstResponseTimeSec !== null &&
            item.firstResponseTimeSec > firstResponseLimitSec;
          const resolutionBreached =
            resolutionTimeLimitSec !== null &&
            item.resolutionTimeSec !== null &&
            item.resolutionTimeSec > resolutionTimeLimitSec;
          return count + (firstResponseBreached || resolutionBreached ? 1 : 0);
        }, 0);

        const byAgentMap = new Map<
          string,
          { userId: string; conversations: number; totalResponseTimeSec: number; responseCount: number }
        >();
        for (const item of filteredMetrics) {
          const assignedUserIds = stateByWaId.get(item.conversation.waId)?.assignedUserIds ?? [];
          for (const assignedUserId of assignedUserIds) {
            const current = byAgentMap.get(assignedUserId) ?? {
              userId: assignedUserId,
              conversations: 0,
              totalResponseTimeSec: 0,
              responseCount: 0,
            };
            current.conversations += 1;
            current.totalResponseTimeSec += item.totalResponseTimeSec ?? 0;
            current.responseCount += item.responseCount ?? 0;
            byAgentMap.set(assignedUserId, current);
          }
        }
        const byDepartmentMap = new Map<
          string,
          {
            departmentId: string | null;
            departmentName: string | null;
            conversations: number;
            totalResponseTimeSec: number;
            responseCount: number;
          }
        >();
        for (const item of filteredMetrics) {
          const departmentId = item.conversation.departmentId ?? null;
          const key = departmentId ?? "__none__";
          const current = byDepartmentMap.get(key) ?? {
            departmentId,
            departmentName: departmentId ? departmentNameById.get(departmentId) ?? null : null,
            conversations: 0,
            totalResponseTimeSec: 0,
            responseCount: 0,
          };
          current.conversations += 1;
          current.totalResponseTimeSec += item.totalResponseTimeSec ?? 0;
          current.responseCount += item.responseCount ?? 0;
          byDepartmentMap.set(key, current);
        }

        json(res, 200, {
          ok: true,
          range: range.key,
          userId: requestedUserId || null,
          departmentId: requestedDepartmentId || null,
          totalConversations,
          avgFirstResponseTimeSec,
          avgResolutionTimeSec,
          slaBreaches,
          byAgent: Array.from(byAgentMap.values()).map((item) => ({
            userId: item.userId,
            conversations: item.conversations,
            avgResponseTimeSec:
              item.responseCount > 0 ? Math.round(item.totalResponseTimeSec / item.responseCount) : null,
          })),
          byDepartment: Array.from(byDepartmentMap.values()).map((item) => ({
            departmentId: item.departmentId,
            departmentName: item.departmentName,
            conversations: item.conversations,
            avgResponseTimeSec:
              item.responseCount > 0 ? Math.round(item.totalResponseTimeSec / item.responseCount) : null,
          })),
        });
      } catch (error) {
        logger.error({
          event: "admin.reports.conversations.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/reports/conversations/export") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const range = parseConversationReportRange(query.range);
        if (!range) {
          json(res, 400, httpError("invalid_range", "Invalid range"));
          return;
        }
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const requestedUserId = typeof query.userId === "string" ? query.userId.trim() : "";
        const requestedDepartmentId =
          typeof query.departmentId === "string" ? query.departmentId.trim() : "";
        if (requestedDepartmentId) {
          const department = await prisma.department.findFirst({
            where: {
              id: requestedDepartmentId,
              clientId: client.id,
            },
            select: { id: true },
          });
          if (!department) {
            json(res, 404, httpError("department_not_found", "Department not found"));
            return;
          }
        }
        const metrics = await prisma.conversationMetrics.findMany({
          where: {
            clientId: client.id,
            startedAt: { gte: range.since },
            ...(requestedDepartmentId
              ? {
                  conversation: {
                    departmentId: requestedDepartmentId,
                  },
                }
              : {}),
          },
          orderBy: { startedAt: "desc" },
          select: {
            conversationId: true,
            firstResponseTimeSec: true,
            resolutionTimeSec: true,
            startedAt: true,
            closedAt: true,
            conversation: {
              select: {
                waId: true,
                departmentId: true,
              },
            },
          },
        });
        const waIds = Array.from(new Set(metrics.map((item) => item.conversation.waId)));
        const runtimeStates = waIds.length
          ? await prisma.conversationRuntimeState.findMany({
              where: {
                clientId: client.id,
                waId: { in: waIds },
              },
              select: {
                waId: true,
                assignedUserId: true,
                status: true,
                assignments: {
                  select: {
                    toUserId: true,
                  },
                },
              },
            })
          : [];
        const departmentIds = Array.from(
          new Set(
            metrics
              .map((item) => item.conversation.departmentId ?? null)
              .filter((value): value is string => typeof value === "string" && value.length > 0)
          )
        );
        const departments = departmentIds.length
          ? await prisma.department.findMany({
              where: {
                clientId: client.id,
                id: { in: departmentIds },
              },
              select: {
                id: true,
                name: true,
              },
            })
          : [];
        const departmentNameById = new Map(departments.map((item) => [item.id, item.name]));
        const stateByWaId = buildReportRuntimeStateMap(runtimeStates);
        const filteredMetrics = requestedUserId
          ? metrics.filter(
              (item) => stateByWaId.get(item.conversation.waId)?.assignedUserIds.includes(requestedUserId)
            )
          : metrics;
        const lines = [
          [
            "conversationId",
            "waId",
            "departmentId",
            "departmentName",
            "assignedUserId",
            "status",
            "firstResponseTimeSec",
            "resolutionTimeSec",
            "createdAt",
            "closedAt",
          ].join(","),
          ...filteredMetrics.map((item) => {
            const runtimeState = stateByWaId.get(item.conversation.waId);
            const departmentId = item.conversation.departmentId ?? null;
            return [
              csvCell(item.conversationId),
              csvCell(item.conversation.waId),
              csvCell(departmentId),
              csvCell(departmentId ? departmentNameById.get(departmentId) ?? null : null),
              csvCell(runtimeState?.assignedUserIds.length ? runtimeState.assignedUserIds.join("|") : null),
              csvCell(runtimeState?.status ?? (item.closedAt ? "CLOSED" : null)),
              csvCell(item.firstResponseTimeSec),
              csvCell(item.resolutionTimeSec),
              csvCell(item.startedAt.toISOString()),
              csvCell(item.closedAt ? item.closedAt.toISOString() : null),
            ].join(",");
          }),
        ];
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"conversation-report-${clientKey}-${range.key}.csv\"`,
        });
        res.end(lines.join("\n"));
      } catch (error) {
        logger.error({
          event: "admin.reports.conversations_export.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/departments") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const includeInactive = parsedUrl.searchParams.get("includeInactive") === "true";
        const client = await prisma.client.findUnique({
          where: { clientKey },
          select: { id: true },
        });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const departments = await prisma.department.findMany({
          where: {
            clientId: client.id,
            ...(includeInactive ? {} : { isActive: true }),
            ...LEGACY_OPERATIONAL_DEPARTMENT_FILTER,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            createdAt: true,
          },
        });
        json(res, 200, {
          ok: true,
          count: departments.length,
          items: departments,
        });
      } catch (error) {
        logger.error({
          event: "admin.departments.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/departments") {
      try {
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
        const body = await readJsonBody(req, res);
        if (!body) return;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
          json(res, 400, httpError("bad_request", "Department name is required"));
          return;
        }
        const slug = normalizeDepartmentSlug(name);
        const existingBySlug = await prisma.department.findFirst({
          where: {
            clientId: client.id,
            slug,
          },
          select: { id: true },
        });
        if (existingBySlug) {
          json(
            res,
            409,
            httpError("department_slug_conflict", "Department slug already exists for this tenant")
          );
          return;
        }
        const department = await prisma.department.create({
          data: {
            clientId: client.id,
            name,
            slug,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            createdAt: true,
          },
        });
        logger.info({
          event: "department.created",
          requestId,
          clientId: client.id,
          departmentId: department.id,
          isActive: department.isActive,
        });
        json(res, 200, { ok: true, department });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          json(
            res,
            409,
            httpError("department_slug_conflict", "Department slug already exists for this tenant")
          );
          return;
        }
        logger.error({
          event: "admin.departments.create.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      req.method === "PATCH" &&
      pathname.startsWith("/admin/departments/") &&
      pathname.split("/").length === 4
    ) {
      try {
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
        const departmentId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!departmentId) {
          json(res, 400, httpError("bad_request", "Department id is required"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const hasName = typeof body.name === "string";
        const hasActive = typeof body.isActive === "boolean";
        if (!hasName && !hasActive) {
          json(res, 400, httpError("bad_request", "Provide name and/or isActive"));
          return;
        }
        const name = hasName ? String(body.name ?? "").trim() : undefined;
        if (hasName && !name) {
          json(res, 400, httpError("bad_request", "Department name is required"));
          return;
        }
        const existing = await prisma.department.findFirst({
          where: {
            id: departmentId,
            clientId: client.id,
          },
          select: { id: true, isActive: true, slug: true },
        });
        if (!existing) {
          json(res, 404, httpError("department_not_found", "Department not found"));
          return;
        }
        const slug = hasName ? normalizeDepartmentSlug(name as string) : existing.slug;
        if (hasName && slug !== existing.slug) {
          const conflictingDepartment = await prisma.department.findFirst({
            where: {
              clientId: client.id,
              slug,
              NOT: { id: existing.id },
            },
            select: { id: true },
          });
          if (conflictingDepartment) {
            json(
              res,
              409,
              httpError("department_slug_conflict", "Department slug already exists for this tenant")
            );
            return;
          }
        }
        const department = await prisma.department.update({
          where: { id: existing.id },
          data: {
            ...(hasName ? { name } : {}),
            ...(hasName ? { slug } : {}),
            ...(hasActive ? { isActive: Boolean(body.isActive) } : {}),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            createdAt: true,
          },
        });
        if (hasActive && existing.isActive !== department.isActive) {
          logger.info({
            event: "department.toggled",
            requestId,
            clientId: client.id,
            departmentId: department.id,
            isActive: department.isActive,
          });
        }
        json(res, 200, { ok: true, department });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          json(
            res,
            409,
            httpError("department_slug_conflict", "Department slug already exists for this tenant")
          );
          return;
        }
        logger.error({
          event: "admin.departments.update.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname.startsWith("/admin/departments/") &&
      pathname.split("/").length === 5 &&
      pathname.split("/")[4] === "consolidate"
    ) {
      try {
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
        const sourceDepartmentId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
        if (!sourceDepartmentId) {
          json(res, 400, httpError("bad_request", "Department id is required"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const targetDepartmentId =
          typeof body.targetDepartmentId === "string" ? body.targetDepartmentId.trim() : "";
        if (!targetDepartmentId) {
          json(res, 400, httpError("bad_request", "targetDepartmentId is required"));
          return;
        }
        if (sourceDepartmentId === targetDepartmentId) {
          json(
            res,
            400,
            httpError("bad_request", "Source and target departments must be different")
          );
          return;
        }
        const [sourceDepartment, targetDepartment] = await Promise.all([
          prisma.department.findFirst({
            where: {
              id: sourceDepartmentId,
              clientId: client.id,
            },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          }),
          prisma.department.findFirst({
            where: {
              id: targetDepartmentId,
              clientId: client.id,
            },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          }),
        ]);
        if (!sourceDepartment) {
          json(res, 404, httpError("department_not_found", "Department not found"));
          return;
        }
        if (!targetDepartment) {
          json(
            res,
            404,
            httpError("target_department_not_found", "Target department not found")
          );
          return;
        }
        if (!targetDepartment.isActive) {
          json(
            res,
            409,
            httpError("target_department_inactive", "Target department must be active")
          );
          return;
        }
        logger.info({
          event: "department.consolidation.started",
          requestId,
          clientId: client.id,
          sourceDepartmentId: sourceDepartment.id,
          targetDepartmentId: targetDepartment.id,
        });
        const consolidation = await prisma.$transaction(async (tx) => {
          const [sourceQueues, targetQueues] = await Promise.all([
            tx.queue.findMany({
              where: {
                clientId: client.id,
                departmentId: sourceDepartment.id,
              },
              select: { id: true, name: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            }),
            tx.queue.findMany({
              where: {
                clientId: client.id,
                departmentId: targetDepartment.id,
              },
              select: { id: true, name: true },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            }),
          ]);

          const targetQueueByName = new Map(
            targetQueues.map((queue) => [queue.name.toLocaleLowerCase("pt-BR"), queue])
          );
          let queuesMoved = 0;
          let queuesMerged = 0;
          let runtimeStatesRequeued = 0;

          for (const sourceQueue of sourceQueues) {
            const targetQueue = targetQueueByName.get(
              sourceQueue.name.toLocaleLowerCase("pt-BR")
            );
            if (targetQueue) {
              const reassigned = await tx.conversationRuntimeState.updateMany({
                where: {
                  clientId: client.id,
                  queueId: sourceQueue.id,
                },
                data: {
                  queueId: targetQueue.id,
                  departmentId: targetDepartment.id,
                },
              });
              runtimeStatesRequeued += reassigned.count;
              queuesMerged += 1;
              continue;
            }

            await tx.queue.update({
              where: { id: sourceQueue.id },
              data: { departmentId: targetDepartment.id },
            });
            targetQueueByName.set(sourceQueue.name.toLocaleLowerCase("pt-BR"), sourceQueue);
            queuesMoved += 1;
          }

          const [users, conversations, runtimeStates] = await Promise.all([
            tx.user.updateMany({
              where: {
                clientId: client.id,
                departmentId: sourceDepartment.id,
              },
              data: { departmentId: targetDepartment.id },
            }),
            tx.conversation.updateMany({
              where: {
                clientId: client.id,
                departmentId: sourceDepartment.id,
              },
              data: { departmentId: targetDepartment.id },
            }),
            tx.conversationRuntimeState.updateMany({
              where: {
                clientId: client.id,
                departmentId: sourceDepartment.id,
              },
              data: { departmentId: targetDepartment.id },
            }),
          ]);

          const updatedSourceDepartment = await tx.department.update({
            where: { id: sourceDepartment.id },
            data: { isActive: false },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              createdAt: true,
            },
          });

          const refreshedTargetDepartment = await tx.department.findUniqueOrThrow({
            where: { id: targetDepartment.id },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              createdAt: true,
            },
          });

          return {
            sourceDepartment: updatedSourceDepartment,
            targetDepartment: refreshedTargetDepartment,
            counts: {
              usersMoved: users.count,
              conversationsMoved: conversations.count,
              runtimeStatesMoved: runtimeStates.count,
              queuesMoved,
              queuesMerged,
              runtimeStatesRequeued,
            },
          };
        });

        logger.info({
          event: "department.consolidation.completed",
          requestId,
          clientId: client.id,
          sourceDepartmentId: sourceDepartment.id,
          targetDepartmentId: targetDepartment.id,
          ...consolidation.counts,
        });
        json(res, 200, {
          ok: true,
          sourceDepartment: consolidation.sourceDepartment,
          targetDepartment: consolidation.targetDepartment,
          counts: consolidation.counts,
        });
      } catch (error) {
        logger.error({
          event: "department.consolidation.failed",
          requestId,
          message: (error as Error).message,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/chatbot/flows") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const items = await prisma.chatbotFlow.findMany({
          where: { clientId: client.id },
          orderBy: [{ entryPoint: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            clientId: true,
            name: true,
            isActive: true,
            entryPoint: true,
            definition: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        json(res, 200, { ok: true, count: items.length, items });
      } catch (error) {
        logger.error({
          event: "admin.chatbot.flows.list.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/admin/chatbot/settings") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const tenants = await getTenants();
        const tenant = tenants[clientKey];
        if (!tenant) {
          json(res, 404, httpError("tenant_not_found", "Tenant not found"));
          return;
        }
        json(res, 200, {
          ok: true,
          tenantId: clientKey,
          settings: {
            disableAutoReply: tenant.disableAutoReply ?? false,
            disableChatbot: Boolean(tenant.disableChatbot),
            disableAiFallback: Boolean(tenant.disableAiFallback),
            disableIntentClassifier: Boolean(tenant.disableIntentClassifier),
            disableLegacyFlows: tenant.disableLegacyFlows !== false,
            disableChatbotFlowEditing: Boolean(tenant.disableChatbotFlowEditing),
            aiAssistantEnabled: tenant.aiAssistantEnabled === true,
            aiAssistantMaxReplies: tenant.aiAssistantMaxReplies ?? 2,
            aiAssistantProfile: tenant.aiAssistantProfile ?? "business",
            aiAssistantSystemPrompt: tenant.aiAssistantSystemPrompt ?? "",
            aiAssistantFallbackToHandoff: tenant.aiAssistantFallbackToHandoff === true,
            aiAssistantAllowedTopics: tenant.aiAssistantAllowedTopics ?? [],
            aiAssistantSecondaryTopics: tenant.aiAssistantSecondaryTopics ?? [],
            aiAssistantBlockedTerms: tenant.aiAssistantBlockedTerms ?? [],
            aiAssistantHandoffKeywords: tenant.aiAssistantHandoffKeywords ?? [],
            aiAssistantFallbackMessage: tenant.aiAssistantFallbackMessage ?? "",
            aiAssistantHandoffPrompt: tenant.aiAssistantHandoffPrompt ?? "",
            aiAssistantGlobalSafety: getAiAssistantGlobalSafetyConfig(),
            aiAssistantConfigurationStatus: getAiAssistantConfigurationStatus(tenant),
            aiBusinessContext: tenant.aiBusinessContext ?? "",
            aiConfigured: isAiAssistantConfigured(tenant),
            chatbotLocked: false,
            flowEditingLocked: Boolean(tenant.disableChatbotFlowEditing),
            aiLocked: false,
            aiAssistantLocked: !env.AI_ASSISTANT_ENABLED || !env.WHATSAPP_AI_ENABLED,
            intentClassifierLocked: !env.FLOW_INTENT_CLASSIFIER_ENABLED,
            followUpEnabled: tenant.followUpEnabled === true,
            followUpDelayMinutes: tenant.followUpDelayMinutes ?? env.FOLLOWUP_DEFAULT_DELAY_MINUTES,
            followUpMaxCount: tenant.followUpMaxCount ?? env.FOLLOWUP_MAX_PER_CONVERSATION,
            followUpUseTemplate: tenant.followUpUseTemplate === true,
            followUpTemplateName: tenant.followUpTemplateName ?? "",
            followUpTemplateLang:
              tenant.followUpTemplateLang ?? tenant.defaultLanguage ?? env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
          },
        });
      } catch (error) {
        logger.error({
          event: "admin.chatbot.settings.get.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "PUT" && pathname === "/admin/chatbot/settings") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const data = body as Record<string, unknown>;
        const keys = [
          "disableChatbot",
          "disableAiFallback",
          "disableIntentClassifier",
          "disableLegacyFlows",
          "disableChatbotFlowEditing",
        ] as const;
        const payload: Record<string, boolean> = {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            if (typeof data[key] !== "boolean") {
              json(res, 400, httpError("bad_request", `${key} must be boolean`));
              return;
            }
            payload[key] = data[key] as boolean;
          }
        }
        const followUpPatch: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(data, "followUpEnabled")) {
          if (typeof data.followUpEnabled !== "boolean") {
            json(res, 400, httpError("bad_request", "followUpEnabled must be boolean"));
            return;
          }
          followUpPatch.followUpEnabled = data.followUpEnabled;
        }
        if (Object.prototype.hasOwnProperty.call(data, "followUpUseTemplate")) {
          if (typeof data.followUpUseTemplate !== "boolean") {
            json(res, 400, httpError("bad_request", "followUpUseTemplate must be boolean"));
            return;
          }
          followUpPatch.followUpUseTemplate = data.followUpUseTemplate;
        }
        if (Object.prototype.hasOwnProperty.call(data, "followUpDelayMinutes")) {
          if (
            typeof data.followUpDelayMinutes !== "number" ||
            !Number.isFinite(data.followUpDelayMinutes) ||
            data.followUpDelayMinutes < 1
          ) {
            json(res, 400, httpError("bad_request", "followUpDelayMinutes must be a positive number"));
            return;
          }
          followUpPatch.followUpDelayMinutes = Math.floor(data.followUpDelayMinutes);
        }
        if (Object.prototype.hasOwnProperty.call(data, "followUpMaxCount")) {
          if (
            typeof data.followUpMaxCount !== "number" ||
            !Number.isInteger(data.followUpMaxCount) ||
            data.followUpMaxCount < 0
          ) {
            json(res, 400, httpError("bad_request", "followUpMaxCount must be a non-negative integer"));
            return;
          }
          followUpPatch.followUpMaxCount = data.followUpMaxCount;
        }
        if (Object.prototype.hasOwnProperty.call(data, "followUpTemplateName")) {
          if (typeof data.followUpTemplateName !== "string") {
            json(res, 400, httpError("bad_request", "followUpTemplateName must be string"));
            return;
          }
          const templateName = data.followUpTemplateName.trim();
          if (templateName && !/^[a-z0-9_]+$/.test(templateName)) {
            json(res, 400, httpError("bad_request", "followUpTemplateName must use lowercase letters, numbers and underscore"));
            return;
          }
          followUpPatch.followUpTemplateName = templateName || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(data, "followUpTemplateLang")) {
          if (typeof data.followUpTemplateLang !== "string") {
            json(res, 400, httpError("bad_request", "followUpTemplateLang must be string"));
            return;
          }
          const templateLang = data.followUpTemplateLang.trim();
          if (templateLang && !/^[a-z]{2}_[A-Z]{2}$/.test(templateLang)) {
            json(res, 400, httpError("bad_request", "followUpTemplateLang must use format pt_BR"));
            return;
          }
          followUpPatch.followUpTemplateLang = templateLang || undefined;
        }
        const aiAssistantPatch: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantEnabled")) {
          if (typeof data.aiAssistantEnabled !== "boolean") {
            json(res, 400, httpError("bad_request", "aiAssistantEnabled must be boolean"));
            return;
          }
          aiAssistantPatch.aiAssistantEnabled = data.aiAssistantEnabled;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantFallbackToHandoff")) {
          if (typeof data.aiAssistantFallbackToHandoff !== "boolean") {
            json(res, 400, httpError("bad_request", "aiAssistantFallbackToHandoff must be boolean"));
            return;
          }
          aiAssistantPatch.aiAssistantFallbackToHandoff = data.aiAssistantFallbackToHandoff;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantMaxReplies")) {
          if (
            typeof data.aiAssistantMaxReplies !== "number" ||
            !Number.isInteger(data.aiAssistantMaxReplies) ||
            data.aiAssistantMaxReplies < 0
          ) {
            json(res, 400, httpError("bad_request", "aiAssistantMaxReplies must be a non-negative integer"));
            return;
          }
          aiAssistantPatch.aiAssistantMaxReplies = data.aiAssistantMaxReplies;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantProfile")) {
          if (
            data.aiAssistantProfile !== "business" &&
            data.aiAssistantProfile !== "government" &&
            data.aiAssistantProfile !== "legal_previdenciario"
          ) {
            json(res, 400, httpError("bad_request", "aiAssistantProfile is invalid"));
            return;
          }
          aiAssistantPatch.aiAssistantProfile = data.aiAssistantProfile;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantSystemPrompt")) {
          if (typeof data.aiAssistantSystemPrompt !== "string") {
            json(res, 400, httpError("bad_request", "aiAssistantSystemPrompt must be string"));
            return;
          }
          aiAssistantPatch.aiAssistantSystemPrompt = data.aiAssistantSystemPrompt.trim() || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantAllowedTopics")) {
          const terms = normalizeAiAssistantTermList(data.aiAssistantAllowedTopics);
          if (!terms) {
            json(res, 400, httpError("bad_request", "aiAssistantAllowedTopics must be an array of strings"));
            return;
          }
          aiAssistantPatch.aiAssistantAllowedTopics = terms;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantSecondaryTopics")) {
          const terms = normalizeAiAssistantTermList(data.aiAssistantSecondaryTopics);
          if (!terms) {
            json(res, 400, httpError("bad_request", "aiAssistantSecondaryTopics must be an array of strings"));
            return;
          }
          aiAssistantPatch.aiAssistantSecondaryTopics = terms;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantBlockedTerms")) {
          const terms = normalizeAiAssistantTermList(data.aiAssistantBlockedTerms);
          if (!terms) {
            json(res, 400, httpError("bad_request", "aiAssistantBlockedTerms must be an array of strings"));
            return;
          }
          aiAssistantPatch.aiAssistantBlockedTerms = terms;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantHandoffKeywords")) {
          const terms = normalizeAiAssistantTermList(data.aiAssistantHandoffKeywords);
          if (!terms) {
            json(res, 400, httpError("bad_request", "aiAssistantHandoffKeywords must be an array of strings"));
            return;
          }
          aiAssistantPatch.aiAssistantHandoffKeywords = terms;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantFallbackMessage")) {
          if (typeof data.aiAssistantFallbackMessage !== "string") {
            json(res, 400, httpError("bad_request", "aiAssistantFallbackMessage must be string"));
            return;
          }
          aiAssistantPatch.aiAssistantFallbackMessage =
            data.aiAssistantFallbackMessage.trim() || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiAssistantHandoffPrompt")) {
          if (typeof data.aiAssistantHandoffPrompt !== "string") {
            json(res, 400, httpError("bad_request", "aiAssistantHandoffPrompt must be string"));
            return;
          }
          aiAssistantPatch.aiAssistantHandoffPrompt =
            data.aiAssistantHandoffPrompt.trim() || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(data, "aiBusinessContext")) {
          if (typeof data.aiBusinessContext !== "string") {
            json(res, 400, httpError("bad_request", "aiBusinessContext must be string"));
            return;
          }
          aiAssistantPatch.aiBusinessContext = data.aiBusinessContext.trim() || undefined;
        }
        if (Object.prototype.hasOwnProperty.call(data, "disableAiFallback")) {
          if (typeof data.disableAiFallback !== "boolean") {
            json(res, 400, httpError("bad_request", "disableAiFallback must be boolean"));
            return;
          }
          aiAssistantPatch.disableAiFallback = data.disableAiFallback;
        }
        const presetApplied =
          typeof data.aiAssistantPresetApplied === "string"
            ? data.aiAssistantPresetApplied.trim().slice(0, 40)
            : null;
        if (
          Object.keys(payload).length === 0 &&
          Object.keys(followUpPatch).length === 0 &&
          Object.keys(aiAssistantPatch).length === 0
        ) {
          json(
            res,
            400,
            httpError(
              "bad_request",
              "Provide at least one of disableChatbot, disableAiFallback or disableIntentClassifier"
            )
          );
          return;
        }
        const tenants = await getTenants();
        const tenant = tenants[clientKey];
        if (!tenant) {
          json(res, 404, httpError("tenant_not_found", "Tenant not found"));
          return;
        }
        const proposedTenant = {
          ...tenant,
          ...payload,
          ...followUpPatch,
          ...aiAssistantPatch,
        };
        const proposedAiStatus = getAiAssistantConfigurationStatus(proposedTenant);
        if (aiAssistantPatch.aiAssistantEnabled === true && !proposedAiStatus.ready) {
          logger.warn({
            event: "ai.assistant.config_incomplete",
            requestId,
            clientId: client.id,
            clientKey,
            missing: proposedAiStatus.missing,
            warnings: proposedAiStatus.warnings,
            score: proposedAiStatus.score,
            reason: "activation_blocked",
          });
          json(
            res,
            409,
            httpError(
              "ai_assistant_config_incomplete",
              `IA supervisionada ainda não está pronta: ${proposedAiStatus.missing.join(", ")}`
            )
          );
          return;
        }
        if (payload.disableIntentClassifier === false && !env.FLOW_INTENT_CLASSIFIER_ENABLED) {
          json(
            res,
            409,
            httpError(
              "intent_classifier_globally_disabled",
              "Classificacao por mensagem livre esta desativada no ambiente."
            )
          );
          return;
        }
        const saved = await saveTenantPatch(clientKey, {
          ...(payload.disableChatbot !== undefined
            ? { disableChatbot: payload.disableChatbot }
            : {}),
          ...(payload.disableAiFallback !== undefined
            ? { disableAiFallback: payload.disableAiFallback }
            : {}),
          ...(payload.disableIntentClassifier !== undefined
            ? { disableIntentClassifier: payload.disableIntentClassifier }
            : {}),
          ...(payload.disableLegacyFlows !== undefined
            ? { disableLegacyFlows: payload.disableLegacyFlows }
            : {}),
          ...(payload.disableChatbotFlowEditing !== undefined
            ? { disableChatbotFlowEditing: payload.disableChatbotFlowEditing }
            : {}),
          ...followUpPatch,
          ...aiAssistantPatch,
        });
        logger.info({
          event: "admin.chatbot.settings.updated",
          requestId,
          clientId: client.id,
          clientKey,
          fieldsChanged: saved.fieldsChanged,
        });
        const savedAiStatus = getAiAssistantConfigurationStatus(saved.tenant);
        logger.info({
          event: savedAiStatus.ready ? "ai.assistant.config_ready" : "ai.assistant.config_incomplete",
          requestId,
          clientId: client.id,
          clientKey,
          missing: savedAiStatus.missing,
          warnings: savedAiStatus.warnings,
          score: savedAiStatus.score,
        });
        if (presetApplied) {
          logger.info({
            event: "ai.assistant.preset_applied",
            requestId,
            clientId: client.id,
            clientKey,
            preset: presetApplied,
            score: savedAiStatus.score,
          });
        }
        json(res, 200, {
          ok: true,
          tenantId: clientKey,
          fieldsChanged: saved.fieldsChanged,
          settings: {
            disableAutoReply: Boolean(saved.tenant.disableAutoReply),
            disableChatbot: Boolean(saved.tenant.disableChatbot),
            disableAiFallback: Boolean(saved.tenant.disableAiFallback),
            disableIntentClassifier: Boolean(saved.tenant.disableIntentClassifier),
            disableLegacyFlows: saved.tenant.disableLegacyFlows !== false,
            disableChatbotFlowEditing: Boolean(saved.tenant.disableChatbotFlowEditing),
            aiAssistantEnabled: saved.tenant.aiAssistantEnabled === true,
            aiAssistantMaxReplies: saved.tenant.aiAssistantMaxReplies ?? 2,
            aiAssistantProfile: saved.tenant.aiAssistantProfile ?? "business",
            aiAssistantSystemPrompt: saved.tenant.aiAssistantSystemPrompt ?? "",
            aiAssistantFallbackToHandoff: saved.tenant.aiAssistantFallbackToHandoff === true,
            aiAssistantAllowedTopics: saved.tenant.aiAssistantAllowedTopics ?? [],
            aiAssistantSecondaryTopics: saved.tenant.aiAssistantSecondaryTopics ?? [],
            aiAssistantBlockedTerms: saved.tenant.aiAssistantBlockedTerms ?? [],
            aiAssistantHandoffKeywords: saved.tenant.aiAssistantHandoffKeywords ?? [],
            aiAssistantFallbackMessage: saved.tenant.aiAssistantFallbackMessage ?? "",
            aiAssistantHandoffPrompt: saved.tenant.aiAssistantHandoffPrompt ?? "",
            aiAssistantGlobalSafety: getAiAssistantGlobalSafetyConfig(),
            aiAssistantConfigurationStatus: getAiAssistantConfigurationStatus(saved.tenant),
            aiBusinessContext: saved.tenant.aiBusinessContext ?? "",
            aiConfigured: isAiAssistantConfigured(saved.tenant),
            chatbotLocked: false,
            flowEditingLocked: Boolean(saved.tenant.disableChatbotFlowEditing),
            aiLocked: false,
            aiAssistantLocked: !env.AI_ASSISTANT_ENABLED || !env.WHATSAPP_AI_ENABLED,
            intentClassifierLocked: !env.FLOW_INTENT_CLASSIFIER_ENABLED,
            followUpEnabled: saved.tenant.followUpEnabled === true,
            followUpDelayMinutes: saved.tenant.followUpDelayMinutes ?? env.FOLLOWUP_DEFAULT_DELAY_MINUTES,
            followUpMaxCount: saved.tenant.followUpMaxCount ?? env.FOLLOWUP_MAX_PER_CONVERSATION,
            followUpUseTemplate: saved.tenant.followUpUseTemplate === true,
            followUpTemplateName: saved.tenant.followUpTemplateName ?? "",
            followUpTemplateLang:
              saved.tenant.followUpTemplateLang ??
              saved.tenant.defaultLanguage ??
              env.OUTBOUND_TEMPLATE_DEFAULT_LANG,
          },
        });
      } catch (error) {
        logger.error({
          event: "admin.chatbot.settings.update.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/admin/chatbot/flows") {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const parsed = parseChatbotFlowUpsertPayload(body, {
          requireName: true,
          requireDefinition: true,
        });
        if (!parsed.ok) {
          json(res, parsed.status, httpError(parsed.code, parsed.message));
          return;
        }
        const flow = await prisma.$transaction(async (tx) => {
          if (parsed.data.entryPoint === true) {
            await tx.chatbotFlow.updateMany({
              where: { clientId: client.id },
              data: { entryPoint: false },
            });
          }
          return tx.chatbotFlow.create({
            data: {
              clientId: client.id,
              name: parsed.data.name as string,
              isActive: parsed.data.isActive ?? false,
              entryPoint: parsed.data.entryPoint ?? false,
              definition: parsed.data.definition as Prisma.InputJsonValue,
            },
            select: {
              id: true,
              clientId: true,
              name: true,
              isActive: true,
              entryPoint: true,
              definition: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        });
        logger.info({
          event: "admin.chatbot.flow.created",
          requestId,
          clientId: client.id,
          clientKey,
          flowId: flow.id,
          isActive: flow.isActive,
          entryPoint: flow.entryPoint,
        });
        json(res, 200, { ok: true, flow });
      } catch (error) {
        logger.error({
          event: "admin.chatbot.flows.create.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
      }
      return;
    }

    if (
      req.method === "PUT" &&
      pathname.startsWith("/admin/chatbot/flows/") &&
      pathname.split("/").length === 5
    ) {
      try {
        const clientKey = await getScopedClientKey();
        if (!clientKey) return;
        const client = await prisma.client.findUnique({ where: { clientKey }, select: { id: true } });
        if (!client) {
          json(res, 404, httpError("client_not_found", "Client not found"));
          return;
        }
        const flowId = decodeURIComponent(pathname.split("/")[4] ?? "").trim();
        if (!flowId) {
          json(res, 400, httpError("bad_request", "Flow id is required"));
          return;
        }
        const existing = await prisma.chatbotFlow.findFirst({
          where: { id: flowId, clientId: client.id },
          select: { id: true },
        });
        if (!existing) {
          json(res, 404, httpError("chatbot_flow_not_found", "Chatbot flow not found"));
          return;
        }
        const body = await readJsonBody(req, res);
        if (!body) return;
        const parsed = parseChatbotFlowUpsertPayload(body);
        if (!parsed.ok) {
          json(res, parsed.status, httpError(parsed.code, parsed.message));
          return;
        }
        const flow = await prisma.$transaction(async (tx) => {
          if (parsed.data.entryPoint === true) {
            await tx.chatbotFlow.updateMany({
              where: {
                clientId: client.id,
                id: { not: flowId },
              },
              data: { entryPoint: false },
            });
          }
          return tx.chatbotFlow.update({
            where: { id: flowId },
            data: {
              ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
              ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
              ...(parsed.data.entryPoint !== undefined
                ? { entryPoint: parsed.data.entryPoint }
                : {}),
              ...(parsed.data.definition !== undefined
                ? { definition: parsed.data.definition as Prisma.InputJsonValue }
                : {}),
            },
            select: {
              id: true,
              clientId: true,
              name: true,
              isActive: true,
              entryPoint: true,
              definition: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        });
        logger.info({
          event: "admin.chatbot.flow.updated",
          requestId,
          clientId: client.id,
          clientKey,
          flowId: flow.id,
          isActive: flow.isActive,
          entryPoint: flow.entryPoint,
        });
        json(res, 200, { ok: true, flow });
      } catch (error) {
        logger.error({
          event: "admin.chatbot.flows.update.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, httpError("server_error", "Server error"));
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
          cursor: null,
          filters: {
            status: null,
            departmentId: null,
            assignedUserId: null,
            unassigned: false,
            search: "",
          },
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
      /^\/admin\/conversations\/[^/]+\/assign$/.test(pathname)
    ) {
      try {
        const waId = normalizeWaId(decodeURIComponent(pathname.split("/")[3] ?? ""));
        if (!waId) {
          json(res, 400, {
            error: {
              code: "bad_request",
              message: "Informe uma conversa valida.",
            },
          });
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
        const body = await readJsonBody(req, res);
        if (!body) return;
        const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!requestedUserId) {
          json(res, 400, { error: "bad_request", message: "Informe o usuario de destino." });
          return;
        }
        const assignedUser = await prisma.user.findFirst({
          where: { id: requestedUserId, client: { clientKey }, isActive: true },
          select: { id: true, name: true, departmentId: true },
        });
        if (!assignedUser) {
          json(res, 404, { error: "user_not_found" });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversations_assign",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }
        const routing = await resolveAssignmentRouting(prisma, {
          clientId: client.id,
          assignedUserDepartmentId: assignedUser.departmentId,
          fallbackDepartmentId: conversation.departmentId ?? null,
        });
        const assignedAt = new Date().toISOString();
        const nextState = {
          ...conversation,
          mode: "HUMAN" as const,
          handoff: {
            ...conversation.handoff,
            status: "active" as const,
            activatedAt: assignedAt,
          },
          assignedUserId: assignedUser.id,
          assignedTo: `user:${assignedUser.id}`,
          assignedAt,
          departmentId: routing.departmentId,
          queueId: routing.queueId,
          status: ConversationOperationalStatus.IN_PROGRESS,
          closedAt: null,
        };
        await runtimeStorage.upsertConversation(nextState);
        await persistConversationDepartment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          departmentId: routing.departmentId,
        });
        await recordConversationAssignment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          fromUserId: conversation.assignedUserId ?? null,
          toUserId: assignedUser.id,
          assignedAt,
        });
        logger.info({
          event: "conversation.assigned",
          requestId,
          clientId: client.id,
          clientKey,
          waId: nextState.waIdCanonical ?? nextState.waId,
          assignedUserId: assignedUser.id,
          fromUserId: conversation.assignedUserId ?? null,
        });
        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
          assignedUserName: assignedUser.name,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversations.assign.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      /^\/admin\/conversations\/[^/]+\/transfer$/.test(pathname)
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
        const body = await readJsonBody(req, res);
        if (!body) return;
        const requestedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!requestedUserId) {
          json(res, 400, { error: "bad_request", message: "Informe o usuario de destino." });
          return;
        }
        const assignedUser = await prisma.user.findFirst({
          where: { id: requestedUserId, client: { clientKey }, isActive: true },
          select: { id: true, name: true, departmentId: true },
        });
        if (!assignedUser) {
          json(res, 404, { error: "user_not_found" });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversations_transfer",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }
        const routing = await resolveAssignmentRouting(prisma, {
          clientId: client.id,
          assignedUserDepartmentId: assignedUser.departmentId,
          fallbackDepartmentId: conversation.departmentId ?? null,
        });
        const assignedAt = new Date().toISOString();
        const nextState = {
          ...conversation,
          mode: "HUMAN" as const,
          handoff: {
            ...conversation.handoff,
            status: "active" as const,
            activatedAt: assignedAt,
          },
          assignedUserId: assignedUser.id,
          assignedTo: `user:${assignedUser.id}`,
          assignedAt,
          departmentId: routing.departmentId,
          queueId: routing.queueId,
          status: ConversationOperationalStatus.IN_PROGRESS,
          closedAt: null,
        };
        await runtimeStorage.upsertConversation(nextState);
        await persistConversationDepartment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          departmentId: routing.departmentId,
        });
        await recordConversationAssignment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          fromUserId: conversation.assignedUserId ?? null,
          toUserId: assignedUser.id,
          assignedAt,
        });
        logger.info({
          event: "conversation.transferred",
          requestId,
          clientId: client.id,
          clientKey,
          waId: nextState.waIdCanonical ?? nextState.waId,
          fromUserId: conversation.assignedUserId ?? null,
          toUserId: assignedUser.id,
        });
        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
          assignedUserName: assignedUser.name,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversations.transfer.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      /^\/admin\/conversations\/[^/]+\/transfer-department$/.test(pathname)
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
        const body = await readJsonBody(req, res);
        if (!body) return;
        const nextDepartmentId =
          typeof body.departmentId === "string" ? body.departmentId.trim() : "";
        if (!nextDepartmentId) {
          json(res, 400, {
            error: {
              code: "bad_request",
              message: "Informe o departmentId de destino.",
            },
          });
          return;
        }
        const department = await prisma.department.findFirst({
          where: {
            id: nextDepartmentId,
            clientId: client.id,
          },
          select: {
            id: true,
            name: true,
          },
        });
        if (!department) {
          json(res, 404, { error: "department_not_found" });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversations_transfer_department",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }

        const previousDepartmentId = conversation.departmentId ?? null;
        const queue = await ensureQueueForDepartment(prisma, {
          clientId: client.id,
          departmentId: department.id,
        });
        const nextState = {
          ...conversation,
          mode: "HUMAN" as const,
          departmentId: department.id,
          queueId: queue.id,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          status: ConversationOperationalStatus.WAITING,
          closedAt: null,
        };

        await runtimeStorage.upsertConversation(nextState);
        await persistConversationDepartment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          departmentId: department.id,
        });

        logger.info({
          event: "conversation.department.transferred",
          clientId: client.id,
          conversationId: nextState.waId,
          waId: nextState.waId,
          fromDepartmentId: previousDepartmentId,
          toDepartmentId: department.id,
          userId: resolveAssignedTo(adminAuth),
          requestId,
        });
        publishRealtimeEvent({
          type: "conversation.handoff.updated",
          clientId: client.id,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          mode: "HUMAN",
          handoffStatus:
            nextState.handoff.status === "pending" || nextState.handoff.status === "active"
              ? nextState.handoff.status
              : "active",
          assignedUserId: nextState.assignedUserId ?? null,
          departmentId: department.id,
          updatedAt: new Date().toISOString(),
        });

        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
          assignedUserName: null,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversations.transfer_department.error",
          message: (error as Error).message,
          requestId,
        });
        json(res, 500, { error: "server_error" });
      }
      return;
    }

    if (
      req.method === "POST" &&
      /^\/admin\/conversations\/[^/]+\/status$/.test(pathname)
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
        const body = await readJsonBody(req, res);
        if (!body) return;
        const nextStatus = normalizeConversationOperationalStatus(
          typeof body.status === "string" ? body.status.trim() : ""
        );
        if (!nextStatus || !CONVERSATION_OPERATIONAL_STATUS_VALUES.includes(nextStatus)) {
          json(res, 400, { error: "bad_request", message: "Status operacional invalido." });
          return;
        }
        const resolvedConversation = await resolveConversationTarget(prisma, {
          clientId: client.id,
          clientKey,
          rawWaId: waId,
          requestId,
          source: "admin_conversations_status",
        });
        const conversation = await runtimeStorage.getConversation(
          resolvedConversation.resolvedWaId,
          clientKey
        );
        if (!conversation) {
          json(res, 404, { error: "conversation_not_found" });
          return;
        }
        const defaults = await ensureDefaultDepartmentAndQueue(prisma, client.id);
        const nextState = {
          ...conversation,
          mode:
            nextStatus === ConversationOperationalStatus.CLOSED
              ? (conversation.mode ?? "HUMAN")
              : "HUMAN" as const,
          departmentId: conversation.departmentId ?? defaults.department.id,
          queueId: conversation.queueId ?? defaults.queue.id,
          status: nextStatus,
          closedAt:
            nextStatus === ConversationOperationalStatus.CLOSED
              ? new Date().toISOString()
              : null,
        };
        await runtimeStorage.upsertConversation(nextState);
        if (nextStatus === ConversationOperationalStatus.CLOSED && nextState.closedAt) {
          await recordConversationClosedMetrics({
            prisma,
            clientId: client.id,
            waId: nextState.waId,
            closedAt: new Date(nextState.closedAt),
            assignedUserId: nextState.assignedUserId ?? null,
            requestId,
          });
        }
        logger.info({
          event: "conversation.status_changed",
          requestId,
          clientId: client.id,
          clientKey,
          waId: nextState.waIdCanonical ?? nextState.waId,
          status: nextStatus,
        });
        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
        });
      } catch (error) {
        logger.error({
          event: "admin.conversations.status.error",
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
      (pathname.endsWith("/claim") || pathname.endsWith("/assign"))
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
              where: { id: requestedUserId, client: { clientKey }, isActive: true },
              select: { id: true, name: true, departmentId: true },
            })
          : null;
        if (requestedUserId && !assignedUser) {
          json(res, 404, { error: "user_not_found" });
          return;
        }
        const routing = await resolveAssignmentRouting(prisma, {
          clientId: client.id,
          assignedUserDepartmentId: assignedUser?.departmentId ?? null,
          fallbackDepartmentId: conversation.departmentId ?? null,
        });
        const previousAssignedUserId = conversation.assignedUserId ?? null;
        const nextState = {
          ...conversation,
          mode: "HUMAN" as const,
          handoff: {
            ...conversation.handoff,
            status: "active" as const,
            activatedAt: assignedAt,
          },
          assignedUserId: assignedUser?.id ?? null,
          assignedTo: assignedUser ? `user:${assignedUser.id}` : assignedTo,
          assignedAt,
          departmentId: routing.departmentId,
          queueId: routing.queueId,
          status: ConversationOperationalStatus.IN_PROGRESS,
          closedAt: null,
        };
        await runtimeStorage.upsertConversation(nextState);
        await persistConversationDepartment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          waIdCanonical: nextState.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
          departmentId: routing.departmentId,
        });
        await recordConversationAssignment(prisma, {
          clientId: client.id,
          waId: nextState.waId,
          fromUserId: previousAssignedUserId,
          toUserId: nextState.assignedUserId ?? null,
          assignedAt,
        });
        logger.info({
          event: "conversation.assigned",
          requestId,
          clientId: client.id,
          clientKey,
          waId: nextState.waIdCanonical ?? nextState.waId,
          assignedUserId: nextState.assignedUserId,
          fromUserId: previousAssignedUserId,
        });
        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
          assignedUserName: assignedUser?.name ?? null,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
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
          handoff: {
            ...conversation.handoff,
            status: "none" as const,
            releasedAt: new Date().toISOString(),
          },
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          status: ConversationOperationalStatus.WAITING,
          closedAt: null,
        };
        await runtimeStorage.upsertConversation(nextState);
        logger.info({
          event: "conversation.released",
          requestId,
          clientId: client.id,
          clientKey,
          waId: nextState.waIdCanonical ?? nextState.waId,
        });
        const payload = await buildConversationActionPayload(prisma, {
          clientId: client.id,
          clientKey,
          conversation: nextState,
          assignedUserName: null,
        });
        json(res, 200, {
          ...payload,
          waId: payload.waId ?? nextState.waId,
          waIdCanonical: payload.waIdCanonical ?? resolvedConversation.resolvedWaIdCanonical,
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
          if (result.error === "window_closed" && result.errorPayload) {
            json(res, result.statusCode, { error: result.errorPayload });
            return;
          }
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
          after: null,
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
          profile: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      json(res, 200, {
        items: clients.map((client) => ({
          ...client,
          profile: getClientProfile(client),
        })),
      });
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
        include: {
          metaConfig: true,
          phoneNumbers: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const phone = client?.phoneNumbers[0] ?? null;
      const tenantWithDisplayPhone = {
        ...tenant,
        displayPhoneNumber:
          tenant.displayPhoneNumber?.trim() ||
          extractTenantDisplayPhoneFromRawPayload(client?.metaConfig?.rawPayload) ||
          phone?.display ||
          undefined,
      };
      json(res, 200, {
        ok: true,
        tenantId,
        tenant: tenantWithDisplayPhone,
        client: client
          ? {
              id: client.id,
              clientKey: client.clientKey,
              status: client.status,
              profile: getClientProfile(client),
            }
          : null,
      });
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
      pathname.split("/").length === 5 &&
      pathname.endsWith("/bootstrap")
    ) {
      if (requireSuperadmin()) return;
      const tenantId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!tenantId) {
        json(res, 400, httpError("bad_request", "Tenant id is required"));
        return;
      }

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

      const body = await readJsonBody(req, res);
      if (body === null) return;

      try {
        const result = await bootstrapTenantDefaults(prisma, {
          clientId: client.id,
          clientKey: client.clientKey,
          requestId,
          initialUser:
            body && typeof body === "object" && !Array.isArray(body)
              ? (body as Record<string, unknown>).initialUser ?? null
              : null,
        });

        json(res, 200, {
          ok: true,
          tenantId,
          clientId: client.id,
          clientKey: client.clientKey,
          seed: result.seed,
          initialUser: result.initialUser,
          departmentCount: result.departments.length,
          firstDepartmentId: result.departments[0]?.id ?? null,
        });
      } catch (error) {
        const typed = error as Error & { status?: number; code?: string };
        if (typed.status && typed.code) {
          json(res, typed.status, httpError(typed.code, typed.message));
          return;
        }
        json(res, 500, httpError("server_error", "Server error"));
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
        const manualBusinessId = normalizeOptionalString(embeddedSignupInput?.businessId);
        const manualBusinessPortfolioId = normalizeOptionalString(
          embeddedSignupInput?.businessPortfolioId
        );
        const manualWabaId = normalizeOptionalString(embeddedSignupInput?.wabaId);
        const candidatePhoneNumberId =
          normalizeOptionalString(embeddedSignupInput?.phoneNumberId) ??
          exchange.phoneNumberId;
        const enriched =
          exchange.businessToken &&
          candidatePhoneNumberId
            ? await enrichMetaOnboardingResult({
                businessToken: exchange.businessToken,
                businessId: exchange.businessId,
                businessPortfolioId: exchange.businessPortfolioId,
                wabaId: exchange.wabaId,
                phoneNumberId: candidatePhoneNumberId,
              })
            : null;
        const finalBusinessId =
          manualBusinessId ?? enriched?.businessId ?? exchange.businessId;
        const finalBusinessPortfolioId =
          manualBusinessPortfolioId ??
          enriched?.businessPortfolioId ??
          exchange.businessPortfolioId;
        const finalWabaId =
          manualWabaId ?? enriched?.wabaId ?? exchange.wabaId;
        const finalPhoneNumberId =
          normalizeOptionalString(embeddedSignupInput?.phoneNumberId) ??
          enriched?.phoneNumberId ??
          exchange.phoneNumberId;
        const rawPayload = {
          exchange: exchange.rawPayload,
          enrich: enriched?.rawPayload ?? null,
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
        const displayPhoneNumber = extractTenantDisplayPhoneFromRawPayload(rawPayload);

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
            displayPhoneNumber,
          });
          phoneMappingAction = syncResult.action;
          tenantUpdate = await saveTenantPatch(tenantId, {
            metaPhoneNumberId: finalPhoneNumberId,
            ...(displayPhoneNumber ? { displayPhoneNumber } : {}),
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
          partialMetaConfig: Boolean(exchange.businessToken) && !finalWabaId,
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
          warning:
            Boolean(exchange.businessToken) && !finalWabaId
              ? "Conexao parcial: token salvo, mas WABA ID nao foi resolvido automaticamente. Informe o WABA ID para habilitar templates self-service."
              : null,
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
      req.method === "POST" &&
      pathname.startsWith("/admin/tenants/") &&
      pathname.split("/").length === 6 &&
      pathname.endsWith("/onboarding/manual-bind")
    ) {
      if (requireSuperadmin()) return;
      const tenantId = decodeURIComponent(pathname.split("/")[3] ?? "").trim();
      if (!tenantId) {
        json(res, 400, httpError("bad_request", "Tenant id is required"));
        return;
      }
      const body = await readJsonBody(req, res);
      if (!body) return;

      const phoneNumberId = normalizeOptionalString(body.phoneNumberId);
      if (!phoneNumberId) {
        json(res, 400, httpError("bad_request", "phoneNumberId is required"));
        return;
      }

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

      try {
        const displayPhoneNumber = normalizeOptionalString(body.displayPhoneNumber);
        const businessId = normalizeOptionalString(body.businessId);
        const businessPortfolioId = normalizeOptionalString(body.businessPortfolioId);
        const wabaId = normalizeOptionalString(body.wabaId);
        const rawPayload = {
          source: "manual_bind_connected_number",
          phoneNumberId,
          displayPhoneNumber,
          businessId,
          businessPortfolioId,
          wabaId,
          raw:
            body.raw && typeof body.raw === "object" && !Array.isArray(body.raw)
              ? body.raw
              : null,
        };

        await prisma.tenantMetaConfig.upsert({
          where: { clientId: client.id },
          update: {
            businessId: businessId ?? undefined,
            businessPortfolioId: businessPortfolioId ?? undefined,
            wabaId: wabaId ?? undefined,
            phoneNumberId,
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
          create: {
            clientId: client.id,
            businessId: businessId ?? undefined,
            businessPortfolioId: businessPortfolioId ?? undefined,
            wabaId: wabaId ?? undefined,
            phoneNumberId,
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
        });

        const syncResult = await syncTenantPhoneNumberMapping({
          clientId: client.id,
          phoneNumberId,
          displayPhoneNumber,
        });
        const tenantUpdate = await saveTenantPatch(tenantId, {
          metaPhoneNumberId: phoneNumberId,
          ...(displayPhoneNumber ? { displayPhoneNumber } : {}),
        });

        logger.info({
          event: "onboarding.manual_bind.success",
          tenantId,
          clientKey: client.clientKey,
          requestId,
          phoneNumberId,
          wabaId,
          businessId,
          businessPortfolioId,
          phoneMappingAction: syncResult.action,
          fieldsChanged: tenantUpdate.fieldsChanged,
        });

        json(res, 200, {
          success: true,
          businessTokenStored: false,
          phoneNumberId,
          wabaId,
          businessId,
          businessPortfolioId,
          phoneMappingAction: syncResult.action,
          warning:
            "Numero vinculado manualmente. O envio usara o token global se este numero pertencer ao portfolio/token da operacao.",
        });
      } catch (error) {
        logger.error({
          event: "onboarding.manual_bind.failed",
          tenantId,
          requestId,
          message: (error as Error).message,
        });
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
        const rawBody = body as Record<string, unknown>;
        const requestedProfile =
          "profile" in rawBody ? parseClientProfile(rawBody.profile) : undefined;
        const { profile: _profile, ...tenantPatch } = rawBody;
        const saved = await saveTenantPatch(tenantId, tenantPatch);
        const clientFieldsChanged: string[] = [];
        if (requestedProfile) {
          const client = await prisma.client.findUnique({
            where: { clientKey: tenantId },
            select: { id: true, clientKey: true, profile: true },
          });
          if (client && getClientProfile(client) !== requestedProfile) {
            await prisma.client.update({
              where: { id: client.id },
              data: { profile: requestedProfile },
            });
            clientFieldsChanged.push("client.profile");
          }
        }
        const phoneNumberId = normalizeOptionalString(saved.tenant.metaPhoneNumberId);
        if (phoneNumberId) {
          const client = await prisma.client.findUnique({ where: { clientKey: tenantId } });
          if (client) {
            await syncTenantPhoneNumberMapping({
              clientId: client.id,
              phoneNumberId,
              displayPhoneNumber: normalizeOptionalString(saved.tenant.displayPhoneNumber),
            });
          }
        }
        logger.info({
          event: "admin.tenant.update",
          tenantId,
          authSource: authToken.source,
          fieldsChanged: [...saved.fieldsChanged, ...clientFieldsChanged],
          backupPath: saved.backupPath,
          requestId,
        });
        json(res, 200, {
          ok: true,
          tenantId,
          backupPath: saved.backupPath,
          fieldsChanged: [...saved.fieldsChanged, ...clientFieldsChanged],
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
      const profile = parseClientProfile(body.profile);
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
            data: { clientKey, name, profile },
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
        if (updatedClient) {
          await bootstrapTenantDefaults(prisma, {
            clientId: updatedClient.id,
            clientKey: updatedClient.clientKey,
            requestId,
            initialUser:
              body && typeof body === "object" && !Array.isArray(body)
                ? (body as Record<string, unknown>).initialUser ?? null
                : null,
          });
        }
        const status = created || createdPhone ? 201 : 200;
        json(
          res,
          status,
          updatedClient
            ? {
                ...updatedClient,
                profile: getClientProfile(updatedClient),
              }
            : updatedClient
        );
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
            json(res, 200, {
              ...existingClient,
              profile: getClientProfile(existingClient),
            });
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
                  messageId: true,
                  templateName: true,
                  status: true,
                  errorBody: true,
                  rawPayload: true,
                },
              })
            : [];
        const campaignMetaMap = new Map<string, CampaignMetaSummary>();
        for (const outbound of outboundMessages) {
          const outboundCampaignId = resolveOutboundCampaignId(outbound);
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

        const syncWhere = tenantAdmin
          ? { clientId: adminAuth.clientId }
          : requestedClientKey
            ? { client: { clientKey: requestedClientKey } }
            : undefined;

        triggerTemplateStatusSync({
          templateIds: await findTemplatesNeedingSync(prisma, syncWhere),
          source: "admin.templates",
          requestId,
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
              submittedCategory: templateRequest.category,
              wasRecategorized: false,
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
            submittedCategory: category,
            wasRecategorized: false,
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
            email: l.email,
            company: l.company,
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
          const signature = validateMetaSignature(rawBody, signatureHeader, env.META_APP_SECRET);
          if (!signature.ok) {
            logNoisyWarn(
              `webhook.signature.invalid:${signature.reason}:${req.socket.remoteAddress ?? "unknown"}`,
              {
                event: "webhook.signature.invalid",
                clientId: null,
                conversationId: null,
                userId: null,
                route: "/webhook",
                method: "POST",
                requestId,
                reason: signature.reason,
                ip: getRequestIp(req),
                userAgent: getUserAgent(req),
              }
            );
            json(res, 403, {
              error: "forbidden",
              message: "Webhook signature rejected.",
            });
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
            clientId: null,
            conversationId: null,
            userId: null,
            route: "/webhook",
            method: "POST",
            requestId,
            error: (error as Error).message,
          });
          json(res, 400, { error: "invalid_json", message: "Invalid JSON payload." });
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
          clientId: null,
          conversationId: null,
          userId: null,
          route: "/webhook",
          method: "POST",
          requestId,
          error: error.message,
        });
        json(res, 400, { error: "invalid_body", message: "Invalid request body." });
      });
      return;
    }
  }

  json(res, 404, { error: "not_found" });
}

async function findTemplatesNeedingSync(
  prisma: { template: { findMany: (...args: any[]) => Promise<Array<{ id: string }>> } },
  where:
    | { clientId: string }
    | { client: { clientKey: string } }
    | undefined
) {
  const items = await prisma.template.findMany({
    where: {
      ...(where ?? {}),
      status: { in: ["submitting", "PENDING"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true },
  });
  return items.map((item) => item.id);
}

function triggerTemplateStatusSync(params: {
  templateIds: string[];
  source: string;
  requestId: string;
}) {
  if (params.templateIds.length === 0) return;

  void Promise.allSettled(params.templateIds.map((templateId) => syncTemplateStatus(templateId))).then(
    (results) => {
      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        if (result.status === "rejected") {
          logger.warn({
            event: "template.status.sync.failed",
            templateId: params.templateIds[index],
            source: params.source,
            requestId: params.requestId,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }
  );
}

function mapTemplateValidationMessage(code: string) {
  switch (code) {
    case "template_name_required":
      return "Informe o nome do template.";
    case "template_name_invalid":
      return "Use apenas letras minusculas, numeros e underscore no nome do template.";
    case "template_category_invalid":
      return "Selecione uma categoria valida.";
    case "template_language_required":
      return "Idioma do template obrigatorio.";
    case "template_language_invalid":
      return "Idioma invalido. Use o formato pt_BR.";
    case "template_content_required":
      return "Informe o conteudo do template.";
    case "template_content_too_long":
      return "O conteudo do template excede o limite permitido pela Meta.";
    case "template_variables_invalid":
      return "Revise as variaveis do template. Os placeholders devem ser sequenciais e coerentes.";
    default:
      return "Nao foi possivel validar o template.";
  }
}

function summarizeMetaErrorMessage(input: string) {
  const value = String(input || "").trim();
  if (!value) return "Erro nao detalhado pela Meta.";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const nestedError =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as Record<string, unknown>)
        : null;
    const nestedMessage =
      nestedError && typeof nestedError.message === "string"
        ? nestedError.message.trim()
        : "";
    if (nestedMessage) return nestedMessage;
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // noop
  }
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

function isTemplatePendingLike(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "pending" || normalized === "submitting";
}

function isRetryableLocalTemplateFailure(
  status: string | null | undefined,
  rejectionReason: string | null | undefined
) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedReason = String(rejectionReason || "").trim().toLowerCase();
  if (normalizedStatus !== "failed") return false;
  return (
    normalizedReason === "template_name_required" ||
    normalizedReason === "template_name_invalid" ||
    normalizedReason === "template_category_invalid" ||
    normalizedReason === "template_language_required" ||
    normalizedReason === "template_language_invalid" ||
    normalizedReason === "template_content_required" ||
    normalizedReason === "template_content_too_long" ||
    normalizedReason === "template_variables_invalid"
  );
}

function isTimeoutLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /timeout|timed out|abort|network|fetch failed|econnreset|etimedout|und_err/i.test(
    message.toLowerCase()
  );
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

function getRequestIp(req: IncomingMessage) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  }
  return req.socket.remoteAddress || null;
}

function getUserAgent(req: IncomingMessage) {
  const userAgent = req.headers["user-agent"];
  return typeof userAgent === "string" && userAgent.trim() ? userAgent.trim() : null;
}

function parseQuery(parsed: URL) {
  const query: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function parseConversationReportRange(rawValue: string | undefined) {
  switch (String(rawValue ?? "").trim()) {
    case "1d":
      return { key: "1d" as const, since: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    case "30d":
      return { key: "30d" as const, since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    case "7d":
    case "":
      return { key: "7d" as const, since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    default:
      return null;
  }
}

function buildReportRuntimeStateMap(
  runtimeStates: Array<{
    waId: string;
    assignedUserId: string | null;
    status?: string | null;
    assignments?: Array<{ toUserId: string | null }>;
  }>
) {
  return new Map(
    runtimeStates.map((item) => {
      const assignedUserIds = Array.from(
        new Set(
          [
            item.assignedUserId ?? null,
            ...(item.assignments?.map((assignment) => assignment.toUserId ?? null) ?? []),
          ].filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );
      return [
        item.waId,
        {
          assignedUserId: item.assignedUserId ?? null,
          assignedUserIds,
          status: item.status ?? null,
        },
      ] as const;
    })
  );
}

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

async function loadConversationReportData(
  prisma: ReturnType<typeof getPrisma>,
  options: {
    clientId: string;
    since: Date;
    requestedDepartmentId: string | null;
    includeClosedAt?: boolean;
  }
) {
  if (options.requestedDepartmentId) {
    const department = await prisma.department.findFirst({
      where: {
        id: options.requestedDepartmentId,
        clientId: options.clientId,
      },
      select: { id: true },
    });
    if (!department) {
      return { ok: false as const, status: 404 as const, code: "department_not_found" as const };
    }
  }
  const metrics = await prisma.conversationMetrics.findMany({
    where: {
      clientId: options.clientId,
      startedAt: { gte: options.since },
      ...(options.requestedDepartmentId
        ? {
            conversation: {
              departmentId: options.requestedDepartmentId,
            },
          }
        : {}),
    },
    ...(options.includeClosedAt ? { orderBy: { startedAt: "desc" as const } } : {}),
    select: {
      conversationId: true,
      firstResponseTimeSec: true,
      totalResponseTimeSec: true,
      responseCount: true,
      avgResponseTimeSec: true,
      resolutionTimeSec: true,
      startedAt: true,
      ...(options.includeClosedAt ? { closedAt: true } : {}),
      conversation: {
        select: {
          waId: true,
          departmentId: true,
        },
      },
    },
  });
  const waIds = Array.from(new Set(metrics.map((item) => item.conversation.waId)));
  const runtimeStates = waIds.length
    ? await prisma.conversationRuntimeState.findMany({
        where: {
          clientId: options.clientId,
          waId: { in: waIds },
        },
        select: {
          waId: true,
          assignedUserId: true,
          status: true,
          assignments: {
            select: {
              toUserId: true,
            },
          },
        },
      })
    : [];
  const slaConfig = await prisma.sLAConfig.findUnique({
    where: { clientId: options.clientId },
    select: {
      firstResponseLimitSec: true,
      resolutionTimeLimitSec: true,
    },
  });
  const departmentIds = Array.from(
    new Set(
      metrics
        .map((item) => item.conversation.departmentId ?? null)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const departments = departmentIds.length
    ? await prisma.department.findMany({
        where: {
          clientId: options.clientId,
          id: { in: departmentIds },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];
  return {
    ok: true as const,
    metrics,
    stateByWaId: buildReportRuntimeStateMap(runtimeStates),
    slaConfig,
    departmentNameById: new Map(departments.map((item) => [item.id, item.name])),
  };
}

function buildConversationReportSummary(options: {
  rangeKey: "1d" | "7d" | "30d";
  requestedUserId: string | null;
  requestedDepartmentId: string | null;
  filteredMetrics: Array<{
    conversationId: string;
    firstResponseTimeSec: number | null;
    totalResponseTimeSec: number | null;
    responseCount: number | null;
    avgResponseTimeSec: number | null;
    resolutionTimeSec: number | null;
    conversation: {
      waId: string;
      departmentId: string | null;
    };
  }>;
  stateByWaId: ReturnType<typeof buildReportRuntimeStateMap>;
  slaConfig: { firstResponseLimitSec: number; resolutionTimeLimitSec: number } | null;
  departmentNameById: Map<string, string>;
}) {
  const totalConversations = options.filteredMetrics.length;
  const firstResponseValues = options.filteredMetrics
    .map((item) => item.firstResponseTimeSec)
    .filter((value): value is number => typeof value === "number");
  const resolutionValues = options.filteredMetrics
    .map((item) => item.resolutionTimeSec)
    .filter((value): value is number => typeof value === "number");
  const avgFirstResponseTimeSec =
    firstResponseValues.length > 0
      ? Math.round(firstResponseValues.reduce((sum, value) => sum + value, 0) / firstResponseValues.length)
      : null;
  const avgResolutionTimeSec =
    resolutionValues.length > 0
      ? Math.round(resolutionValues.reduce((sum, value) => sum + value, 0) / resolutionValues.length)
      : null;
  const firstResponseLimitSec =
    options.slaConfig && options.slaConfig.firstResponseLimitSec > 0
      ? options.slaConfig.firstResponseLimitSec
      : null;
  const resolutionTimeLimitSec =
    options.slaConfig && options.slaConfig.resolutionTimeLimitSec > 0
      ? options.slaConfig.resolutionTimeLimitSec
      : null;
  const slaBreaches = options.filteredMetrics.reduce((count, item) => {
    const firstResponseBreached =
      firstResponseLimitSec !== null &&
      item.firstResponseTimeSec !== null &&
      item.firstResponseTimeSec > firstResponseLimitSec;
    const resolutionBreached =
      resolutionTimeLimitSec !== null &&
      item.resolutionTimeSec !== null &&
      item.resolutionTimeSec > resolutionTimeLimitSec;
    return count + (firstResponseBreached || resolutionBreached ? 1 : 0);
  }, 0);
  const byAgentMap = new Map<
    string,
    { userId: string; conversations: number; totalResponseTimeSec: number; responseCount: number }
  >();
  for (const item of options.filteredMetrics) {
    const assignedUserIds = options.stateByWaId.get(item.conversation.waId)?.assignedUserIds ?? [];
    for (const assignedUserId of assignedUserIds) {
      const current = byAgentMap.get(assignedUserId) ?? {
        userId: assignedUserId,
        conversations: 0,
        totalResponseTimeSec: 0,
        responseCount: 0,
      };
      current.conversations += 1;
      current.totalResponseTimeSec += item.totalResponseTimeSec ?? 0;
      current.responseCount += item.responseCount ?? 0;
      byAgentMap.set(assignedUserId, current);
    }
  }
  const byDepartmentMap = new Map<
    string,
    {
      departmentId: string | null;
      departmentName: string | null;
      conversations: number;
      totalResponseTimeSec: number;
      responseCount: number;
    }
  >();
  for (const item of options.filteredMetrics) {
    const departmentId = item.conversation.departmentId ?? null;
    const key = departmentId ?? "__none__";
    const current = byDepartmentMap.get(key) ?? {
      departmentId,
      departmentName: departmentId ? options.departmentNameById.get(departmentId) ?? null : null,
      conversations: 0,
      totalResponseTimeSec: 0,
      responseCount: 0,
    };
    current.conversations += 1;
    current.totalResponseTimeSec += item.totalResponseTimeSec ?? 0;
    current.responseCount += item.responseCount ?? 0;
    byDepartmentMap.set(key, current);
  }
  return {
    ok: true,
    range: options.rangeKey,
    userId: options.requestedUserId,
    departmentId: options.requestedDepartmentId,
    totalConversations,
    avgFirstResponseTimeSec,
    avgResolutionTimeSec,
    slaBreaches,
    byAgent: Array.from(byAgentMap.values()).map((item) => ({
      userId: item.userId,
      conversations: item.conversations,
      avgResponseTimeSec:
        item.responseCount > 0 ? Math.round(item.totalResponseTimeSec / item.responseCount) : null,
    })),
    byDepartment: Array.from(byDepartmentMap.values()).map((item) => ({
      departmentId: item.departmentId,
      departmentName: item.departmentName,
      conversations: item.conversations,
      avgResponseTimeSec:
        item.responseCount > 0 ? Math.round(item.totalResponseTimeSec / item.responseCount) : null,
    })),
  };
}

function buildConversationReportCsv(options: {
  metrics: Array<{
    conversationId: string;
    firstResponseTimeSec: number | null;
    resolutionTimeSec: number | null;
    startedAt: Date;
    closedAt?: Date | null;
    conversation: {
      waId: string;
      departmentId: string | null;
    };
  }>;
  stateByWaId: ReturnType<typeof buildReportRuntimeStateMap>;
  departmentNameById: Map<string, string>;
}) {
  return [
    [
      "conversationId",
      "waId",
      "departmentId",
      "departmentName",
      "assignedUserId",
      "status",
      "firstResponseTimeSec",
      "resolutionTimeSec",
      "createdAt",
      "closedAt",
    ].join(","),
    ...options.metrics.map((item) => {
      const runtimeState = options.stateByWaId.get(item.conversation.waId);
      const departmentId = item.conversation.departmentId ?? null;
      return [
        csvCell(item.conversationId),
        csvCell(item.conversation.waId),
        csvCell(departmentId),
        csvCell(departmentId ? options.departmentNameById.get(departmentId) ?? null : null),
        csvCell(runtimeState?.assignedUserIds.length ? runtimeState.assignedUserIds.join("|") : null),
        csvCell(runtimeState?.status ?? (item.closedAt ? "CLOSED" : null)),
        csvCell(item.firstResponseTimeSec),
        csvCell(item.resolutionTimeSec),
        csvCell(item.startedAt.toISOString()),
        csvCell(item.closedAt ? item.closedAt.toISOString() : null),
      ].join(",");
    }),
  ].join("\n");
}

function getRequestedClientKey(req: IncomingMessage, query: Record<string, string>) {
  const headerClientKey = req.headers["x-client-key"];
  if (typeof headerClientKey === "string" && headerClientKey.trim()) {
    return headerClientKey.trim();
  }
  const queryClientKey = String(query.clientKey ?? "").trim();
  return queryClientKey || null;
}

function normalizeAiAssistantTermList(input: unknown) {
  if (!Array.isArray(input)) return null;
  if (input.some((term) => typeof term !== "string")) return null;
  const terms = input
    .map((term) => term.trim())
    .filter((term): term is string => Boolean(term))
    .slice(0, 80);
  return [...new Set(terms)];
}

function getAiAssistantGlobalSafetyConfig() {
  return {
    questionStarters: AI_ASSISTANT_SIMPLE_QUESTION_STARTERS,
    topicTerms: AI_ASSISTANT_GLOBAL_TOPIC_TERMS,
    blockedTerms: AI_ASSISTANT_GLOBAL_BLOCKED_TERMS,
    handoffTerms: AI_ASSISTANT_GLOBAL_HANDOFF_TERMS,
    maxInputChars: AI_ASSISTANT_MAX_INPUT_CHARS,
    personalDataBlocked: true,
  };
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
  compareField("displayPhoneNumber");
  compareField("companyLegalName");
  compareField("companyTradeName");
  compareField("companyTaxId");
  compareField("companyStateRegistration");
  compareField("companyMunicipalRegistration");
  compareField("companyWebsite");
  compareField("companyIndustry");
  compareField("companyAddressStreet");
  compareField("companyAddressNumber");
  compareField("companyAddressComplement");
  compareField("companyAddressDistrict");
  compareField("companyAddressCity");
  compareField("companyAddressState");
  compareField("companyAddressZip");
  compareField("companyAddressCountry");
  compareField("legalRepresentativeName");
  compareField("legalRepresentativeCpf");
  compareField("legalRepresentativeEmail");
  compareField("legalRepresentativePhone");
  compareField("billingContactName");
  compareField("billingContactEmail");
  compareField("billingContactPhone");
  compareField("billingEmail");
  compareField("financialContactName");
  compareField("financialContactEmail");
  compareField("financialContactPhone");
  compareField("technicalContactName");
  compareField("technicalContactEmail");
  compareField("technicalContactPhone");
  compareField("contractPlanName");
  compareField("contractStartDate");
  compareField("contractEndDate");
  compareField("contractBillingDay");
  compareField("contractPaymentMethod");
  compareField("contractNotes");
  compareField("maxActiveAppUsers");
  compareField("allowlist");
  compareField("handoffAttendantWaid");
  compareField("defaultLanguage");
  compareField("planName");
  compareField("messagesLimit");
  compareField("disableAutoReply");
  compareField("disableChatbot");
  compareField("appDisableChatbot");
  compareField("disableChatbotFlowEditing");
  compareField("disableLegacyFlows");
  compareField("disableAiFallback");
  compareField("appDisableAiFallback");
  compareField("disableIntentClassifier");
  compareField("appDisableIntentClassifier");
  compareField("followUpEnabled");
  compareField("followUpDelayMinutes");
  compareField("followUpMaxCount");
  compareField("followUpUseTemplate");
  compareField("followUpTemplateName");
  compareField("followUpTemplateLang");
  compareField("aiAssistantEnabled");
  compareField("aiAssistantMaxReplies");
  compareField("aiAssistantProfile");
  compareField("aiAssistantSystemPrompt");
  compareField("aiAssistantFallbackToHandoff");
  compareField("aiAssistantAllowedTopics");
  compareField("aiAssistantSecondaryTopics");
  compareField("aiAssistantBlockedTerms");
  compareField("aiAssistantHandoffKeywords");
  compareField("aiAssistantFallbackMessage");
  compareField("aiAssistantHandoffPrompt");
  compareField("aiBusinessContext");
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
  displayPhoneNumber?: string | null;
}) {
  const prisma = getPrisma();
  const display = params.displayPhoneNumber?.trim() || params.phoneNumberId;
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
        display,
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
    data: { display },
  });
  return { action: "existing" as const };
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseClientProfile(value: unknown): ClientProfile {
  return value === "government" ? "government" : "business";
}

function extractTenantDisplayPhoneFromRawPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const payload = rawPayload as Record<string, unknown>;
  const enrich = payload.enrich;
  if (enrich && typeof enrich === "object" && !Array.isArray(enrich)) {
    const displayPhone = extractTenantDisplayPhoneFromRawPayload(enrich);
    if (displayPhone) return displayPhone;
  }
  const phoneNumber = payload.phoneNumber;
  if (phoneNumber && typeof phoneNumber === "object" && !Array.isArray(phoneNumber)) {
    const displayPhone = normalizeOptionalString(
      (phoneNumber as Record<string, unknown>).display_phone_number
    );
    if (displayPhone) return displayPhone;
  }
  return normalizeOptionalString(payload.display_phone_number);
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(normalizeJsonPayload(status, payload)));
}

function defaultErrorMessage(code: string, status: number) {
  switch (code) {
    case "bad_request":
    case "invalid_json":
    case "invalid_body":
    case "invalid_role":
    case "department_required":
      return "Bad request.";
    case "unauthorized":
    case "invalid_credentials":
      return "Unauthorized.";
    case "forbidden":
    case "client_inactive":
      return "Forbidden.";
    case "not_found":
    case "client_not_found":
    case "conversation_not_found":
    case "lead_not_found":
    case "user_not_found":
    case "department_not_found":
      return "Not found.";
    case "weak_password":
      return "Password is too weak.";
    case "user_already_exists":
      return "Conflict.";
    case "server_error":
    case "internal_error":
      return "Internal server error.";
    default:
      return status >= 500 ? "Internal server error." : `Request failed (${status}).`;
  }
}

async function parseAdminUserUpsertPayload(
  prisma: ReturnType<typeof getPrisma>,
  options: {
    clientId: string;
    body: unknown;
    requireName: boolean;
    requireEmail: boolean;
    requireRole: boolean;
    currentRole?: string | null;
    currentDepartmentId?: string | null;
  }
): Promise<
  | {
      ok: true;
      data: {
        name?: string;
        email?: string;
        role?: string;
        departmentId?: string | null;
        isActive?: boolean;
      };
    }
  | { ok: false; status: 400 | 404; code: string; message: string }
> {
  const body =
    options.body && typeof options.body === "object" && !Array.isArray(options.body)
      ? (options.body as Record<string, unknown>)
      : {};
  const data: {
    name?: string;
    email?: string;
    role?: string;
    departmentId?: string | null;
    isActive?: boolean;
  } = {};

  if ("name" in body || options.requireName) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "User name is required",
      };
    }
    data.name = name;
  }

  if ("email" in body || options.requireEmail) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "User email is required",
      };
    }
    data.email = email;
  }

  const role =
    "role" in body || options.requireRole
      ? String(body.role ?? "AGENT").trim().toUpperCase()
      : "";
  const allowedRoles = new Set(["AGENT", "SUPERVISOR", "ADMIN"]);
  if (role) {
    if (!allowedRoles.has(role)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_role",
        message: "Role must be AGENT, SUPERVISOR or ADMIN",
      };
    }
    data.role = role;
  }

  const hasDepartment = "departmentId" in body;
  const rawDepartmentId =
    hasDepartment && body.departmentId != null ? String(body.departmentId).trim() : "";
  if (hasDepartment) {
    if (!rawDepartmentId) {
      data.departmentId = null;
    } else {
      const department = await prisma.department.findFirst({
        where: {
          id: rawDepartmentId,
          clientId: options.clientId,
        },
        select: { id: true },
      });
      if (!department) {
        return {
          ok: false,
          status: 404,
          code: "department_not_found",
          message: "Department not found for this tenant",
        };
      }
      data.departmentId = department.id;
    }
  }

  const effectiveRole =
    data.role ?? String(options.currentRole ?? "").trim().toUpperCase() ?? "";
  const effectiveDepartmentId = hasDepartment
    ? (data.departmentId ?? null)
    : options.currentDepartmentId ?? undefined;
  if (
    (effectiveRole === "AGENT" || effectiveRole === "SUPERVISOR") &&
    !effectiveDepartmentId
  ) {
    return {
      ok: false,
      status: 400,
      code: "department_required",
      message: "departmentId is required for AGENT and SUPERVISOR",
    };
  }

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "isActive must be a boolean",
      };
    }
    data.isActive = body.isActive;
  }

  return { ok: true, data };
}

function parseDepartmentUpsertPayload(
  body: unknown,
  options?: { requireName?: boolean; currentName?: string | null }
):
  | {
      ok: true;
      data: {
        name?: string;
        slug?: string;
        isActive?: boolean;
      };
    }
  | { ok: false; status: 400; code: string; message: string } {
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const data: {
    name?: string;
    slug?: string;
    isActive?: boolean;
  } = {};

  if ("name" in payload || options?.requireName) {
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "Department name is required",
      };
    }
    data.name = name;
    data.slug = normalizeDepartmentSlug(name);
  } else if (options?.currentName) {
    data.name = undefined;
    data.slug = undefined;
  }

  if ("isActive" in payload) {
    if (typeof payload.isActive !== "boolean") {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "isActive must be a boolean",
      };
    }
    data.isActive = payload.isActive;
  }

  return { ok: true, data };
}

function parseChatbotFlowUpsertPayload(
  body: unknown,
  options?: {
    requireName?: boolean;
    requireDefinition?: boolean;
  }
):
  | {
      ok: true;
      data: {
        name?: string;
        isActive?: boolean;
        entryPoint?: boolean;
        definition?: Prisma.JsonValue;
      };
    }
  | { ok: false; status: 400; code: string; message: string } {
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const data: {
    name?: string;
    isActive?: boolean;
    entryPoint?: boolean;
    definition?: Prisma.JsonValue;
  } = {};

  if ("name" in payload || options?.requireName) {
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "Flow name is required",
      };
    }
    data.name = name;
  }

  if ("isActive" in payload) {
    if (typeof payload.isActive !== "boolean") {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "isActive must be a boolean",
      };
    }
    data.isActive = payload.isActive;
  }

  if ("entryPoint" in payload) {
    if (typeof payload.entryPoint !== "boolean") {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        message: "entryPoint must be a boolean",
      };
    }
    data.entryPoint = payload.entryPoint;
  }

  if ("definition" in payload) {
    const validated = validateChatbotFlowDefinition(payload.definition);
    if (!validated.ok) {
      return {
        ok: false,
        status: 400,
        code: validated.code,
        message: validated.message,
      };
    }
    data.definition = validated.definition as Prisma.JsonValue;
  } else if (options?.requireDefinition) {
    return {
      ok: false,
      status: 400,
      code: "bad_request",
      message: "definition is required",
    };
  }

  return { ok: true, data };
}

async function bootstrapTenantDefaults(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    requestId: string;
    initialUser?: unknown;
  }
) {
  logger.info({
    event: "tenant.bootstrap.started",
    requestId: params.requestId,
    clientId: params.clientId,
    clientKey: params.clientKey,
    hasInitialUser: Boolean(params.initialUser),
  });

  try {
    const seeded = await ensureDefaultDepartments(prisma, {
      clientId: params.clientId,
    });

    const activeDepartments = await prisma.department.findMany({
      where: {
        clientId: params.clientId,
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (activeDepartments.length === 0) {
      throw new Error("tenant bootstrap failed to ensure at least one active department");
    }

    let userSummary:
      | {
          action: "created" | "updated";
          id: string;
          email: string;
          role: string;
          departmentId: string | null;
          isActive: boolean;
        }
      | null = null;

    if (params.initialUser && typeof params.initialUser === "object" && !Array.isArray(params.initialUser)) {
      const body = params.initialUser as Record<string, unknown>;
      const parsed = await parseAdminUserUpsertPayload(prisma, {
        clientId: params.clientId,
        body,
        requireName: true,
        requireEmail: true,
        requireRole: false,
      });
      if (!parsed.ok) {
        const error = new Error(parsed.message) as Error & {
          status?: number;
          code?: string;
        };
        error.status = parsed.status;
        error.code = parsed.code;
        throw error;
      }

      const password = typeof body.password === "string" ? body.password : "";
      if (password && password.length < 6) {
        const error = new Error("Password must be at least 6 characters") as Error & {
          status?: number;
          code?: string;
        };
        error.status = 400;
        error.code = "weak_password";
        throw error;
      }

      const email = String(parsed.data.email ?? "").trim().toLowerCase();
      const existingUser = await prisma.user.findUnique({
        where: {
          clientId_email: {
            clientId: params.clientId,
            email,
          },
        },
        select: { id: true },
      });

      const user = await prisma.user.upsert({
        where: {
          clientId_email: {
            clientId: params.clientId,
            email,
          },
        },
        update: {
          ...parsed.data,
          ...(password ? { passwordHash: hashPassword(password) } : {}),
        },
        create: {
          clientId: params.clientId,
          name: parsed.data.name as string,
          email,
          role: parsed.data.role ?? "AGENT",
          departmentId:
            Object.prototype.hasOwnProperty.call(parsed.data, "departmentId")
              ? (parsed.data.departmentId ?? null)
              : null,
          isActive: typeof parsed.data.isActive === "boolean" ? parsed.data.isActive : true,
          ...(password ? { passwordHash: hashPassword(password) } : {}),
        },
        select: {
          id: true,
          email: true,
          role: true,
          departmentId: true,
          isActive: true,
        },
      });

      userSummary = {
        action: existingUser ? "updated" : "created",
        id: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId ?? null,
        isActive: user.isActive,
      };
    }

    logger.info({
      event: "tenant.bootstrap.completed",
      requestId: params.requestId,
      clientId: params.clientId,
      clientKey: params.clientKey,
      createdDepartments: seeded.created,
      reactivatedDepartments: seeded.reactivated,
      unchangedDepartments: seeded.unchanged,
      activeDepartmentCount: activeDepartments.length,
      initialUserAction: userSummary?.action ?? null,
      userId: userSummary?.id ?? null,
      email: userSummary?.email ?? null,
      role: userSummary?.role ?? null,
      departmentId: userSummary?.departmentId ?? null,
      isActive: userSummary?.isActive ?? null,
    });

    return {
      ok: true as const,
      seed: {
        created: seeded.created,
        reactivated: seeded.reactivated,
        unchanged: seeded.unchanged,
        total: seeded.total,
      },
      departments: activeDepartments,
      initialUser: userSummary,
    };
  } catch (error) {
    logger.error({
      event: "tenant.bootstrap.failed",
      requestId: params.requestId,
      clientId: params.clientId,
      clientKey: params.clientKey,
      message: (error as Error).message,
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : null,
    });
    throw error;
  }
}

function normalizeJsonPayload(status: number, payload: unknown) {
  if (
    status < 400 ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return payload;
  }

  const typed = payload as Record<string, unknown>;
  if (
    typed.error &&
    typeof typed.error === "object" &&
    !Array.isArray(typed.error) &&
    typeof (typed.error as Record<string, unknown>).code === "string" &&
    typeof (typed.error as Record<string, unknown>).message === "string"
  ) {
    return payload;
  }

  if (typeof typed.error === "string") {
    const code = typed.error;
    const message =
      typeof typed.message === "string" && typed.message.trim()
        ? typed.message
        : defaultErrorMessage(code, status);
    return {
      error: { code, message },
      ...(typeof typed.details === "string" && typed.details.trim()
        ? { details: typed.details }
        : {}),
    };
  }

  if (typeof typed.code === "string" && typeof typed.message === "string") {
    return {
      error: {
        code: typed.code,
        message: typed.message,
      },
      ...(typeof typed.details === "string" && typed.details.trim()
        ? { details: typed.details }
        : {}),
    };
  }

  return payload;
}

function logNoisyWarn(key: string, data: Record<string, unknown>, windowMs = 60_000) {
  const now = Date.now();
  const state = noisyLogState.get(key);
  if (!state || now - state.lastLoggedAt >= windowMs) {
    logger.warn({
      ...data,
      suppressedCount: state?.suppressedCount ?? 0,
    });
    noisyLogState.set(key, { lastLoggedAt: now, suppressedCount: 0 });
    return;
  }
  state.suppressedCount += 1;
  noisyLogState.set(key, state);
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

function extractCampaignIdFromMessageId(messageId: string | null | undefined) {
  const value = typeof messageId === "string" ? messageId.trim() : "";
  if (!value.startsWith("campaign.")) return null;
  const suffix = value.slice("campaign.".length);
  const separatorIndex = suffix.lastIndexOf(".");
  if (separatorIndex <= 0) return null;
  const campaignId = suffix.slice(0, separatorIndex);
  return campaignId || null;
}

function resolveOutboundCampaignId(item: { messageId?: string | null; rawPayload: unknown }) {
  return extractCampaignIdFromRawPayload(item.rawPayload) ?? extractCampaignIdFromMessageId(item.messageId);
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

function normalizeInboxMessageStatus(lastStatus: string | null, fallbackStatus: string) {
  return normalizeCampaignMessageStatus(lastStatus, fallbackStatus).toUpperCase();
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
  messageId?: string | null;
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

function buildCampaignSeedFallbackStatusItems(
  campaign: {
    sentCount: number;
    blockedCount: number;
    status: string;
    templateName: string;
  },
  seed: CampaignDraftSeed
): CampaignMetaStatus[] {
  const sentLimit = Math.max(campaign.sentCount || 0, 0);
  const blockedLimit = sentLimit + Math.max(campaign.blockedCount || 0, 0);
  return seed.recipients.map((waId, index) => {
    const wasSent = index < sentLimit;
    const wasBlockedOrFailed = !wasSent && index < blockedLimit;
    return {
      waId,
      templateName: seed.templateName || campaign.templateName,
      status: wasSent ? "sent" : "failed",
      pricingCategory: null,
      pricingBillable: null,
      pricingModel: null,
      conversationId: null,
      error: wasSent
        ? "Status Meta detalhado indisponivel; exibido a partir do historico da campanha."
        : wasBlockedOrFailed
          ? "Envio bloqueado ou falhou; status Meta detalhado indisponivel."
          : "Envio individual nao encontrado no historico preservado.",
    };
  });
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
  features: unknown;
  profile: string | null;
};

async function getScopedClientById(
  prisma: ReturnType<typeof getPrisma>,
  clientId: string
): Promise<ScopedClientRecord | null> {
  return prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, clientKey: true, status: true, features: true, profile: true },
  });
}

function getTenantMaxActiveAppUsers(clientKey: string, tenants: Awaited<ReturnType<typeof getTenants>>) {
  const configuredLimit = tenants[clientKey]?.maxActiveAppUsers;
  if (
    typeof configuredLimit === "number" &&
    Number.isInteger(configuredLimit) &&
    configuredLimit >= 0
  ) {
    return configuredLimit;
  }
  return 5;
}

async function assertTenantActiveUserLimitAvailable(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    requestId: string;
  }
): Promise<
  | { ok: true; maxActiveAppUsers: number; activeUsers: number }
  | { ok: false; maxActiveAppUsers: number; activeUsers: number }
> {
  const tenants = await getTenants();
  const maxActiveAppUsers = getTenantMaxActiveAppUsers(params.clientKey, tenants);
  const activeUsers = await prisma.user.count({
    where: {
      clientId: params.clientId,
      isActive: true,
    },
  });
  const ok = activeUsers < maxActiveAppUsers;
  if (!ok) {
    logger.warn({
      event: "tenant.user_limit.exceeded",
      requestId: params.requestId,
      clientId: params.clientId,
      clientKey: params.clientKey,
      activeUsers,
      maxActiveAppUsers,
    });
  }
  return { ok, activeUsers, maxActiveAppUsers };
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

async function ensureQueueForDepartment(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    departmentId: string;
  }
) {
  return prisma.queue.upsert({
    where: {
      clientId_departmentId_name: {
        clientId: params.clientId,
        departmentId: params.departmentId,
        name: DEFAULT_OPERATIONAL_QUEUE_NAME,
      },
    },
    update: {},
    create: {
      clientId: params.clientId,
      departmentId: params.departmentId,
      name: DEFAULT_OPERATIONAL_QUEUE_NAME,
    },
    select: { id: true, name: true, departmentId: true },
  });
}

async function resolveAssignmentRouting(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    assignedUserDepartmentId?: string | null;
    fallbackDepartmentId?: string | null;
  }
) {
  const defaults = await ensureDefaultDepartmentAndQueue(prisma, params.clientId);
  const departmentId =
    (await resolveOperationalDepartmentId(
      prisma,
      params.clientId,
      params.assignedUserDepartmentId ?? params.fallbackDepartmentId ?? defaults.department.id
    )) ?? defaults.department.id;
  const queue =
    departmentId === defaults.department.id
      ? defaults.queue
      : await ensureQueueForDepartment(prisma, {
          clientId: params.clientId,
          departmentId,
        });
  return { departmentId, queueId: queue.id };
}

const CONVERSATION_OPERATIONAL_STATUS_VALUES = [
  ConversationOperationalStatus.WAITING,
  ConversationOperationalStatus.IN_PROGRESS,
  ConversationOperationalStatus.WAITING_USER,
  ConversationOperationalStatus.CLOSED,
] as const;

function normalizeConversationOperationalStatus(
  value?: string | ConversationOperationalStatus | null
): ConversationOperationalStatus | null {
  switch (String(value ?? "").toUpperCase()) {
    case "WAITING":
      return ConversationOperationalStatus.WAITING;
    case "IN_PROGRESS":
      return ConversationOperationalStatus.IN_PROGRESS;
    case "WAITING_USER":
      return ConversationOperationalStatus.WAITING_USER;
    case "CLOSED":
      return ConversationOperationalStatus.CLOSED;
    default:
      return null;
  }
}

function sanitizeDownloadFileName(input: string | null | undefined) {
  const value = String(input ?? "").trim();
  if (!value) return null;
  return value.replace(/[^\w.\- ]+/g, "_");
}

const outboundMediaRoot = path.resolve(process.cwd(), ".data", "media", "outbound");

function sanitizeStorageSegment(input: string) {
  return input.replace(/[^\w.-]+/g, "_").slice(0, 160) || crypto.randomUUID();
}

function getRawMediaPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const root = rawPayload as Record<string, unknown>;
  const media = root.media;
  if (media && typeof media === "object" && !Array.isArray(media)) {
    return media as Record<string, unknown>;
  }
  return root;
}

async function storeOutboundMediaFile(params: {
  clientId: string;
  messageId: string;
  content: Buffer;
  mimeType: string;
  fileName?: string | null;
}) {
  const safeClientId = sanitizeStorageSegment(params.clientId);
  const safeMessageId = sanitizeStorageSegment(params.messageId);
  const safeFileName =
    sanitizeDownloadFileName(params.fileName) ||
    `${safeMessageId}.${params.mimeType.includes("ogg") ? "ogg" : "bin"}`;
  const directory = path.join(outboundMediaRoot, safeClientId);
  await fs.mkdir(directory, { recursive: true });
  const absolutePath = path.join(directory, `${safeMessageId}-${safeFileName}`);
  await fs.writeFile(absolutePath, params.content);
  return {
    localPath: path.relative(process.cwd(), absolutePath),
    size: params.content.length,
  };
}

async function resolveStoredOutboundMedia(rawPayload: unknown) {
  const media = getRawMediaPayload(rawPayload);
  const localPath = typeof media?.localPath === "string" ? media.localPath : null;
  if (!localPath) return null;

  const absolutePath = path.resolve(process.cwd(), localPath);
  const relativeToRoot = path.relative(outboundMediaRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;

  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) return null;
    return {
      absolutePath,
      size: stats.size,
      mimeType:
        typeof media?.mimeType === "string" && media.mimeType.trim()
          ? media.mimeType.trim()
          : "application/octet-stream",
      fileName: typeof media?.fileName === "string" ? media.fileName : null,
    };
  } catch {
    return null;
  }
}

function buildConversationMessageDownloadPath(waId: string, messageId: string) {
  return `/app/conversation/${encodeURIComponent(waId)}/messages/${encodeURIComponent(messageId)}/media`;
}

function isChatbotDisabledForTenant(tenant?: {
  disableChatbot?: boolean;
  appDisableChatbot?: boolean;
} | null) {
  return tenant?.disableChatbot === true;
}

function isAiFallbackDisabledForTenant(tenant?: {
  disableAiFallback?: boolean;
  appDisableAiFallback?: boolean;
  aiBusinessContext?: string;
  aiAssistantAllowedTopics?: string[];
  aiAssistantSecondaryTopics?: string[];
  aiAssistantFallbackMessage?: string;
  aiAssistantHandoffPrompt?: string;
} | null) {
  const aiConfigured = isAiAssistantConfigured(tenant);
  if (!aiConfigured) return true;
  return tenant?.disableAiFallback === true;
}

function isIntentClassifierDisabledForTenant(tenant?: {
  disableIntentClassifier?: boolean;
  appDisableIntentClassifier?: boolean;
} | null) {
  if (!env.FLOW_INTENT_CLASSIFIER_ENABLED) return true;
  return tenant?.disableIntentClassifier === true;
}

async function enforceAppFeature(
  prisma: ReturnType<typeof getPrisma>,
  res: ServerResponse,
  params: {
    client: { id: string; features?: unknown; profile?: unknown };
    userId: string;
    feature: ClientFeatureKey;
    endpoint: string;
    requestId: string;
  }
) {
  if (hasFeature(params.client, params.feature)) return true;
  const timestamp = new Date().toISOString();
  logger.warn({
    event: "feature.denied",
    clientId: params.client.id,
    userId: params.userId,
    feature: params.feature,
    route: params.endpoint,
    timestamp,
    requestId: params.requestId,
  });
  try {
    await prisma.event.create({
      data: {
        clientId: params.client.id,
        requestId: `${params.requestId}:feature.denied:${params.feature}`,
        eventName: "feature.denied",
        payloadJson: {
          userId: params.userId,
          clientId: params.client.id,
          feature: params.feature,
          route: params.endpoint,
          timestamp,
          action: "feature.denied",
        },
      },
    });
  } catch (error) {
    logger.warn({
      event: "feature.denied.audit_failed",
      clientId: params.client.id,
      userId: params.userId,
      feature: params.feature,
      route: params.endpoint,
      requestId: params.requestId,
      message: (error as Error).message,
    });
  }
  json(res, 403, {
    error: {
      code: "feature_not_enabled",
      message: `Feature '${params.feature}' is not enabled for this tenant`,
    },
    feature: params.feature,
  });
  return false;
}

function isConversationInHumanFlow(conversation: {
  mode?: string | null;
  handoff?: { status?: string | null };
  assignedUserId?: string | null;
  assignedAt?: string | null;
}) {
  return (
    conversation.mode === "HUMAN" ||
    conversation.handoff?.status === "active" ||
    conversation.handoff?.status === "pending" ||
    Boolean(conversation.assignedUserId) ||
    Boolean(conversation.assignedAt)
  );
}

function deriveConversationOperationalStatus(conversation: {
  mode?: string | null;
  handoff?: { status?: string | null };
  assignedUserId?: string | null;
  assignedAt?: string | null;
}) {
  if (!isConversationInHumanFlow(conversation)) return null;
  return conversation.assignedUserId
    ? ConversationOperationalStatus.IN_PROGRESS
    : ConversationOperationalStatus.WAITING;
}

async function ensureDefaultDepartmentAndQueue(
  prisma: ReturnType<typeof getPrisma>,
  clientId: string
) {
  return ensureDefaultOperationalDepartmentAndQueue(prisma, clientId);
}

async function ensureConversationOperationalState(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    conversation: Awaited<ReturnType<typeof runtimeStorage.getConversation>>;
    defaults: Awaited<ReturnType<typeof ensureDefaultDepartmentAndQueue>>;
  }
) {
  const normalizedDepartmentId = params.conversation
    ? await resolveOperationalDepartmentId(
        prisma,
        params.clientId,
        params.conversation.departmentId ?? null
      )
    : null;
  const normalizedConversation =
    params.conversation && normalizedDepartmentId !== (params.conversation.departmentId ?? null)
      ? {
          ...params.conversation,
          departmentId: normalizedDepartmentId,
        }
      : params.conversation;
  const conversation = materializeConversationOperationalState(normalizedConversation, params.defaults);
  if (!conversation) return null;
  const original = params.conversation;
  const shouldPersist =
    (original?.departmentId ?? null) !== (conversation.departmentId ?? null) ||
    (original?.queueId ?? null) !== (conversation.queueId ?? null) ||
    (normalizeConversationOperationalStatus(original?.status) ?? null) !==
      (normalizeConversationOperationalStatus(conversation.status) ?? null) ||
    (original?.closedAt ?? null) !== (conversation.closedAt ?? null);
  if (!shouldPersist) return conversation;
  await runtimeStorage.upsertConversation(conversation);
  return conversation;
}

function materializeConversationOperationalState(
  conversation: Awaited<ReturnType<typeof runtimeStorage.getConversation>>,
  defaults: Awaited<ReturnType<typeof ensureDefaultDepartmentAndQueue>>
) {
  if (!conversation) return null;
  if (!isConversationInHumanFlow(conversation)) {
    return conversation;
  }
  const explicitStatus = normalizeConversationOperationalStatus(conversation.status);
  const derivedStatus = explicitStatus
    ? null
    : deriveConversationOperationalStatus(conversation);
  const resolvedStatus = explicitStatus ?? derivedStatus ?? null;
  const normalizedStatus =
    conversation.assignedUserId && resolvedStatus === ConversationOperationalStatus.WAITING
      ? ConversationOperationalStatus.IN_PROGRESS
      : resolvedStatus;
  return {
    ...conversation,
    departmentId: conversation.departmentId ?? defaults.department.id,
    queueId: conversation.queueId ?? defaults.queue.id,
    status: normalizedStatus,
    closedAt:
      normalizedStatus === ConversationOperationalStatus.CLOSED
        ? conversation.closedAt ?? new Date().toISOString()
        : null,
  };
}

async function recordConversationAssignment(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    waId: string;
    fromUserId?: string | null;
    toUserId?: string | null;
    assignedAt: string;
  }
) {
  if (!params.toUserId) return;
  const runtimeState = await prisma.conversationRuntimeState.findUnique({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    select: { id: true },
  });
  if (!runtimeState) {
    logNoisyWarn(`conversation.assignment.skipped:${params.clientId}:${params.waId}`, {
      event: "conversation.assignment.skipped",
      clientId: params.clientId,
      conversationId: null,
      userId: params.toUserId ?? params.fromUserId ?? null,
      requestId: logger.getContext().requestId ?? null,
      waId: params.waId,
      storageMode: env.STORAGE_MODE,
      readSource: env.CONV_STATE_READ_SOURCE,
      reason: "runtime_state_not_found_shadow_row_missing",
    });
    return;
  }
  await prisma.conversationAssignment.create({
    data: {
      conversationId: runtimeState.id,
      fromUserId: params.fromUserId ?? null,
      toUserId: params.toUserId,
      assignedAt: new Date(params.assignedAt),
    },
  });
}

async function recordConversationAuditEvent(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    requestId: string;
    eventName:
      | "conversation.assigned"
      | "conversation.transferred"
      | "conversation.department.transferred"
      | "conversation.released"
      | "conversation.released_to_general"
      | "conversation.status_changed";
    actorUserId: string;
    waId: string;
    waIdCanonical?: string | null;
    conversationId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const timestamp = new Date().toISOString();
  const eventRequestId = `${params.requestId}:${params.eventName}`;
  try {
    await prisma.event.create({
      data: {
        clientId: params.clientId,
        conversationId: params.conversationId ?? null,
        waId: params.waId,
        waIdCanonical: params.waIdCanonical ?? null,
        requestId: eventRequestId,
        eventName: params.eventName,
        payloadJson: {
          action: params.eventName,
          userId: params.actorUserId,
          clientId: params.clientId,
          clientKey: params.clientKey,
          conversationId: params.conversationId ?? null,
          waId: params.waId,
          waIdCanonical: params.waIdCanonical ?? null,
          timestamp,
          ...(params.payload ?? {}),
        },
      },
    });
  } catch (error) {
    logger.warn({
      event: "conversation.audit_event_failed",
      clientId: params.clientId,
      clientKey: params.clientKey,
      userId: params.actorUserId,
      eventName: params.eventName,
      requestId: eventRequestId,
      message: (error as Error).message,
    });
  }
}

async function persistConversationDepartment(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    waId: string;
    waIdCanonical?: string | null;
    departmentId: string | null;
  }
) {
  await prisma.conversation.upsert({
    where: {
      clientId_waId: {
        clientId: params.clientId,
        waId: params.waId,
      },
    },
    update: {
      departmentId: params.departmentId,
      waIdCanonical: params.waIdCanonical ?? undefined,
    },
    create: {
      clientId: params.clientId,
      waId: params.waId,
      waIdCanonical: params.waIdCanonical ?? undefined,
      departmentId: params.departmentId,
    },
  });
}

async function loadConversationOperationalLookups(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    states: Array<
      | {
          departmentId?: string | null;
          queueId?: string | null;
        }
      | null
      | undefined
    >;
    defaults: Awaited<ReturnType<typeof ensureDefaultDepartmentAndQueue>>;
  }
) {
  const departmentIds = Array.from(
    new Set(
      params.states
        .map((item) => item?.departmentId ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );
  const queueIds = Array.from(
    new Set(
      params.states
        .map((item) => item?.queueId ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [departments, queues] = await Promise.all([
    departmentIds.length > 0
      ? prisma.department.findMany({
          where: { clientId: params.clientId, id: { in: departmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    queueIds.length > 0
      ? prisma.queue.findMany({
          where: { clientId: params.clientId, id: { in: queueIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const departmentById = new Map(departments.map((item) => [item.id, item.name]));
  const queueById = new Map(queues.map((item) => [item.id, item.name]));
  departmentById.set(params.defaults.department.id, params.defaults.department.name);
  queueById.set(params.defaults.queue.id, params.defaults.queue.name);
  return { departmentById, queueById };
}

function isAgentRole(role: string | null | undefined) {
  return normalizeUserRole(role) === "AGENT";
}

function isSupervisorRole(role: string | null | undefined) {
  return normalizeUserRole(role) === "SUPERVISOR";
}

function isAdminRole(role: string | null | undefined) {
  return normalizeUserRole(role) === "ADMIN";
}

function canManageAnyConversation(role: string | null | undefined) {
  return isSupervisorRole(role) || isAdminRole(role);
}

function canManageOwnedConversation(
  role: string | null | undefined,
  assignedUserId: string | null | undefined,
  currentUserId: string
) {
  if (canManageAnyConversation(role)) return true;
  if (!assignedUserId) return false;
  return assignedUserId === currentUserId;
}

async function loadAppDepartmentAccess(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    userId: string;
    role: string;
  }
) {
  if (isAdminRole(params.role)) {
    return { requiresDepartmentScope: false, departmentId: null as string | null };
  }
  if (!isAgentRole(params.role) && !isSupervisorRole(params.role)) {
    return { requiresDepartmentScope: false, departmentId: null as string | null };
  }
  const user = await prisma.user.findFirst({
    where: { id: params.userId, clientId: params.clientId },
    select: { departmentId: true },
  });
  return {
    requiresDepartmentScope: true,
    departmentId: user?.departmentId ?? null,
  };
}

function hasConversationDepartmentAccess(params: {
  role: string;
  userDepartmentId: string | null;
  conversationDepartmentId: string | null | undefined;
}) {
  if (isAdminRole(params.role)) return true;
  if (!isAgentRole(params.role) && !isSupervisorRole(params.role)) return true;
  if (!params.userDepartmentId) return false;
  return params.userDepartmentId === (params.conversationDepartmentId ?? null);
}

function logAppDepartmentDenied(params: {
  requestId: string;
  userId: string;
  clientId: string;
  departmentId: string | null;
  conversationDepartmentId: string | null | undefined;
  waId?: string | null;
  route: string;
}) {
  logger.warn({
    event: "rbac.department.denied",
    requestId: params.requestId,
    userId: params.userId,
    clientId: params.clientId,
    departmentId: params.departmentId,
    conversationDepartmentId: params.conversationDepartmentId ?? null,
    waId: params.waId ?? null,
    route: params.route,
  });
}

async function canManageLead(
  prisma: ReturnType<typeof getPrisma>,
  client: { id: string; clientKey: string },
  clientAuth: { userId: string; role: string },
  lead: { waId: string; waIdCanonical?: string | null },
  requestId: string,
  source: string
) {
  if (!isAgentRole(clientAuth.role)) return true;
  const resolvedConversation = await resolveConversationTarget(prisma, {
    clientId: client.id,
    clientKey: client.clientKey,
    rawWaId: lead.waIdCanonical ?? lead.waId,
    requestId,
    source,
  });
  const conversation = await runtimeStorage.getConversation(
    resolvedConversation.resolvedWaId,
    client.clientKey
  );
  return canManageOwnedConversation(
    clientAuth.role,
    conversation?.assignedUserId ?? null,
    clientAuth.userId
  );
}

function logAppRbacDenied(params: {
  requestId: string;
  route: string;
  userId: string;
  clientId: string;
  role: string;
  reason: string;
  waId?: string | null;
  leadId?: string | null;
}) {
  logger.warn({
    event: "rbac.denied",
    scope: "app",
    requestId: params.requestId,
    route: params.route,
    userId: params.userId,
    clientId: params.clientId,
    role: normalizeUserRole(params.role),
    reason: params.reason,
    waId: params.waId ?? null,
    leadId: params.leadId ?? null,
  });
}

function serializeConversationOperationalFields(params: {
  conversation: {
    mode?: string | null;
    handoff?: { status?: string | null } | null;
    assignedUserId?: string | null;
    assignedTo?: string | null;
    assignedAt?: string | null;
    departmentId?: string | null;
    queueId?: string | null;
    status?: string | ConversationOperationalStatus | null;
    closedAt?: string | null;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    answers?: {
      flowContext?: Record<string, unknown> | null;
      flowTags?: string[] | null;
    } | null;
  } | null;
  assignedUserName: string | null;
  departmentName: string | null;
  queueName: string | null;
}) {
  const conversation = params.conversation;
  const flowContext = sanitizeInboxFlowContext(conversation?.answers?.flowContext ?? null);
  const assignedUserId = conversation?.assignedUserId ?? null;
  const normalizedStatus = normalizeConversationOperationalStatus(conversation?.status);
  const status =
    assignedUserId && normalizedStatus === ConversationOperationalStatus.WAITING
      ? ConversationOperationalStatus.IN_PROGRESS
      : normalizedStatus;
  return {
    mode: conversation?.mode === "HUMAN" ? "HUMAN" : "BOT",
    handoffStatus: conversation?.handoff?.status ?? "none",
    assignedUserId,
    assignedTo: conversation?.assignedTo ?? null,
    assignedUserName: params.assignedUserName,
    assignedAt: conversation?.assignedAt ?? null,
    departmentId: conversation?.departmentId ?? null,
    departmentName: params.departmentName,
    queueId: conversation?.queueId ?? null,
    queueName: params.queueName,
    status,
    closedAt: conversation?.closedAt ?? null,
    lastInboundAt: conversation?.lastInboundAt ?? null,
    lastOutboundAt: conversation?.lastOutboundAt ?? null,
    isUnassigned: !conversation?.assignedUserId,
    flowContext,
    flowTags: sanitizeInboxFlowTags(conversation?.answers?.flowTags ?? null),
  };
}

const INBOX_UX_EVENT_NAMES = [
  "inbox.priority.rendered",
  "inbox.sorted",
  "inbox.suggestion.used",
] as const;

function isAllowedInboxUxEvent(value: string): value is (typeof INBOX_UX_EVENT_NAMES)[number] {
  return (INBOX_UX_EVENT_NAMES as readonly string[]).includes(value);
}

function sanitizeInboxUxEventPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of ["conversationKey", "leadId", "leadTemp", "topPriority"] as const) {
    const item = source[key];
    if (typeof item === "string") {
      result[key] = item.slice(0, 180);
    } else if (item === null) {
      result[key] = null;
    }
  }
  const count = source.count;
  if (typeof count === "number" && Number.isFinite(count)) {
    result.count = Math.max(0, Math.min(Math.floor(count), 1000));
  }
  return result;
}

const INBOX_FLOW_CONTEXT_KEYS = [
  "area",
  "servico",
  "situacao",
  "prioridade",
  "lead_temp",
  "intent",
  "origem_intencao",
] as const;

function sanitizeInboxFlowContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean | null> = {};
  for (const key of INBOX_FLOW_CONTEXT_KEYS) {
    const item = source[key];
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
    }
  }
  return result;
}

function sanitizeInboxFlowTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

async function buildConversationActionPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    conversation: Awaited<ReturnType<typeof runtimeStorage.getConversation>>;
    assignedUserName?: string | null;
  }
) {
  const defaults = await ensureDefaultDepartmentAndQueue(prisma, params.clientId);
  const conversation = materializeConversationOperationalState(params.conversation, defaults);
  const assignedUserName =
    params.assignedUserName ??
    (conversation?.assignedUserId
      ? await findAssignedUserName(prisma, params.clientId, conversation.assignedUserId)
      : null);
  const departmentName =
    conversation?.departmentId === defaults.department.id || !conversation?.departmentId
      ? defaults.department.name
      : (
          await prisma.department.findFirst({
            where: { clientId: params.clientId, id: conversation.departmentId },
            select: { name: true },
          })
        )?.name ?? null;
  const queueName =
    conversation?.queueId === defaults.queue.id || !conversation?.queueId
      ? defaults.queue.name
      : (
          await prisma.queue.findFirst({
            where: { clientId: params.clientId, id: conversation.queueId },
            select: { name: true },
          })
        )?.name ?? null;

  return {
    ok: true,
    waId: conversation?.waId ?? null,
    waIdCanonical: conversation?.waIdCanonical ?? null,
    ...serializeConversationOperationalFields({
      conversation,
      assignedUserName,
      departmentName,
      queueName,
    }),
  };
}

function buildScopedWaIdWhere(rawWaId: string) {
  const lookup = buildWaIdLookup(rawWaId);
  return {
    OR: [{ waIdCanonical: { in: lookup.variants } }, { waId: { in: lookup.variants } }],
  };
}

type PrivacyConversationTarget = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  deletedAt?: Date | null;
  anonymizedAt?: Date | null;
};

function normalizeRetentionDays(value: unknown) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function maskPersonalWaId(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}******${digits.slice(-4)}`;
  }
  if (raw.length <= 4) return "******";
  return `${raw.slice(0, 2)}******${raw.slice(-2)}`;
}

function buildAnonymizedWaId(target: PrivacyConversationTarget) {
  const masked = maskPersonalWaId(target.waId);
  return masked.includes("*") ? `${masked}:${target.id.slice(0, 8)}` : `anon:${target.id.slice(0, 12)}`;
}

function buildPrivacyAuditPayload(params: {
  userId: string;
  clientId: string;
  conversationId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  return {
    userId: params.userId,
    clientId: params.clientId,
    conversationId: params.conversationId ?? null,
    timestamp: new Date().toISOString(),
    action: params.action,
    ...(params.details ? { details: params.details } : {}),
  };
}

async function persistPrivacyAuditEvent(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    conversationId?: string | null;
    waId?: string | null;
    waIdCanonical?: string | null;
    requestId: string;
    eventName: "conversation.deleted" | "conversation.anonymized" | "retention.executed";
    payload: Prisma.InputJsonValue;
  }
) {
  await prisma.event.create({
    data: {
      clientId: params.clientId,
      conversationId: params.conversationId ?? null,
      waId: params.waId ?? null,
      waIdCanonical: params.waIdCanonical ?? null,
      requestId: `${params.requestId}:${params.eventName}`,
      eventName: params.eventName,
      payloadJson: params.payload,
    },
  });
}

async function getOrCreateRetentionConfig(prisma: ReturnType<typeof getPrisma>, clientId: string) {
  return prisma.retentionConfig.upsert({
    where: { clientId },
    update: {},
    create: { clientId, retentionDays: 90 },
  });
}

async function findPrivacyConversationTarget(
  prisma: ReturnType<typeof getPrisma>,
  clientId: string,
  rawConversationId: string
): Promise<PrivacyConversationTarget | null> {
  if (!rawConversationId) return null;
  const normalizedWaId = normalizeWaId(rawConversationId);
  const idLookup = isUuidLike(rawConversationId) ? [{ id: rawConversationId }] : [];
  const waIdLookup = normalizedWaId
    ? [
        { waId: normalizedWaId },
        { waIdCanonical: canonicalizeBrazilWaId(normalizedWaId) },
      ]
    : [];
  if (idLookup.length === 0 && waIdLookup.length === 0) return null;
  return prisma.conversation.findFirst({
    where: {
      clientId,
      OR: [...idLookup, ...waIdLookup],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true, anonymizedAt: true },
  });
}

function buildConversationPrivacyWhere(target: PrivacyConversationTarget) {
  const values = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  return {
    OR: [
      { waId: { in: values } },
      { waIdCanonical: { in: values } },
    ],
  };
}

async function deleteConversationPrivacyData(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
    audit: boolean;
  }
) {
  const target = params.conversation;
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const now = new Date();
  const matchingConversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      OR: [{ id: target.id }, ...scopedWaWhere.OR],
    },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true },
  });
  const conversationIds = matchingConversations.map((item) => item.id);
  const waIds = Array.from(
    new Set(matchingConversations.flatMap((item) => [item.waId, item.waIdCanonical].filter(Boolean) as string[]))
  );

  const result = await prisma.$transaction(async (tx) => {
    const conversations = await tx.conversation.updateMany({
      where: { clientId: params.clientId, id: { in: conversationIds }, deletedAt: null },
      data: {
        deletedAt: now,
        closedAt: now,
        departmentId: null,
      },
    });
    const runtimeStates = await tx.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        status: ConversationOperationalStatus.CLOSED,
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    });
    return { conversations, runtimeStates };
  });

  for (const waId of waIds) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  if (params.audit) {
    const payload = buildPrivacyAuditPayload({
      userId: params.userId,
      clientId: params.clientId,
      conversationId: target.id,
      action: "conversation.deleted",
      details: {
        action: "soft_delete",
        softDeletedConversations: result.conversations.count,
        preservedIdentity: true,
        preservedHistory: true,
      },
    });
    await persistPrivacyAuditEvent(prisma, {
      clientId: params.clientId,
      conversationId: null,
      waId: null,
      waIdCanonical: null,
      requestId: params.requestId,
      eventName: "conversation.deleted",
      payload: payload as Prisma.InputJsonValue,
    });
    logger.info({ event: "conversation.deleted", ...payload });
  }

  return {
    deleted: {
      action: "soft_delete",
      conversations: result.conversations.count,
      softDeletedConversations: result.conversations.count,
      metrics: 0,
      messages: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      runtimeStates: result.runtimeStates.count,
      events: 0,
      contacts: 0,
      leads: 0,
      leadNotes: 0,
    },
  };
}

async function anonymizeConversationPrivacyData(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    conversation: PrivacyConversationTarget;
    userId: string;
    requestId: string;
  }
) {
  const target = params.conversation;
  const anonymizedWaId = buildAnonymizedWaId(target);
  const anonymizedName = "Usuario Anonimizado";
  const scopedWaWhere = buildConversationPrivacyWhere(target);
  const waIds = Array.from(new Set([target.waId, target.waIdCanonical].filter(Boolean))) as string[];
  const now = new Date();

  const [conversation, runtimeStates, inbound, outbound, contacts, leads, leadNotes, events] = await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { clientId: params.clientId, id: target.id },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        anonymizedAt: now,
        deletedAt: now,
        closedAt: now,
        historyVisibleAfter: now,
        departmentId: null,
      },
    }),
    prisma.conversationRuntimeState.updateMany({
      where: { clientId: params.clientId, ...scopedWaWhere },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        conversationKey: `${params.clientKey}:${anonymizedWaId}`,
        answers: {},
        status: "CLOSED",
        closedAt: now,
        assignedUserId: null,
        assignedTo: null,
        assignedAt: null,
        departmentId: null,
        queueId: null,
        handoffStatus: "NONE",
        handoffReleasedAt: now,
        mode: "BOT",
      },
    }),
    prisma.inboundMessage.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: { waId: anonymizedWaId, waIdCanonical: anonymizedWaId, bodyText: "[mensagem anonimizada]", rawPayload: Prisma.JsonNull },
    }),
    prisma.outboundMessage.updateMany({
      where: { clientId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: { waId: anonymizedWaId, waIdCanonical: anonymizedWaId, bodyText: "[mensagem anonimizada]", errorBody: null, rawPayload: Prisma.JsonNull },
    }),
    prisma.contact.updateMany({
      where: { clientId: params.clientId, waId: { in: waIds } },
      data: { waId: anonymizedWaId, name: anonymizedName },
    }),
    prisma.lead.updateMany({
      where: { tenantId: params.clientId, OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }] },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        name: anonymizedName,
        phone: anonymizedWaId,
        city: null,
        service: null,
        email: null,
        company: null,
      },
    }),
    prisma.leadNote.updateMany({
      where: {
        tenantId: params.clientId,
        lead: {
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
      },
      data: { body: "[nota anonimizada]" },
    }),
    prisma.event.updateMany({
      where: {
        clientId: params.clientId,
        eventName: { notIn: [...IMMUTABLE_PRIVACY_AUDIT_EVENTS] },
        OR: [{ conversationId: target.id }, { waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
      },
      data: {
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
      },
    }),
  ]);

  for (const waId of waIds) {
    await runtimeStorage.deleteConversation(waId, params.clientKey);
  }

  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: target.id,
    action: "conversation.anonymized",
    details: { anonymizedWaId: maskPersonalWaId(target.waId) },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    conversationId: target.id,
    waId: anonymizedWaId,
    waIdCanonical: anonymizedWaId,
    requestId: params.requestId,
    eventName: "conversation.anonymized",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "conversation.anonymized", ...payload });
  logger.info({
    event: "ai.memory.cleared",
    clientId: params.clientId,
    clientKey: params.clientKey,
    conversationId: target.id,
    runtimeStates: runtimeStates.count,
    reason: "conversation_anonymized",
  });

  return {
    anonymized: {
      conversation: conversation.count,
      runtimeStates: runtimeStates.count,
      inboundMessages: inbound.count,
      outboundMessages: outbound.count,
      contacts: contacts.count,
      leads: leads.count,
      leadNotes: leadNotes.count,
      events: events.count,
    },
    waId: anonymizedWaId,
  };
}

async function executeRetentionForClient(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    userId: string;
    requestId: string;
  }
) {
  const retention = await getOrCreateRetentionConfig(prisma, params.clientId);
  const cutoff = new Date(Date.now() - retention.retentionDays * 24 * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      createdAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }],
      AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: cutoff } }] }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, waId: true, waIdCanonical: true, deletedAt: true, anonymizedAt: true },
  });
  let softDeletedConversations = 0;
  let anonymizedConversations = 0;
  for (const conversation of conversations) {
    const anonymized = await anonymizeConversationPrivacyData(prisma, {
      clientId: params.clientId,
      clientKey: params.clientKey,
      conversation,
      userId: params.userId,
      requestId: `${params.requestId}:retention:anonymize:${conversation.id}`,
    });
    anonymizedConversations += anonymized.anonymized.conversation;
    const softDeleted = await deleteConversationPrivacyData(prisma, {
      clientId: params.clientId,
      clientKey: params.clientKey,
      conversation,
      userId: params.userId,
      requestId: `${params.requestId}:retention:${conversation.id}`,
      audit: false,
    });
    softDeletedConversations += Math.max(
      softDeleted.deleted.softDeletedConversations,
      anonymized.anonymized.conversation
    );
  }
  const payload = buildPrivacyAuditPayload({
    userId: params.userId,
    clientId: params.clientId,
    conversationId: null,
    action: "retention.executed",
    details: {
      retentionDays: retention.retentionDays,
      cutoff: cutoff.toISOString(),
      action: "soft_delete_anonymize",
      anonymizedConversations,
      softDeletedConversations,
    },
  });
  await persistPrivacyAuditEvent(prisma, {
    clientId: params.clientId,
    requestId: params.requestId,
    eventName: "retention.executed",
    payload: payload as Prisma.InputJsonValue,
  });
  logger.info({ event: "retention.executed", ...payload });
  return {
    retentionDays: retention.retentionDays,
    cutoff: cutoff.toISOString(),
    deletedConversations: softDeletedConversations,
    softDeletedConversations,
    anonymizedConversations,
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
      deletedAt: null,
      anonymizedAt: null,
      ...buildScopedWaIdWhere(lookup.raw),
    },
    select: {
      waId: true,
      waIdCanonical: true,
      id: true,
      departmentId: true,
      createdAt: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      historyVisibleAfter: true,
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
  // Map preserves insertion order, so the first valid raw waId wins for each canonical key.
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

type ConversationListCursor = {
  updatedAt: string;
  conversationIdentity: string;
};

type ContactTimelineCursor = {
  createdAt: string;
};

function buildEmptyDashboardOverview() {
  return {
    ok: true,
    kpis: {
      active: 0,
      waiting: 0,
      waitingUser: 0,
      closedToday: 0,
      avgFirstResponseTimeSec: null,
      avgResolutionTimeSec: null,
      slaBreaches: 0,
      totalConversations: 0,
    },
    queue: [],
    generatedAt: new Date().toISOString(),
  };
}

function startOfCurrentDay() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function getLatestDate(...values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

function resolveDashboardOperationalStatus(state: {
  status: ConversationOperationalStatus | null;
  mode: string | null;
  assignedUserId: string | null;
}) {
  if (state.status) return state.status;
  if (state.mode === "HUMAN") {
    return state.assignedUserId ? ConversationOperationalStatus.IN_PROGRESS : ConversationOperationalStatus.WAITING;
  }
  return null;
}

async function buildAppDashboardOverview(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    departmentId: string | null;
    assignedUserId: string | null;
    status: ConversationOperationalStatus | null;
  }
) {
  const dashboardStatuses = [
    ConversationOperationalStatus.WAITING,
    ConversationOperationalStatus.IN_PROGRESS,
    ConversationOperationalStatus.WAITING_USER,
    ConversationOperationalStatus.CLOSED,
  ];
  const runtimeStates = await prisma.conversationRuntimeState.findMany({
    where: {
      clientId: params.clientId,
      status: params.status ?? { in: dashboardStatuses },
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.assignedUserId ? { assignedUserId: params.assignedUserId } : {}),
    },
    select: {
      waId: true,
      waIdCanonical: true,
      mode: true,
      handoffStatus: true,
      handoffRequestedAt: true,
      handoffActivatedAt: true,
      assignedUserId: true,
      assignedAt: true,
      departmentId: true,
      queueId: true,
      status: true,
      closedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      updatedAt: true,
    },
  });
  if (runtimeStates.length === 0) return buildEmptyDashboardOverview();

  const waIds = Array.from(new Set(runtimeStates.map((item) => item.waId)));
  const canonicalWaIds = Array.from(
    new Set(runtimeStates.map((item) => item.waIdCanonical ?? item.waId))
  );
  const conversations = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      departmentId: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      updatedAt: true,
    },
  });
  if (conversations.length === 0) return buildEmptyDashboardOverview();

  const conversationIds = conversations.map((item) => item.id);
  const [metrics, slaConfig, leads] = await Promise.all([
    prisma.conversationMetrics.findMany({
      where: {
        clientId: params.clientId,
        conversationId: { in: conversationIds },
      },
      select: {
        conversationId: true,
        firstResponseTimeSec: true,
        resolutionTimeSec: true,
      },
    }),
    prisma.sLAConfig.findUnique({
      where: { clientId: params.clientId },
      select: {
        firstResponseLimitSec: true,
        resolutionTimeLimitSec: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: params.clientId,
        OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: canonicalWaIds } }],
      },
      select: {
        waId: true,
        waIdCanonical: true,
        name: true,
        phone: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const runtimeByWaId = new Map<string, (typeof runtimeStates)[number]>();
  for (const state of runtimeStates) {
    runtimeByWaId.set(getWaIdGroupKey(state.waId, state.waIdCanonical), state);
  }
  const leadByWaId = new Map<string, (typeof leads)[number]>();
  for (const lead of leads) {
    const key = getWaIdGroupKey(lead.waId, lead.waIdCanonical);
    const current = leadByWaId.get(key);
    if (!current || lead.updatedAt.getTime() > current.updatedAt.getTime()) {
      leadByWaId.set(key, lead);
    }
  }
  const operationalItems = conversations
    .map((conversation) => {
      const key = getWaIdGroupKey(conversation.waId, conversation.waIdCanonical);
      const state = runtimeByWaId.get(key);
      const status = state
        ? resolveDashboardOperationalStatus(state)
        : null;
      const departmentId = state?.departmentId ?? conversation.departmentId ?? null;
      const assignedUserId = state?.assignedUserId ?? null;
      const lastInteractionAt = getLatestDate(
        state?.lastInboundAt,
        state?.lastOutboundAt,
        conversation.lastInboundAt,
        conversation.lastOutboundAt,
        state?.updatedAt,
        conversation.updatedAt
      );
      const waitingSince =
        state?.handoffRequestedAt ??
        state?.handoffActivatedAt ??
        state?.updatedAt ??
        conversation.lastInboundAt ??
        conversation.updatedAt;
      return {
        conversation,
        state,
        key,
        status,
        departmentId,
        assignedUserId,
        lastInteractionAt,
        waitingSince,
      };
    })
    .filter((item) => item.status !== null)
    .filter((item) => !params.departmentId || item.departmentId === params.departmentId)
    .filter((item) => !params.assignedUserId || item.assignedUserId === params.assignedUserId)
    .filter((item) => !params.status || item.status === params.status);

  const operationalIds = new Set(operationalItems.map((item) => item.conversation.id));
  const scopedMetrics = metrics.filter((metric) => operationalIds.has(metric.conversationId));
  const firstResponseValues = metrics
    .filter((metric) => operationalIds.has(metric.conversationId))
    .map((metric) => metric.firstResponseTimeSec)
    .filter((value): value is number => typeof value === "number");
  const resolutionValues = metrics
    .filter((metric) => operationalIds.has(metric.conversationId))
    .map((metric) => metric.resolutionTimeSec)
    .filter((value): value is number => typeof value === "number");
  const firstResponseLimitSec =
    slaConfig && slaConfig.firstResponseLimitSec > 0 ? slaConfig.firstResponseLimitSec : null;
  const resolutionTimeLimitSec =
    slaConfig && slaConfig.resolutionTimeLimitSec > 0 ? slaConfig.resolutionTimeLimitSec : null;
  const slaBreaches = scopedMetrics.reduce((count, metric) => {
    const firstResponseBreached =
      firstResponseLimitSec !== null &&
      metric.firstResponseTimeSec !== null &&
      metric.firstResponseTimeSec > firstResponseLimitSec;
    const resolutionBreached =
      resolutionTimeLimitSec !== null &&
      metric.resolutionTimeSec !== null &&
      metric.resolutionTimeSec > resolutionTimeLimitSec;
    return count + (firstResponseBreached || resolutionBreached ? 1 : 0);
  }, 0);

  const departmentIds = Array.from(
    new Set(operationalItems.map((item) => item.departmentId).filter((value): value is string => Boolean(value)))
  );
  const assignedUserIds = Array.from(
    new Set(operationalItems.map((item) => item.assignedUserId).filter((value): value is string => Boolean(value)))
  );
  const [departments, users] = await Promise.all([
    departmentIds.length
      ? prisma.department.findMany({
          where: { clientId: params.clientId, id: { in: departmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    assignedUserIds.length
      ? prisma.user.findMany({
          where: { clientId: params.clientId, id: { in: assignedUserIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const departmentNameById = new Map(departments.map((item) => [item.id, item.name]));
  const userNameById = new Map(users.map((item) => [item.id, item.name]));

  // Uses the server timezone for now; this can be moved to a tenant/business timezone later.
  const startOfDay = startOfCurrentDay();
  const queue = operationalItems
    .filter((item) => item.status === ConversationOperationalStatus.WAITING)
    .sort((left, right) => left.waitingSince.getTime() - right.waitingSince.getTime())
    .slice(0, 50)
    .map((item) => {
      const lead = leadByWaId.get(item.key);
      return {
        id: item.conversation.id,
        waId: item.conversation.waId,
        displayName: lead?.name ?? lead?.phone ?? null,
        status: item.status,
        departmentId: item.departmentId,
        departmentName: item.departmentId ? departmentNameById.get(item.departmentId) ?? null : null,
        assignedUserId: item.assignedUserId,
        assignedUserName: item.assignedUserId ? userNameById.get(item.assignedUserId) ?? null : null,
        lastInteractionAt: item.lastInteractionAt ? item.lastInteractionAt.toISOString() : null,
        waitingSince: item.waitingSince ? item.waitingSince.toISOString() : null,
      };
    });

  return {
    ok: true,
    kpis: {
      active: operationalItems.filter((item) => item.status === ConversationOperationalStatus.IN_PROGRESS).length,
      waiting: operationalItems.filter((item) => item.status === ConversationOperationalStatus.WAITING).length,
      waitingUser: operationalItems.filter((item) => item.status === ConversationOperationalStatus.WAITING_USER).length,
      closedToday: operationalItems.filter(
        (item) =>
          item.status === ConversationOperationalStatus.CLOSED &&
          item.state?.closedAt &&
          item.state.closedAt >= startOfDay
      ).length,
      avgFirstResponseTimeSec:
        firstResponseValues.length > 0
          ? Math.round(firstResponseValues.reduce((sum, value) => sum + value, 0) / firstResponseValues.length)
          : null,
      avgResolutionTimeSec:
        resolutionValues.length > 0
          ? Math.round(resolutionValues.reduce((sum, value) => sum + value, 0) / resolutionValues.length)
          : null,
      slaBreaches,
      totalConversations: operationalItems.length,
    },
    queue,
    generatedAt: new Date().toISOString(),
  };
}

type ConversationListFilters = {
  status: ConversationOperationalStatus | null;
  departmentId: string | null;
  assignedUserId: string | null;
  unassigned: boolean;
  search: string;
};

function decodeConversationListCursor(raw: string): ConversationListCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<ConversationListCursor>;
    if (!parsed.updatedAt || !parsed.conversationIdentity || !Number.isFinite(Date.parse(parsed.updatedAt))) {
      return null;
    }
    return {
      updatedAt: parsed.updatedAt,
      conversationIdentity: parsed.conversationIdentity,
    };
  } catch {
    return null;
  }
}

function encodeConversationListCursor(cursor: ConversationListCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeContactTimelineCursor(raw: string): ContactTimelineCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<ContactTimelineCursor>;
    if (!parsed.createdAt || !Number.isFinite(Date.parse(parsed.createdAt))) {
      return null;
    }
    return { createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function encodeContactTimelineCursor(cursor: ContactTimelineCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function getTimelineMessageTitle(direction: "INBOUND" | "OUTBOUND", type: MessageType) {
  const prefix = direction === "INBOUND" ? "recebida" : "enviada";
  switch (type) {
    case "IMAGE":
      return `Imagem ${prefix}`;
    case "AUDIO":
      return `Audio ${prefix}`;
    case "VIDEO":
      return `Video ${prefix}`;
    case "DOCUMENT":
      return `Documento ${prefix}`;
    case "TEMPLATE":
      return `Template ${prefix}`;
    case "TEXT":
      return `Mensagem ${prefix}`;
    default:
      return `Interacao ${prefix}`;
  }
}

function getTimelineEventTitle(eventName: string) {
  switch (eventName) {
    case "conversation.assigned":
      return "Atendimento assumido";
    case "conversation.transferred":
      return "Atendimento transferido";
    case "conversation.department.transferred":
      return "Setor alterado";
    case "conversation.handoff.updated":
      return "Entrada na fila humana";
    case "conversation.released":
      return "Liberado para automacao";
    case "conversation.released_to_general":
      return "Liberado para Atendimento Geral";
    case "conversation.status_changed":
      return "Status alterado";
    case "conversation.deleted":
      return "Conversa removida da operacao";
    case "conversation.anonymized":
      return "Dados anonimizados";
    case "conversation.reactivated_after_retention":
      return "Conversa reativada";
    case "lead.capture.requested":
      return "Cadastro solicitado";
    case "lead.captured":
      return "Cadastro capturado";
    case "lead.demo_requested":
      return "Demo solicitada";
    case "lead.demo_scheduled":
      return "Demo agendada";
    case "message.status.updated":
      return "Status da mensagem atualizado";
    default:
      return eventName.replace(/\./g, " ");
  }
}

const CONTACT_TIMELINE_VISIBLE_EVENT_NAMES = [
  "conversation.assigned",
  "conversation.transferred",
  "conversation.department.transferred",
  "conversation.handoff.updated",
  "conversation.released",
  "conversation.released_to_general",
  "conversation.status_changed",
] as const;

function getTimelineMessageBody(type: MessageType, bodyText?: string | null, templateName?: string | null) {
  if (bodyText?.trim()) return bodyText;
  if (templateName?.trim()) return `Template: ${templateName}`;
  switch (type) {
    case "IMAGE":
      return "Imagem";
    case "AUDIO":
      return "Audio";
    case "VIDEO":
      return "Video";
    case "DOCUMENT":
      return "Documento";
    default:
      return null;
  }
}

function normalizeConversationStatusFilter(value: unknown): ConversationOperationalStatus | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === ConversationOperationalStatus.WAITING ||
    normalized === ConversationOperationalStatus.IN_PROGRESS ||
    normalized === ConversationOperationalStatus.WAITING_USER ||
    normalized === ConversationOperationalStatus.CLOSED
    ? normalized
    : null;
}

function getConversationListCursorIdentity(item: { waId: string; waIdCanonical: string }) {
  return item.waIdCanonical || item.waId;
}

function isAfterConversationListCursor(
  item: { updatedAt: Date; waId: string; waIdCanonical: string },
  cursor: ConversationListCursor | null
) {
  if (!cursor) return true;
  const itemTimestamp = item.updatedAt.getTime();
  const cursorTimestamp = Date.parse(cursor.updatedAt);
  if (!Number.isFinite(cursorTimestamp)) return true;
  if (itemTimestamp < cursorTimestamp) return true;
  if (itemTimestamp > cursorTimestamp) return false;
  return getConversationListCursorIdentity(item) > cursor.conversationIdentity;
}

function compareConversationListOrder(
  left: { updatedAt: Date; waId: string; waIdCanonical: string },
  right: { updatedAt: Date; waId: string; waIdCanonical: string }
) {
  const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedDiff !== 0) return updatedDiff;
  return getConversationListCursorIdentity(left).localeCompare(getConversationListCursorIdentity(right));
}

function conversationMatchesListFilters(item: {
  lastMessage: { bodyText: string | null } | null;
  leadName: string | null;
  leadPhone: string | null;
  waId: string;
  status: ConversationOperationalStatus | null;
  departmentId: string | null;
  assignedUserId: string | null;
}, filters: ConversationListFilters) {
  if (filters.status && item.status !== filters.status) return false;
  if (filters.departmentId && item.departmentId !== filters.departmentId) return false;
  if (filters.assignedUserId && item.assignedUserId !== filters.assignedUserId) return false;
  if (filters.unassigned && item.assignedUserId) return false;
  if (filters.search) {
    const haystack = [item.leadName, item.leadPhone, item.waId, item.lastMessage?.bodyText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

function conversationListItemIsInHumanFlow(item: {
  mode?: string | null;
  handoffStatus?: string | null;
  assignedUserId: string | null;
  assignedAt: string | null;
}) {
  return (
    item.mode === "HUMAN" ||
    item.handoffStatus === "active" ||
    item.handoffStatus === "pending" ||
    Boolean(item.assignedUserId) ||
    Boolean(item.assignedAt)
  );
}

function getInboxPriorityScore(item: { flowContext?: Record<string, unknown> | null }) {
  const leadTemp = String(item.flowContext?.lead_temp ?? "").trim().toLowerCase();
  if (leadTemp === "quente") return 3;
  if (leadTemp === "morno") return 2;
  if (leadTemp === "frio") return 1;
  return 0;
}

function getInboxWaitingTimestamp(item: {
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  updatedAt: Date | string;
}) {
  const raw = item.lastInboundAt ?? item.lastOutboundAt ?? item.updatedAt;
  const timestamp = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function getInboxActivityTimestamp(item: {
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  updatedAt: Date | string;
}) {
  const timestamps = [item.lastInboundAt, item.lastOutboundAt, item.updatedAt]
    .map((value) => (value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""))))
    .filter((timestamp) => Number.isFinite(timestamp));
  return timestamps.length > 0 ? Math.max(...timestamps) : Number.NEGATIVE_INFINITY;
}

function sortConversationItemsByPriorityAndWait<T extends {
  flowContext?: Record<string, unknown> | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  updatedAt: Date | string;
}>(items: T[]) {
  return [...items].sort((left, right) => {
    const priorityDiff = getInboxPriorityScore(right) - getInboxPriorityScore(left);
    if (priorityDiff !== 0) return priorityDiff;
    const waitDiff = getInboxWaitingTimestamp(left) - getInboxWaitingTimestamp(right);
    if (waitDiff !== 0) return waitDiff;
    return String(left.updatedAt).localeCompare(String(right.updatedAt));
  });
}

function sortConversationItemsByRecent<T extends {
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  updatedAt: Date | string;
}>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTimestamp = getInboxActivityTimestamp(left);
    const rightTimestamp = getInboxActivityTimestamp(right);
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
    return String(right.updatedAt).localeCompare(String(left.updatedAt));
  });
}

function buildConversationFilterCounts(
  items: Array<{
    lastMessage: { bodyText: string | null } | null;
    leadName: string | null;
    leadPhone: string | null;
    waId: string;
    status: ConversationOperationalStatus | null;
    departmentId: string | null;
    assignedUserId: string | null;
  }>,
  filters: ConversationListFilters
) {
  const baseFilters = {
    ...filters,
    status: null,
    assignedUserId: null,
    unassigned: false,
  };
  const baseItems = items.filter((item) => conversationMatchesListFilters(item, baseFilters));
  const counts = {
    ALL: baseItems.length,
    WAITING: 0,
    IN_PROGRESS: 0,
    WAITING_USER: 0,
    CLOSED: 0,
    MINE: 0,
    UNASSIGNED: 0,
  };
  for (const item of baseItems) {
    if (item.status && Object.prototype.hasOwnProperty.call(counts, item.status)) {
      counts[item.status] += 1;
    }
    if (filters.assignedUserId && item.assignedUserId === filters.assignedUserId) {
      counts.MINE += 1;
    }
    if (!item.assignedUserId) {
      counts.UNASSIGNED += 1;
    }
  }
  return counts;
}

function buildEmptyConversationFilterCounts() {
  return {
    ALL: 0,
    WAITING: 0,
    IN_PROGRESS: 0,
    WAITING_USER: 0,
    CLOSED: 0,
    MINE: 0,
    UNASSIGNED: 0,
  };
}

async function buildConversationListPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    userId?: string;
    limit: number;
    cursor: ConversationListCursor | null;
    filters: ConversationListFilters;
    includeAssignedUserName: boolean;
    profile?: string | null;
  }
) {
  const defaults = await ensureDefaultDepartmentAndQueue(prisma, params.clientId);
  const conversationFetchLimit = Math.min(params.limit * 10 + 1, 1000);
  const messageFetchLimit = Math.min(conversationFetchLimit * 2, 2000);
  const conversationWhere: Prisma.ConversationWhereInput = {
    clientId: params.clientId,
    deletedAt: null,
    anonymizedAt: null,
    lastInboundAt: { not: null },
    ...(params.filters.departmentId ? { departmentId: params.filters.departmentId } : {}),
    ...(params.cursor
      ? {
          OR: [
            { updatedAt: { lt: new Date(params.cursor.updatedAt) } },
            {
              updatedAt: new Date(params.cursor.updatedAt),
              waIdCanonical: { gt: params.cursor.conversationIdentity },
            },
            {
              updatedAt: new Date(params.cursor.updatedAt),
              waIdCanonical: null,
              waId: { gt: params.cursor.conversationIdentity },
            },
          ],
        }
      : {}),
  };
  const conversations = await prisma.conversation.findMany({
    where: conversationWhere,
    orderBy: [{ updatedAt: "desc" }, { waIdCanonical: "asc" }, { waId: "asc" }],
    take: conversationFetchLimit,
    select: {
      waId: true,
      waIdCanonical: true,
      departmentId: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      historyVisibleAfter: true,
    },
  });
  if (conversations.length === 0) {
    const readState = params.userId
      ? await getInboxReadState(params.clientId, params.userId)
      : {
          lastReadAtByConversationKey: {},
          manuallyUnreadByConversationKey: {},
        };
    return {
      ok: true,
      count: 0,
      items: [],
      conversations: [],
      filterCounts: buildEmptyConversationFilterCounts(),
      nextCursor: null,
      readState,
    };
  }

  const groupedConversations = new Map<
    string,
    {
      waId: string;
      waIdCanonical: string;
      departmentId: string | null;
      updatedAt: Date;
      lastInboundAt: Date | null;
      lastOutboundAt: Date | null;
      historyVisibleAfter: Date | null;
    }
  >();
  for (const conversation of conversations) {
    const key = getWaIdGroupKey(conversation.waId, conversation.waIdCanonical);
    const current = groupedConversations.get(key);
    if (!current || compareConversationLookupPriority(conversation, current) < 0) {
      groupedConversations.set(key, {
        waId: conversation.waId,
        waIdCanonical: key,
        departmentId: conversation.departmentId,
        updatedAt: conversation.updatedAt,
        lastInboundAt: conversation.lastInboundAt,
        lastOutboundAt: conversation.lastOutboundAt,
        historyVisibleAfter: conversation.historyVisibleAfter,
      });
    }
  }
  const cursorFilteredConversations = Array.from(groupedConversations.values())
    .sort(compareConversationListOrder)
    .filter((item) => isAfterConversationListCursor(item, params.cursor));
  const winners = cursorFilteredConversations;
  const waIds = Array.from(new Set(winners.map((item) => item.waId)));
  const canonicalWaIds = Array.from(new Set(winners.map((item) => item.waIdCanonical)));
  const historyVisibleAfterByWaId = new Map(
    winners.map((item) => [item.waIdCanonical, item.historyVisibleAfter])
  );
  const isVisibleInCurrentOperation = (
    key: string,
    createdAt: Date | string | null | undefined
  ) => {
    const cutoff = historyVisibleAfterByWaId.get(key);
    if (!cutoff || !createdAt) return true;
    const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs > cutoff.getTime();
  };

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
        email: true,
        company: true,
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
        messageId: true,
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
        messageId: true,
        type: true,
        status: true,
        bodyText: true,
        templateName: true,
        rawPayload: true,
        createdAt: true,
      },
    }),
  ]);
  const runtimeConversations = await Promise.all(
    winners.map(async (item) => {
      const conversation = materializeConversationOperationalState(
        await runtimeStorage.getConversation(item.waId, params.clientKey),
        defaults
      );
      return {
        waIdCanonical: item.waIdCanonical,
        conversation,
      };
    })
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
  const operationalLookups = await loadConversationOperationalLookups(prisma, {
    clientId: params.clientId,
    states: runtimeConversations.map((item) => item.conversation),
    defaults,
  });
  const readState = params.userId
    ? await getInboxReadState(params.clientId, params.userId)
    : {
        lastReadAtByConversationKey: {},
        manuallyUnreadByConversationKey: {},
      };

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
    if (!isVisibleInCurrentOperation(key, item.createdAt)) continue;
    if (!latestInboundByWaId.has(key)) {
      latestInboundByWaId.set(key, item);
    }
  }
  const latestOutboundByWaId = new Map<string, (typeof outbound)[number]>();
  for (const item of outbound) {
    const key = getWaIdGroupKey(item.waId, item.waIdCanonical);
    if (!isVisibleInCurrentOperation(key, item.createdAt)) continue;
    if (!latestOutboundByWaId.has(key)) {
      latestOutboundByWaId.set(key, item);
    }
  }

  const allItems = winners.map((conversation) => {
    const key = conversation.waIdCanonical;
    const lead = leadByWaId.get(key);
    const latestInbound = latestInboundByWaId.get(key);
    const latestOutbound = latestOutboundByWaId.get(key);
    const runtimeState = runtimeByWaId.get(key);
    const operationalFields = serializeConversationOperationalFields({
      conversation: runtimeState ?? null,
      assignedUserName:
        params.includeAssignedUserName && runtimeState?.assignedUserId
          ? assignedUserById.get(runtimeState.assignedUserId) ?? null
          : null,
      departmentName: runtimeState?.departmentId
        ? operationalLookups.departmentById.get(runtimeState.departmentId) ?? null
        : null,
      queueName: runtimeState?.queueId
        ? operationalLookups.queueById.get(runtimeState.queueId) ?? null
        : null,
    });
    const inboundAt = latestInbound?.createdAt?.getTime() ?? -1;
    const outboundAt = latestOutbound?.createdAt?.getTime() ?? -1;
    const lastMessage =
      inboundAt >= outboundAt
        ? latestInbound
          ? {
              direction: "INBOUND",
              type: latestInbound.type,
              status: "RECEIVED",
              messageId: latestInbound.messageId,
              bodyText: latestInbound.bodyText ? latestInbound.bodyText.slice(0, 300) : null,
              templateName: null,
              createdAt: latestInbound.createdAt,
            }
          : null
        : latestOutbound
          ? {
              direction: "OUTBOUND",
              type: latestOutbound.type,
              status: normalizeInboxMessageStatus(
                extractMetaStatus(latestOutbound.rawPayload).lastStatus,
                latestOutbound.status
              ),
              messageId: latestOutbound.messageId,
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
      leadEmail: lead?.email ?? null,
      leadCompany: lead?.company ?? null,
      ...operationalFields,
      departmentId: operationalFields.departmentId ?? conversation.departmentId ?? null,
      updatedAt: conversation.updatedAt,
    };
  });
  const filteredItems = (
    params.profile === "business"
      ? sortConversationItemsByPriorityAndWait
      : sortConversationItemsByRecent
  )(
    allItems.filter(
      (item) =>
        conversationListItemIsInHumanFlow(item) &&
        conversationMatchesListFilters(item, params.filters)
    )
  );
  const filterCounts = buildConversationFilterCounts(
    allItems.filter(conversationListItemIsInHumanFlow),
    params.filters
  );
  const items = filteredItems.slice(0, params.limit);
  const nextCursorSource =
    filteredItems.length > params.limit
      ? items[items.length - 1]
      : cursorFilteredConversations.length >= conversationFetchLimit
        ? cursorFilteredConversations[cursorFilteredConversations.length - 1]
        : null;
  const nextCursor = nextCursorSource
    ? encodeConversationListCursor({
        updatedAt:
          nextCursorSource.updatedAt instanceof Date
            ? nextCursorSource.updatedAt.toISOString()
            : String(nextCursorSource.updatedAt),
        conversationIdentity: getConversationListCursorIdentity(nextCursorSource),
      })
    : null;

  return {
    ok: true,
    count: items.length,
    items,
    conversations: items,
    filterCounts,
    nextCursor,
    readState,
  };
}

async function buildConversationDetailPayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    waId: string;
    order: "asc" | "desc";
    after: Date | null;
    limit: number;
    includeRaw: boolean;
    includeAssignedUserName: boolean;
    requestId: string;
    source: string;
  }
) {
  const defaults = await ensureDefaultDepartmentAndQueue(prisma, params.clientId);
  const resolved = await resolveConversationTarget(prisma, {
    clientId: params.clientId,
    clientKey: params.clientKey,
    rawWaId: params.waId,
    requestId: params.requestId,
    source: params.source,
  });
  const conversation = resolved.winner
    ? materializeConversationOperationalState(
        await runtimeStorage.getConversation(resolved.resolvedWaId, params.clientKey),
        defaults
      )
    : null;
  const detailWaIds = Array.from(
    new Set(
      [
        ...buildWaIdLookup(params.waId).variants,
        resolved.resolvedWaId,
        resolved.resolvedWaIdCanonical,
        ...resolved.matchedWaIds,
      ].filter(Boolean)
    )
  );
  const historyVisibleAfter = resolved.winner?.historyVisibleAfter ?? null;
  const messageCreatedAfter =
    params.after && historyVisibleAfter
      ? params.after > historyVisibleAfter
        ? params.after
        : historyVisibleAfter
      : params.after ?? historyVisibleAfter;
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
        ...(messageCreatedAfter ? { createdAt: { gt: messageCreatedAfter } } : {}),
        OR: [{ waIdCanonical: { in: detailWaIds } }, { waId: { in: detailWaIds } }],
      },
      orderBy: { createdAt: params.order },
      take: params.limit,
      select: {
        createdAt: true,
        messageId: true,
        type: true,
        requestId: true,
        bodyText: true,
        rawPayload: true,
      },
    }),
    prisma.outboundMessage.findMany({
      where: {
        clientId: params.clientId,
        ...(messageCreatedAfter ? { createdAt: { gt: messageCreatedAfter } } : {}),
        OR: [{ waIdCanonical: { in: detailWaIds } }, { waId: { in: detailWaIds } }],
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
        rawPayload: true,
      },
    }),
  ]);
  const operationalLookups = await loadConversationOperationalLookups(prisma, {
    clientId: params.clientId,
    states: [conversation],
    defaults,
  });

  const items = [
    ...inbound.map((item) => ({
      direction: "INBOUND",
      type: item.type,
      status: "RECEIVED",
      intent: null,
      bodyText: item.bodyText ?? null,
      media: buildInboxMessageMedia({
        type: item.type,
        rawPayload: item.rawPayload,
        downloadUrl: item.messageId
          ? buildConversationMessageDownloadPath(resolved.resolvedWaId, item.messageId)
          : undefined,
      }),
      templateName: null,
      templateLang: null,
      requestId: item.requestId,
      messageId: item.messageId,
      metaMessageId: null,
      errorBody: null,
      createdAt: item.createdAt,
      rawPayload: params.includeRaw ? item.rawPayload : undefined,
    })),
    ...outbound.map((item) => {
      const metaStatus = extractMetaStatus(item.rawPayload);
      return {
        direction: "OUTBOUND",
        type: item.type,
        status: normalizeInboxMessageStatus(metaStatus.lastStatus, item.status),
        intent: null,
        bodyText: item.bodyText ?? null,
        media: buildInboxMessageMedia({
          type: item.type,
          rawPayload: item.rawPayload,
          downloadUrl: item.messageId
            ? buildConversationMessageDownloadPath(resolved.resolvedWaId, item.messageId)
            : undefined,
        }),
        templateName: item.templateName,
        templateLang: item.templateLang,
        requestId: item.requestId,
        messageId: item.messageId,
        metaMessageId: item.metaMessageId,
        errorBody:
          item.errorBody?.slice(0, 2000) ||
          metaStatus.statusDetail ||
          stringifyCampaignError(metaStatus.errorData) ||
          stringifyCampaignError(metaStatus.errors),
        createdAt: item.createdAt,
        rawPayload: params.includeRaw ? item.rawPayload : undefined,
      };
    }),
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
    ...serializeConversationOperationalFields({
      conversation,
      assignedUserName: assignedUser?.name ?? null,
      departmentName: conversation?.departmentId
        ? operationalLookups.departmentById.get(conversation.departmentId) ?? null
        : null,
      queueName: conversation?.queueId
        ? operationalLookups.queueById.get(conversation.queueId) ?? null
        : null,
    }),
    count: items.length,
    items,
  };
}

async function buildContactTimelinePayload(
  prisma: ReturnType<typeof getPrisma>,
  params: {
    clientId: string;
    clientKey: string;
    waId: string;
    limit: number;
    cursor: ContactTimelineCursor | null;
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
  const detailWaIds = Array.from(
    new Set(
      [
        ...buildWaIdLookup(params.waId).variants,
        resolved.resolvedWaId,
        resolved.resolvedWaIdCanonical,
        ...resolved.matchedWaIds,
      ].filter(Boolean)
    )
  );
  const createdBefore = params.cursor ? new Date(params.cursor.createdAt) : null;
  const historyVisibleAfter = resolved.winner?.historyVisibleAfter ?? null;
  const currentOperationStartedAt = resolved.winner?.createdAt ?? null;
  const visibleAfter =
    historyVisibleAfter && currentOperationStartedAt
      ? historyVisibleAfter > currentOperationStartedAt
        ? historyVisibleAfter
        : currentOperationStartedAt
      : historyVisibleAfter ?? currentOperationStartedAt;
  const createdAtFilter: Prisma.DateTimeFilter = {
    ...(createdBefore ? { lt: createdBefore } : {}),
    ...(visibleAfter ? { gt: visibleAfter } : {}),
  };
  const hasCreatedAtFilter = Boolean(createdBefore || visibleAfter);
  const baseCreatedAtWhere = hasCreatedAtFilter ? { createdAt: createdAtFilter } : {};
  const take = Math.min(params.limit + 1, 101);

  const matchingLeads = await prisma.lead.findMany({
    where: {
      tenantId: params.clientId,
      OR: [{ waIdCanonical: { in: detailWaIds } }, { waId: { in: detailWaIds } }],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      name: true,
      phone: true,
      city: true,
      service: true,
      email: true,
      company: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  const leadIds = matchingLeads.map((item) => item.id);
  const lead = matchingLeads[0] ?? null;

  const [contact, inbound, outbound, events, notes] = await Promise.all([
    prisma.contact.findFirst({
      where: {
        clientId: params.clientId,
        waId: { in: detailWaIds },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, waId: true, name: true, updatedAt: true, createdAt: true },
    }),
    prisma.inboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waIdCanonical: { in: detailWaIds } }, { waId: { in: detailWaIds } }],
        ...baseCreatedAtWhere,
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        messageId: true,
        type: true,
        bodyText: true,
        createdAt: true,
      },
    }),
    prisma.outboundMessage.findMany({
      where: {
        clientId: params.clientId,
        OR: [{ waIdCanonical: { in: detailWaIds } }, { waId: { in: detailWaIds } }],
        ...baseCreatedAtWhere,
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        waId: true,
        waIdCanonical: true,
        messageId: true,
        metaMessageId: true,
        type: true,
        status: true,
        bodyText: true,
        templateName: true,
        createdAt: true,
      },
    }),
    prisma.event.findMany({
      where: {
        clientId: params.clientId,
        ...baseCreatedAtWhere,
        eventName: { in: [...CONTACT_TIMELINE_VISIBLE_EVENT_NAMES] },
        OR: [
          ...(resolved.winner?.id ? [{ conversationId: resolved.winner.id }] : []),
          { waIdCanonical: { in: detailWaIds } },
          { waId: { in: detailWaIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        eventName: true,
        messageId: true,
        requestId: true,
        createdAt: true,
      },
    }),
    leadIds.length
      ? prisma.leadNote.findMany({
          where: {
            tenantId: params.clientId,
            leadId: { in: leadIds },
            ...baseCreatedAtWhere,
          },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            leadId: true,
            body: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const items = [
    ...inbound.map((item) => ({
      id: `inbound:${item.id}`,
      kind: "message",
      direction: "INBOUND",
      title: getTimelineMessageTitle("INBOUND", item.type),
      body: getTimelineMessageBody(item.type, item.bodyText),
      createdAt: item.createdAt,
      metadata: {
        type: item.type,
        messageId: item.messageId,
      },
    })),
    ...outbound.map((item) => ({
      id: `outbound:${item.id}`,
      kind: "message",
      direction: "OUTBOUND",
      title: getTimelineMessageTitle("OUTBOUND", item.type),
      body: getTimelineMessageBody(item.type, item.bodyText, item.templateName),
      createdAt: item.createdAt,
      metadata: {
        type: item.type,
        status: item.status,
        messageId: item.messageId,
        metaMessageId: item.metaMessageId,
      },
    })),
    ...events.map((item) => ({
      id: `event:${item.id}`,
      kind: "event",
      eventName: item.eventName,
      title: getTimelineEventTitle(item.eventName),
      body: null,
      createdAt: item.createdAt,
      metadata: {
        messageId: item.messageId,
        requestId: item.requestId,
      },
    })),
    ...notes.map((item) => ({
      id: `note:${item.id}`,
      kind: "note",
      title: "Nota CRM",
      body: item.body,
      createdAt: item.createdAt,
      metadata: {
        leadId: item.leadId,
      },
    })),
  ]
    .sort((left, right) => {
      const diff = right.createdAt.getTime() - left.createdAt.getTime();
      if (diff !== 0) return diff;
      return left.id.localeCompare(right.id);
    });
  const pageItems = items.slice(0, params.limit);
  const nextCursorSource = items.length > params.limit ? pageItems[pageItems.length - 1] : null;

  return {
    ok: true,
    contact: {
      waId: resolved.resolvedWaId,
      waIdCanonical: resolved.resolvedWaIdCanonical,
      name: lead?.name ?? contact?.name ?? null,
      phone: lead?.phone ?? resolved.resolvedWaId,
      leadId: lead?.id ?? null,
      leadStatus: lead?.status ?? null,
      contactId: contact?.id ?? null,
    },
    items: pageItems.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    nextCursor: nextCursorSource
      ? encodeContactTimelineCursor({ createdAt: nextCursorSource.createdAt.toISOString() })
      : null,
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
            messageId: true,
            templateName: true,
            status: true,
            errorBody: true,
            rawPayload: true,
          },
        })
      : [];
  const campaignMetaMap = new Map<string, CampaignMetaSummary>();
  for (const outbound of outboundMessages) {
    const outboundCampaignId = resolveOutboundCampaignId(outbound);
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
      messageId: true,
      templateName: true,
      status: true,
      errorBody: true,
      rawPayload: true,
    },
  });
  const messagesMetaStatus = outboundMessages
    .filter((item) => resolveOutboundCampaignId(item) === campaign.id)
    .map(buildCampaignMetaStatusItem);
  const draftSeed = await buildCampaignDraftSeed(prisma, {
    clientId: params.clientId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    templateName: campaign.templateName,
    outboundMessages,
  });
  const visibleMessagesMetaStatus =
    messagesMetaStatus.length > 0
      ? messagesMetaStatus
      : buildCampaignSeedFallbackStatusItems(campaign, draftSeed);
  return {
    ok: true,
    campaign: {
      ...serializeCampaign(campaign),
      metaSummary: summarizeCampaignMetaStatuses(visibleMessagesMetaStatus),
      messagesMetaStatus: visibleMessagesMetaStatus,
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
      messageId?: string | null;
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
    (item) => resolveOutboundCampaignId(item) === params.campaignId
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
        json(res, 400, { error: "invalid_json", message: "Invalid JSON payload." });
        resolve(null);
      }
    }).catch(() => {
      json(res, 400, { error: "invalid_body", message: "Invalid request body." });
      resolve(null);
    });
  });
}

type ParsedMultipartBody = {
  caption: string | null;
  file:
    | {
        fileName: string | null;
        mimeType: string;
        content: Buffer;
      }
    | null;
};

const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;

async function readMultipartBody(req: IncomingMessage, res: ServerResponse) {
  const contentType = String(req.headers["content-type"] ?? "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (boundaryMatch?.[1] ?? boundaryMatch?.[2] ?? "").trim();
  if (!boundary) {
    json(res, 400, { error: "invalid_body", message: "Payload multipart invalido." });
    return null;
  }

  try {
    const request = new Request("http://localhost/upload", {
      method: req.method ?? "POST",
      headers: req.headers as HeadersInit,
      body: Readable.toWeb(req) as BodyInit,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const formData = await request.formData();
    const captionValue = formData.get("caption");
    const fileValue = formData.get("file");

    let file: ParsedMultipartBody["file"] = null;
    if (fileValue instanceof File) {
      file = {
        fileName: fileValue.name.trim() || null,
        mimeType: fileValue.type.trim() || "application/octet-stream",
        content: Buffer.from(await fileValue.arrayBuffer()),
      };
    }

    return {
      caption: typeof captionValue === "string" && captionValue.trim() ? captionValue.trim() : null,
      file,
    };
  } catch {
    json(res, 400, { error: "invalid_body", message: "Payload multipart invalido." });
    return null;
  }
}

function detectOutboundMediaKind(mimeType: string, fileName?: string | null): SendMediaKind | null {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime.startsWith("audio/")) return "audio";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime) return "document";

  const extension = String(fileName ?? "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  if (extension && ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "image";
  if (extension && ["mp3", "ogg", "wav", "m4a", "aac"].includes(extension)) return "audio";
  if (extension && ["mp4", "mov", "avi", "webm"].includes(extension)) return "video";
  if (extension) return "document";
  return null;
}

function resolveFinalUploadMimeType(mediaKind: SendMediaKind, mimeType: string | null | undefined) {
  const normalizedMimeType = String(mimeType ?? "")
    .trim()
    .toLowerCase();
  if (normalizedMimeType) return normalizedMimeType;
  if (mediaKind === "audio") return "audio/ogg";
  if (mediaKind === "image") return "image/jpeg";
  if (mediaKind === "video") return "video/mp4";
  return "application/octet-stream";
}

function isAllowedOutboundMediaMimeType(mimeType: unknown) {
  if (typeof mimeType !== "string") return false;
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!normalizedMime) return false;
  return (
    normalizedMime.startsWith("image/") ||
    normalizedMime.startsWith("audio/") ||
    normalizedMime.startsWith("video/") ||
    normalizedMime === "application/pdf" ||
    normalizedMime === "text/plain" ||
    normalizedMime === "application/msword" ||
    normalizedMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function formatElapsedSince(timestampIso?: string, nowMs = Date.now()) {
  if (!timestampIso) return null;
  const timestampMs = Date.parse(timestampIso);
  if (!Number.isFinite(timestampMs) || timestampMs >= nowMs) {
    return null;
  }
  const diffMs = nowMs - timestampMs;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return `${diffMinutes} minuto${diffMinutes === 1 ? "" : "s"}`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hora${diffHours === 1 ? "" : "s"}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} dia${diffDays === 1 ? "" : "s"}`;
}

function buildWindowClosedError(expiresAt?: string) {
  const elapsed = formatElapsedSince(expiresAt);
  return {
    code: "window_closed",
    message: elapsed
      ? `Janela fechada ha cerca de ${elapsed}. Envie primeiro um template aprovado pela Meta em Campanhas para reabrir a conversa.`
      : "Janela possivelmente fechada. Envie primeiro um template aprovado pela Meta em Campanhas para reabrir a conversa.",
    details:
      "Sem resposta recente do cliente, texto livre fica bloqueado fora da janela de 24 horas. Envie um template aprovado em Campanhas e aguarde o retorno desse numero para a janela reabrir.",
  };
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
  | { ok: false; statusCode: number; error: string; errorPayload?: { code: string; message: string; details: string } }
> {
  if (!env.outboundEnabled) {
    return { ok: false, statusCode: 503, error: "outbound_disabled" };
  }
  const nowMs = Date.now();
  const conversation = await runtimeStorage.getConversation(params.waId, params.clientKey);
  if (conversation && !isWindowOpen(conversation, nowMs)) {
    return {
      ok: false,
      statusCode: 409,
      error: "window_closed",
      errorPayload: buildWindowClosedError(conversation.window.expiresAt),
    };
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

  const outboundInserted = await persistOutboundMessage({
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
      status:
        conversation.assignedUserId && conversation.status === ConversationOperationalStatus.WAITING
          ? ConversationOperationalStatus.IN_PROGRESS
          : conversation.status,
    });
    await recordConversationAgentOutboundMetrics({
      prisma: getPrisma(),
      clientId: params.clientId,
      waId: params.waId,
      occurredAt: new Date(createdAt),
      wasInserted: outboundInserted && sendResult.ok,
      assignedAt: conversation.assignedAt ?? null,
      assignedUserId: conversation.assignedUserId ?? null,
      requestId: params.requestId,
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

async function adminSendMediaMessage(params: {
  waId: string;
  clientKey: string;
  clientId: string;
  requestId: string;
  mimeType: string;
  fileName?: string | null;
  caption?: string | null;
  content: Buffer;
}): Promise<
  | {
      ok: true;
      status: "SENT" | "FAILED";
      messageId: string;
      metaMessageId: string | null;
      createdAt: string;
      mediaType: "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
      bodyText: string | null;
      media: {
        kind: "image" | "document" | "audio" | "video";
        mimeType: string;
        fileName: string | null;
        caption: string | null;
        hasDownload: boolean;
        downloadUrl: string;
      };
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      errorPayload?: { code: string; message: string; details: string };
      errorDetails?: string | null;
    }
> {
  if (!env.outboundEnabled) {
    return { ok: false, statusCode: 503, error: "outbound_disabled" };
  }
  const nowMs = Date.now();
  const conversation = await runtimeStorage.getConversation(params.waId, params.clientKey);
  if (conversation && !isWindowOpen(conversation, nowMs)) {
    return {
      ok: false,
      statusCode: 409,
      error: "window_closed",
      errorPayload: buildWindowClosedError(conversation.window.expiresAt),
    };
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
      event: "admin.conversation.send_media.credentials_missing",
      waId: maskWaId(params.waId),
      clientKey: params.clientKey,
      requestId: params.requestId,
    });
    return { ok: false, statusCode: 503, error: "tenant_outbound_credentials_missing" };
  }

  const mediaKind = detectOutboundMediaKind(params.mimeType, params.fileName);
  if (!mediaKind) {
    return { ok: false, statusCode: 400, error: "unsupported_media_type" };
  }

  let uploadContent = params.content;
  let uploadMimeType = resolveFinalUploadMimeType(mediaKind, params.mimeType);
  let uploadFileName = params.fileName ?? null;

  if (mediaKind === "audio") {
    const transcoded = await transcodeAudioToOggOpus({
      inputBuffer: params.content,
      inputMimeType: params.mimeType,
      fileName: params.fileName,
      requestId: params.requestId,
      clientId: params.clientId,
      clientKey: params.clientKey,
    });
    if (!transcoded.ok) {
      return {
        ok: false,
        statusCode: 502,
        error: "audio_transcode_failed",
        errorDetails: transcoded.details ?? transcoded.error,
      };
    }
    uploadContent = transcoded.buffer;
    uploadMimeType = resolveFinalUploadMimeType(mediaKind, transcoded.mimeType);
    uploadFileName = transcoded.fileName;
  }

  const uploaded = await uploadMedia(
    new Blob([new Uint8Array(uploadContent)], { type: uploadMimeType }),
    uploadMimeType,
    {
      accessToken: credentials.accessToken,
      phoneNumberId: credentials.phoneNumberId,
    },
    uploadFileName
  );
  if (!uploaded.ok) {
    logger.error({
      event: "admin.conversation.send_media.upload_failed",
      clientKey: params.clientKey,
      requestId: params.requestId,
      waId: maskWaId(params.waId),
      status: uploaded.status ?? null,
      errorBody: uploaded.errorBody ?? null,
    });
    return {
      ok: false,
      statusCode: uploaded.status ?? 502,
      error: "media_upload_failed",
      errorDetails: uploaded.errorBody ?? null,
    };
  }

  const sendResult = await sendMediaMessage({
    to: params.waId,
    kind: mediaKind,
    mediaId: uploaded.mediaId,
    caption: params.caption,
    fileName: uploadFileName,
    credentials,
  });
  const status = sendResult.ok ? "SENT" : "FAILED";
  const messageId = `admin.send_media.${params.requestId}`;
  const createdAt = new Date().toISOString();
  const tenants = await getTenants();
  const phoneNumberId =
    credentials.phoneNumberId || tenants[params.clientKey]?.metaPhoneNumberId || undefined;

  const prismaType =
    mediaKind === "image"
      ? "IMAGE"
      : mediaKind === "audio"
        ? "AUDIO"
        : mediaKind === "video"
          ? "VIDEO"
          : "DOCUMENT";

  const storedMedia = await storeOutboundMediaFile({
    clientId: params.clientId,
    messageId,
    content: uploadContent,
    mimeType: uploadMimeType,
    fileName: uploadFileName,
  }).catch((error) => {
    logger.error({
      event: "admin.conversation.send_media.local_store_failed",
      clientKey: params.clientKey,
      requestId: params.requestId,
      waId: maskWaId(params.waId),
      message: (error as Error).message,
    });
    return null;
  });

  const outboundInserted = await persistOutboundMessage({
    clientId: params.clientId,
    phoneNumberId,
    waId: params.waId,
    messageId,
    type: prismaType,
    status,
    bodyText: params.caption ?? null,
    requestId: params.requestId,
    metaMessageId: sendResult.messageId ?? null,
    errorBody: sendResult.errorBody ?? null,
    rawPayload: {
      type: mediaKind,
      media: {
        mediaId: uploaded.mediaId,
        mimeType: uploadMimeType,
        fileName: uploadFileName,
        caption: params.caption ?? null,
        localPath: storedMedia?.localPath ?? null,
        localSize: storedMedia?.size ?? null,
      },
      source: "admin_inbox_media",
      status: sendResult.status ?? null,
      errorBody: sendResult.errorBody ?? null,
    },
  });

  if (conversation) {
    await runtimeStorage.upsertConversation({
      ...conversation,
      lastOutboundAt: createdAt,
    });
    await recordConversationAgentOutboundMetrics({
      prisma: getPrisma(),
      clientId: params.clientId,
      waId: params.waId,
      occurredAt: new Date(createdAt),
      wasInserted: outboundInserted && sendResult.ok,
      assignedAt: conversation.assignedAt ?? null,
      assignedUserId: conversation.assignedUserId ?? null,
      requestId: params.requestId,
    });
  }

  if (!sendResult.ok) {
    return {
      ok: false,
      statusCode: sendResult.status ?? 502,
      error: "media_send_failed",
      errorDetails: sendResult.errorBody ?? null,
    };
  }

  return {
    ok: true,
    status,
    messageId,
    metaMessageId: sendResult.messageId ?? null,
    createdAt,
    mediaType: prismaType,
    bodyText: params.caption ?? null,
    media: {
      kind: mediaKind,
      mimeType: uploadMimeType,
      fileName: uploadFileName,
      caption: params.caption ?? null,
      hasDownload: true,
      downloadUrl: buildConversationMessageDownloadPath(params.waId, messageId),
    },
  };
}
