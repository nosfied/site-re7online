import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPassword, issueClientAuthToken } from "../auth/clientAuth.js";
import { buildAppAuthSessionExpiresAt } from "../auth/sessionPolicy.js";
import { saveWebSessionAuthState } from "../web-session/webSessionAuthStore.js";
import { getPrisma } from "../db.js";
import { MessageStatus, MessageType, Prisma, TrainingContentStatus, TrainingContentType } from "@prisma/client";
import type { ConversationState } from "../conversation/conversation.types.js";
import { getDepartmentAvailability, getNextDepartmentOpenAt } from "../departments/businessHours.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaigns-feature-route-test-secret";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "campaigns-feature-route-test-admin-token";
process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "campaigns-feature-route-test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "campaigns-feature-route-test-phone";
process.env.META_APP_SECRET = process.env.META_APP_SECRET || "campaigns-feature-route-test-meta-secret";
process.env.CHANNEL_ACCOUNT_SECRET_KEY = process.env.CHANNEL_ACCOUNT_SECRET_KEY || "campaigns-feature-route-test-channel-secret";
process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY || "campaigns-feature-route-test-webhook-secret-key";

type TestResponse<T = unknown> = {
  status: number;
  body: T;
};

type ErrorPayload = {
  error?: string | { code?: string; message?: string };
  message?: string;
  feature?: string;
};

type TestUser = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
};

const prisma = getPrisma();
const originalCwd = process.cwd();
const prefix = `campaigns-feature-${process.pid}-${Date.now()}`;
const safeTemplatePrefix = prefix.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
const trainingContentPrefix = `campaigns-${process.pid}`;
const businessAdminToken = `${prefix}-business-admin-token`;
process.env.PLATFORM_SUPPORT_TENANT_KEY = process.env.PLATFORM_SUPPORT_TENANT_KEY || `${prefix}-support`;

let tempRoot = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;
let setTemplateReviewNotificationSenderForTests: typeof import("../templates/templateReviewNotification.js").setTemplateReviewNotificationSenderForTests;
let filterOptedOutCampaignRecipients: typeof import("../campaigns/optOutRegistry.js").filterOptedOutCampaignRecipients;
let recordContactOptOut: typeof import("../campaigns/optOutRegistry.js").recordContactOptOut;
let revokeContactOptOut: typeof import("../campaigns/optOutRegistry.js").revokeContactOptOut;
let runtimeStorage: typeof import("../storage/runtimeStorage.js").runtimeStorage;

let businessClientId = "";
let governmentClientId = "";
let overrideClientId = "";
let killSwitchClientId = "";
let supportClientId = "";
let businessAdmin: TestUser;
let businessSupervisor: TestUser;
let businessAgent: TestUser;
let governmentAdmin: TestUser;
let overrideAdmin: TestUser;
let killSwitchAdmin: TestUser;
let supportAdmin: TestUser;

function getErrorCode(payload: ErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.code;
}

function makeTenant(id: string) {
  return {
    id,
    name: id,
    metaPhoneNumberId: `phone-${id}`,
    allowlist: [],
    handoffAttendantWaid: "",
    defaultLanguage: "pt_BR",
  };
}

async function writeTenants(clientKeys: string[]) {
  const tenantsPath = path.join(tempRoot, ".data", "tenants.json");
  await fs.mkdir(path.dirname(tenantsPath), { recursive: true });
  await fs.writeFile(
    tenantsPath,
    JSON.stringify(
      Object.fromEntries(clientKeys.map((clientKey) => [clientKey, makeTenant(clientKey)])),
      null,
      2
    ),
    "utf-8"
  );
}

async function createUser(params: {
  clientId: string;
  role: string;
  suffix: string;
}): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      clientId: params.clientId,
      name: `Campaigns ${params.role} ${params.suffix}`,
      email: `${prefix}-${params.suffix}@example.test`,
      role: params.role,
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
      role: true,
    },
  });
  await prisma.appAuthSession.create({
    data: {
      id: `${user.id}-session`,
      clientId: user.clientId,
      userId: user.id,
      expiresAt: buildAppAuthSessionExpiresAt(),
    },
  });
  return user;
}

async function assignUserDepartments(params: {
  clientId: string;
  userId: string;
  departmentIds: string[];
  primaryDepartmentId?: string | null;
}) {
  await prisma.user.update({
    where: { id: params.userId },
    data: { departmentId: params.primaryDepartmentId ?? params.departmentIds[0] ?? null },
  });
  await prisma.userDepartmentMembership.createMany({
    data: params.departmentIds.map((departmentId) => ({
      clientId: params.clientId,
      userId: params.userId,
      departmentId,
      isActive: true,
      isPrimary: departmentId === (params.primaryDepartmentId ?? params.departmentIds[0]),
    })),
    skipDuplicates: true,
  });
}

function authToken(user: TestUser) {
  return issueClientAuthToken(user, `${user.id}-session`);
}

async function request<T = unknown>(
  method: string,
  route: string,
  user: TestUser,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function requestWithBearer<T = unknown>(
  method: string,
  route: string,
  token: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function requestText(
  method: string,
  route: string,
  user: TestUser
): Promise<{ status: number; text: string; contentType: string | null }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
    },
  });
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

async function requestRaw(
  method: string,
  route: string,
  user: TestUser,
  headers?: Record<string, string>
): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
      ...(headers ?? {}),
    },
  });
  return {
    status: response.status,
    text: await response.text(),
    headers: response.headers,
  };
}

async function requestMultipart<T = unknown>(
  route: string,
  user: TestUser,
  form: FormData
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken(user)}`,
    },
    body: form,
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function requestBlob(
  method: string,
  route: string,
  user: TestUser
): Promise<{ status: number; contentType: string | null; disposition: string | null; bytes: Uint8Array }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${authToken(user)}`,
    },
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    disposition: response.headers.get("content-disposition"),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

async function requestUnauth<T = unknown>(
  method: string,
  route: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for async condition");
}

async function seedHybridRuntimeState(
  state: Pick<
    ConversationState,
    | "waId"
    | "waIdCanonical"
    | "firstSeenAt"
    | "lastInboundAt"
    | "lastOutboundAt"
    | "window"
    | "mode"
    | "status"
    | "assignedUserId"
    | "assignedTo"
  >
) {
  const clientKey = `${prefix}-business`;
  await runtimeStorage.upsertConversation({
    clientKey,
    conversationKey: `${clientKey}:${state.waId}`,
    waId: state.waId,
    waIdCanonical: state.waIdCanonical,
    firstSeenAt: state.firstSeenAt,
    lastInboundAt: state.lastInboundAt,
    lastOutboundAt: state.lastOutboundAt,
    window: state.window,
    handoff: { status: "active" },
    mode: state.mode,
    status: state.status,
    assignedUserId: state.assignedUserId,
    assignedTo: state.assignedTo,
    answers: {},
    chatbotActive: false,
  });
}

async function requestAdmin<T = unknown>(
  method: string,
  route: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "x-admin-token": businessAdminToken,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function requestSuperadmin<T = unknown>(
  method: string,
  route: string,
  body?: unknown
): Promise<TestResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "x-admin-token": process.env.ADMIN_TOKEN ?? "",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

async function cleanup() {
  await prisma.trainingContent.deleteMany({
    where: {
      contentId: {
        startsWith: trainingContentPrefix,
      },
    },
  });
  const clients = await prisma.client.findMany({
    where: {
      clientKey: {
        startsWith: prefix,
      },
    },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) return;
  await prisma.platformSupportSession.deleteMany({
    where: {
      actingClientId: {
        in: clientIds,
      },
    },
  });
  await prisma.platformSupportAccessGrant.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.inboundMessage.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.outboundMessage.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.event.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.tenantOperationalConfig.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.campaign.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.lead.deleteMany({
    where: {
      tenantId: {
        in: clientIds,
      },
    },
  });
  await prisma.conversationRuntimeState.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.conversation.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.contact.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.appAuthSession.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.waPhoneNumber.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.tenantMetaConfig.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      clientId: {
        in: clientIds,
      },
    },
  });
  await prisma.client.deleteMany({
    where: {
      id: {
        in: clientIds,
      },
    },
  });
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "re7-campaigns-feature-routes-"));
  process.chdir(tempRoot);
  await cleanup();

  const businessClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-business`,
      name: "Campaigns Feature Business",
      profile: "business",
      features: {},
      adminToken: businessAdminToken,
    },
    select: { id: true, clientKey: true },
  });
  const governmentClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-government`,
      name: "Campaigns Feature Government",
      profile: "government",
      features: {},
    },
    select: { id: true, clientKey: true },
  });
  const overrideClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-override`,
      name: "Campaigns Feature Override",
      profile: "government",
      features: { campaigns: true, templates: true },
    },
    select: { id: true, clientKey: true },
  });
  const killSwitchClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-kill-switch`,
      name: "Campaigns Feature Kill Switch",
      profile: "business",
      features: { campaigns: false },
    },
    select: { id: true, clientKey: true },
  });
  const supportClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-support`,
      name: "Campaigns Feature Support",
      profile: "business",
      features: { chatbot: true },
    },
    select: { id: true, clientKey: true },
  });

  businessClientId = businessClient.id;
  governmentClientId = governmentClient.id;
  overrideClientId = overrideClient.id;
  killSwitchClientId = killSwitchClient.id;
  supportClientId = supportClient.id;
  await writeTenants([
    businessClient.clientKey,
    governmentClient.clientKey,
    overrideClient.clientKey,
    killSwitchClient.clientKey,
    supportClient.clientKey,
  ]);

  ({
    filterOptedOutCampaignRecipients,
    recordContactOptOut,
    revokeContactOptOut,
  } = await import("../campaigns/optOutRegistry.js"));
  ({ runtimeStorage } = await import("../storage/runtimeStorage.js"));

  businessAdmin = await createUser({
    clientId: businessClientId,
    role: "ADMIN",
    suffix: "business-admin",
  });
  businessSupervisor = await createUser({
    clientId: businessClientId,
    role: "SUPERVISOR",
    suffix: "business-supervisor",
  });
  businessAgent = await createUser({
    clientId: businessClientId,
    role: "AGENT",
    suffix: "business-agent",
  });
  governmentAdmin = await createUser({
    clientId: governmentClientId,
    role: "ADMIN",
    suffix: "government-admin",
  });
  overrideAdmin = await createUser({
    clientId: overrideClientId,
    role: "ADMIN",
    suffix: "override-admin",
  });
  killSwitchAdmin = await createUser({
    clientId: killSwitchClientId,
    role: "ADMIN",
    suffix: "kill-switch-admin",
  });
  supportAdmin = await createUser({
    clientId: supportClientId,
    role: "ADMIN",
    suffix: "support-admin",
  });

  handleRequest = (await import("./routes.js")).handleRequest;
  setTemplateReviewNotificationSenderForTests = (
    await import("../templates/templateReviewNotification.js")
  ).setTemplateReviewNotificationSenderForTests;
  server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
});

test.after(async () => {
  setTemplateReviewNotificationSenderForTests(null);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await cleanup();
  await prisma.$disconnect();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("business profile default can access campaigns route", async () => {
  const response = await request<{ ok: boolean; count: number }>(
    "GET",
    "/app/campaigns",
    businessAdmin
  );

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("internal web session handoff realtime endpoint requires worker auth and validates payload", async () => {
  const previousToken = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = "handoff-realtime-test-token";
  try {
    const unauthorized = await requestWithBearer<ErrorPayload>(
      "POST",
      "/internal/web-session/handoff-realtime",
      "wrong-token",
      { clientId: businessClientId, waId: "5511955557784", handoffStatus: "active" }
    );
    assert.equal(unauthorized.status, 401);

    const invalid = await requestWithBearer<ErrorPayload>(
      "POST",
      "/internal/web-session/handoff-realtime",
      "handoff-realtime-test-token",
      { clientId: businessClientId, waId: "", handoffStatus: "active" }
    );
    assert.equal(invalid.status, 400);

    const valid = await requestWithBearer<{ ok: boolean }>(
      "POST",
      "/internal/web-session/handoff-realtime",
      "handoff-realtime-test-token",
      {
        clientId: businessClientId,
        waId: "5511955557784",
        waIdCanonical: "55119555557784",
        mode: "HUMAN",
        handoffStatus: "active",
        assignedUserId: null,
        departmentId: "department-general",
        updatedAt: "2026-08-18T12:00:00.000Z",
        notificationMessage: {
          messageId: "web.session.inbound.1",
          type: "TEXT",
          bodyText: "Atendimento",
          createdAt: "2026-08-18T12:00:00.000Z",
        },
      }
    );
    assert.equal(valid.status, 200);
    assert.equal(valid.body.ok, true);
  } finally {
    if (previousToken === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = previousToken;
  }
});

test("app chatbot flow builder uses session tenant and rejects cross-tenant routing ids", async () => {
  const businessDepartment = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Builder Business`,
      slug: `${prefix}-builder-business`,
    },
    select: { id: true },
  });
  const businessQueue = await prisma.queue.create({
    data: {
      clientId: businessClientId,
      departmentId: businessDepartment.id,
      name: `${prefix} Builder Business`,
    },
    select: { id: true },
  });
  const governmentDepartment = await prisma.department.create({
    data: {
      clientId: governmentClientId,
      name: `${prefix} Builder Government`,
      slug: `${prefix}-builder-government`,
    },
    select: { id: true },
  });
  const governmentQueue = await prisma.queue.create({
    data: {
      clientId: governmentClientId,
      departmentId: governmentDepartment.id,
      name: `${prefix} Builder Government`,
    },
    select: { id: true },
  });

  const response = await request<{ ok: true; flow: { id: string; clientId: string; definition: unknown } }>(
    "POST",
    "/app/chatbot/flows",
    businessAdmin,
    {
      name: "Builder tenant scoped",
      isActive: true,
      entryPoint: true,
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Escolha",
            options: [
              {
                label: "Atendimento",
                next: "handoff",
                departmentId: businessDepartment.id,
                queueId: businessQueue.id,
              },
            ],
          },
          handoff: { type: "handoff", text: "Encaminhando" },
        },
      },
    }
  );

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.flow.clientId, businessClientId);

  const crossTenant = await request<ErrorPayload>(
    "POST",
    "/app/chatbot/flows",
    businessAdmin,
    {
      name: "Builder cross tenant",
      definition: {
        start: "handoff",
        nodes: {
          handoff: {
            type: "handoff",
            departmentId: governmentDepartment.id,
            queueId: governmentQueue.id,
          },
        },
      },
    }
  );

  assert.equal(crossTenant.status, 400, JSON.stringify(crossTenant.body));
  assert.equal(getErrorCode(crossTenant.body), "invalid_chatbot_reference");
});

test("government profile default is blocked from campaigns routes", async () => {
  const routes = [
    { method: "GET", route: "/app/campaigns" },
    { method: "GET", route: "/app/campaigns/audience-preview" },
    { method: "POST", route: "/app/campaigns/drafts", body: { name: "Draft", templateId: "missing", selectedLeadIds: ["lead"] } },
    { method: "POST", route: "/app/campaigns/missing/send" },
    { method: "POST", route: "/app/campaigns/missing/discard" },
    { method: "GET", route: "/app/campaigns/missing" },
    { method: "POST", route: "/app/campaigns/missing/cancel" },
    {
      method: "POST",
      route: "/app/campaigns",
      body: {
        name: "Campanha bloqueada",
        templateName: "template_teste",
        recipients: ["5511999999999"],
      },
    },
  ];

  for (const item of routes) {
    const response = await request<ErrorPayload>(
      item.method,
      item.route,
      governmentAdmin,
      item.body
    );
    assert.equal(response.status, 403, `${item.method} ${item.route}`);
    assert.equal(getErrorCode(response.body), "feature_not_enabled");
    assert.equal(response.body.feature, "campaigns");
  }
});

test("campaign draft routes require authentication", async () => {
  const draft = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/drafts", {
    name: "Sem sessao",
    templateId: "template",
    selectedLeadIds: ["lead"],
  });
  assert.equal(draft.status, 401);
  assert.equal(getErrorCode(draft.body), "missing_token");

  const send = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/example/send");
  assert.equal(send.status, 401);
  assert.equal(getErrorCode(send.body), "missing_token");

  const discard = await requestUnauth<ErrorPayload>("POST", "/app/campaigns/example/discard");
  assert.equal(discard.status, 401);
  assert.equal(getErrorCode(discard.body), "missing_token");
});

test("training center serves authenticated catalog and safe training content", async () => {
  const previousRoot = process.env.TRAINING_CONTENT_ROOT;
  const pdfContentId = `${trainingContentPrefix}-intro-guide`;
  const videoContentId = `${trainingContentPrefix}-intro-video`;
  const draftContentId = `${trainingContentPrefix}-draft-guide`;
  const symlinkContentId = `${trainingContentPrefix}-symlink-guide`;
  const pdfStorageKey = "11111111-1111-4111-8111-111111111111.pdf";
  const videoStorageKey = "22222222-2222-4222-8222-222222222222.mp4";
  const draftStorageKey = "33333333-3333-4333-8333-333333333333.pdf";
  const symlinkStorageKey = "44444444-4444-4444-8444-444444444444.pdf";
  try {
    delete process.env.TRAINING_CONTENT_ROOT;
    await prisma.trainingContent.deleteMany({
      where: {
        contentId: {
          in: [pdfContentId, videoContentId, draftContentId, symlinkContentId],
        },
      },
    });
    const unauth = await requestUnauth<ErrorPayload>("GET", "/app/training/catalog");
    assert.equal(unauth.status, 401);
    assert.equal(getErrorCode(unauth.body), "missing_token");
    const unauthContent = await requestUnauth<ErrorPayload>("GET", `/app/training/content/${pdfContentId}`);
    assert.equal(unauthContent.status, 401);
    assert.equal(getErrorCode(unauthContent.body), "missing_token");

    const unavailableCatalog = await request<{
      ok: true;
      storageConfigured: boolean;
      sections: Array<{ items: Array<{ id: string; path?: string; streamUrl?: string; available: boolean }> }>;
    }>("GET", "/app/training/catalog", businessAgent);
    assert.equal(unavailableCatalog.status, 200, JSON.stringify(unavailableCatalog.body));
    assert.equal(unavailableCatalog.body.storageConfigured, false);

    await prisma.trainingContent.createMany({
      data: [
        {
          contentId: pdfContentId,
          type: TrainingContentType.PDF,
          title: "Guia de introducao",
          description: "Material publicado para operadores.",
          category: "Primeiros passos",
          sortOrder: 1,
          status: TrainingContentStatus.PUBLISHED,
          storageKey: pdfStorageKey,
          originalFilename: "intro-platform-guide.pdf",
          mimeType: "application/pdf",
          sizeBytes: 18,
          downloadable: true,
          publishedAt: new Date(),
        },
        {
          contentId: videoContentId,
          type: TrainingContentType.VIDEO,
          title: "Video de introducao",
          category: "Primeiros passos",
          sortOrder: 2,
          status: TrainingContentStatus.PUBLISHED,
          storageKey: videoStorageKey,
          originalFilename: "intro-platform.mp4",
          mimeType: "video/mp4",
          sizeBytes: 16,
          downloadable: false,
          publishedAt: new Date(),
        },
        {
          contentId: draftContentId,
          type: TrainingContentType.PDF,
          title: "Rascunho interno",
          category: "Primeiros passos",
          sortOrder: 3,
          status: TrainingContentStatus.DRAFT,
          storageKey: draftStorageKey,
          originalFilename: "draft-guide.pdf",
          mimeType: "application/pdf",
          sizeBytes: 18,
          downloadable: false,
        },
      ],
    });

    const unavailableCatalogWithItems = await request<{
      ok: true;
      storageConfigured: boolean;
      sections: Array<{ items: Array<{ id: string; path?: string; streamUrl?: string; available: boolean }> }>;
    }>("GET", "/app/training/catalog", businessAgent);
    assert.equal(unavailableCatalogWithItems.status, 200, JSON.stringify(unavailableCatalogWithItems.body));
    assert.equal(unavailableCatalogWithItems.body.storageConfigured, false);
    const unavailablePdf = unavailableCatalogWithItems.body.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === pdfContentId);
    assert.equal(unavailablePdf?.available, false);
    assert.equal("path" in (unavailablePdf ?? {}), false);
    assert.equal(
      unavailableCatalogWithItems.body.sections
        .flatMap((section) => section.items)
        .some((item) => item.id === draftContentId),
      false
    );

    const storageMissing = await request<ErrorPayload>(
      "GET",
      `/app/training/content/${pdfContentId}`,
      businessAgent
    );
    assert.equal(storageMissing.status, 503);
    assert.equal(getErrorCode(storageMissing.body), "training_storage_unavailable");

    const root = path.join(tempRoot, "training-content");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, pdfStorageKey), "%PDF-1.4\ntraining\n");
    await fs.writeFile(path.join(root, videoStorageKey), "0000ftypisomdemo");
    process.env.TRAINING_CONTENT_ROOT = root;

    const catalog = await request<{
      ok: true;
      storageConfigured: boolean;
      sections: Array<{ items: Array<{ id: string; path?: string; streamUrl?: string; downloadUrl?: string; available: boolean }> }>;
    }>("GET", "/app/training/catalog", businessAgent);
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    assert.equal(catalog.body.storageConfigured, true);
    const pdfItem = catalog.body.sections.flatMap((section) => section.items).find((item) => item.id === pdfContentId);
    assert.equal(pdfItem?.available, true);
    assert.equal("path" in (pdfItem ?? {}), false);
    assert.equal(pdfItem?.streamUrl, `/app/training/content/${pdfContentId}`);
    assert.equal(pdfItem?.downloadUrl, `/app/training/content/${pdfContentId}/download`);

    const traversal = await request<ErrorPayload>("GET", "/app/training/content/..%2Fsecret", businessAgent);
    assert.equal(traversal.status, 404);
    assert.equal(getErrorCode(traversal.body), "training_content_not_found");

    const draft = await request<ErrorPayload>("GET", `/app/training/content/${draftContentId}`, businessAgent);
    assert.equal(draft.status, 404);
    assert.equal(getErrorCode(draft.body), "training_content_not_found");

    const missing = await request<ErrorPayload>("GET", "/app/training/content/missing-guide", businessAgent);
    assert.equal(missing.status, 404);
    assert.equal(getErrorCode(missing.body), "training_content_not_found");

    const pdfInline = await requestRaw("GET", `/app/training/content/${pdfContentId}`, businessAgent);
    assert.equal(pdfInline.status, 200);
    assert.match(pdfInline.headers.get("content-type") ?? "", /^application\/pdf/);
    assert.match(pdfInline.headers.get("content-disposition") ?? "", /^inline; filename="intro-platform-guide\.pdf"/);
    assert.match(pdfInline.text, /^%PDF-1\.4/);

    const pdfDownload = await requestRaw("GET", `/app/training/content/${pdfContentId}/download`, businessAgent);
    assert.equal(pdfDownload.status, 200);
    assert.match(pdfDownload.headers.get("content-disposition") ?? "", /^attachment; filename="intro-platform-guide\.pdf"/);

    const videoRange = await requestRaw(
      "GET",
      `/app/training/content/${videoContentId}`,
      businessAgent,
      { range: "bytes=2-5" }
    );
    assert.equal(videoRange.status, 206);
    assert.equal(videoRange.headers.get("accept-ranges"), "bytes");
    assert.equal(videoRange.headers.get("content-range"), "bytes 2-5/16");
    assert.equal(videoRange.text, "00ft");

    const invalidRange = await requestRaw(
      "GET",
      `/app/training/content/${videoContentId}`,
      businessAgent,
      { range: "bytes=99-120" }
    );
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers.get("content-range"), "bytes */16");

    await prisma.trainingContent.create({
      data: {
        contentId: symlinkContentId,
        type: TrainingContentType.PDF,
        title: "Guia com symlink",
        category: "Seguranca",
        status: TrainingContentStatus.PUBLISHED,
        storageKey: symlinkStorageKey,
        originalFilename: "symlink-guide.pdf",
        mimeType: "application/pdf",
        sizeBytes: 18,
        publishedAt: new Date(),
      },
    });
    await fs.writeFile(path.join(tempRoot, "outside-training.pdf"), "%PDF-1.4\noutside\n");
    await fs.symlink(path.join(tempRoot, "outside-training.pdf"), path.join(root, symlinkStorageKey));
    const symlinkEscape = await request<ErrorPayload>("GET", `/app/training/content/${symlinkContentId}`, businessAgent);
    assert.equal(symlinkEscape.status, 404);
    assert.equal(getErrorCode(symlinkEscape.body), "training_content_not_found");
  } finally {
    await prisma.trainingContent.deleteMany({
      where: {
        contentId: {
          in: [pdfContentId, videoContentId, draftContentId, symlinkContentId],
        },
      },
    });
    if (previousRoot === undefined) {
      delete process.env.TRAINING_CONTENT_ROOT;
    } else {
      process.env.TRAINING_CONTENT_ROOT = previousRoot;
    }
  }
});

test("admin training content CRUD is superadmin-only and keeps app catalog published-only", async () => {
  const previousRoot = process.env.TRAINING_CONTENT_ROOT;
  const root = path.join(tempRoot, "training-admin-content");
  try {
    process.env.TRAINING_CONTENT_ROOT = root;
    await fs.mkdir(root, { recursive: true });
    await prisma.trainingContent.deleteMany({
      where: {
        contentId: {
          startsWith: trainingContentPrefix,
        },
      },
    });

    const unauth = await requestUnauth<ErrorPayload>("GET", "/admin/training");
    assert.equal(unauth.status, 401);

    const tenantAdmin = await requestAdmin<ErrorPayload>("GET", "/admin/training");
    assert.equal(tenantAdmin.status, 403);

    const form = new FormData();
    form.set("title", `${trainingContentPrefix} Admin material`);
    form.set("description", "Material gerenciado pelo console interno.");
    form.set("category", "Operacao");
    form.set("type", "PDF");
    form.set("sortOrder", "7");
    form.set("status", "DRAFT");
    form.set("downloadable", "true");
    form.set("file", new Blob(["%PDF-1.4\nadmin\n"], { type: "application/pdf" }), "admin-material.pdf");

    const createResponse = await fetch(`${baseUrl}/admin/training`, {
      method: "POST",
      headers: {
        "x-admin-token": process.env.ADMIN_TOKEN ?? "",
      },
      body: form,
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      ok: true;
      item: { id: string; contentId: string; status: string; storageKey?: string; previewUrl: string };
    };
    assert.equal(created.ok, true);
    assert.equal(created.item.status, "DRAFT");
    assert.equal("storageKey" in created.item, false);

    const draftCatalog = await request<{
      ok: true;
      sections: Array<{ items: Array<{ id: string }> }>;
    }>("GET", "/app/training/catalog", businessAgent);
    assert.equal(draftCatalog.status, 200, JSON.stringify(draftCatalog.body));
    assert.equal(
      draftCatalog.body.sections.flatMap((section) => section.items).some((item) => item.id === created.item.contentId),
      false
    );

    const publish = await requestSuperadmin<{ ok: true; item: { status: string } }>(
      "POST",
      `/admin/training/${encodeURIComponent(created.item.id)}/publish`
    );
    assert.equal(publish.status, 200, JSON.stringify(publish.body));
    assert.equal(publish.body.item.status, "PUBLISHED");

    const publishedCatalog = await request<{
      ok: true;
      sections: Array<{ items: Array<{ id: string; streamUrl: string; downloadUrl?: string }> }>;
    }>("GET", "/app/training/catalog", businessAgent);
    assert.equal(publishedCatalog.status, 200, JSON.stringify(publishedCatalog.body));
    const publishedItem = publishedCatalog.body.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === created.item.contentId);
    assert.equal(publishedItem?.streamUrl, `/app/training/content/${created.item.contentId}`);
    assert.equal(publishedItem?.downloadUrl, `/app/training/content/${created.item.contentId}/download`);

    const preview = await fetch(`${baseUrl}${created.item.previewUrl}`, {
      headers: {
        "x-admin-token": process.env.ADMIN_TOKEN ?? "",
      },
    });
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-type") ?? "", /^application\/pdf/);

    const patch = await requestSuperadmin<{ ok: true; item: { title: string; sortOrder: number } }>(
      "PATCH",
      `/admin/training/${encodeURIComponent(created.item.id)}`,
      {
        title: `${trainingContentPrefix} Admin material updated`,
        category: "Operacao",
        sortOrder: 3,
        status: "PUBLISHED",
        downloadable: true,
      }
    );
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.item.sortOrder, 3);

    const deleteResponse = await requestSuperadmin<{ ok: true }>(
      "DELETE",
      `/admin/training/${encodeURIComponent(created.item.id)}`
    );
    assert.equal(deleteResponse.status, 200, JSON.stringify(deleteResponse.body));
    assert.equal(deleteResponse.body.ok, true);

    const list = await requestSuperadmin<{ ok: true; items: Array<{ id: string }> }>("GET", "/admin/training");
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.items.some((item) => item.id === created.item.id), false);
  } finally {
    await prisma.trainingContent.deleteMany({
      where: {
        contentId: {
          startsWith: trainingContentPrefix,
        },
      },
    });
    if (previousRoot === undefined) {
      delete process.env.TRAINING_CONTENT_ROOT;
    } else {
      process.env.TRAINING_CONTENT_ROOT = previousRoot;
    }
  }
});

test("support hub uses configured support tenant and isolates requester conversations", async () => {
  const { env } = await import("../config/env.js");
  const originalSupportTenantKey = env.PLATFORM_SUPPORT_TENANT_KEY;
  const originalSupportAttachmentRoot = env.SUPPORT_ATTACHMENT_ROOT;
  const supportAttachmentRoot = path.join(tempRoot, "support-attachments");
  try {
    env.PLATFORM_SUPPORT_TENANT_KEY = "";
    env.SUPPORT_ATTACHMENT_ROOT = supportAttachmentRoot;
    await fs.mkdir(supportAttachmentRoot, { recursive: true });
    const unavailable = await request<ErrorPayload>("GET", "/app/support/conversations", businessAdmin);
    assert.equal(unavailable.status, 503);
    assert.equal(getErrorCode(unavailable.body), "support_unavailable");
    env.PLATFORM_SUPPORT_TENANT_KEY = `${prefix}-support`;

    const agent = await request<ErrorPayload>("GET", "/app/support/conversations", businessAgent);
    assert.equal(agent.status, 403);
    assert.equal(getErrorCode(agent.body), "forbidden");

    const genericEntryFlow = await prisma.chatbotFlow.create({
      data: {
        clientId: supportClientId,
        name: "Generic support tenant entry flow",
        isActive: true,
        entryPoint: true,
        definition: {
          start: "handoff",
          nodes: {
            handoff: {
              type: "handoff",
              text: "Fluxo generico que nao deve ser usado automaticamente pelo suporte.",
              handoffSummary: "Fluxo generico.",
            },
          },
        },
      },
    });
    const dedicatedSupportFlow = await prisma.chatbotFlow.create({
      data: {
        clientId: supportClientId,
        name: "Dedicated support channel flow",
        isActive: true,
        entryPoint: false,
        definition: {
          start: "handoff",
          nodes: {
            handoff: {
              type: "handoff",
              text: "Vamos encaminhar para a equipe de suporte dedicado.",
              handoffSummary: "Solicitacao aberta pelo hub de suporte dedicado.",
            },
          },
        },
      },
    });
    const otherTenantFlow = await prisma.chatbotFlow.create({
      data: {
        clientId: governmentClientId,
        name: "Other tenant support flow",
        isActive: true,
        entryPoint: true,
        definition: {
          start: "handoff",
          nodes: {
            handoff: {
              type: "handoff",
              text: "Fluxo de outro tenant.",
              handoffSummary: "Fluxo de outro tenant.",
            },
          },
        },
      },
    });
    await prisma.tenantOperationalConfig.upsert({
      where: { clientId: supportClientId },
      update: {
        config: {
          supportChannel: {
            chatbotFlowId: dedicatedSupportFlow.id,
          },
        },
      },
      create: {
        clientId: supportClientId,
        config: {
          supportChannel: {
            chatbotFlowId: dedicatedSupportFlow.id,
          },
        },
      },
    });

    const created = await request<{
      ok: true;
      resumed: boolean;
      conversation: { supportRef: string; protocol: string; status: string };
    }>("POST", "/app/support/conversations", businessAdmin, {
      text: "Preciso de ajuda com a configuracao.",
      clientId: governmentClientId,
      supportTenant: `${prefix}-government`,
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.resumed, false);
    assert.match(created.body.conversation.protocol, /^CVT-/);
    assert.ok(created.body.conversation.supportRef);

    const supportConversation = await prisma.conversation.findFirst({
      where: {
        clientId: supportClientId,
        channel: "support",
        provider: "converta",
      },
      select: { id: true, waId: true, externalUserHash: true },
    });
    assert.ok(supportConversation);
    assert.ok(supportConversation.waId.startsWith("support:"));

    const sourceConversation = await prisma.conversation.findFirst({
      where: {
        clientId: businessClientId,
        channel: "support",
      },
      select: { id: true },
    });
    assert.equal(sourceConversation, null);

    const chatbotReply = await prisma.outboundMessage.findFirst({
      where: {
        clientId: supportClientId,
        waId: supportConversation.waId,
        channel: "support",
        rawPayload: {
          path: ["source"],
          equals: "support_chatbot",
        },
      },
      select: { bodyText: true },
    });
    assert.match(chatbotReply?.bodyText ?? "", /suporte dedicado/i);
    assert.doesNotMatch(chatbotReply?.bodyText ?? "", /Fluxo generico/i);

    const resumed = await request<{
      ok: true;
      resumed: boolean;
      conversation: { supportRef: string };
    }>("POST", "/app/support/conversations", businessAdmin, {
      text: "Complementando o chamado.",
    });
    assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    assert.equal(resumed.body.resumed, true);
    assert.equal(resumed.body.conversation.supportRef, created.body.conversation.supportRef);

    await prisma.conversationRuntimeState.updateMany({
      where: { clientId: supportClientId, waId: supportConversation.waId },
      data: {
        mode: "HUMAN",
        handoffStatus: "ACTIVE",
        status: "IN_PROGRESS",
        assignedUserId: supportAdmin.id,
        windowIsOpen: false,
        windowExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.conversation.update({
      where: { id: supportConversation.id },
      data: {
        windowIsOpen: false,
        windowExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    const originalFetch = globalThis.fetch;
    let externalFetchCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      externalFetchCalls += 1;
      throw new Error("support channel reply must not call external Graph API");
    }) as typeof fetch;
    try {
      const supportReply = await request<{
        ok: true;
        message: { bodyText: string | null; metaMessageId: string | null; status: string };
      }>("POST", `/app/conversation/${encodeURIComponent(supportConversation.waId)}/send`, supportAdmin, {
        text: "Recebemos sua solicitacao.",
      });
      assert.equal(supportReply.status, 200, JSON.stringify(supportReply.body));
      assert.equal(supportReply.body.message.status, "SENT");
      assert.equal(supportReply.body.message.metaMessageId, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(externalFetchCalls, 0);

    const supportOutbound = await prisma.outboundMessage.findFirst({
      where: {
        clientId: supportClientId,
        waId: supportConversation.waId,
        channel: "support",
        provider: "converta",
        rawPayload: {
          path: ["source"],
          equals: "support_inbox",
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: { bodyText: true, metaMessageId: true, rawPayload: true },
    });
    assert.equal(supportOutbound?.bodyText, "Recebemos sua solicitacao.");
    assert.equal(supportOutbound?.metaMessageId, null);

    const inboxDetail = await request<{
      ok: true;
      channel: string;
      provider: string;
      protocol: string | null;
      channelOutboundEnabled: boolean;
      items: Array<{
        direction: string;
        bodyText: string | null;
        type: string | null;
        metaMessageId: string | null;
      }>;
    }>("GET", `/app/conversation/${encodeURIComponent(supportConversation.waId)}`, supportAdmin);
    assert.equal(inboxDetail.status, 200, JSON.stringify(inboxDetail.body));
    assert.equal(inboxDetail.body.channel, "support");
    assert.equal(inboxDetail.body.provider, "converta");
    assert.equal(inboxDetail.body.channelOutboundEnabled, true);
    assert.match(inboxDetail.body.protocol ?? "", /^CVT-/);
    assert.ok(
      inboxDetail.body.items.some(
        (item) => item.direction === "INBOUND" && item.bodyText === "Preciso de ajuda com a configuracao."
      )
    );
    assert.ok(
      inboxDetail.body.items.some(
        (item) =>
          item.direction === "OUTBOUND" &&
          item.bodyText === "Recebemos sua solicitacao." &&
          item.metaMessageId === null
      )
    );

    const inboxTimeline = await request<{
      ok: true;
      contact: { waId: string; waIdCanonical: string; phone: string };
      items: Array<{ kind: string; direction?: string; body?: string | null }>;
    }>("GET", `/app/conversation/${encodeURIComponent(supportConversation.waId)}/timeline`, supportAdmin);
    assert.equal(inboxTimeline.status, 200, JSON.stringify(inboxTimeline.body));
    assert.equal(inboxTimeline.body.contact.waId, supportConversation.waId);
    assert.equal(inboxTimeline.body.contact.waIdCanonical, supportConversation.waId);
    assert.equal(inboxTimeline.body.contact.phone, supportConversation.waId);
    assert.ok(
      inboxTimeline.body.items.some(
        (item) => item.kind === "message" && item.direction === "OUTBOUND" && item.body === "Recebemos sua solicitacao."
      )
    );

    const detail = await request<{
      ok: true;
      messages: Array<{
        direction: string;
        type?: string;
        bodyText: string | null;
        media?: { kind: string; ref: string; mimeType: string; sizeBytes: number; fileName?: string | null; url?: string } | null;
      }>;
    }>("GET", `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}`, businessAdmin);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.ok(detail.body.messages.some((item) => item.direction === "OUTBOUND" && item.bodyText === "Recebemos sua solicitacao."));

    const oneByOnePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2t0XQAAAABJRU5ErkJggg==",
      "base64"
    );
    const uploadForm = new FormData();
    uploadForm.set("caption", "Print do erro no suporte");
    uploadForm.set("file", new Blob([oneByOnePng], { type: "image/png" }), "erro-suporte.png");
    const upload = await requestMultipart<{
      ok: true;
      messages: Array<{
        direction: string;
        type?: string;
        bodyText: string | null;
        media?: { kind: string; ref: string; mimeType: string; sizeBytes: number; fileName?: string | null; url?: string } | null;
      }>;
    }>(`/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}/attachments`, businessAdmin, uploadForm);
    assert.equal(upload.status, 200, JSON.stringify(upload.body));
    const imageMessage = upload.body.messages.find((item) => item.direction === "INBOUND" && item.type === "IMAGE");
    assert.ok(imageMessage?.media);
    assert.equal(imageMessage.media.kind, "image");
    assert.equal(imageMessage.media.mimeType, "image/png");
    assert.equal(imageMessage.media.fileName, "erro-suporte.png");
    assert.equal("storageKey" in imageMessage.media, false);
    assert.equal("url" in imageMessage.media && Boolean(imageMessage.media.url), false);

    const storedSupportImage = await prisma.inboundMessage.findFirst({
      where: {
        clientId: supportClientId,
        waId: supportConversation.waId,
        channel: "support",
        type: "IMAGE",
      },
      select: { messageId: true, rawPayload: true },
    });
    assert.ok(storedSupportImage?.messageId);
    const raw = storedSupportImage.rawPayload as Record<string, unknown>;
    assert.equal(raw.source, "support_hub");
    assert.equal(typeof raw.supportAttachment, "object");
    assert.equal(JSON.stringify(raw).includes("erro-suporte.png"), true);
    assert.equal(JSON.stringify(raw).includes(oneByOnePng.toString("base64")), false);

    const sourceAttachment = await requestBlob(
      "GET",
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}/attachments/${encodeURIComponent(imageMessage.media.ref)}`,
      businessAdmin
    );
    assert.equal(sourceAttachment.status, 200);
    assert.match(sourceAttachment.contentType ?? "", /^image\/png/);
    assert.match(sourceAttachment.disposition ?? "", /^inline/);
    assert.equal(Buffer.compare(Buffer.from(sourceAttachment.bytes), oneByOnePng), 0);

    const inboxAttachment = await requestBlob(
      "GET",
      `/app/conversation/${encodeURIComponent(supportConversation.waId)}/messages/${encodeURIComponent(storedSupportImage.messageId)}/media`,
      supportAdmin
    );
    assert.equal(inboxAttachment.status, 200);
    assert.match(inboxAttachment.contentType ?? "", /^image\/png/);
    assert.equal(Buffer.compare(Buffer.from(inboxAttachment.bytes), oneByOnePng), 0);

    const agentForm = new FormData();
    agentForm.set("file", new Blob([oneByOnePng], { type: "image/png" }), "agent.png");
    const agentUpload = await requestMultipart<ErrorPayload>(
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}/attachments`,
      businessAgent,
      agentForm
    );
    assert.equal(agentUpload.status, 403);

    const spoofForm = new FormData();
    spoofForm.set("file", new Blob(["not an image"], { type: "image/png" }), "spoof.png");
    const spoofUpload = await requestMultipart<ErrorPayload>(
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}/attachments`,
      businessAdmin,
      spoofForm
    );
    assert.equal(spoofUpload.status, 400);

    const otherTenantAttachment = await requestBlob(
      "GET",
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}/attachments/${encodeURIComponent(imageMessage.media.ref)}`,
      governmentAdmin
    );
    assert.equal(otherTenantAttachment.status, 404);

    const otherUserDetail = await request<ErrorPayload>(
      "GET",
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}`,
      businessSupervisor
    );
    assert.equal(otherUserDetail.status, 404);
    assert.equal(getErrorCode(otherUserDetail.body), "support_conversation_not_found");

    const otherTenantDetail = await request<ErrorPayload>(
      "GET",
      `/app/support/conversations/${encodeURIComponent(created.body.conversation.supportRef)}`,
      governmentAdmin
    );
    assert.equal(otherTenantDetail.status, 404);
    assert.equal(getErrorCode(otherTenantDetail.body), "support_conversation_not_found");

    await prisma.conversation.update({
      where: { id: supportConversation.id },
      data: { closedAt: new Date() },
    });
    await prisma.conversationRuntimeState.updateMany({
      where: { clientId: supportClientId, waId: supportConversation.waId },
      data: { closedAt: new Date(), status: "CLOSED" },
    });
    const chatbotRepliesBeforeInvalidFlow = await prisma.outboundMessage.count({
      where: {
        clientId: supportClientId,
        channel: "support",
        rawPayload: {
          path: ["source"],
          equals: "support_chatbot",
        },
      },
    });
    await prisma.tenantOperationalConfig.update({
      where: { clientId: supportClientId },
      data: {
        config: {
          supportChannel: {
            chatbotFlowId: otherTenantFlow.id,
          },
        },
      },
    });
    const reopened = await request<{
      ok: true;
      resumed: boolean;
      conversation: { supportRef: string };
    }>("POST", "/app/support/conversations", businessAdmin, {
      text: "Novo chamado depois do encerramento.",
    });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.resumed, false);
    assert.notEqual(reopened.body.conversation.supportRef, created.body.conversation.supportRef);
    const latestSupportConversation = await prisma.conversation.findFirst({
      where: { clientId: supportClientId, channel: "support", provider: "converta" },
      orderBy: [{ createdAt: "desc" }],
      select: { waId: true },
    });
    assert.ok(latestSupportConversation);
    const invalidFlowRuntime = await prisma.conversationRuntimeState.findFirst({
      where: { clientId: supportClientId, waId: latestSupportConversation.waId, channel: "support" },
      select: { mode: true, status: true, flow: true, chatbotActive: true },
    });
    assert.equal(invalidFlowRuntime?.mode, "HUMAN");
    assert.equal(invalidFlowRuntime?.status, "WAITING");
    assert.equal(invalidFlowRuntime?.flow, null);
    assert.equal(invalidFlowRuntime?.chatbotActive, false);
    assert.equal(
      await prisma.outboundMessage.count({
        where: {
          clientId: supportClientId,
          channel: "support",
          rawPayload: {
            path: ["source"],
            equals: "support_chatbot",
          },
        },
      }),
      chatbotRepliesBeforeInvalidFlow
    );

    await prisma.conversation.updateMany({
      where: { clientId: supportClientId, channel: "support", closedAt: null },
      data: { closedAt: new Date() },
    });
    await prisma.conversationRuntimeState.updateMany({
      where: { clientId: supportClientId, channel: "support", closedAt: null },
      data: { closedAt: new Date(), status: "CLOSED" },
    });
    await prisma.tenantOperationalConfig.update({
      where: { clientId: supportClientId },
      data: { config: {} },
    });
    const noConfig = await request<{
      ok: true;
      resumed: boolean;
      conversation: { supportRef: string };
    }>("POST", "/app/support/conversations", businessSupervisor, {
      text: "Chamado sem flow dedicado configurado.",
    });
    assert.equal(noConfig.status, 200, JSON.stringify(noConfig.body));
    assert.equal(noConfig.body.resumed, false);
    const noConfigConversation = await prisma.conversation.findFirst({
      where: { clientId: supportClientId, channel: "support", provider: "converta", closedAt: null },
      orderBy: [{ createdAt: "desc" }],
      select: { waId: true },
    });
    assert.ok(noConfigConversation);
    const noConfigRuntime = await prisma.conversationRuntimeState.findFirst({
      where: { clientId: supportClientId, waId: noConfigConversation.waId, channel: "support" },
      select: { mode: true, status: true, flow: true, chatbotActive: true },
    });
    assert.equal(noConfigRuntime?.mode, "HUMAN");
    assert.equal(noConfigRuntime?.status, "WAITING");
    assert.equal(noConfigRuntime?.flow, null);
    assert.equal(noConfigRuntime?.chatbotActive, false);
    assert.equal(
      await prisma.outboundMessage.count({
        where: {
          clientId: supportClientId,
          channel: "support",
          rawPayload: {
            path: ["source"],
            equals: "support_chatbot",
          },
        },
      }),
      chatbotRepliesBeforeInvalidFlow
    );
    assert.ok(genericEntryFlow.id);
  } finally {
    env.PLATFORM_SUPPORT_TENANT_KEY = originalSupportTenantKey;
    env.SUPPORT_ATTACHMENT_ROOT = originalSupportAttachmentRoot;
  }
});

test("platform support access is tenant-authorized, temporary, auditable, and not operational", async () => {
  await prisma.platformSupportSession.deleteMany({ where: { actingClientId: businessClientId } });
  await prisma.platformSupportAccessGrant.deleteMany({ where: { clientId: businessClientId } });

  const unauth = await requestUnauth<ErrorPayload>("GET", "/app/settings/support-access");
  assert.equal(unauth.status, 401);

  const agentSettings = await request<ErrorPayload>("GET", "/app/settings/support-access", businessAgent);
  assert.equal(agentSettings.status, 403);
  assert.equal(getErrorCode(agentSettings.body), "forbidden");

  const supervisorSettings = await request<{
    ok: true;
    grant: null;
    permissions: { canManage: boolean };
  }>("GET", "/app/settings/support-access", businessSupervisor);
  assert.equal(supervisorSettings.status, 200, JSON.stringify(supervisorSettings.body));
  assert.equal(supervisorSettings.body.grant, null);
  assert.equal(supervisorSettings.body.permissions.canManage, false);

  const supervisorGrant = await request<ErrorPayload>("POST", "/app/settings/support-access", businessSupervisor, {
    durationHours: 4,
    reason: "diagnostico de suporte",
  });
  assert.equal(supervisorGrant.status, 403);

  const invalidGrant = await request<ErrorPayload>("POST", "/app/settings/support-access", businessAdmin, {
    durationHours: 72,
  });
  assert.equal(invalidGrant.status, 400);
  assert.equal(getErrorCode(invalidGrant.body), "invalid_duration");

  const enterWithoutGrant = await request<ErrorPayload>(
    "POST",
    `/app/platform-support/tenants/${prefix}-business/enter`,
    supportAdmin
  );
  assert.equal(enterWithoutGrant.status, 403);
  assert.equal(getErrorCode(enterWithoutGrant.body), "support_access_not_authorized");

  const grant = await request<{
    ok: true;
    grant: {
      id: string;
      grantedBy: { id: string; name: string } | null;
      reason: string | null;
      expiresAt: string;
      active: boolean;
    };
  }>("POST", "/app/settings/support-access", businessAdmin, {
    durationHours: 4,
    reason: "analise tecnica temporaria",
  });
  assert.equal(grant.status, 200, JSON.stringify(grant.body));
  assert.equal(grant.body.grant.grantedBy?.id, businessAdmin.id);
  assert.equal(grant.body.grant.reason, "analise tecnica temporaria");
  assert.equal(grant.body.grant.active, true);
  assert.ok(new Date(grant.body.grant.expiresAt).getTime() > Date.now());
  assert.equal(
    await prisma.platformSupportAccessGrant.count({
      where: { id: grant.body.grant.id, clientId: businessClientId },
    }),
    1
  );

  const grantEvent = await prisma.event.findFirst({
    where: { clientId: businessClientId, eventName: "support.access.granted" },
    select: { payloadJson: true },
  });
  assert.ok(grantEvent);
  assert.equal(JSON.stringify(grantEvent.payloadJson).includes(businessAdmin.email), false);

  const adminConsoleDetail = await requestSuperadmin<{
    ok: true;
    supportAccess: { id: string; active: boolean; reason: string | null } | null;
  }>("GET", `/admin/tenants/${prefix}-business`);
  assert.equal(adminConsoleDetail.status, 200, JSON.stringify(adminConsoleDetail.body));
  assert.equal(adminConsoleDetail.body.supportAccess?.id, grant.body.grant.id);
  assert.equal(adminConsoleDetail.body.supportAccess?.active, true);

  const tenantUserEnter = await request<ErrorPayload>(
    "POST",
    `/app/platform-support/tenants/${prefix}-business/enter`,
    businessAdmin
  );
  assert.equal(tenantUserEnter.status, 403);
  assert.equal(getErrorCode(tenantUserEnter.body), "support_identity_required");

  const crossTenantEnter = await request<ErrorPayload>(
    "POST",
    `/app/platform-support/tenants/${prefix}-government/enter`,
    supportAdmin
  );
  assert.equal(crossTenantEnter.status, 403);
  assert.equal(getErrorCode(crossTenantEnter.body), "support_access_not_authorized");

  const usersBefore = await prisma.user.count({ where: { clientId: businessClientId } });
  const appSessionsBefore = await prisma.appAuthSession.count({ where: { clientId: businessClientId } });
  const outboundBefore = await prisma.outboundMessage.count({ where: { clientId: businessClientId } });

  const entered = await request<{
    ok: true;
    token: string;
    supportAccess: {
      accessType: "platform_support";
      grantId: string;
      supportClientId: string;
      supportUserId: string;
      tenantId: string;
      tenantName: string;
      expiresAt: string;
    };
  }>("POST", `/app/platform-support/tenants/${prefix}-business/enter`, supportAdmin);
  assert.equal(entered.status, 200, JSON.stringify(entered.body));
  assert.equal(entered.body.supportAccess.grantId, grant.body.grant.id);
  assert.equal(entered.body.supportAccess.supportClientId, supportClientId);
  assert.equal(entered.body.supportAccess.supportUserId, supportAdmin.id);
  assert.equal(entered.body.supportAccess.tenantId, `${prefix}-business`);

  assert.equal(await prisma.user.count({ where: { clientId: businessClientId } }), usersBefore);
  assert.equal(await prisma.appAuthSession.count({ where: { clientId: businessClientId } }), appSessionsBefore);

  const supportTenantView = await requestWithBearer<{
    ok: true;
    tenant: { id: string; supportAccess: { accessType: string; grantId: string } | null };
  }>("GET", "/app/tenant", entered.body.token);
  assert.equal(supportTenantView.status, 200, JSON.stringify(supportTenantView.body));
  assert.equal(supportTenantView.body.tenant.id, businessClientId);
  assert.equal(supportTenantView.body.tenant.supportAccess?.accessType, "platform_support");
  assert.equal(supportTenantView.body.tenant.supportAccess?.grantId, grant.body.grant.id);

  const supportSettingsView = await requestWithBearer<{
    ok: true;
    permissions: { canManage: boolean };
  }>("GET", "/app/settings/support-access", entered.body.token);
  assert.equal(supportSettingsView.status, 200, JSON.stringify(supportSettingsView.body));
  assert.equal(supportSettingsView.body.permissions.canManage, false);

  const supportSelfRevoke = await requestWithBearer<ErrorPayload>(
    "DELETE",
    "/app/settings/support-access",
    entered.body.token
  );
  assert.equal(supportSelfRevoke.status, 403);
  assert.equal(getErrorCode(supportSelfRevoke.body), "support_access_self_management_blocked");

  const supportClaim = await requestWithBearer<ErrorPayload>(
    "POST",
    "/app/conversation/5511999990000/claim",
    entered.body.token
  );
  assert.equal(supportClaim.status, 403);
  assert.equal(getErrorCode(supportClaim.body), "support_operational_action_blocked");

  const supportSend = await requestWithBearer<ErrorPayload>(
    "POST",
    "/app/conversation/5511999990000/send",
    entered.body.token,
    { text: "nao deve enviar" }
  );
  assert.equal(supportSend.status, 403);
  assert.equal(getErrorCode(supportSend.body), "support_operational_action_blocked");
  assert.equal(await prisma.outboundMessage.count({ where: { clientId: businessClientId } }), outboundBefore);

  const enteredSession = await prisma.platformSupportSession.findFirst({
    where: { actingClientId: businessClientId, supportUserId: supportAdmin.id, endedAt: null },
    select: { id: true },
  });
  assert.ok(enteredSession);

  const revoke = await request<{
    ok: true;
    grant: { id: string; active: boolean; revokedBy: { id: string; name: string } | null };
  }>("DELETE", "/app/settings/support-access", businessAdmin);
  assert.equal(revoke.status, 200, JSON.stringify(revoke.body));
  assert.equal(revoke.body.grant.id, grant.body.grant.id);
  assert.equal(revoke.body.grant.active, false);
  assert.equal(revoke.body.grant.revokedBy?.id, businessAdmin.id);

  const revokedSession = await prisma.platformSupportSession.findUnique({
    where: { id: enteredSession.id },
    select: { endedAt: true, endReason: true },
  });
  assert.ok(revokedSession?.endedAt);
  assert.equal(revokedSession.endReason, "grant_revoked");

  const afterRevoke = await requestWithBearer<ErrorPayload>("GET", "/app/tenant", entered.body.token);
  assert.equal(afterRevoke.status, 401);
  assert.equal(getErrorCode(afterRevoke.body), "support_access_revoked");

  const revokeEvent = await prisma.event.findFirst({
    where: { clientId: businessClientId, eventName: "support.access.revoked" },
    select: { payloadJson: true },
  });
  assert.ok(revokeEvent);

  const expiredGrant = await prisma.platformSupportAccessGrant.create({
    data: {
      clientId: businessClientId,
      grantedByUserId: businessAdmin.id,
      reason: "grant expirado de teste",
      expiresAt: new Date(Date.now() - 60_000),
    },
    select: { id: true },
  });
  const expiredSession = await prisma.platformSupportSession.create({
    data: {
      grantId: expiredGrant.id,
      actingClientId: businessClientId,
      supportClientId,
      supportUserId: supportAdmin.id,
      sourceAppSessionId: `${supportAdmin.id}-session`,
      expiresAt: new Date(Date.now() - 30_000),
    },
    select: { id: true },
  });
  const expiredToken = issueClientAuthToken(
    {
      ...supportAdmin,
      clientId: businessClientId,
      role: "ADMIN",
      supportAccess: {
        accessType: "platform_support",
        grantId: expiredGrant.id,
        supportClientId,
        supportUserId: supportAdmin.id,
        sourceAppSessionId: `${supportAdmin.id}-session`,
      },
    },
    expiredSession.id,
    buildAppAuthSessionExpiresAt()
  );
  const expiredAccess = await requestWithBearer<ErrorPayload>("GET", "/app/tenant", expiredToken);
  assert.equal(expiredAccess.status, 401);
  assert.equal(getErrorCode(expiredAccess.body), "support_access_expired");
  const expiredStoredSession = await prisma.platformSupportSession.findUnique({
    where: { id: expiredSession.id },
    select: { endedAt: true, endReason: true },
  });
  assert.ok(expiredStoredSession?.endedAt);
  assert.equal(expiredStoredSession.endReason, "grant_expired");

  assert.ok(
    await prisma.event.findFirst({
      where: { clientId: businessClientId, eventName: "support.access.expired" },
    })
  );
});

test("admin tenant feature entitlements are platform-scoped, audited, dependency-aware, and preserved in support mode", async () => {
  const originalClient = await prisma.client.findUnique({
    where: { id: businessClientId },
    select: { features: true },
  });
  await prisma.platformSupportSession.deleteMany({ where: { actingClientId: businessClientId } });
  await prisma.platformSupportAccessGrant.deleteMany({ where: { clientId: businessClientId } });
  try {
    await prisma.client.update({
      where: { id: businessClientId },
      data: { features: { legacyExperimentalFlag: true, campaigns: false, reports: true, crm: true } },
    });

    const detail = await requestSuperadmin<{
      ok: true;
      client: { features: Record<string, unknown> | null };
      featureEntitlements: Array<{ key: string; status: string; enabled: boolean; unavailableReasons: string[] }>;
    }>("GET", `/admin/tenants/${prefix}-business`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.client.features?.legacyExperimentalFlag, true);
    assert.ok(detail.body.featureEntitlements.some((item) => item.key === "crm" && item.enabled === true));
    assert.ok(
      detail.body.featureEntitlements.some(
        (item) => item.key === "campaigns" && item.status === "unavailable"
      )
    );

    const tenantAdminAttempt = await requestUnauth<ErrorPayload>(
      "PUT",
      `/admin/tenants/${prefix}-business/features`,
      { features: { reports: false } }
    );
    assert.equal(tenantAdminAttempt.status, 401);

    const unknown = await requestSuperadmin<ErrorPayload>(
      "PUT",
      `/admin/tenants/${prefix}-business/features`,
      { features: { unknownFeature: true } }
    );
    assert.equal(unknown.status, 400);
    assert.equal(getErrorCode(unknown.body), "unknown_feature");

    const dependencyBlocked = await requestSuperadmin<ErrorPayload>(
      "PUT",
      `/admin/tenants/${prefix}-business/features`,
      { features: { campaigns: true } }
    );
    assert.equal(dependencyBlocked.status, 409);
    assert.equal(getErrorCode(dependencyBlocked.body), "feature_dependency_unavailable");
    assert.equal(dependencyBlocked.body.feature, "campaigns");

    const updated = await requestSuperadmin<{
      ok: true;
      client: { features: Record<string, unknown> | null };
      featureEntitlements: Array<{ key: string; enabled: boolean }>;
      fieldsChanged: string[];
    }>("PUT", `/admin/tenants/${prefix}-business/features`, {
      features: { reports: false, crm: false },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.deepEqual(updated.body.fieldsChanged.sort(), ["features.crm", "features.reports"]);
    assert.equal(updated.body.client.features?.legacyExperimentalFlag, true);
    assert.equal(updated.body.client.features?.reports, false);
    assert.equal(updated.body.client.features?.crm, false);

    const saved = await prisma.client.findUnique({
      where: { id: businessClientId },
      select: { features: true },
    });
    assert.equal((saved?.features as Record<string, unknown>).legacyExperimentalFlag, true);

    const event = await prisma.event.findFirst({
      where: { clientId: businessClientId, eventName: "tenant.feature.updated" },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });
    assert.ok(event);
    assert.equal(JSON.stringify(event.payloadJson).includes(businessAdmin.email), false);
    assert.equal(JSON.stringify(event.payloadJson).includes(process.env.ADMIN_TOKEN ?? ""), false);

    const grant = await request<{ ok: true; grant: { id: string } }>(
      "POST",
      "/app/settings/support-access",
      businessAdmin,
      { durationHours: 1, reason: "feature entitlement test" }
    );
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    const entered = await request<{
      ok: true;
      features: { reports: boolean; crm: boolean };
      supportAccess: { accessType: "platform_support"; grantId: string };
    }>("POST", `/app/platform-support/tenants/${prefix}-business/enter`, supportAdmin);
    assert.equal(entered.status, 200, JSON.stringify(entered.body));
    assert.equal(entered.body.supportAccess.grantId, grant.body.grant.id);
    assert.equal(entered.body.features.reports, false);
    assert.equal(entered.body.features.crm, false);
  } finally {
    await prisma.platformSupportSession.deleteMany({ where: { actingClientId: businessClientId } });
    await prisma.platformSupportAccessGrant.deleteMany({ where: { clientId: businessClientId } });
    await prisma.client.update({
      where: { id: businessClientId },
      data: { features: (originalClient?.features ?? {}) as Prisma.JsonObject },
    });
  }
});

test("queue assignment settings are tenant scoped and managed by admin or supervisor", async () => {
  const unauth = await requestUnauth<ErrorPayload>("GET", "/app/settings/queue-assignment");
  assert.equal(unauth.status, 401);

  const agent = await request<ErrorPayload>("GET", "/app/settings/queue-assignment", businessAgent);
  assert.equal(agent.status, 403);

  const supervisor = await request<{
    ok: boolean;
    policy: { enabled: boolean; mode: string };
    permissions: { canUpdate: boolean };
  }>("GET", "/app/settings/queue-assignment", businessSupervisor);
  assert.equal(supervisor.status, 200);
  assert.equal(supervisor.body.ok, true);
  assert.equal(supervisor.body.policy.enabled, false);
  assert.equal(supervisor.body.policy.mode, "manual");
  assert.equal(supervisor.body.permissions.canUpdate, true);

  const supervisorUpdate = await request<{
    ok: boolean;
    policy: { enabled: boolean; mode: string; scope: string };
    permissions: { canUpdate: boolean };
  }>("PUT", "/app/settings/queue-assignment", businessSupervisor, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
  });
  assert.equal(supervisorUpdate.status, 200);
  assert.equal(supervisorUpdate.body.policy.enabled, true);
  assert.equal(supervisorUpdate.body.policy.mode, "round_robin");
  assert.equal(supervisorUpdate.body.permissions.canUpdate, true);

  const supervisorLeastActive = await request<{
    ok: boolean;
    policy: { enabled: boolean; mode: string; scope: string };
  }>("PUT", "/app/settings/queue-assignment", businessSupervisor, {
    enabled: true,
    mode: "least_active",
    scope: "department",
  });
  assert.equal(supervisorLeastActive.status, 200);
  assert.equal(supervisorLeastActive.body.policy.mode, "least_active");

  const agentUpdate = await request<ErrorPayload>("PUT", "/app/settings/queue-assignment", businessAgent, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
  });
  assert.equal(agentUpdate.status, 403);

  const invalid = await request<ErrorPayload>("PUT", "/app/settings/queue-assignment", businessAdmin, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    maxActivePerAgent: 0,
  });
  assert.equal(invalid.status, 400);
  assert.equal(getErrorCode(invalid.body), "invalid_max_active");

  const saved = await request<{
    ok: boolean;
    tenantId: string;
    policy: {
      enabled: boolean;
      mode: string;
      scope: string;
      maxActivePerAgent: number | null;
      includeSupervisors: boolean;
      requireOnline: boolean;
      notifyAssignedOnly: boolean;
      lastAssignedUserIdByScope?: unknown;
    };
    effectiveMode: string;
    warnings: string[];
    permissions: { canUpdate: boolean };
  }>("PUT", "/app/settings/queue-assignment", businessAdmin, {
    enabled: true,
    mode: "round_robin",
    scope: "department",
    maxActivePerAgent: 3,
    includeSupervisors: false,
    requireOnline: true,
    notifyAssignedOnly: true,
    clientId: overrideClientId,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  assert.match(saved.body.tenantId, /business$/);
  assert.equal(saved.body.policy.enabled, true);
  assert.equal(saved.body.policy.mode, "round_robin");
  assert.equal(saved.body.policy.scope, "department");
  assert.equal(saved.body.policy.maxActivePerAgent, 3);
  assert.equal(saved.body.policy.includeSupervisors, false);
  assert.equal(saved.body.policy.requireOnline, true);
  assert.equal(saved.body.policy.notifyAssignedOnly, true);
  assert.equal(saved.body.policy.lastAssignedUserIdByScope, undefined);
  assert.equal(saved.body.effectiveMode, "round_robin");
  assert.ok(saved.body.warnings.some((warning) => warning.includes("Presenca online")));
  assert.equal(saved.body.permissions.canUpdate, true);

  const override = await request<{
    policy: { enabled: boolean; mode: string };
  }>("GET", "/app/settings/queue-assignment", overrideAdmin);
  assert.equal(override.status, 200);
  assert.equal(override.body.policy.enabled, false);
  assert.equal(override.body.policy.mode, "manual");

  const config = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: businessClientId },
    select: { config: true },
  });
  const queuePolicy = (config?.config as { queueAssignmentPolicy?: { mode?: string; maxActivePerAgent?: number } })
    ?.queueAssignmentPolicy;
  assert.equal(queuePolicy?.mode, "round_robin");
  assert.equal(queuePolicy?.maxActivePerAgent, 3);

  const event = await prisma.event.findFirst({
    where: { clientId: businessClientId, eventName: "queue.assignment.policy_updated" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(event);
  const payload = event.payloadJson as Record<string, unknown>;
  assert.equal(payload.mode, "round_robin");
  assert.equal(payload.scope, "department");
  assert.equal(payload.maxActivePerAgent, 3);
  assert.ok(!JSON.stringify(payload).includes(overrideClientId));
});

test("whatsapp web session settings are tenant scoped and admin protected", async () => {
  const unauth = await requestUnauth<ErrorPayload>("GET", "/app/settings/channels/whatsapp/web-session");
  assert.equal(unauth.status, 401);

  const agent = await request<ErrorPayload>("GET", "/app/settings/channels/whatsapp/web-session", businessAgent);
  assert.equal(agent.status, 403);

  const supervisor = await request<ErrorPayload>("GET", "/app/settings/channels/whatsapp/web-session", businessSupervisor);
  assert.equal(supervisor.status, 403);

  const supervisorPrepare = await request<ErrorPayload>(
    "POST",
    "/app/settings/channels/whatsapp/web-session",
    businessSupervisor,
    { displayName: "Lab WhatsApp" }
  );
  assert.equal(supervisorPrepare.status, 403);

  const prepared = await request<{
    ok: boolean;
    tenantId: string;
    status: {
      configured: boolean;
      account: {
        channel: string;
        provider: string;
        channelAccountId: string;
        displayName: string;
        runtimeEnabled: boolean;
        status: string;
      };
      lifecycle: { desiredState: string; observedState: string };
    };
  }>("POST", "/app/settings/channels/whatsapp/web-session?clientId=malicious", businessAdmin, {
    displayName: "Lab WhatsApp",
    channelAccountId: "lab-account",
    channel: "instagram",
    provider: "meta",
  });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.body.ok, true);
  assert.match(prepared.body.tenantId, /business$/);
  assert.equal(prepared.body.status.configured, true);
  assert.equal(prepared.body.status.account.channel, "whatsapp");
  assert.equal(prepared.body.status.account.provider, "web_session");
  assert.equal(prepared.body.status.account.channelAccountId, "lab-account");
  assert.equal(prepared.body.status.account.displayName, "Lab WhatsApp");
  assert.equal(prepared.body.status.account.runtimeEnabled, false);
  assert.equal(prepared.body.status.account.status, "pending");
  assert.equal(prepared.body.status.lifecycle.desiredState, "DISCONNECTED");
  assert.equal(prepared.body.status.lifecycle.observedState, "DISCONNECTED");

  const supervisorQr = await request<ErrorPayload>(
    "GET",
    "/app/settings/channels/whatsapp/web-session/qr",
    businessSupervisor
  );
  assert.equal(supervisorQr.status, 403);

  const overrideStatus = await request<{
    status: { configured: boolean };
  }>("GET", "/app/settings/channels/whatsapp/web-session", overrideAdmin);
  assert.equal(overrideStatus.status, 200);
  assert.equal(overrideStatus.body.status.configured, false);

  const disabledConnect = await request<ErrorPayload>(
    "POST",
    "/app/settings/channels/whatsapp/web-session/connect",
    businessAdmin
  );
  assert.equal(disabledConnect.status, 403);
  assert.equal(getErrorCode(disabledConnect.body), "web_session_feature_disabled");

  await prisma.client.update({
    where: { id: businessClientId },
    data: { features: { whatsappWebSession: true } },
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    update: {
      phoneNumberId: "meta-phone-id-business",
      businessToken: "meta-business-token-business",
      wabaId: "meta-waba-id-business",
      rawPayload: { source: "unit_test", phoneNumber: { display_phone_number: "+55 84 9999-0001" } },
    },
    create: {
      clientId: businessClientId,
      phoneNumberId: "meta-phone-id-business",
      businessToken: "meta-business-token-business",
      wabaId: "meta-waba-id-business",
      rawPayload: { source: "unit_test", phoneNumber: { display_phone_number: "+55 84 9999-0001" } },
    },
  });
  await prisma.waPhoneNumber.upsert({
    where: { phoneNumberId: "meta-phone-id-business" },
    update: { clientId: businessClientId, display: "+55 84 9999-0001" },
    create: {
      clientId: businessClientId,
      phoneNumberId: "meta-phone-id-business",
      display: "+55 84 9999-0001",
    },
  });
  const noNumberConnect = await request<ErrorPayload>(
    "POST",
    "/app/settings/channels/whatsapp/web-session/connect",
    businessAdmin
  );
  assert.equal(noNumberConnect.status, 409);
  assert.equal(getErrorCode(noNumberConnect.body), "web_session_number_not_authorized");

  const tenantAuthorizationBlocked = await request<ErrorPayload>(
    "PUT",
    "/app/settings/channels/whatsapp/web-session/authorize-number",
    businessAdmin,
    { number: "+55 84 9999-9999" }
  );
  assert.equal(tenantAuthorizationBlocked.status, 403);
  assert.equal(getErrorCode(tenantAuthorizationBlocked.body), "platform_admin_required");
  const tenantPrimaryBlocked = await request<ErrorPayload>(
    "PUT",
    "/app/settings/channels/whatsapp/primary-transport",
    businessAdmin,
    { provider: "web_session" }
  );
  assert.equal(tenantPrimaryBlocked.status, 403);
  assert.equal(getErrorCode(tenantPrimaryBlocked.body), "platform_admin_required");
  const tenantMediaPolicyBlocked = await request<ErrorPayload>(
    "PUT",
    "/app/settings/channels/whatsapp/media-policy",
    businessAdmin,
    {
      whatsappMediaPolicy: {
        inbound: { image: true, audio: false, video: false, document: true },
        outbound: { image: true, audio: false, video: false, document: true },
      },
    }
  );
  assert.equal(tenantMediaPolicyBlocked.status, 404);
  const tenantReleaseBlocked = await request<ErrorPayload>(
    "POST",
    "/app/settings/channels/whatsapp/web-session/release-number",
    businessAdmin
  );
  assert.equal(tenantReleaseBlocked.status, 403);
  assert.equal(getErrorCode(tenantReleaseBlocked.body), "platform_admin_required");

  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: businessClientId },
    update: {
      config: {
        supportChannel: { chatbotFlowId: "flow-preserved" },
      },
    },
    create: {
      clientId: businessClientId,
      config: {
        supportChannel: { chatbotFlowId: "flow-preserved" },
      },
    },
  });
  const mediaPolicyDefault = await requestSuperadmin<{
    ok: true;
    source: string;
    whatsappMediaPolicy: {
      inbound: { image: boolean; audio: boolean; video: boolean; document: boolean };
      outbound: { image: boolean; audio: boolean; video: boolean; document: boolean };
    };
  }>("GET", `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/whatsapp/media-policy`);
  assert.equal(mediaPolicyDefault.status, 200);
  assert.equal(mediaPolicyDefault.body.source, "json_fallback");
  assert.equal(mediaPolicyDefault.body.whatsappMediaPolicy.inbound.audio, true);

  const mediaPolicyUpdated = await requestSuperadmin<{
    ok: true;
    fieldsChanged: string[];
    whatsappMediaPolicy: {
      inbound: { image: boolean; audio: boolean; video: boolean; document: boolean };
      outbound: { image: boolean; audio: boolean; video: boolean; document: boolean };
    };
  }>("PUT", `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/whatsapp/media-policy`, {
    whatsappMediaPolicy: {
      inbound: { image: true, audio: false, video: false, document: true },
      outbound: { image: true, audio: true, video: false, document: true },
    },
  });
  assert.equal(mediaPolicyUpdated.status, 200, JSON.stringify(mediaPolicyUpdated.body));
  assert.deepEqual(mediaPolicyUpdated.body.fieldsChanged, ["whatsappMediaPolicy"]);
  assert.equal(mediaPolicyUpdated.body.whatsappMediaPolicy.inbound.audio, false);
  assert.equal(mediaPolicyUpdated.body.whatsappMediaPolicy.outbound.audio, true);
  const configAfterMediaPolicy = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: businessClientId },
    select: { config: true },
  });
  const configObject = configAfterMediaPolicy?.config as Record<string, unknown> | null;
  assert.deepEqual(configObject?.supportChannel, { chatbotFlowId: "flow-preserved" });
  assert.equal(Boolean(configObject?.whatsappMediaPolicy), true);
  const mediaPolicyAudit = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "whatsapp.media_policy.updated",
    },
  });
  assert.ok(mediaPolicyAudit);
  assert.equal(JSON.stringify(mediaPolicyAudit.payloadJson).includes(process.env.ADMIN_TOKEN ?? ""), false);

  const mismatchedAuthorization = await requestSuperadmin<ErrorPayload>(
    "PUT",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/web-session/authorize-number`,
    { number: "+55 84 9999-9999" }
  );
  assert.equal(mismatchedAuthorization.status, 409);
  assert.equal(getErrorCode(mismatchedAuthorization.body), "web_session_meta_identity_mismatch");

  const authorized = await requestSuperadmin<{
    status: {
      authorization: {
        status: string;
        authorizedNumberCanonical: string;
        authorizedNumberMasked: string;
      };
    };
  }>(
    "PUT",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/web-session/authorize-number`,
    { number: "+55 84 9999-0001" }
  );
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.status.authorization.status, "AUTHORIZED");
  assert.equal(authorized.body.status.authorization.authorizedNumberCanonical, "558499990001");
  assert.equal(authorized.body.status.authorization.authorizedNumberMasked, "****0001");

  const webPrimaryBeforeConnect = await requestSuperadmin<ErrorPayload>(
    "PUT",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/whatsapp/primary-transport`,
    { provider: "web_session" }
  );
  assert.equal(webPrimaryBeforeConnect.status, 409);
  assert.equal(getErrorCode(webPrimaryBeforeConnect.body), "web_session_transport_unavailable");

  const connected = await request<{
    status: {
      account: {
        runtimeEnabled: boolean;
        inboundPersistenceEnabled: boolean;
        outboundEnabled: boolean;
        status: string;
      };
      lifecycle: { desiredState: string; observedState: string };
    };
  }>("POST", "/app/settings/channels/whatsapp/web-session/connect", businessAdmin);
  assert.equal(connected.status, 200);
  assert.equal(connected.body.status.account.runtimeEnabled, true);
  assert.equal(connected.body.status.account.inboundPersistenceEnabled, true);
  assert.equal(connected.body.status.account.outboundEnabled, false);
  assert.equal(connected.body.status.account.status, "pending");
  assert.equal(connected.body.status.lifecycle.desiredState, "CONNECTED");
  assert.equal(connected.body.status.lifecycle.observedState, "CONNECTING");

  const qr = await request<{
    ok: boolean;
    qr: string | null;
    expired: boolean;
    lifecycle: { observedState: string };
  }>("GET", "/app/settings/channels/whatsapp/web-session/qr", businessAdmin);
  assert.equal(qr.status, 200);
  assert.equal(qr.body.ok, true);
  assert.equal(qr.body.qr, null);
  assert.equal(qr.body.expired, false);

  const savedSecret = await saveWebSessionAuthState({
    prisma,
    tenantKey: `${prefix}-business`,
    channelAccountId: "lab-account",
    state: { creds: { me: "redacted" }, keys: {} },
  });
  assert.equal(savedSecret.ok, true);
  assert.equal(
    await prisma.channelAccountSecret.count({
      where: {
        channelAccount: { clientId: businessClientId, channel: "whatsapp", provider: "web_session" },
      },
    }),
    1
  );

  await prisma.channelAccount.create({
    data: {
      clientId: businessClientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId: "web-session-default",
      displayName: "Placeholder Web Session",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: false,
      outboundEnabled: false,
      automationEnabled: false,
      aiEnabled: false,
      handoffEnabled: false,
      status: "disconnected",
      tokenStatus: "not_required",
    },
  });

  const disconnected = await request<{
    status: {
      account: { channelAccountId: string; runtimeEnabled: boolean; status: string };
      authState: { configured: boolean };
      lifecycle: { desiredState: string; observedState: string };
    };
  }>("POST", "/app/settings/channels/whatsapp/web-session/disconnect", businessAdmin);
  assert.equal(disconnected.status, 200);
  assert.equal(disconnected.body.status.account.channelAccountId, "lab-account");
  assert.equal(disconnected.body.status.account.runtimeEnabled, false);
  assert.equal(disconnected.body.status.authState.configured, true);

  const reconnected = await request<{
    status: {
      account: { channelAccountId: string; runtimeEnabled: boolean; status: string };
      authState: { configured: boolean };
      lifecycle: { desiredState: string; observedState: string };
    };
  }>("POST", "/app/settings/channels/whatsapp/web-session/connect", businessAdmin);
  assert.equal(reconnected.status, 200);
  assert.equal(reconnected.body.status.account.channelAccountId, "lab-account");
  assert.equal(reconnected.body.status.account.runtimeEnabled, true);
  assert.equal(reconnected.body.status.account.status, "pending");
  assert.equal(reconnected.body.status.authState.configured, true);
  assert.equal(reconnected.body.status.lifecycle.desiredState, "CONNECTED");
  assert.equal(reconnected.body.status.lifecycle.observedState, "CONNECTING");

  await prisma.channelAccount.updateMany({
    where: { clientId: businessClientId, channel: "whatsapp", provider: "web_session", channelAccountId: "lab-account" },
    data: {
      status: "connected",
      outboundEnabled: true,
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "CONNECTED",
        },
      },
    },
  });
  const savedWebPrimary = await requestSuperadmin<{
    ok: true;
    primaryTransport: "web_session";
    status: { primaryTransport: "web_session"; hybridIdentity: { conflict: boolean } };
  }>(
    "PUT",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/whatsapp/primary-transport`,
    { provider: "web_session" }
  );
  assert.equal(savedWebPrimary.status, 200, JSON.stringify(savedWebPrimary.body));
  assert.equal(savedWebPrimary.body.primaryTransport, "web_session");
  assert.equal(savedWebPrimary.body.status.primaryTransport, "web_session");
  assert.equal(savedWebPrimary.body.status.hybridIdentity.conflict, false);

  const reset = await request<{
    status: {
      authState: { configured: boolean };
      authorization: { status: string; authorizedNumberCanonical: string };
      account: { runtimeEnabled: boolean; inboundPersistenceEnabled: boolean; status: string };
      lifecycle: { desiredState: string; observedState: string };
    };
  }>("POST", "/app/settings/channels/whatsapp/web-session/reset", businessAdmin);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.status.authState.configured, false);
  assert.equal(reset.body.status.authorization.status, "AUTHORIZED");
  assert.equal(reset.body.status.authorization.authorizedNumberCanonical, "558499990001");
  assert.equal(reset.body.status.account.runtimeEnabled, false);
  assert.equal(reset.body.status.account.inboundPersistenceEnabled, false);
  assert.equal(reset.body.status.account.status, "pending");
  assert.equal(reset.body.status.lifecycle.desiredState, "DISCONNECTED");
  assert.equal(reset.body.status.lifecycle.observedState, "DISCONNECTED");
  assert.equal(
    await prisma.channelAccountSecret.count({
      where: {
        channelAccount: { clientId: businessClientId, channel: "whatsapp", provider: "web_session" },
      },
    }),
    0
  );
  await prisma.channelAccount.updateMany({
    where: { clientId: businessClientId, channel: "whatsapp", provider: "web_session", channelAccountId: "lab-account" },
    data: { channelAccountId: "558499990001" },
  });

  const release = await requestSuperadmin<{
    status: {
      authorization: { status: string; authorizedNumberCanonical: string | null };
      hybridIdentity: {
        conflict: boolean;
        logicalIdentity: { provider: string; maskedNumber: string | null } | null;
      };
      account: { runtimeEnabled: boolean; inboundPersistenceEnabled: boolean; status: string };
    };
  }>("POST", `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/web-session/release-number`);
  assert.equal(release.status, 200);
  assert.equal(release.body.status.authorization.status, "RELEASED");
  assert.equal(release.body.status.authorization.authorizedNumberCanonical, null);
  assert.equal(release.body.status.hybridIdentity.conflict, false);
  assert.equal(release.body.status.hybridIdentity.logicalIdentity?.provider, "meta");
  assert.equal(release.body.status.hybridIdentity.logicalIdentity?.maskedNumber, "****0001");
  assert.equal(release.body.status.account.runtimeEnabled, false);
  const archivedReleasedAccount = await prisma.channelAccount.findFirst({
    where: { clientId: businessClientId, channel: "whatsapp", provider: "web_session", channelAccountId: { startsWith: "archived:" } },
    select: { channelAccountId: true },
  });
  assert.ok(archivedReleasedAccount);
  assert.match(archivedReleasedAccount.channelAccountId, /^archived:/);
  const releaseArchiveEvent = await prisma.event.findFirst({
    where: { clientId: businessClientId, eventName: "whatsapp.web.identity.released_archived" },
    select: { payloadJson: true },
  });
  assert.ok(releaseArchiveEvent);
  const releaseArchivePayload = releaseArchiveEvent.payloadJson as { previousNumberMasked?: string; previousNumberHash?: string };
  assert.equal(releaseArchivePayload.previousNumberMasked, "****0001");
  assert.ok(releaseArchivePayload.previousNumberHash);

  const reauthorized = await requestSuperadmin(
    "PUT",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/web-session/authorize-number`,
    { number: "+55 84 9999-0001" }
  );
  assert.equal(reauthorized.status, 200);
  const metaMismatch = await requestSuperadmin<ErrorPayload>(
    "POST",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/onboarding/manual-bind`,
    {
      phoneNumberId: "meta-phone-id-business-2",
      displayPhoneNumber: "+55 84 9999-0002",
    }
  );
  assert.equal(metaMismatch.status, 409);
  assert.equal(getErrorCode(metaMismatch.body), "hybrid_identity_conflict");

  const confirmedMetaChange = await requestSuperadmin<{ ok: true; phoneNumberId: string }>(
    "POST",
    `/admin/tenants/${encodeURIComponent(`${prefix}-business`)}/onboarding/manual-bind`,
    {
      phoneNumberId: "meta-phone-id-business-2",
      displayPhoneNumber: "+55 84 9999-0002",
      confirmInvalidateWebSession: true,
    }
  );
  assert.equal(confirmedMetaChange.status, 200, JSON.stringify(confirmedMetaChange.body));
  assert.equal(confirmedMetaChange.body.phoneNumberId, "meta-phone-id-business-2");
  const invalidatedConfig = await prisma.tenantOperationalConfig.findUnique({
    where: { clientId: businessClientId },
    select: { config: true },
  });
  assert.equal(
    (invalidatedConfig?.config as { webSessionAuthorization?: { status?: string } })?.webSessionAuthorization?.status,
    "INVALIDATED_BY_META_IDENTITY_CHANGE"
  );
  assert.equal(
    await prisma.channelAccountSecret.count({
      where: {
        channelAccount: { clientId: businessClientId, channel: "whatsapp", provider: "web_session" },
      },
    }),
    0
  );
  const invalidatedReconnect = await request<ErrorPayload>(
    "POST",
    "/app/settings/channels/whatsapp/web-session/connect",
    businessAdmin
  );
  assert.equal(invalidatedReconnect.status, 409);
  assert.equal(getErrorCode(invalidatedReconnect.body), "web_session_number_not_authorized");

  await prisma.client.update({
    where: { id: businessClientId },
    data: { features: {} },
  });
});

test("inbox routes WhatsApp web session outbound through worker without Meta fallback", async (t) => {
  const previousWorkerUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
  const previousWorkerToken = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
  const previousFetch = globalThis.fetch;
  const waId = "5511940008842";
  const legacyCanonicalWaId = "55119940008842";
  const channelAccountId = "lab-outbound-account";
  const workerTextRequests: Array<Record<string, unknown>> = [];
  const workerMediaRequests: Array<Record<string, unknown>> = [];
  let workerMessageSequence = 0;
  const fakeWorker = createServer((req, res) => {
    if (req.method !== "POST" || (req.url !== "/web-session/send-text" && req.url !== "/web-session/send-media")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    assert.equal(req.headers.authorization, "Bearer worker-test-token");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const requestPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      const requests = req.url === "/web-session/send-media" ? workerMediaRequests : workerTextRequests;
      requests.push(requestPayload);
      workerMessageSequence += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, externalMessageId: `baileys-test-message-id-${workerMessageSequence}` }));
    });
  });
  await new Promise<void>((resolve) => fakeWorker.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    const closePromise = new Promise<void>((resolve, reject) => fakeWorker.close((error) => error ? reject(error) : resolve()));
    fakeWorker.closeAllConnections();
    fakeWorker.closeIdleConnections();
    await closePromise;
    if (previousWorkerUrl === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = previousWorkerUrl;
    if (previousWorkerToken === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = previousWorkerToken;
    globalThis.fetch = previousFetch;
    await prisma.client.update({ where: { id: businessClientId }, data: { features: {} } });
  });
  const address = fakeWorker.address() as AddressInfo;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = `http://127.0.0.1:${address.port}`;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = "worker-test-token";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      throw new Error("web_session inbox text must not call Meta Graph");
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  await prisma.client.update({
    where: { id: businessClientId },
    data: { features: { whatsappWebSession: true } },
  });
  await prisma.channelAccount.create({
    data: {
      clientId: businessClientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      displayName: "Lab outbound",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: false,
      status: "connected",
      tokenStatus: "configured",
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "CONNECTED",
          lastConnectedAt: new Date("2026-08-11T12:00:00.000Z").toISOString(),
          lastDisconnectedAt: null,
          lastErrorCode: null,
          lastErrorAt: null,
          reconnectCount: 0,
        },
      },
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: legacyCanonicalWaId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      windowIsOpen: false,
      windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
      lastInboundAt: new Date("2026-08-11T12:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: legacyCanonicalWaId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      windowIsOpen: false,
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-08-11T12:00:00.000Z"),
    },
  });
  const quotedInbound = await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      waId,
      waIdCanonical: legacyCanonicalWaId,
      messageId: `web:${channelAccountId}:quoted-inbound-1`,
      externalMessageId: "quoted-inbound-1",
      type: "IMAGE",
      bodyText: "Imagem recebida",
      allowlistHit: true,
      rawPayload: {
        provider: "web_session",
        channel: "whatsapp",
        channelAccountId,
        externalMessageId: "quoted-inbound-1",
        media: {
          mediaId: "web-session:quoted-image",
          storageProvider: "local_web_session",
          storageRef: "quoted/image.jpg",
          mimeType: "image/jpeg",
          caption: "Imagem recebida",
        },
      },
    },
  });

  const detail = await request<{ ok: true; provider: string; channelOutboundEnabled: boolean }>(
    "GET",
    `/app/conversation/${waId}`,
    businessAdmin
  );
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.provider, "web_session");
  assert.equal(detail.body.channelOutboundEnabled, true);

  const blockedTemplate = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: "template-web-session-blocked",
  });
  assert.equal(blockedTemplate.status, 409);
  assert.equal(getErrorCode(blockedTemplate.body), "unsupported_transport");

  const response = await request<{
    ok: true;
    message: { messageId: string; status: string; metaMessageId: string | null; bodyText: string | null };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Mensagem controlada web session.",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.message.status, "SENT");
  assert.equal(response.body.message.metaMessageId, null);
  assert.equal(workerTextRequests.length, 1);
  assert.equal(workerTextRequests[0]?.tenantKey, `${prefix}-business`);
  assert.equal(workerTextRequests[0]?.channelAccountId, channelAccountId);
  assert.equal(workerTextRequests[0]?.recipientWaId, waId);
  assert.notEqual(workerTextRequests[0]?.recipientWaId, legacyCanonicalWaId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      waId,
      provider: "web_session",
      externalMessageId: "baileys-test-message-id-1",
    },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(outbound.channel, "whatsapp");
  assert.equal(outbound.channelAccountId, channelAccountId);
  assert.equal(outbound.waIdCanonical, legacyCanonicalWaId);
  assert.equal(outbound.metaMessageId, null);
  assert.equal(outbound.status, "SENT");
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "inbox_text");
  assert.equal((outbound.rawPayload as Record<string, unknown>).provider, "web_session");
  assert.equal((outbound.rawPayload as Record<string, unknown>).metaUsage, undefined);
  assert.equal(JSON.stringify(outbound.rawPayload).includes(waId), false);

  const outboundConversation = await prisma.conversation.findFirstOrThrow({
    where: { clientId: businessClientId, waId, provider: "web_session" },
    select: { lastOutboundAt: true, channelAccountId: true },
  });
  assert.equal(outboundConversation.channelAccountId, channelAccountId);
  assert.ok(outboundConversation.lastOutboundAt);
  assert.ok(outboundConversation.lastOutboundAt.getTime() >= outbound.createdAt.getTime() - 5000);

  const outboundRuntime = await prisma.conversationRuntimeState.findFirstOrThrow({
    where: { clientId: businessClientId, waId, provider: "web_session" },
    select: { lastOutboundAt: true, lastOutboundMessageId: true, channelAccountId: true },
  });
  assert.equal(outboundRuntime.channelAccountId, channelAccountId);
  assert.equal(outboundRuntime.lastOutboundMessageId, response.body.message.messageId);
  assert.ok(outboundRuntime.lastOutboundAt);
  assert.ok(outboundRuntime.lastOutboundAt.getTime() >= outbound.createdAt.getTime() - 5000);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "inbox.web_session.text.sent" },
    orderBy: { createdAt: "desc" },
  });
  const payload = event.payloadJson as Record<string, unknown>;
  assert.equal(payload.provider, "web_session");
  assert.equal(payload.waIdLast4, waId.slice(-4));
  assert.equal(JSON.stringify(payload).includes(waId), false);

  const replyResponse = await request<{
    ok: true;
    message: {
      messageId: string;
      status: string;
      metaMessageId: string | null;
      replyTo: { kind: string; id: string; previewType: string };
    };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Resposta contextual web session.",
    replyTo: { kind: "inbound", id: quotedInbound.id },
  });
  assert.equal(replyResponse.status, 200, JSON.stringify(replyResponse.body));
  assert.equal(replyResponse.body.message.status, "SENT");
  assert.equal(replyResponse.body.message.metaMessageId, null);
  assert.deepEqual(replyResponse.body.message.replyTo, {
    kind: "inbound",
    id: quotedInbound.id,
    previewType: "IMAGE",
    mode: "reply",
  });
  assert.equal(workerTextRequests.length, 2);
  assert.deepEqual(workerTextRequests[1]?.replyTo, {
    externalMessageId: "quoted-inbound-1",
    remoteJid: `${waId}@s.whatsapp.net`,
    fromMe: false,
    messageType: "IMAGE",
    bodyText: "Imagem recebida",
    fileName: null,
    mimeType: "image/jpeg",
  });
  const replyOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      waId,
      messageId: replyResponse.body.message.messageId,
    },
  });
  const replyPayload = (replyOutbound.rawPayload as Record<string, unknown>).contextualReply as Record<string, unknown>;
  assert.equal(replyPayload.replyToKind, "inbound");
  assert.equal(replyPayload.replyToInternalMessageId, quotedInbound.id);
  assert.equal(replyPayload.replyToProvider, "web_session");
  assert.equal(replyPayload.replyToProviderMessagePresent, true);
  assert.equal(replyPayload.replyToMetaMessagePresent, false);
  assert.equal(JSON.stringify(replyPayload).includes("quoted-inbound-1"), false);
  assert.equal(JSON.stringify(replyPayload).includes(waId), false);

  const protocolWaId = "5584990008843";
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: businessClientId },
    update: {
      config: {
        protocolNotification: {
          enabled: true,
          trigger: "first_human_handoff",
          includeProtocol: true,
          messageTemplate: "Atendimento registrado. Protocolo: {{protocol}}",
        },
      },
      schemaVersion: 1,
    },
    create: {
      clientId: businessClientId,
      config: {
        protocolNotification: {
          enabled: true,
          trigger: "first_human_handoff",
          includeProtocol: true,
          messageTemplate: "Atendimento registrado. Protocolo: {{protocol}}",
        },
      },
      schemaVersion: 1,
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: protocolWaId,
      waIdCanonical: protocolWaId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      windowIsOpen: false,
      lastInboundAt: new Date("2026-08-11T12:10:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: protocolWaId,
      waIdCanonical: protocolWaId,
      conversationKey: `${prefix}-business:${protocolWaId}`,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      windowIsOpen: false,
      mode: "HUMAN",
      status: "WAITING",
      lastInboundAt: new Date("2026-08-11T12:10:00.000Z"),
    },
  });
  const claimResponse = await request<{ ok: true; protocol: string | null; assignedUserId: string | null }>(
    "POST",
    `/app/conversation/${protocolWaId}/claim`,
    businessAdmin,
    {}
  );
  assert.equal(claimResponse.status, 200, JSON.stringify(claimResponse.body));
  assert.match(claimResponse.body.protocol ?? "", /^CVT-/);
  assert.equal(claimResponse.body.assignedUserId, businessAdmin.id);
  assert.equal(workerTextRequests.length, 3);
  assert.equal(workerTextRequests[2]?.recipientWaId, protocolWaId);
  assert.equal(
    typeof workerTextRequests[2]?.text === "string" && workerTextRequests[2].text.includes(claimResponse.body.protocol ?? ""),
    true
  );
  const protocolOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      waId: protocolWaId,
      provider: "web_session",
      externalMessageId: "baileys-test-message-id-3",
    },
  });
  assert.equal((protocolOutbound.rawPayload as Record<string, unknown>).source, "protocol_notice");

  const legacyMetaWaId = "5511940008844";
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: businessClientId },
    update: {
      config: { whatsappPrimaryTransport: "web_session" },
      schemaVersion: 1,
    },
    create: {
      clientId: businessClientId,
      config: { whatsappPrimaryTransport: "web_session" },
      schemaVersion: 1,
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: legacyMetaWaId,
      waIdCanonical: legacyMetaWaId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: legacyMetaWaId,
      waIdCanonical: legacyMetaWaId,
      conversationKey: `${prefix}-business:${legacyMetaWaId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await seedHybridRuntimeState({
    waId: legacyMetaWaId,
    waIdCanonical: legacyMetaWaId,
    firstSeenAt: "2026-01-01T08:00:00.000Z",
    lastInboundAt: "2026-01-01T08:00:00.000Z",
    window: { isOpen: false, expiresAt: "2026-01-01T10:00:00.000Z" },
    mode: "HUMAN",
    status: "IN_PROGRESS",
    assignedUserId: businessAdmin.id,
    assignedTo: businessAdmin.name,
  });
  const primaryTransportResponse = await request<{
    ok: true;
    message: { status: string; metaMessageId: string | null };
  }>("POST", `/app/conversation/${legacyMetaWaId}/send`, businessAdmin, {
    text: "Mensagem web session em conversa Meta fechada.",
  });
  assert.equal(primaryTransportResponse.status, 200, JSON.stringify(primaryTransportResponse.body));
  assert.equal(primaryTransportResponse.body.message.status, "SENT");
  assert.equal(primaryTransportResponse.body.message.metaMessageId, null);
  assert.equal(workerTextRequests.length, 4);
  assert.equal(workerTextRequests[3]?.recipientWaId, legacyMetaWaId);

  const webSessionCanned = await request<{ ok: true; item: { id: string } }>(
    "POST",
    "/app/canned-replies",
    businessAdmin,
    {
      title: "Resposta Web Session",
      body: "Mensagem pronta por Web Session em conversa Meta fechada.",
    }
  );
  assert.equal(webSessionCanned.status, 201, JSON.stringify(webSessionCanned.body));
  const cannedPrimaryTransportResponse = await request<{
    ok: true;
    message: { status: string; metaMessageId: string | null };
  }>("POST", `/app/conversation/${legacyMetaWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: webSessionCanned.body.item.id,
  });
  assert.equal(cannedPrimaryTransportResponse.status, 200, JSON.stringify(cannedPrimaryTransportResponse.body));
  assert.equal(cannedPrimaryTransportResponse.body.message.status, "SENT");
  assert.equal(cannedPrimaryTransportResponse.body.message.metaMessageId, null);
  assert.equal(workerTextRequests.length, 5);
  assert.equal(workerTextRequests[4]?.recipientWaId, legacyMetaWaId);

  const imagePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2t0XQAAAABJRU5ErkJggg==",
    "base64"
  );
  const mediaForm = new FormData();
  mediaForm.set("caption", "Imagem via Web Session em conversa Meta fechada.");
  mediaForm.set("file", new Blob([imagePng], { type: "image/png" }), "web-session-hybrid.png");
  const mediaPrimaryTransportResponse = await requestMultipart<{
    ok: true;
    message: { status: string; metaMessageId: string | null; media: { kind: string; mimeType: string; fileName: string } };
  }>(`/app/conversation/${legacyMetaWaId}/send-media`, businessAdmin, mediaForm);
  assert.equal(mediaPrimaryTransportResponse.status, 200, JSON.stringify(mediaPrimaryTransportResponse.body));
  assert.equal(mediaPrimaryTransportResponse.body.message.status, "SENT");
  assert.equal(mediaPrimaryTransportResponse.body.message.metaMessageId, null);
  assert.equal(mediaPrimaryTransportResponse.body.message.media.kind, "image");
  assert.equal(workerMediaRequests.length, 1);
  assert.equal(workerMediaRequests[0]?.recipientWaId, legacyMetaWaId);
  assert.equal(workerMediaRequests[0]?.mediaKind, "image");
  const mediaOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, provider: "web_session", type: "IMAGE" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(mediaOutbound.waIdCanonical, legacyMetaWaId);
  assert.equal(mediaOutbound.provider, "web_session");
  assert.equal(mediaOutbound.type, "IMAGE");
  assert.equal(mediaOutbound.externalMessageId, "baileys-test-message-id-6");
  assert.equal(mediaOutbound.metaMessageId, null);
  assert.equal((mediaOutbound.rawPayload as Record<string, unknown>).provider, "web_session");
  assert.equal((protocolOutbound.rawPayload as Record<string, unknown>).agentSignatureApplied, false);
  const protocolEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "conversation.protocol.notice.sent" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(JSON.stringify(protocolEvent.payloadJson).includes(protocolWaId), false);
});

test("web session inbound uses shared chatbot flow and queue handoff", async (t) => {
  const previousWorkerUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
  const previousWorkerToken = process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
  const previousFetch = globalThis.fetch;
  const waId = "5511955557784";
  const channelAccountId = "lab-flow-account";
  const workerRequests: Array<Record<string, unknown>> = [];
  const fakeWorker = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/web-session/send-text") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    assert.equal(req.headers.authorization, "Bearer worker-flow-token");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      workerRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, externalMessageId: `flow-worker-message-${workerRequests.length}` }));
    });
  });
  await new Promise<void>((resolve) => fakeWorker.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => fakeWorker.close((error) => error ? reject(error) : resolve()));
    if (previousWorkerUrl === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = previousWorkerUrl;
    if (previousWorkerToken === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = previousWorkerToken;
    globalThis.fetch = previousFetch;
    await prisma.client.update({ where: { id: businessClientId }, data: { features: {} } });
  });
  const address = fakeWorker.address() as AddressInfo;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = `http://127.0.0.1:${address.port}`;
  process.env.WHATSAPP_WEB_WORKER_CONTROL_TOKEN = "worker-flow-token";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      throw new Error("web_session chatbot must not call Meta Graph");
    }
    return previousFetch(input, init);
  }) as typeof fetch;

  await prisma.client.update({
    where: { id: businessClientId },
    data: { features: { whatsappWebSession: true } },
  });
  await prisma.channelAccount.create({
    data: {
      clientId: businessClientId,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      displayName: "Lab flow",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: false,
      status: "connected",
      tokenStatus: "configured",
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: "CONNECTED",
          lastConnectedAt: new Date("2026-08-11T12:00:00.000Z").toISOString(),
        },
      },
    },
  });
  await prisma.chatbotFlow.create({
    data: {
      clientId: businessClientId,
      name: "Web Session shared flow",
      isActive: true,
      entryPoint: true,
      definition: {
        start: "menu",
        nodes: {
          menu: {
            type: "menu",
            text: "Como podemos ajudar?",
            options: [
              { label: "Informacoes gerais", next: "info" },
              { label: "Falar com atendente", next: "human", tags: ["handoff"] },
            ],
          },
          info: { type: "text", text: "Informacoes gerais do atendimento." },
          human: {
            type: "handoff",
            text: "Vou encaminhar voce para atendimento humano.",
            handoffSummary: "Cliente solicitou atendimento humano pelo menu.",
          },
        },
      },
    },
  });
  const { ingestWebSessionInboundMessage } = await import("../web-session/webSessionInbound.js");

  const waitingWaId = "5511955557799";
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: waitingWaId,
      waIdCanonical: waitingWaId,
      conversationKey: `${prefix}-business:${waitingWaId}`,
      channel: "whatsapp",
      provider: "web_session",
      channelAccountId,
      firstSeenAt: new Date("2026-08-12T11:59:00.000Z"),
      windowIsOpen: true,
      lastInboundAt: new Date("2026-08-12T11:59:00.000Z"),
      mode: "HUMAN",
      status: "WAITING",
      handoffStatus: "NONE",
    },
  });
  await ingestWebSessionInboundMessage({
    prisma,
    message: {
      provider: "web_session",
      channel: "whatsapp",
      clientId: businessClientId,
      tenantKey: `${prefix}-business`,
      channelAccountDbId: channelAccountId,
      channelAccountId,
      externalMessageId: "flow-inbound-existing-waiting",
      sender: waitingWaId,
      senderCanonical: waitingWaId,
      senderJid: `${waitingWaId}@s.whatsapp.net`,
      timestamp: new Date("2026-08-12T12:00:00.000Z"),
      type: MessageType.TEXT,
      text: "oi",
      rawPayload: { provider: "web_session", type: "text" },
    },
  });
  assert.equal(workerRequests.length, 1);
  assert.match(String(workerRequests[0]?.text ?? ""), /Como podemos ajudar/);
  const waitingRuntime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId: waitingWaId } },
  });
  assert.equal(waitingRuntime.mode, "BOT");
  assert.equal(waitingRuntime.status, null);
  assert.equal(waitingRuntime.chatbotActive, true);

  const first = await ingestWebSessionInboundMessage({
    prisma,
    message: {
      provider: "web_session",
      channel: "whatsapp",
      clientId: businessClientId,
      tenantKey: `${prefix}-business`,
      channelAccountDbId: channelAccountId,
      channelAccountId,
      externalMessageId: "flow-inbound-1",
      sender: waId,
      senderCanonical: waId,
      senderJid: `${waId}@s.whatsapp.net`,
      timestamp: new Date("2026-08-12T12:00:00.000Z"),
      type: MessageType.TEXT,
      text: "oi",
      rawPayload: { provider: "web_session", type: "text" },
    },
  });
  assert.equal(first.ok, true);
  assert.equal(workerRequests.length, 2);
  assert.equal(workerRequests[1]?.recipientWaId, waId);
  assert.match(String(workerRequests[1]?.text ?? ""), /Como podemos ajudar/);
  const botRuntime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(botRuntime.provider, "web_session");
  assert.equal(botRuntime.mode, "BOT");
  assert.equal(botRuntime.chatbotActive, true);
  assert.equal(botRuntime.status, null);

  await ingestWebSessionInboundMessage({
    prisma,
    message: {
      provider: "web_session",
      channel: "whatsapp",
      clientId: businessClientId,
      tenantKey: `${prefix}-business`,
      channelAccountDbId: channelAccountId,
      channelAccountId,
      externalMessageId: "flow-inbound-2",
      sender: waId,
      senderCanonical: waId,
      senderJid: `${waId}@s.whatsapp.net`,
      timestamp: new Date("2026-08-12T12:00:10.000Z"),
      type: MessageType.TEXT,
      text: "2",
      rawPayload: { provider: "web_session", type: "text" },
    },
  });
  assert.equal(workerRequests.length, 4);
  assert.match(String(workerRequests[2]?.text ?? ""), /atendimento humano/);
  assert.match(String(workerRequests[3]?.text ?? ""), /protocolo de atendimento/);
  const handoffRuntime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(handoffRuntime.mode, "HUMAN");
  assert.equal(handoffRuntime.status, "WAITING");
  assert.equal(handoffRuntime.handoffStatus, "ACTIVE");
  assert.equal(handoffRuntime.chatbotActive, false);
  assert.ok(handoffRuntime.departmentId);

  const botOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, provider: "web_session", externalMessageId: "flow-worker-message-2" },
  });
  assert.equal((botOutbound.rawPayload as Record<string, unknown>).source, "bot");
  assert.equal(JSON.stringify(botOutbound.rawPayload).includes(waId), false);
});

test("admin tenants summary includes db-only clients without activity", async () => {
  const dbOnlyClientKey = `${prefix}-db-only-summary`;
  await prisma.client.create({
    data: {
      clientKey: dbOnlyClientKey,
      name: "DB Only Summary Tenant",
      profile: "business",
      features: {},
    },
  });

  const response = await requestSuperadmin<{
    ok: boolean;
    tenants: Array<{
      tenantId: string;
      clientKey: string;
      name: string;
      lastMessageAt: string | null;
      counts: {
        inbound: { received: number };
        outbound: { sent_text: number; sent_template: number; failed: number };
      };
    }>;
  }>("GET", "/admin/tenants/summary?range=24h");

  assert.equal(response.status, 200);
  const item = response.body.tenants.find((tenant) => tenant.clientKey === dbOnlyClientKey);
  assert.ok(item);
  assert.equal(item.tenantId, dbOnlyClientKey);
  assert.equal(item.name, "DB Only Summary Tenant");
  assert.equal(item.lastMessageAt, null);
  assert.equal(item.counts.inbound.received, 0);
  assert.equal(item.counts.outbound.sent_text, 0);
  assert.equal(item.counts.outbound.sent_template, 0);
  assert.equal(item.counts.outbound.failed, 0);
});

test("admin tenant provisioning creates tenant without initial channel and remains idempotent", async () => {
  const tenantKey = `${prefix}-no-channel`;
  const contractNotes = [
    "Contrato: teste sem canal inicial",
    "Vigencia: inicio pendente de confirmacao",
    "Escopo: canais configurados posteriormente",
  ].join("\n");

  const first = await requestSuperadmin<{
    ok: boolean;
    tenantId: string;
    client: { id: string; clientKey: string; status: string; profile?: string };
    tenant: {
      id: string;
      name: string;
      metaPhoneNumberId: string;
      companyLegalName?: string;
      companyTaxId?: string;
      contractNotes?: string;
      channelAccounts?: unknown[];
    };
    action: string;
    initialChannel: string;
  }>("POST", "/admin/tenants", {
    clientKey: tenantKey,
    name: "Tenant Sem Canal",
    profile: "government",
    status: "ONBOARDING",
    maxActiveAppUsers: 14,
    companyLegalName: "Orgao Publico de Teste",
    companyTaxId: "00.000.000/0001-00",
    contractNotes,
  });

  assert.equal(first.status, 201);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.action, "created");
  assert.equal(first.body.initialChannel, "none");
  assert.equal(first.body.tenantId, tenantKey);
  assert.equal(first.body.client.clientKey, tenantKey);
  assert.equal(first.body.client.status, "INACTIVE");
  assert.equal(first.body.client.profile, "government");
  assert.equal(first.body.tenant.metaPhoneNumberId, "");
  assert.equal(first.body.tenant.companyLegalName, "Orgao Publico de Teste");
  assert.equal(first.body.tenant.companyTaxId, "00.000.000/0001-00");
  assert.equal(first.body.tenant.contractNotes, contractNotes);
  assert.deepEqual(first.body.tenant.channelAccounts, []);

  const client = await prisma.client.findUniqueOrThrow({
    where: { clientKey: tenantKey },
    select: {
      id: true,
      status: true,
      profile: true,
      _count: {
        select: {
          users: true,
          departments: true,
          queues: true,
          channelAccounts: true,
          phoneNumbers: true,
        },
      },
    },
  });
  assert.equal(client.status, "INACTIVE");
  assert.equal(client.profile, "government");
  assert.deepEqual(client._count, {
    users: 0,
    departments: 0,
    queues: 0,
    channelAccounts: 0,
    phoneNumbers: 0,
  });
  assert.equal(await prisma.tenantMetaConfig.count({ where: { clientId: client.id } }), 0);
  const operationalConfig = await prisma.tenantOperationalConfig.findUnique({ where: { clientId: client.id } });
  assert.ok(operationalConfig);
  assert.deepEqual(
    (operationalConfig.config as { runtimeLimits?: { maxActiveAppUsers?: number } }).runtimeLimits,
    { maxActiveAppUsers: 14 }
  );

  const detail = await requestSuperadmin<{
    tenant: { id: string; metaPhoneNumberId: string; channelAccounts?: unknown[] };
  }>("GET", `/admin/tenants/${encodeURIComponent(tenantKey)}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tenant.id, tenantKey);
  assert.equal(detail.body.tenant.metaPhoneNumberId, "");
  assert.deepEqual(detail.body.tenant.channelAccounts, []);

  const channels = await requestSuperadmin<{ channelAccounts: unknown[] }>(
    "GET",
    `/admin/tenants/${encodeURIComponent(tenantKey)}/channel-accounts`
  );
  assert.equal(channels.status, 200);
  assert.deepEqual(channels.body.channelAccounts, []);

  const second = await requestSuperadmin<{ action: string; initialChannel: string }>(
    "POST",
    "/admin/tenants",
    {
      clientKey: tenantKey,
      name: "Tenant Sem Canal",
      profile: "government",
      status: "ONBOARDING",
      maxActiveAppUsers: 14,
      companyLegalName: "Orgao Publico de Teste",
      companyTaxId: "00.000.000/0001-00",
      contractNotes,
    }
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.action, "existing");
  assert.equal(second.body.initialChannel, "none");

  assert.equal(await prisma.client.count({ where: { clientKey: tenantKey } }), 1);
  assert.equal(await prisma.channelAccount.count({ where: { clientId: client.id } }), 0);
  assert.equal(await prisma.waPhoneNumber.count({ where: { clientId: client.id } }), 0);
});

test("app user limit can resolve maxActiveAppUsers from tenant operational config", async () => {
  const tenantKey = `${prefix}-runtime-limit`;
  const client = await prisma.client.create({
    data: {
      clientKey: tenantKey,
      name: "Runtime Limit Tenant",
      status: "ACTIVE",
      profile: "business",
    },
    select: { id: true },
  });
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId: client.id,
      config: {
        runtimeLimits: { maxActiveAppUsers: 2 },
      },
    },
  });
  const department = await prisma.department.create({
    data: {
      clientId: client.id,
      name: "Atendimento",
      slug: "atendimento",
    },
    select: { id: true },
  });
  const admin = await createUser({ clientId: client.id, role: "ADMIN", suffix: "runtime-limit-admin" });

  const allowed = await request<{ ok: boolean; user: TestUser }>("POST", "/app/users", admin, {
    name: "Runtime Limit Agent",
    email: `${prefix}-runtime-limit-agent@example.test`,
    role: "AGENT",
    departmentId: department.id,
    isActive: true,
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.ok, true);

  const blocked = await request<ErrorPayload>("POST", "/app/users", admin, {
    name: "Runtime Limit Extra Agent",
    email: `${prefix}-runtime-limit-extra@example.test`,
    role: "AGENT",
    departmentId: department.id,
    isActive: true,
  });
  assert.equal(blocked.status, 409);
  assert.equal(getErrorCode(blocked.body), "user_limit_exceeded");
});

test("app user management enforces target role RBAC and audits role/status changes", async () => {
  const tenantKey = `${prefix}-users-rbac`;
  const client = await prisma.client.create({
    data: {
      clientKey: tenantKey,
      name: "Users RBAC Tenant",
      status: "ACTIVE",
      profile: "business",
    },
    select: { id: true },
  });
  await prisma.tenantOperationalConfig.create({
    data: {
      clientId: client.id,
      config: {
        runtimeLimits: { maxActiveAppUsers: 50 },
      },
    },
  });
  const departmentA = await prisma.department.create({
    data: { clientId: client.id, name: "Setor A", slug: "setor-a" },
    select: { id: true },
  });
  const departmentB = await prisma.department.create({
    data: { clientId: client.id, name: "Setor B", slug: "setor-b" },
    select: { id: true },
  });
  const departmentC = await prisma.department.create({
    data: { clientId: client.id, name: "Setor C", slug: "setor-c" },
    select: { id: true },
  });

  const admin = await createUser({ clientId: client.id, role: "ADMIN", suffix: "users-rbac-admin" });
  const secondAdmin = await createUser({ clientId: client.id, role: "ADMIN", suffix: "users-rbac-admin-2" });
  const supervisor = await createUser({ clientId: client.id, role: "SUPERVISOR", suffix: "users-rbac-supervisor" });
  const editableAgent = await createUser({ clientId: client.id, role: "AGENT", suffix: "users-rbac-agent-edit" });
  const promotableAgent = await createUser({ clientId: client.id, role: "AGENT", suffix: "users-rbac-agent-promote" });
  const inactiveAgent = await createUser({ clientId: client.id, role: "AGENT", suffix: "users-rbac-agent-inactive" });
  const targetSupervisor = await createUser({ clientId: client.id, role: "SUPERVISOR", suffix: "users-rbac-supervisor-target" });

  await assignUserDepartments({ clientId: client.id, userId: supervisor.id, departmentIds: [departmentA.id], primaryDepartmentId: departmentA.id });
  await assignUserDepartments({ clientId: client.id, userId: targetSupervisor.id, departmentIds: [departmentC.id], primaryDepartmentId: departmentC.id });
  await assignUserDepartments({ clientId: client.id, userId: editableAgent.id, departmentIds: [departmentA.id], primaryDepartmentId: departmentB.id });
  await assignUserDepartments({ clientId: client.id, userId: promotableAgent.id, departmentIds: [departmentB.id], primaryDepartmentId: departmentB.id });
  await assignUserDepartments({ clientId: client.id, userId: inactiveAgent.id, departmentIds: [departmentA.id], primaryDepartmentId: departmentA.id });
  await assignUserDepartments({ clientId: client.id, userId: secondAdmin.id, departmentIds: [departmentA.id], primaryDepartmentId: departmentA.id });

  const supervisorList = await request<{ items: Array<{ id: string; role: string }> }>("GET", "/app/users", supervisor);
  assert.equal(supervisorList.status, 200);
  assert.ok(supervisorList.body.items.some((item) => item.id === editableAgent.id));
  assert.ok(supervisorList.body.items.some((item) => item.id === promotableAgent.id));
  assert.ok(supervisorList.body.items.some((item) => item.id === targetSupervisor.id));
  assert.ok(!supervisorList.body.items.some((item) => item.role === "ADMIN"));

  const editAgent = await request<{ user: { id: string; name: string } }>("PUT", `/app/users/${editableAgent.id}`, supervisor, {
    name: "Editable Agent Updated",
    email: editableAgent.email,
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(editAgent.status, 200);
  assert.equal(editAgent.body.user.name, "Editable Agent Updated");

  const promoteAgent = await request<{ user: { id: string; role: string } }>("PUT", `/app/users/${promotableAgent.id}`, supervisor, {
    name: promotableAgent.name,
    email: promotableAgent.email,
    role: "SUPERVISOR",
    departmentIds: [departmentB.id],
    primaryDepartmentId: departmentB.id,
    isActive: true,
  });
  assert.equal(promoteAgent.status, 200);
  assert.equal(promoteAgent.body.user.role, "SUPERVISOR");

  const roleEvent = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "user.role.changed" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(roleEvent);
  assert.equal((roleEvent.payloadJson as Record<string, unknown>).newRole, "SUPERVISOR");

  const editPromotedSupervisor = await request<ErrorPayload>("PUT", `/app/users/${promotableAgent.id}`, supervisor, {
    name: promotableAgent.name,
    email: promotableAgent.email,
    role: "SUPERVISOR",
    departmentIds: [departmentB.id],
    primaryDepartmentId: departmentB.id,
    isActive: true,
  });
  assert.equal(editPromotedSupervisor.status, 403);

  const promoteAdmin = await request<ErrorPayload>("PUT", `/app/users/${editableAgent.id}`, supervisor, {
    name: "Editable Agent Updated",
    email: editableAgent.email,
    role: "ADMIN",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(promoteAdmin.status, 403);

  const deactivateAgent = await request<{ user: { isActive: boolean } }>("PUT", `/app/users/${inactiveAgent.id}`, supervisor, {
    name: inactiveAgent.name,
    email: inactiveAgent.email,
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: false,
  });
  assert.equal(deactivateAgent.status, 200);
  assert.equal(deactivateAgent.body.user.isActive, false);

  const statusEvent = await prisma.event.findFirst({
    where: { clientId: client.id, eventName: "user.status.changed" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(statusEvent);
  assert.equal((statusEvent.payloadJson as Record<string, unknown>).newStatus, "INACTIVE");

  const editSupervisor = await request<ErrorPayload>("PUT", `/app/users/${targetSupervisor.id}`, supervisor, {
    name: targetSupervisor.name,
    email: targetSupervisor.email,
    role: "SUPERVISOR",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(editSupervisor.status, 403);

  const demoteSupervisor = await request<ErrorPayload>("PUT", `/app/users/${targetSupervisor.id}`, supervisor, {
    name: targetSupervisor.name,
    email: targetSupervisor.email,
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(demoteSupervisor.status, 403);

  const editAdmin = await request<ErrorPayload>("PUT", `/app/users/${secondAdmin.id}`, supervisor, {
    name: secondAdmin.name,
    email: secondAdmin.email,
    role: "ADMIN",
    isActive: true,
  });
  assert.equal(editAdmin.status, 403);

  const changeOwnRole = await request<ErrorPayload>("PUT", `/app/users/${supervisor.id}`, supervisor, {
    name: supervisor.name,
    email: supervisor.email,
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(changeOwnRole.status, 403);

  const supervisorCreateAgent = await request<{ user: { role: string } }>("POST", "/app/users", supervisor, {
    name: "Supervisor Created Agent",
    email: `${prefix}-supervisor-created-agent@example.test`,
    password: "secret123",
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(supervisorCreateAgent.status, 200);
  assert.equal(supervisorCreateAgent.body.user.role, "AGENT");

  const supervisorCreateSupervisor = await request<ErrorPayload>("POST", "/app/users", supervisor, {
    name: "Supervisor Created Supervisor",
    email: `${prefix}-supervisor-created-supervisor@example.test`,
    password: "secret123",
    role: "SUPERVISOR",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(supervisorCreateSupervisor.status, 403);

  const adminPromote = await request<{ user: { role: string } }>("PUT", `/app/users/${editableAgent.id}`, admin, {
    name: "Editable Agent Admin Promoted",
    email: editableAgent.email,
    role: "SUPERVISOR",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(adminPromote.status, 200);
  assert.equal(adminPromote.body.user.role, "SUPERVISOR");

  const adminDemote = await request<{ user: { role: string } }>("PUT", `/app/users/${editableAgent.id}`, admin, {
    name: "Editable Agent Admin Demoted",
    email: editableAgent.email,
    role: "AGENT",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(adminDemote.status, 200);
  assert.equal(adminDemote.body.user.role, "AGENT");

  const adminEditAdmin = await request<{ user: { id: string; name: string } }>("PUT", `/app/users/${secondAdmin.id}`, admin, {
    name: "Second Admin Updated",
    email: secondAdmin.email,
    role: "ADMIN",
    isActive: true,
  });
  assert.equal(adminEditAdmin.status, 200);
  assert.equal(adminEditAdmin.body.user.name, "Second Admin Updated");

  const adminDowngradeSecondAdmin = await request<{ user: { id: string; role: string } }>("PUT", `/app/users/${secondAdmin.id}`, admin, {
    name: "Second Admin Updated",
    email: secondAdmin.email,
    role: "SUPERVISOR",
    departmentIds: [departmentA.id],
    primaryDepartmentId: departmentA.id,
    isActive: true,
  });
  assert.equal(adminDowngradeSecondAdmin.status, 200);
  assert.equal(adminDowngradeSecondAdmin.body.user.role, "SUPERVISOR");

  const singleAdminClient = await prisma.client.create({
    data: {
      clientKey: `${prefix}-single-admin`,
      name: "Single Admin Tenant",
      status: "ACTIVE",
      profile: "business",
    },
    select: { id: true },
  });
  const singleAdminDepartment = await prisma.department.create({
    data: { clientId: singleAdminClient.id, name: "Setor unico", slug: "setor-unico" },
    select: { id: true },
  });
  const singleAdmin = await createUser({ clientId: singleAdminClient.id, role: "ADMIN", suffix: "single-admin" });
  const lastAdminDemotion = await request<ErrorPayload>("PUT", `/app/users/${singleAdmin.id}`, singleAdmin, {
    name: singleAdmin.name,
    email: singleAdmin.email,
    role: "SUPERVISOR",
    departmentIds: [singleAdminDepartment.id],
    primaryDepartmentId: singleAdminDepartment.id,
    isActive: true,
  });
  assert.equal(lastAdminDemotion.status, 409);
  assert.equal(getErrorCode(lastAdminDemotion.body), "last_admin_required");

  const lastAdminDeactivation = await request<ErrorPayload>("PUT", `/app/users/${singleAdmin.id}`, singleAdmin, {
    name: singleAdmin.name,
    email: singleAdmin.email,
    role: "ADMIN",
    isActive: false,
  });
  assert.equal(lastAdminDeactivation.status, 409);
  assert.equal(getErrorCode(lastAdminDeactivation.body), "last_admin_required");
});

test("app API keys and webhooks are admin only", async () => {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-admin-only-integrations`,
      name: "Admin Only Integrations",
      status: "ACTIVE",
      profile: "business",
      features: { webhooks: true },
    },
    select: { id: true },
  });
  const admin = await createUser({ clientId: client.id, role: "ADMIN", suffix: "admin-only-integrations-admin" });
  const supervisor = await createUser({ clientId: client.id, role: "SUPERVISOR", suffix: "admin-only-integrations-supervisor" });
  const agent = await createUser({ clientId: client.id, role: "AGENT", suffix: "admin-only-integrations-agent" });

  const apiKeysAdmin = await request<{ ok: boolean }>("GET", "/app/api-keys", admin);
  assert.equal(apiKeysAdmin.status, 200);
  assert.equal(apiKeysAdmin.body.ok, true);
  assert.equal((await request<ErrorPayload>("GET", "/app/api-keys", supervisor)).status, 403);
  assert.equal((await request<ErrorPayload>("GET", "/app/api-keys", agent)).status, 403);

  const createdKey = await request<{ ok: boolean; key: { id: string } }>("POST", "/app/api-keys", admin, {
    name: "Admin key",
    scopes: ["read"],
  });
  assert.equal(createdKey.status, 201);
  assert.equal(createdKey.body.ok, true);
  assert.equal((await request<ErrorPayload>("POST", "/app/api-keys", supervisor, { name: "Blocked", scopes: ["read"] })).status, 403);
  assert.equal((await request<ErrorPayload>("POST", "/app/api-keys", agent, { name: "Blocked", scopes: ["read"] })).status, 403);
  assert.equal((await request<{ ok: boolean }>("POST", `/app/api-keys/${createdKey.body.key.id}/revoke`, admin)).status, 200);
  assert.equal((await request<ErrorPayload>("POST", `/app/api-keys/${createdKey.body.key.id}/revoke`, supervisor)).status, 403);

  const webhooksAdmin = await request<{ ok: boolean }>("GET", "/app/webhooks", admin);
  assert.equal(webhooksAdmin.status, 200);
  assert.equal(webhooksAdmin.body.ok, true);
  assert.equal((await request<ErrorPayload>("GET", "/app/webhooks", supervisor)).status, 403);
  assert.equal((await request<ErrorPayload>("GET", "/app/webhooks", agent)).status, 403);

  const createdWebhook = await request<{ ok: boolean }>("POST", "/app/webhooks", admin, {
    name: "Admin webhook",
    url: "https://example.com/webhook",
  });
  assert.equal(createdWebhook.status, 201);
  assert.equal(createdWebhook.body.ok, true);
  assert.equal((await request<ErrorPayload>("POST", "/app/webhooks", supervisor, { name: "Blocked", url: "https://example.com/blocked" })).status, 403);
  assert.equal((await request<ErrorPayload>("POST", "/app/webhooks", agent, { name: "Blocked", url: "https://example.com/blocked" })).status, 403);
});

test("CRM contact history is hidden from AGENT but available to supervisor and admin", async () => {
  const client = await prisma.client.create({
    data: {
      clientKey: `${prefix}-crm-history-rbac`,
      name: "CRM History RBAC",
      status: "ACTIVE",
      profile: "business",
      features: { crm: true },
    },
    select: { id: true },
  });
  const admin = await createUser({ clientId: client.id, role: "ADMIN", suffix: "crm-history-admin" });
  const supervisor = await createUser({ clientId: client.id, role: "SUPERVISOR", suffix: "crm-history-supervisor" });
  const agent = await createUser({ clientId: client.id, role: "AGENT", suffix: "crm-history-agent" });
  const waId = `${prefix}-crm-history-waid`;
  const lead = await prisma.lead.create({
    data: {
      tenantId: client.id,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "web_session",
      name: "CRM History Contact",
      phone: "5581999990000",
    },
    select: { id: true },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "web_session",
    },
    select: { id: true },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: client.id,
      waId,
      waIdCanonical: waId,
      status: "WAITING",
      mode: "HUMAN",
      handoffStatus: "ACTIVE",
      answers: {},
    },
  });

  const agentList = await request<{ items: Array<{ leadId: string; conversationsCount: number; lastConversationId: string | null; hasConversation: boolean }> }>(
    "GET",
    "/app/crm/contacts?hasConversation=true",
    agent
  );
  assert.equal(agentList.status, 200);
  const agentItem = agentList.body.items.find((item) => item.leadId === lead.id);
  assert.ok(agentItem);
  assert.equal(agentItem.conversationsCount, 0);
  assert.equal(agentItem.lastConversationId, null);
  assert.equal(agentItem.hasConversation, false);

  const supervisorList = await request<{ items: Array<{ leadId: string; conversationsCount: number; lastConversationId: string | null; hasConversation: boolean }> }>(
    "GET",
    "/app/crm/contacts?hasConversation=true",
    supervisor
  );
  assert.equal(supervisorList.status, 200);
  const supervisorItem = supervisorList.body.items.find((item) => item.leadId === lead.id);
  assert.ok(supervisorItem);
  assert.equal(supervisorItem.conversationsCount, 1);
  assert.equal(supervisorItem.lastConversationId, conversation.id);
  assert.equal(supervisorItem.hasConversation, true);

  const agentDetail = await request<{ item: { conversationsCount: number; lastConversationId: string | null }; conversations: unknown[] }>(
    "GET",
    `/app/crm/contacts/${lead.id}`,
    agent
  );
  assert.equal(agentDetail.status, 200);
  assert.equal(agentDetail.body.item.conversationsCount, 0);
  assert.equal(agentDetail.body.item.lastConversationId, null);
  assert.deepEqual(agentDetail.body.conversations, []);

  const adminDetail = await request<{ item: { conversationsCount: number; lastConversationId: string | null }; conversations: unknown[] }>(
    "GET",
    `/app/crm/contacts/${lead.id}`,
    admin
  );
  assert.equal(adminDetail.status, 200);
  assert.equal(adminDetail.body.item.conversationsCount, 1);
  assert.equal(adminDetail.body.item.lastConversationId, conversation.id);
  assert.equal(adminDetail.body.conversations.length, 1);
});

test("admin tenant without channel can receive web session channel later", async () => {
  const tenantKey = `${prefix}-future-web-session`;
  await requestSuperadmin("POST", "/admin/tenants", {
    clientKey: tenantKey,
    name: "Future Web Session Tenant",
    profile: "government",
    status: "ONBOARDING",
  });
  const client = await prisma.client.findUniqueOrThrow({
    where: { clientKey: tenantKey },
    select: { id: true },
  });

  const response = await requestSuperadmin<{ channelAccounts: Array<{ provider: string; channel: string; channelAccountId: string }> }>(
    "PUT",
    `/admin/tenants/${encodeURIComponent(tenantKey)}/channel-accounts`,
    {
      channelAccounts: [
        {
          channel: "whatsapp",
          provider: "web_session",
          channelAccountId: "web-session-default",
          displayName: "WhatsApp por sessao",
          status: "pending",
          tokenStatus: "not_required",
          enabled: false,
        },
      ],
    }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.channelAccounts.length, 1);
  assert.equal(response.body.channelAccounts[0].channel, "whatsapp");
  assert.equal(response.body.channelAccounts[0].provider, "web_session");
  assert.equal(response.body.channelAccounts[0].channelAccountId, "web-session-default");
  assert.equal(await prisma.channelAccount.count({ where: { clientId: client.id } }), 1);
  assert.equal(await prisma.tenantMetaConfig.count({ where: { clientId: client.id } }), 0);
  assert.equal(await prisma.waPhoneNumber.count({ where: { clientId: client.id } }), 0);
});

test("admin channel removal clears operational Meta identity but preserves historical config", async () => {
  const tenantKey = `${prefix}-meta-teardown`;
  await requestSuperadmin("POST", "/admin/tenants", {
    clientKey: tenantKey,
    name: "Meta Teardown Tenant",
    profile: "business",
    status: "ACTIVE",
  });
  const client = await prisma.client.findUniqueOrThrow({
    where: { clientKey: tenantKey },
    select: { id: true },
  });
  await prisma.tenantMetaConfig.create({
    data: {
      clientId: client.id,
      businessToken: "meta-token-teardown",
      businessId: "meta-business-teardown",
      businessPortfolioId: "meta-portfolio-teardown",
      wabaId: "meta-waba-teardown",
      phoneNumberId: "meta-phone-teardown",
      rawPayload: { source: "unit_test", phoneNumber: { display_phone_number: "+55 84 9999-1001" } },
    },
  });
  await prisma.waPhoneNumber.create({
    data: {
      clientId: client.id,
      phoneNumberId: "meta-phone-teardown",
      display: "+55 84 9999-1001",
    },
  });
  await prisma.channelAccount.create({
    data: {
      clientId: client.id,
      channel: "whatsapp",
      provider: "meta",
      channelAccountId: "meta-phone-teardown",
      displayName: "Meta Cloud",
      enabled: true,
      runtimeEnabled: true,
      inboundPersistenceEnabled: true,
      outboundEnabled: true,
      automationEnabled: true,
      aiEnabled: false,
      handoffEnabled: true,
      status: "connected",
      tokenStatus: "configured",
    },
  });
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      config: { whatsappPrimaryTransport: "meta", supportChannel: { mode: "human" } },
    },
    update: {
      config: { whatsappPrimaryTransport: "meta", supportChannel: { mode: "human" } },
    },
  });

  const removal = await requestSuperadmin<{
    webSessionStatus?: {
      hybridIdentity?: { meta: { configured: boolean; canonicalNumber: string | null } };
      primaryTransport?: string | null;
    };
  }>("PUT", `/admin/tenants/${encodeURIComponent(tenantKey)}/channel-accounts`, {
    channelAccounts: [],
  });

  assert.equal(removal.status, 200);
  assert.equal(removal.body.webSessionStatus?.hybridIdentity?.meta.configured, false);
  assert.equal(removal.body.webSessionStatus?.hybridIdentity?.meta.canonicalNumber, null);
  assert.equal(removal.body.webSessionStatus?.primaryTransport ?? null, null);
  const metaConfig = await prisma.tenantMetaConfig.findUniqueOrThrow({
    where: { clientId: client.id },
    select: {
      businessToken: true,
      businessId: true,
      businessPortfolioId: true,
      wabaId: true,
      phoneNumberId: true,
      rawPayload: true,
    },
  });
  assert.equal(metaConfig.businessToken, null);
  assert.equal(metaConfig.businessId, null);
  assert.equal(metaConfig.businessPortfolioId, null);
  assert.equal(metaConfig.wabaId, null);
  assert.equal(metaConfig.phoneNumberId, null);
  assert.equal((metaConfig.rawPayload as { operationalStatus?: { state?: string } }).operationalStatus?.state, "removed");
  const config = await prisma.tenantOperationalConfig.findUniqueOrThrow({
    where: { clientId: client.id },
    select: { config: true },
  });
  assert.equal((config.config as { whatsappPrimaryTransport?: string }).whatsappPrimaryTransport, undefined);
  assert.deepEqual((config.config as { supportChannel?: unknown }).supportChannel, { mode: "human" });
  assert.equal(
    await prisma.event.count({
      where: { clientId: client.id, eventName: "whatsapp.meta.operational_identity_cleared" },
    }),
    1
  );
});

test("legacy admin client creation with phoneNumberId still works", async () => {
  const tenantKey = `${prefix}-legacy-meta-create`;
  const phoneNumberId = `${prefix}-legacy-meta-phone`;

  const response = await requestSuperadmin<{ clientKey: string; phoneNumbers?: Array<{ phoneNumberId: string }> }>(
    "POST",
    "/admin/clients",
    {
      clientKey: tenantKey,
      name: "Legacy Meta Tenant",
      phone_number_id: phoneNumberId,
      profile: "business",
    }
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.clientKey, tenantKey);
  assert.equal(response.body.phoneNumbers?.[0]?.phoneNumberId, phoneNumberId);
  const client = await prisma.client.findUniqueOrThrow({
    where: { clientKey: tenantKey },
    select: { id: true },
  });
  assert.equal(await prisma.waPhoneNumber.count({ where: { clientId: client.id } }), 1);
});

test("admin tenant detail opens db-only clients with a safe default tenant view", async () => {
  const dbOnlyClientKey = `${prefix}-db-only-detail`;
  await prisma.client.create({
    data: {
      clientKey: dbOnlyClientKey,
      name: "DB Only Detail Tenant",
      profile: "business",
      features: {},
    },
  });

  const response = await requestSuperadmin<{
    ok: boolean;
    tenantId: string;
    client: { clientKey: string; status: string; profile?: string } | null;
    tenant: {
      id: string;
      name: string;
      metaPhoneNumberId: string;
      allowlist: string[];
      handoffAttendantWaid: string;
      defaultLanguage: string;
      channelAccounts?: unknown[];
    };
  }>("GET", `/admin/tenants/${encodeURIComponent(dbOnlyClientKey)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.tenantId, dbOnlyClientKey);
  assert.equal(response.body.client?.clientKey, dbOnlyClientKey);
  assert.equal(response.body.tenant.id, dbOnlyClientKey);
  assert.equal(response.body.tenant.name, "DB Only Detail Tenant");
  assert.equal(response.body.tenant.metaPhoneNumberId, "");
  assert.deepEqual(response.body.tenant.allowlist, []);
  assert.equal(response.body.tenant.handoffAttendantWaid, "");
  assert.equal(response.body.tenant.defaultLanguage, "pt_BR");
  assert.deepEqual(response.body.tenant.channelAccounts, []);
});

test("admin onboarding manual bind supports db-only clients", async () => {
  const dbOnlyClientKey = `${prefix}-db-only-onboarding`;
  const client = await prisma.client.create({
    data: {
      clientKey: dbOnlyClientKey,
      name: "DB Only Onboarding Tenant",
      profile: "business",
      features: {},
    },
    select: { id: true },
  });

  const response = await requestSuperadmin<{
    success: boolean;
    phoneNumberId: string | null;
    phoneMappingAction?: string | null;
  }>(
    "POST",
    `/admin/tenants/${encodeURIComponent(dbOnlyClientKey)}/onboarding/manual-bind`,
    {
      phoneNumberId: `${prefix}-phone-db-only`,
      displayPhoneNumber: "55 84 9***-0000",
      wabaId: `${prefix}-waba-db-only`,
      businessId: `${prefix}-business-db-only`,
      businessPortfolioId: `${prefix}-portfolio-db-only`,
    }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.phoneNumberId, `${prefix}-phone-db-only`);
  assert.equal(response.body.phoneMappingAction, "created");

  const metaConfig = await prisma.tenantMetaConfig.findUnique({
    where: { clientId: client.id },
    select: {
      phoneNumberId: true,
      wabaId: true,
      businessId: true,
      businessPortfolioId: true,
    },
  });
  assert.equal(metaConfig?.phoneNumberId, `${prefix}-phone-db-only`);
  assert.equal(metaConfig?.wabaId, `${prefix}-waba-db-only`);
  assert.equal(metaConfig?.businessId, `${prefix}-business-db-only`);
  assert.equal(metaConfig?.businessPortfolioId, `${prefix}-portfolio-db-only`);

  const phoneNumber = await prisma.waPhoneNumber.findUnique({
    where: { phoneNumberId: `${prefix}-phone-db-only` },
    select: { clientId: true, display: true },
  });
  assert.equal(phoneNumber?.clientId, client.id);
  assert.equal(phoneNumber?.display, "55 84 9***-0000");

  const detail = await requestSuperadmin<{
    tenant: { metaPhoneNumberId: string; displayPhoneNumber?: string };
  }>("GET", `/admin/tenants/${encodeURIComponent(dbOnlyClientKey)}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tenant.metaPhoneNumberId, `${prefix}-phone-db-only`);
  assert.equal(detail.body.tenant.displayPhoneNumber, "55 84 9***-0000");
});

test("admin onboarding manual bind rejects phone conflicts without partial meta config", async () => {
  const ownerClientKey = `${prefix}-db-only-phone-owner`;
  const targetClientKey = `${prefix}-db-only-phone-conflict`;
  const owner = await prisma.client.create({
    data: {
      clientKey: ownerClientKey,
      name: "DB Only Phone Owner",
      profile: "business",
      features: {},
    },
    select: { id: true },
  });
  const target = await prisma.client.create({
    data: {
      clientKey: targetClientKey,
      name: "DB Only Phone Conflict",
      profile: "business",
      features: {},
    },
    select: { id: true },
  });
  await prisma.waPhoneNumber.create({
    data: {
      clientId: owner.id,
      phoneNumberId: `${prefix}-phone-conflict`,
      display: "55 84 9***-1111",
    },
  });

  const response = await requestSuperadmin(
    "POST",
    `/admin/tenants/${encodeURIComponent(targetClientKey)}/onboarding/manual-bind`,
    {
      phoneNumberId: `${prefix}-phone-conflict`,
      displayPhoneNumber: "55 84 9***-1111",
      wabaId: `${prefix}-waba-conflict`,
      businessId: `${prefix}-business-conflict`,
      businessPortfolioId: `${prefix}-portfolio-conflict`,
    }
  );

  assert.equal(response.status, 409);
  const targetMetaConfig = await prisma.tenantMetaConfig.findUnique({
    where: { clientId: target.id },
    select: { phoneNumberId: true, wabaId: true, businessId: true, businessPortfolioId: true },
  });
  assert.equal(targetMetaConfig, null);
});

test("admin onboarding code exchange sends canonical manual oauth redirect uri for db-only clients", async () => {
  const dbOnlyClientKey = `${prefix}-db-only-code-exchange`;
  const client = await prisma.client.create({
    data: {
      clientKey: dbOnlyClientKey,
      name: "DB Only Code Exchange Tenant",
      profile: "business",
      features: {},
    },
    select: { id: true },
  });
  const originalFetch = globalThis.fetch;
  let capturedUrl: URL | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "graph.facebook.com") {
      return originalFetch(input, init);
    }
    capturedUrl = url;
    return new Response(
      JSON.stringify({
        access_token: `${prefix}-business-token`,
        token_type: "bearer",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const redirectUri = `https://converta.re7online.com/admin/tenants/${encodeURIComponent(
      dbOnlyClientKey
    )}/onboarding`;
    const response = await requestSuperadmin<{
      success: boolean;
      businessTokenStored: boolean;
    }>(
      "POST",
      `/admin/tenants/${encodeURIComponent(dbOnlyClientKey)}/onboarding/exchange-code`,
      {
        code: "valid-test-code",
        redirectUri: `${redirectUri}?metaConfigId=1050567334003366`,
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.businessTokenStored, true);
    assert.ok(capturedUrl);
    const metaRequestUrl = capturedUrl as URL;
    assert.equal(metaRequestUrl.pathname.endsWith("/oauth/access_token"), true);
    assert.equal(metaRequestUrl.searchParams.get("code"), "valid-test-code");
    assert.equal(metaRequestUrl.searchParams.get("redirect_uri"), redirectUri);

    const metaConfig = await prisma.tenantMetaConfig.findUnique({
      where: { clientId: client.id },
      select: { businessToken: true },
    });
    assert.equal(metaConfig?.businessToken, `${prefix}-business-token`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin onboarding code exchange resolves WABA by displayed phone when OAuth omits ids", async () => {
  const dbOnlyClientKey = `${prefix}-db-only-code-display-resolution`;
  const client = await prisma.client.create({
    data: {
      clientKey: dbOnlyClientKey,
      name: "DB Only Display Resolution Tenant",
      profile: "business",
      features: {},
    },
    select: { id: true },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "graph.facebook.com") {
      return originalFetch(input, init);
    }
    if (url.pathname.endsWith("/oauth/access_token")) {
      return new Response(
        JSON.stringify({
          access_token: `${prefix}-business-token-display`,
          token_type: "bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname.endsWith("/me/businesses")) {
      return new Response(
        JSON.stringify({
          data: [{ id: `${prefix}-portfolio-display`, name: "Portfolio" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname.endsWith(`/${prefix}-portfolio-display/owned_whatsapp_business_accounts`)) {
      return new Response(
        JSON.stringify({
          data: [{ id: `${prefix}-waba-display`, name: "WABA" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname.endsWith(`/${prefix}-portfolio-display/client_whatsapp_business_accounts`)) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.endsWith(`/${prefix}-waba-display/phone_numbers`)) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: `${prefix}-phone-display`,
              display_phone_number: "+55 84 9459-6848",
              verified_name: "Converta DEMO",
              code_verification_status: "EXPIRED",
              name_status: "AVAILABLE_WITHOUT_REVIEW",
              account_mode: "LIVE",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.pathname.endsWith(`/${prefix}-waba-display/subscribed_apps`)) {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { message: "unexpected graph request" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await requestSuperadmin<{
      success: boolean;
      businessTokenStored: boolean;
      phoneNumberId: string | null;
      wabaId: string | null;
      businessId: string | null;
      businessPortfolioId: string | null;
      warning?: string | null;
    }>(
      "POST",
      `/admin/tenants/${encodeURIComponent(dbOnlyClientKey)}/onboarding/exchange-code`,
      {
        code: "valid-display-resolution-code",
        redirectUri: `https://converta.re7online.com/admin/tenants/${encodeURIComponent(
          dbOnlyClientKey
        )}/onboarding`,
        embeddedSignup: {
          displayPhoneNumber: "55 84 9459-6848",
          raw: { code: "redacted-in-test" },
        },
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.businessTokenStored, true);
    assert.equal(response.body.phoneNumberId, `${prefix}-phone-display`);
    assert.equal(response.body.wabaId, `${prefix}-waba-display`);
    assert.equal(response.body.businessId, `${prefix}-portfolio-display`);
    assert.equal(response.body.businessPortfolioId, `${prefix}-portfolio-display`);
    assert.equal(response.body.warning, "Meta reportou code_verification_status=EXPIRED.");

    const metaConfig = await prisma.tenantMetaConfig.findUnique({
      where: { clientId: client.id },
      select: { phoneNumberId: true, wabaId: true, businessToken: true },
    });
    assert.equal(metaConfig?.phoneNumberId, `${prefix}-phone-display`);
    assert.equal(metaConfig?.wabaId, `${prefix}-waba-display`);
    assert.equal(metaConfig?.businessToken, `${prefix}-business-token-display`);

    const phoneNumber = await prisma.waPhoneNumber.findUnique({
      where: { phoneNumberId: `${prefix}-phone-display` },
      select: { clientId: true, display: true },
    });
    assert.equal(phoneNumber?.clientId, client.id);
    assert.equal(phoneNumber?.display, "55 84 9459-6848");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meta usage summary is tenant scoped, role protected and sanitized", async () => {
  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: businessClientId },
    update: {
      config: {
        metaUsagePolicy: {
          enabled: true,
          mode: "alert_only",
          monthlyLimitUsd: 0.01,
          monthlyMessageLimit: 1,
          alertThresholds: [70, 90, 100],
        },
      },
    },
    create: {
      clientId: businessClientId,
      config: {
        metaUsagePolicy: {
          enabled: true,
          mode: "alert_only",
          monthlyLimitUsd: 0.01,
          monthlyMessageLimit: 1,
          alertThresholds: [70, 90, 100],
        },
      },
    },
  });
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "5584999991111",
        waIdCanonical: "5584999991111",
        messageId: `${prefix}.usage.business`,
        type: "TEMPLATE",
        status: "SENT",
        bodyText: "Nao deve vazar",
        rawPayload: {
          metaUsage: {
            source: "inbox_template",
            messageKind: "template",
            direction: "outbound",
            metaCategory: "utility",
            deliveryStatus: "delivered",
            estimatedBillable: true,
            estimatedMetaCostUsd: 0.008,
            billingRule: "utility_billable",
            waIdLast4: "1111",
            waIdLength: 13,
          },
        },
        createdAt: new Date("2026-08-03T10:00:00.000Z"),
      },
      {
        clientId: overrideClientId,
        waId: "5584999992222",
        waIdCanonical: "5584999992222",
        messageId: `${prefix}.usage.override`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: {
          metaUsage: {
            source: "campaign",
            messageKind: "template",
            direction: "outbound",
            metaCategory: "marketing",
            deliveryStatus: "delivered",
            estimatedBillable: true,
            estimatedMetaCostUsd: 9,
            billingRule: "marketing_billable",
            waIdLast4: "2222",
            waIdLength: 13,
          },
        },
        createdAt: new Date("2026-08-03T10:01:00.000Z"),
      },
    ],
  });

  const unauth = await requestUnauth<ErrorPayload>("GET", "/app/usage/meta/summary?month=2026-08");
  assert.equal(unauth.status, 401);
  assert.equal(getErrorCode(unauth.body), "missing_token");

  const agent = await request<ErrorPayload>("GET", "/app/usage/meta/summary?month=2026-08", businessAgent);
  assert.equal(agent.status, 403);
  assert.equal(getErrorCode(agent.body), "forbidden");

  const invalidMonth = await request<ErrorPayload>(
    "GET",
    "/app/usage/meta/summary?month=2026-13",
    businessAdmin
  );
  assert.equal(invalidMonth.status, 400);
  assert.equal(getErrorCode(invalidMonth.body), "invalid_month");

  const first = await request<{
    ok: true;
    summary: {
      month: string;
      tenantKey: string | null;
      deliveredBillableCount: number;
      deliveredEstimatedCostUsd: number;
      thresholdReached: number | null;
      limitExceeded: boolean;
      byCategory: Record<string, { deliveredBillableCount: number }>;
    };
    alerts: { created: number; skipped: boolean };
  }>("GET", "/app/usage/meta/summary?month=2026-08&clientId=malicious", businessAdmin);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.ok, true);
  assert.equal(first.body.summary.deliveredBillableCount, 1);
  assert.equal(first.body.summary.deliveredEstimatedCostUsd, 0.008);
  assert.equal(first.body.summary.byCategory.utility.deliveredBillableCount, 1);
  assert.equal(first.body.summary.byCategory.marketing, undefined);
  assert.equal(first.body.summary.thresholdReached, 100);
  assert.equal(first.body.summary.limitExceeded, true);
  assert.equal(first.body.alerts.created, 3);
  const serialized = JSON.stringify(first.body);
  assert.equal(serialized.includes("5584999991111"), false);
  assert.equal(serialized.includes("Nao deve vazar"), false);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("token"), false);

  const second = await request<{ alerts: { created: number; skipped: boolean } }>(
    "GET",
    "/app/usage/meta/summary?month=2026-08",
    businessSupervisor
  );
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.alerts.created, 0);

  const otherTenant = await request<{
    ok: true;
    summary: { deliveredBillableCount: number; deliveredEstimatedCostUsd: number };
    alerts: { created: number; skipped: boolean };
  }>("GET", "/app/usage/meta/summary?month=2026-08", overrideAdmin);
  assert.equal(otherTenant.status, 200, JSON.stringify(otherTenant.body));
  assert.equal(otherTenant.body.summary.deliveredBillableCount, 1);
  assert.equal(otherTenant.body.summary.deliveredEstimatedCostUsd, 9);
  assert.equal(otherTenant.body.alerts.skipped, true);
});

test("meta usage cost preview validates tenant template and returns sanitized estimate", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `usage_preview_${safeTemplatePrefix}`,
      category: "MARKETING",
      language: "pt_BR",
      status: "approved",
      content: "Aviso {{1}}",
    },
  });
  const otherTemplate = await prisma.template.create({
    data: {
      clientId: overrideClientId,
      name: `usage_preview_other_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Outro",
    },
  });

  const unauth = await requestUnauth<ErrorPayload>("POST", "/app/usage/meta/preview", {
    source: "campaign",
    messageKind: "template",
    templateId: template.id,
    recipientCount: 1,
  });
  assert.equal(unauth.status, 401);
  assert.equal(getErrorCode(unauth.body), "missing_token");

  const response = await request<{
    ok: true;
    preview: {
      source: string;
      messageKind: string;
      metaCategory: string;
      recipientCount: number;
      eligibleCount: number;
      blockedCount: number;
      unitCostUsd: number | null;
      estimatedCostUsd: number | null;
      warningLevel: string;
      notes: string[];
    };
  }>("POST", "/app/usage/meta/preview?clientId=malicious", businessAgent, {
    source: "campaign",
    messageKind: "template",
    templateId: template.id,
    recipientCount: 12,
    eligibleCount: 10,
    blockedCount: 2,
    windowOpenAtSend: "unknown",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.preview.metaCategory, "marketing");
  assert.equal(response.body.preview.unitCostUsd, 0.0625);
  assert.equal(response.body.preview.estimatedCostUsd, 0.625);
  assert.equal(response.body.preview.blockedCount, 2);
  assert.equal(response.body.preview.warningLevel, "warning");
  assert.equal(response.body.preview.notes.some((note) => note.includes("Marketing")), true);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("5584999999999"), false);
  assert.equal(serialized.includes("bodyText"), false);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("token"), false);

  const crossTenant = await request<ErrorPayload>("POST", "/app/usage/meta/preview", businessAdmin, {
    source: "campaign",
    messageKind: "template",
    templateId: otherTemplate.id,
    recipientCount: 1,
    eligibleCount: 1,
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "template_not_found");

  const service = await request<{
    ok: true;
    preview: { metaCategory: string; unitCostUsd: number | null; estimatedCostUsd: number | null; notes: string[] };
  }>("POST", "/app/usage/meta/preview", businessAgent, {
    source: "canned_reply",
    messageKind: "canned_reply",
    recipientCount: 1,
    eligibleCount: 1,
  });
  assert.equal(service.status, 200, JSON.stringify(service.body));
  assert.equal(service.body.preview.metaCategory, "service");
  assert.equal(JSON.stringify(service.body).includes("grátis"), false);
  assert.equal(JSON.stringify(service.body).includes("gratuito"), false);
});

test("meta usage monthly report exposes sanitized JSON and CSV", async () => {
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "5584999993333",
        waIdCanonical: "5584999993333",
        messageId: `${prefix}.report.business.delivered`,
        type: "TEMPLATE",
        status: "SENT",
        bodyText: "Nao deve aparecer no relatorio",
        metaMessageId: `${prefix}.meta.secret`,
        rawPayload: {
          providerToken: "token-nao-deve-vazar",
          metaMessageId: `${prefix}.meta.secret`,
          metaUsage: {
            source: "campaign",
            messageKind: "template",
            direction: "outbound",
            metaCategory: "utility",
            deliveryStatus: "delivered",
            estimatedBillable: true,
            estimatedMetaUnitCostUsd: 0.008,
            estimatedMetaCostUsd: 0.008,
            billingRule: "utility_billable",
            rateCardVersion: "meta-br-planning-2026-08",
            waIdLast4: "3333",
            waIdLength: 13,
          },
        },
        createdAt: new Date("2026-09-03T10:00:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: "5584999994444",
        waIdCanonical: "5584999994444",
        messageId: `${prefix}.report.business.pending`,
        type: "TEXT",
        status: "SENT",
        bodyText: "Tambem nao deve aparecer",
        rawPayload: {
          metaUsage: {
            source: "inbox_text",
            messageKind: "free_text",
            direction: "outbound",
            metaCategory: "service",
            deliveryStatus: "sent",
            estimatedBillable: false,
            estimatedMetaUnitCostUsd: 0,
            estimatedMetaCostUsd: null,
            billingRule: "current_service_free",
            rateCardVersion: "meta-br-planning-2026-08",
            waIdLast4: "4444",
            waIdLength: 13,
          },
        },
        createdAt: new Date("2026-09-03T10:01:00.000Z"),
      },
      {
        clientId: overrideClientId,
        waId: "5584999995555",
        waIdCanonical: "5584999995555",
        messageId: `${prefix}.report.override`,
        type: "TEMPLATE",
        status: "SENT",
        rawPayload: {
          metaUsage: {
            source: "manual_campaign_send",
            messageKind: "template",
            direction: "outbound",
            metaCategory: "marketing",
            deliveryStatus: "delivered",
            estimatedBillable: true,
            estimatedMetaUnitCostUsd: 0.0625,
            estimatedMetaCostUsd: 7,
            billingRule: "marketing_billable",
            rateCardVersion: "meta-br-planning-2026-08",
            waIdLast4: "5555",
            waIdLength: 13,
          },
        },
        createdAt: new Date("2026-09-03T10:02:00.000Z"),
      },
    ],
  });

  const unauth = await requestUnauth<ErrorPayload>("GET", "/app/usage/meta/report?month=2026-09");
  assert.equal(unauth.status, 401);
  assert.equal(getErrorCode(unauth.body), "missing_token");

  const agent = await request<ErrorPayload>("GET", "/app/usage/meta/report?month=2026-09", businessAgent);
  assert.equal(agent.status, 403);
  assert.equal(getErrorCode(agent.body), "forbidden");

  const invalidMonth = await request<ErrorPayload>("GET", "/app/usage/meta/report?month=2026-00", businessAdmin);
  assert.equal(invalidMonth.status, 400);
  assert.equal(getErrorCode(invalidMonth.body), "invalid_month");

  const jsonReport = await request<{
    ok: true;
    reportType: string;
    month: string;
    summary: {
      totalOutboundWithUsage: number;
      deliveredBillableCount: number;
      deliveredEstimatedCostUsd: number;
      sentPendingCount: number;
    };
    byCategory: Record<string, { deliveredBillableCount: number }>;
    bySource: Record<string, { sentPendingCount: number }>;
  }>("GET", "/app/usage/meta/report?month=2026-09&clientId=malicious", businessAdmin);
  assert.equal(jsonReport.status, 200, JSON.stringify(jsonReport.body));
  assert.equal(jsonReport.body.ok, true);
  assert.equal(jsonReport.body.reportType, "meta_usage_monthly");
  assert.equal(jsonReport.body.month, "2026-09");
  assert.equal(jsonReport.body.summary.totalOutboundWithUsage, 2);
  assert.equal(jsonReport.body.summary.deliveredBillableCount, 1);
  assert.equal(jsonReport.body.summary.deliveredEstimatedCostUsd, 0.008);
  assert.equal(jsonReport.body.summary.sentPendingCount, 1);
  assert.equal(jsonReport.body.byCategory.utility.deliveredBillableCount, 1);
  assert.equal(jsonReport.body.byCategory.marketing.deliveredBillableCount, 0);
  assert.equal(jsonReport.body.bySource.inbox_text.sentPendingCount, 1);
  const serialized = JSON.stringify(jsonReport.body);
  assert.equal(serialized.includes("5584999993333"), false);
  assert.equal(serialized.includes("3333"), false);
  assert.equal(serialized.includes("Nao deve aparecer"), false);
  assert.equal(serialized.includes("bodyText"), false);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("metaMessageId"), false);
  assert.equal(serialized.includes("token-nao-deve-vazar"), false);

  const csv = await requestText("GET", "/app/usage/meta/report.csv?month=2026-09", businessSupervisor);
  assert.equal(csv.status, 200);
  assert.match(csv.contentType ?? "", /text\/csv/);
  assert.match(
    csv.text,
    /^month,groupType,groupKey,source,metaCategory,deliveryStatus,messageKind,deliveredBillableCount,deliveredEstimatedCostUsd,billableUnknownCostCount,sentPendingCount,failedCount,nonBillableCount,rateCardVersion,billingRule,notes\n/
  );
  assert.match(csv.text, /2026-09,category,utility,,utility,,/);
  assert.equal(csv.text.includes("5584999993333"), false);
  assert.equal(csv.text.includes("3333"), false);
  assert.equal(csv.text.includes("Nao deve aparecer"), false);
  assert.equal(csv.text.includes("rawPayload"), false);
  assert.equal(csv.text.includes("metaMessageId"), false);
  assert.equal(csv.text.includes("token"), false);

  const otherTenant = await request<{
    ok: true;
    summary: { totalOutboundWithUsage: number; deliveredBillableCount: number; deliveredEstimatedCostUsd: number };
  }>("GET", "/app/usage/meta/report?month=2026-09", overrideAdmin);
  assert.equal(otherTenant.status, 200, JSON.stringify(otherTenant.body));
  assert.equal(otherTenant.body.summary.totalOutboundWithUsage, 1);
  assert.equal(otherTenant.body.summary.deliveredBillableCount, 1);
  assert.equal(otherTenant.body.summary.deliveredEstimatedCostUsd, 7);
});

test("session audit report is tenant scoped, role protected and sanitized", async () => {
  const from = new Date("2030-01-10T00:00:00.000Z");
  const to = new Date("2030-01-11T00:00:00.000Z");
  const reportsDepartment = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Session Reports Department`,
      slug: `${prefix}-session-reports-department`,
    },
    select: { id: true },
  });
  await assignUserDepartments({
    clientId: businessClientId,
    userId: businessAdmin.id,
    departmentIds: [reportsDepartment.id],
  });
  await assignUserDepartments({
    clientId: businessClientId,
    userId: businessSupervisor.id,
    departmentIds: [reportsDepartment.id],
  });
  await assignUserDepartments({
    clientId: businessClientId,
    userId: businessAgent.id,
    departmentIds: [reportsDepartment.id],
  });
  const openSessionId = `${businessAdmin.id}-session-audit-open`;
  const logoutSessionId = `${businessSupervisor.id}-session-audit-logout`;
  const replacedSessionId = `${businessAgent.id}-session-audit-replaced`;
  const renewedSessionId = `${businessAgent.id}-session-audit-renewed`;
  const expiredSessionId = `${businessAgent.id}-session-audit-expired`;
  const otherTenantSessionId = `${governmentAdmin.id}-session-audit-cross-tenant`;
  await prisma.appAuthSession.createMany({
    data: [
      {
        id: openSessionId,
        clientId: businessClientId,
        userId: businessAdmin.id,
        createdAt: new Date("2030-01-10T08:00:00.000Z"),
        lastSeenAt: new Date("2030-01-10T08:05:00.000Z"),
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2030-01-10T08:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
      {
        id: logoutSessionId,
        clientId: businessClientId,
        userId: businessSupervisor.id,
        createdAt: new Date("2030-01-10T09:00:00.000Z"),
        lastSeenAt: new Date("2030-01-10T09:10:00.000Z"),
        revokedAt: new Date("2030-01-10T09:30:00.000Z"),
        revokeReason: "logout",
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2030-01-10T09:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
      {
        id: replacedSessionId,
        clientId: businessClientId,
        userId: businessAgent.id,
        createdAt: new Date("2030-01-10T10:00:00.000Z"),
        lastSeenAt: new Date("2030-01-10T10:20:00.000Z"),
        revokedAt: new Date("2030-01-10T10:45:00.000Z"),
        revokeReason: "replaced_by_new_login",
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2030-01-10T10:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
      {
        id: renewedSessionId,
        clientId: businessClientId,
        userId: businessAgent.id,
        createdAt: new Date("2030-01-10T11:00:00.000Z"),
        lastSeenAt: new Date("2030-01-10T11:15:00.000Z"),
        revokedAt: new Date("2030-01-10T11:30:00.000Z"),
        revokeReason: "session_renewed",
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2030-01-10T11:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
      {
        id: expiredSessionId,
        clientId: businessClientId,
        userId: businessAgent.id,
        createdAt: new Date("2020-01-10T08:00:00.000Z"),
        lastSeenAt: new Date("2020-01-10T08:20:00.000Z"),
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2020-01-10T08:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
      {
        id: otherTenantSessionId,
        clientId: governmentClientId,
        userId: governmentAdmin.id,
        createdAt: new Date("2030-01-10T12:00:00.000Z"),
        lastSeenAt: new Date("2030-01-10T12:20:00.000Z"),
        expiresAt: buildAppAuthSessionExpiresAt(new Date("2030-01-10T12:00:00.000Z")),
        userAgent: "Sensitive browser details",
        ipHash: "sensitive-ip-hash",
      },
    ],
  });

  const unauth = await requestUnauth<ErrorPayload>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}`
  );
  assert.equal(unauth.status, 401);

  const agent = await request<ErrorPayload>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
    businessAgent
  );
  assert.equal(agent.status, 403);

  const admin = await request<{
    ok: true;
    total: number;
    items: Array<{
      id: string;
      userId: string;
      userName: string;
      role: string;
      loginAt: string;
      endedAt: string | null;
      endReason: string | null;
      endReasonLabel: string;
      status: string;
      durationObservedSec: number | null;
      lastSeenAt: string | null;
      ipHash?: string;
      userAgent?: string;
    }>;
    notes: string[];
  }>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}&clientId=malicious`,
    businessAdmin
  );
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  assert.equal(admin.body.total, 4);
  assert.equal(admin.body.items.some((item) => item.id === otherTenantSessionId), false);
  assert.equal(admin.body.items.some((item) => item.ipHash || item.userAgent), false);
  assert.equal(admin.body.notes.some((note) => note.includes("nao e controle de ponto")), true);

  const openItem = admin.body.items.find((item) => item.id === openSessionId);
  assert.equal(openItem?.status, "OPEN");
  assert.equal(openItem?.endedAt, null);
  assert.equal(openItem?.durationObservedSec, null);
  assert.equal(openItem?.endReasonLabel, "Encerramento nao registrado");
  assert.equal(openItem?.lastSeenAt, "2030-01-10T08:05:00.000Z");

  const logoutItem = admin.body.items.find((item) => item.id === logoutSessionId);
  assert.equal(logoutItem?.status, "CLOSED");
  assert.equal(logoutItem?.endReason, "logout");
  assert.equal(logoutItem?.endReasonLabel, "Logout explicito");
  assert.equal(logoutItem?.durationObservedSec, 1800);

  const replacedItem = admin.body.items.find((item) => item.id === replacedSessionId);
  assert.equal(replacedItem?.endReasonLabel, "Substituida por novo login");

  const renewedItem = admin.body.items.find((item) => item.id === renewedSessionId);
  assert.equal(renewedItem?.status, "CLOSED");
  assert.equal(renewedItem?.endReasonLabel, "Renovada");

  const supervisor = await request<{ ok: true; total: number }>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
    businessSupervisor
  );
  assert.equal(supervisor.status, 200, JSON.stringify(supervisor.body));
  assert.equal(supervisor.body.total, 4);

  const filteredByUser = await request<{ ok: true; total: number; items: Array<{ id: string }> }>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}&userId=${businessSupervisor.id}`,
    businessAdmin
  );
  assert.equal(filteredByUser.status, 200, JSON.stringify(filteredByUser.body));
  assert.equal(filteredByUser.body.total, 1);
  assert.equal(filteredByUser.body.items[0]?.id, logoutSessionId);

  const filteredByRole = await request<{ ok: true; total: number; items: Array<{ role: string }> }>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}&role=AGENT`,
    businessAdmin
  );
  assert.equal(filteredByRole.status, 200, JSON.stringify(filteredByRole.body));
  assert.equal(filteredByRole.body.total, 2);
  assert.equal(filteredByRole.body.items[0]?.role, "AGENT");

  const filteredClosed = await request<{ ok: true; total: number }>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}&status=CLOSED`,
    businessAdmin
  );
  assert.equal(filteredClosed.status, 200, JSON.stringify(filteredClosed.body));
  assert.equal(filteredClosed.body.total, 3);

  const expiredFrom = new Date("2020-01-10T00:00:00.000Z");
  const expiredTo = new Date("2020-01-11T00:00:00.000Z");
  const filteredExpired = await request<{ ok: true; total: number; items: Array<{ id: string; status: string; statusLabel: string; endedAt: string | null; endReasonLabel: string }> }>(
    "GET",
    `/app/reports/sessions?from=${expiredFrom.toISOString()}&to=${expiredTo.toISOString()}&status=EXPIRED`,
    businessAdmin
  );
  assert.equal(filteredExpired.status, 200, JSON.stringify(filteredExpired.body));
  assert.equal(filteredExpired.body.total, 1);
  assert.equal(filteredExpired.body.items[0]?.id, expiredSessionId);
  assert.equal(filteredExpired.body.items[0]?.status, "EXPIRED");
  assert.equal(filteredExpired.body.items[0]?.statusLabel, "Expirada");
  assert.equal(filteredExpired.body.items[0]?.endedAt, null);

  const crossTenantUser = await request<ErrorPayload>(
    "GET",
    `/app/reports/sessions?from=${from.toISOString()}&to=${to.toISOString()}&userId=${governmentAdmin.id}`,
    businessAdmin
  );
  assert.equal(crossTenantUser.status, 400);
  assert.equal(getErrorCode(crossTenantUser.body), "user_not_found");

  const csv = await requestText(
    "GET",
    `/app/reports/sessions/export?from=${from.toISOString()}&to=${to.toISOString()}`,
    businessAdmin
  );
  assert.equal(csv.status, 200, csv.text);
  assert.match(csv.contentType ?? "", /text\/csv/);
  assert.match(csv.text, /duracao_observada_segundos/);
  assert.match(csv.text, /Logout explicito/);
  assert.doesNotMatch(csv.text, /sensitive-ip-hash/i);
  assert.doesNotMatch(csv.text, /Sensitive browser/i);
  assert.doesNotMatch(csv.text, new RegExp(otherTenantSessionId));
});

test("conversation reports separate human message activity from assignment metrics", async () => {
  const periodFrom = new Date("2030-02-01T00:00:00.000Z");
  const periodTo = new Date("2030-02-02T00:00:00.000Z");
  const conversationA = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-report-wa-a`,
      waIdCanonical: `${prefix}-report-wa-a`,
      channel: "whatsapp",
      provider: "meta",
      createdAt: new Date("2030-02-01T08:00:00.000Z"),
    },
    select: { id: true, waId: true },
  });
  const conversationB = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: `${prefix}-report-wa-b`,
      waIdCanonical: `${prefix}-report-wa-b`,
      channel: "whatsapp",
      provider: "meta",
      createdAt: new Date("2030-02-01T09:00:00.000Z"),
    },
    select: { id: true, waId: true },
  });
  await prisma.conversationMetrics.createMany({
    data: [
      {
        conversationId: conversationA.id,
        clientId: businessClientId,
        startedAt: new Date("2030-02-01T08:00:00.000Z"),
        firstResponseTimeSec: 30,
        totalResponseTimeSec: 60,
        responseCount: 2,
        resolutionTimeSec: 300,
      },
      {
        conversationId: conversationB.id,
        clientId: businessClientId,
        startedAt: new Date("2030-02-01T09:00:00.000Z"),
        firstResponseTimeSec: 45,
        totalResponseTimeSec: 90,
        responseCount: 3,
        resolutionTimeSec: 600,
      },
    ],
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: conversationA.waId,
      waIdCanonical: conversationA.waId,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessSupervisor.id,
      assignedTo: businessSupervisor.name,
      assignedAt: new Date("2030-02-01T08:05:00.000Z"),
      assignments: {
        create: {
          toUserId: businessSupervisor.id,
          assignedAt: new Date("2030-02-01T08:05:00.000Z"),
        },
      },
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: conversationB.waId,
      waIdCanonical: conversationB.waId,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "WAITING",
      assignedUserId: businessSupervisor.id,
      assignedTo: businessSupervisor.name,
      assignedAt: new Date("2030-02-01T09:05:00.000Z"),
      assignments: {
        create: {
          toUserId: businessSupervisor.id,
          assignedAt: new Date("2030-02-01T09:05:00.000Z"),
        },
      },
    },
  });
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-human-agent-1`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "human message one",
        rawPayload: { actor: { source: "human_inbox", userId: businessAgent.id } },
        createdAt: new Date("2030-02-01T10:00:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-human-agent-2`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "human message two",
        rawPayload: { actor: { source: "human_inbox", userId: businessAgent.id } },
        createdAt: new Date("2030-02-01T10:10:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: conversationB.waId,
        waIdCanonical: conversationB.waId,
        messageId: `${prefix}-human-supervisor-1`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "human message three",
        rawPayload: { actor: { source: "human_inbox", userId: businessSupervisor.id } },
        createdAt: periodFrom,
      },
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-outside-period`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "outside period",
        rawPayload: { actor: { source: "human_inbox", userId: businessAgent.id } },
        createdAt: new Date("2030-01-31T23:59:59.000Z"),
      },
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-bot-message`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "bot message",
        rawPayload: { actor: { source: "bot", userId: businessAgent.id } },
        createdAt: new Date("2030-02-01T10:20:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-campaign-message`,
        type: MessageType.TEMPLATE,
        status: MessageStatus.SENT,
        bodyText: "campaign message",
        rawPayload: { source: "campaign" },
        createdAt: new Date("2030-02-01T10:30:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: conversationA.waId,
        waIdCanonical: conversationA.waId,
        messageId: `${prefix}-historical-no-actor`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "historical message",
        rawPayload: { source: "admin_inbox" },
        createdAt: new Date("2030-02-01T10:40:00.000Z"),
      },
      {
        clientId: governmentClientId,
        waId: `${prefix}-other-tenant-wa`,
        waIdCanonical: `${prefix}-other-tenant-wa`,
        messageId: `${prefix}-other-tenant-message`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: "other tenant message",
        rawPayload: { actor: { source: "human_inbox", userId: businessAgent.id } },
        createdAt: new Date("2030-02-01T10:50:00.000Z"),
      },
    ],
  });

  const response = await request<{
    ok: true;
    agentMessageActivity: Array<{ userId: string; userName: string | null; outboundMessages: number }>;
    assignedConversationsByAgent: Array<{ userId: string; conversations: number; avgResponseTimeSec: number | null }>;
    byAgent: Array<{ userId: string; conversations: number; avgResponseTimeSec: number | null }>;
    notes: string[];
  }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&clientId=malicious`,
    businessAdmin
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const activityByUser = new Map(
    response.body.agentMessageActivity.map((item) => [item.userId, item.outboundMessages])
  );
  assert.equal(activityByUser.get(businessAgent.id), 2);
  assert.equal(activityByUser.get(businessSupervisor.id), 1);
  assert.equal(activityByUser.has(governmentAdmin.id), false);
  assert.equal(response.body.agentMessageActivity.length, 2);

  const assignmentsByUser = new Map(
    response.body.assignedConversationsByAgent.map((item) => [item.userId, item.conversations])
  );
  assert.equal(assignmentsByUser.get(businessSupervisor.id), 2);
  assert.equal(assignmentsByUser.has(businessAgent.id), false);
  assert.deepEqual(response.body.byAgent, response.body.assignedConversationsByAgent);
  assert.equal(
    response.body.notes.some((note) => note.includes("mensagens historicas anteriores")),
    true
  );
});

test("app reports scope supervisors to all active department memberships", async () => {
  const periodFrom = new Date("2031-03-01T00:00:00.000Z");
  const periodTo = new Date("2031-03-02T00:00:00.000Z");
  const departments = await Promise.all(
    ["A", "B", "C", "D"].map((label) =>
      prisma.department.create({
        data: {
          clientId: businessClientId,
          name: `${prefix} Reports Department ${label}`,
          slug: `${prefix}-reports-department-${label.toLowerCase()}`,
        },
        select: { id: true, name: true },
      })
    )
  );
  const supervisor = await createUser({
    clientId: businessClientId,
    role: "SUPERVISOR",
    suffix: "reports-multi-department-supervisor",
  });
  const agentA = await createUser({ clientId: businessClientId, role: "AGENT", suffix: "reports-agent-a" });
  const agentB = await createUser({ clientId: businessClientId, role: "AGENT", suffix: "reports-agent-b" });
  const agentC = await createUser({ clientId: businessClientId, role: "AGENT", suffix: "reports-agent-c" });
  const agentD = await createUser({ clientId: businessClientId, role: "AGENT", suffix: "reports-agent-d" });
  await assignUserDepartments({
    clientId: businessClientId,
    userId: supervisor.id,
    departmentIds: [departments[0].id, departments[1].id, departments[2].id],
    primaryDepartmentId: departments[0].id,
  });
  await assignUserDepartments({ clientId: businessClientId, userId: agentA.id, departmentIds: [departments[0].id] });
  await assignUserDepartments({ clientId: businessClientId, userId: agentB.id, departmentIds: [departments[1].id] });
  await assignUserDepartments({ clientId: businessClientId, userId: agentC.id, departmentIds: [departments[2].id] });
  await assignUserDepartments({ clientId: businessClientId, userId: agentD.id, departmentIds: [departments[3].id] });

  const agents = [agentA, agentB, agentC, agentD];
  for (const [index, department] of departments.entries()) {
    const conversation = await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId: `${prefix}-report-scope-wa-${index}`,
        waIdCanonical: `${prefix}-report-scope-wa-${index}`,
        channel: index === 2 ? "webchat" : "whatsapp",
        provider: index === 2 ? "webchat" : "meta",
        departmentId: department.id,
        createdAt: new Date(periodFrom.getTime() + index * 60_000),
      },
      select: { id: true, waId: true },
    });
    await prisma.conversationMetrics.create({
      data: {
        conversationId: conversation.id,
        clientId: businessClientId,
        startedAt: new Date(periodFrom.getTime() + index * 60_000),
        firstResponseTimeSec: 10 + index,
        totalResponseTimeSec: 20 + index,
        responseCount: 1,
        resolutionTimeSec: 100 + index,
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId: conversation.waId,
        waIdCanonical: conversation.waId,
        channel: index === 2 ? "webchat" : "whatsapp",
        provider: index === 2 ? "webchat" : "meta",
        mode: "HUMAN",
        status: "IN_PROGRESS",
        departmentId: department.id,
        assignedUserId: agents[index].id,
        assignedTo: agents[index].name,
        assignments: {
          create: {
            toUserId: agents[index].id,
            assignedAt: new Date(periodFrom.getTime() + index * 60_000),
          },
        },
      },
    });
    await prisma.outboundMessage.create({
      data: {
        clientId: businessClientId,
        waId: conversation.waId,
        waIdCanonical: conversation.waId,
        messageId: `${prefix}-report-scope-message-${index}`,
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        bodyText: `message ${index}`,
        rawPayload: { actor: { source: "human_inbox", userId: agents[index].id } },
        createdAt: new Date(periodFrom.getTime() + index * 60_000 + 30_000),
      },
    });
  }

  await prisma.appAuthSession.createMany({
    data: agents.map((agent, index) => ({
      id: `${prefix}-report-scope-session-${index}`,
      clientId: businessClientId,
      userId: agent.id,
      createdAt: new Date(periodFrom.getTime() + index * 60_000),
      lastSeenAt: new Date(periodFrom.getTime() + index * 60_000 + 30_000),
      expiresAt: buildAppAuthSessionExpiresAt(new Date(periodFrom.getTime() + index * 60_000)),
      userAgent: "Sensitive browser details",
      ipHash: "sensitive-ip-hash",
    })),
  });

  const reportDepartments = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    "/app/departments?purpose=reports",
    supervisor
  );
  assert.equal(reportDepartments.status, 200, JSON.stringify(reportDepartments.body));
  assert.deepEqual(
    reportDepartments.body.items.map((item) => item.id).sort(),
    [departments[0].id, departments[1].id, departments[2].id].sort()
  );

  const supervisorReport = await request<{
    ok: true;
    totalConversations: number;
    byDepartment: Array<{ departmentId: string | null; conversations: number }>;
  }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}`,
    supervisor
  );
  assert.equal(supervisorReport.status, 200, JSON.stringify(supervisorReport.body));
  assert.equal(supervisorReport.body.totalConversations, 3);
  assert.deepEqual(
    supervisorReport.body.byDepartment.map((item) => item.departmentId).sort(),
    [departments[0].id, departments[1].id, departments[2].id].sort()
  );

  const departmentBReport = await request<{ ok: true; totalConversations: number; byDepartment: Array<{ departmentId: string | null }> }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&departmentId=${departments[1].id}`,
    supervisor
  );
  assert.equal(departmentBReport.status, 200, JSON.stringify(departmentBReport.body));
  assert.equal(departmentBReport.body.totalConversations, 1);
  assert.equal(departmentBReport.body.byDepartment[0]?.departmentId, departments[1].id);

  const forbiddenDepartment = await request<ErrorPayload>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&departmentId=${departments[3].id}`,
    supervisor
  );
  assert.equal(forbiddenDepartment.status, 403);
  assert.equal(getErrorCode(forbiddenDepartment.body), "department_forbidden");

  const agentAReport = await request<{ ok: true; totalConversations: number }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&userId=${agentA.id}`,
    supervisor
  );
  assert.equal(agentAReport.status, 200, JSON.stringify(agentAReport.body));
  assert.equal(agentAReport.body.totalConversations, 1);

  const forbiddenAgent = await request<ErrorPayload>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&userId=${agentD.id}`,
    supervisor
  );
  assert.equal(forbiddenAgent.status, 403);
  assert.equal(getErrorCode(forbiddenAgent.body), "user_forbidden");

  const channelFiltered = await request<{ ok: true; totalConversations: number }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&channel=webchat`,
    supervisor
  );
  assert.equal(channelFiltered.status, 200, JSON.stringify(channelFiltered.body));
  assert.equal(channelFiltered.body.totalConversations, 1);

  const combinedDepartmentChannel = await request<{ ok: true; totalConversations: number }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&departmentId=${departments[2].id}&channel=webchat`,
    supervisor
  );
  assert.equal(combinedDepartmentChannel.status, 200, JSON.stringify(combinedDepartmentChannel.body));
  assert.equal(combinedDepartmentChannel.body.totalConversations, 1);

  const adminReport = await request<{ ok: true; totalConversations: number }>(
    "GET",
    `/app/reports/conversations?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}`,
    businessAdmin
  );
  assert.equal(adminReport.status, 200, JSON.stringify(adminReport.body));
  assert.ok(adminReport.body.totalConversations >= 4);

  const csv = await requestText(
    "GET",
    `/app/reports/conversations/export?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}`,
    supervisor
  );
  assert.equal(csv.status, 200, csv.text);
  assert.match(csv.text, new RegExp(`${prefix}-report-scope-wa-0`));
  assert.match(csv.text, new RegExp(`${prefix}-report-scope-wa-1`));
  assert.match(csv.text, new RegExp(`${prefix}-report-scope-wa-2`));
  assert.doesNotMatch(csv.text, new RegExp(`${prefix}-report-scope-wa-3`));

  const sessionReport = await request<{ ok: true; total: number; items: Array<{ userId: string }> }>(
    "GET",
    `/app/reports/sessions?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}`,
    supervisor
  );
  assert.equal(sessionReport.status, 200, JSON.stringify(sessionReport.body));
  assert.equal(sessionReport.body.total, 3);
  assert.equal(sessionReport.body.items.some((item) => item.userId === agentD.id), false);

  const forbiddenSessionUser = await request<ErrorPayload>(
    "GET",
    `/app/reports/sessions?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}&userId=${agentD.id}`,
    supervisor
  );
  assert.equal(forbiddenSessionUser.status, 403);
  assert.equal(getErrorCode(forbiddenSessionUser.body), "user_forbidden");

  const sessionCsv = await requestText(
    "GET",
    `/app/reports/sessions/export?from=${periodFrom.toISOString()}&to=${periodTo.toISOString()}`,
    supervisor
  );
  assert.equal(sessionCsv.status, 200, sessionCsv.text);
  assert.match(sessionCsv.text, new RegExp(agentA.name));
  assert.match(sessionCsv.text, new RegExp(agentB.name));
  assert.match(sessionCsv.text, new RegExp(agentC.name));
  assert.doesNotMatch(sessionCsv.text, new RegExp(agentD.name));
});

test("auth session events are persisted with sanitized payloads", async () => {
  const email = `${prefix}-session-event-user@example.test`;
  await prisma.user.create({
    data: {
      clientId: businessClientId,
      name: "Session Event User",
      email,
      passwordHash: hashPassword("session-event-password"),
      role: "SUPERVISOR",
      isActive: true,
    },
  });

  const firstLogin = await requestUnauth<{
    ok: true;
    token: string;
  }>("POST", "/auth/login", {
    email,
    password: "session-event-password",
  });
  assert.equal(firstLogin.status, 200, JSON.stringify(firstLogin.body));

  const secondLogin = await requestUnauth<{
    ok: true;
    token: string;
  }>("POST", "/auth/login", {
    email,
    password: "session-event-password",
  });
  assert.equal(secondLogin.status, 200, JSON.stringify(secondLogin.body));

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secondLogin.body.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(logout.status, 200);

  const events = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: {
        in: ["auth.login", "auth.logout", "auth.session_replaced"],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      eventName: true,
      payloadJson: true,
      waId: true,
      messageId: true,
    },
  });
  assert.equal(events.filter((event) => event.eventName === "auth.login").length, 2);
  assert.equal(events.filter((event) => event.eventName === "auth.session_replaced").length, 1);
  assert.equal(events.filter((event) => event.eventName === "auth.logout").length, 1);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("session-event-password"), false);
  assert.equal(serialized.includes("Sensitive browser"), false);
  assert.equal(serialized.includes("ipHash"), false);
  assert.equal(events.some((event) => event.waId || event.messageId), false);
});

test("auth sessions expire, do not slide on lastSeen and can be explicitly renewed", async () => {
  const email = `${prefix}-session-ttl-user@example.test`;
  const user = await prisma.user.create({
    data: {
      clientId: businessClientId,
      name: "Session TTL User",
      email,
      passwordHash: hashPassword("session-ttl-password"),
      role: "SUPERVISOR",
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
      role: true,
    },
  });

  const login = await requestUnauth<{
    ok: true;
    token: string;
    expiresAt: string;
  }>("POST", "/auth/login", {
    email,
    password: "session-ttl-password",
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const [, encodedPayload] = login.body.token.split(".");
  const jwtPayload = JSON.parse(
    Buffer.from((encodedPayload ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  ) as { sid: string; exp: number };
  assert.equal(Math.floor(new Date(login.body.expiresAt).getTime() / 1000), jwtPayload.exp);

  const sessionBeforeActivity = await prisma.appAuthSession.findUniqueOrThrow({
    where: { id: jwtPayload.sid },
    select: { expiresAt: true, lastSeenAt: true },
  });
  await prisma.appAuthSession.update({
    where: { id: jwtPayload.sid },
    data: { lastSeenAt: new Date(Date.now() - 6 * 60 * 1000) },
  });
  const activity = await fetch(`${baseUrl}/app/campaigns`, {
    headers: { authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(activity.status, 200);
  const sessionAfterActivity = await prisma.appAuthSession.findUniqueOrThrow({
    where: { id: jwtPayload.sid },
    select: { expiresAt: true, lastSeenAt: true },
  });
  assert.equal(sessionAfterActivity.expiresAt.toISOString(), sessionBeforeActivity.expiresAt.toISOString());
  assert.ok(sessionAfterActivity.lastSeenAt.getTime() > sessionBeforeActivity.lastSeenAt.getTime());

  const renew = await fetch(`${baseUrl}/auth/renew`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${login.body.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ userId: "ignored", clientId: "ignored", sid: "ignored" }),
  });
  const renewBody = (await renew.json()) as { ok: true; token: string; expiresAt: string };
  assert.equal(renew.status, 200, JSON.stringify(renewBody));
  const [, renewedPayload] = renewBody.token.split(".");
  const renewedJwtPayload = JSON.parse(
    Buffer.from((renewedPayload ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  ) as { sid: string; exp: number };
  assert.notEqual(renewedJwtPayload.sid, jwtPayload.sid);
  assert.equal(Math.floor(new Date(renewBody.expiresAt).getTime() / 1000), renewedJwtPayload.exp);

  const oldSession = await prisma.appAuthSession.findUniqueOrThrow({
    where: { id: jwtPayload.sid },
    select: { revokedAt: true, revokeReason: true },
  });
  assert.ok(oldSession.revokedAt);
  assert.equal(oldSession.revokeReason, "session_renewed");

  const activeSessions = await prisma.appAuthSession.count({
    where: { clientId: businessClientId, userId: user.id, revokedAt: null },
  });
  assert.equal(activeSessions, 1);

  const expiredSessionId = `${user.id}-expired-session`;
  const expiredToken = issueClientAuthToken(user, expiredSessionId, buildAppAuthSessionExpiresAt());
  const expiredCreatedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
  await prisma.appAuthSession.create({
    data: {
      id: expiredSessionId,
      clientId: businessClientId,
      userId: user.id,
      createdAt: expiredCreatedAt,
      lastSeenAt: expiredCreatedAt,
      expiresAt: new Date(Date.now() - 60 * 1000),
    },
  });
  const expiredRequest = await fetch(`${baseUrl}/app/campaigns`, {
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  const expiredBody = (await expiredRequest.json()) as ErrorPayload;
  assert.equal(expiredRequest.status, 401);
  assert.equal(getErrorCode(expiredBody), "session_expired");
  const expiredSession = await prisma.appAuthSession.findUniqueOrThrow({
    where: { id: expiredSessionId },
    select: { revokedAt: true, revokeReason: true, lastSeenAt: true },
  });
  assert.ok(expiredSession.revokedAt);
  assert.equal(expiredSession.revokeReason, "session_expired");
  assert.equal(expiredSession.lastSeenAt.toISOString(), expiredCreatedAt.toISOString());

  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  const inactiveRequest = await fetch(`${baseUrl}/app/campaigns`, {
    headers: { authorization: `Bearer ${renewBody.token}` },
  });
  const inactiveBody = (await inactiveRequest.json()) as ErrorPayload;
  assert.equal(inactiveRequest.status, 401);
  assert.equal(getErrorCode(inactiveBody), "user_inactive");

  const events = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: { in: ["auth.session_renewed", "auth.session_expired"] },
    },
    select: { eventName: true, payloadJson: true, waId: true, messageId: true },
  });
  assert.equal(events.some((event) => event.eventName === "auth.session_renewed"), true);
  assert.equal(events.some((event) => event.eventName === "auth.session_expired"), true);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("session-ttl-password"), false);
  assert.equal(events.some((event) => event.waId || event.messageId), false);
});

test("template catalog is tenant scoped and exposes campaign usage safely", async () => {
  await prisma.template.createMany({
    data: [
      {
        clientId: businessClientId,
        name: `approved_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "approved",
        content: "Ola {{1}}, seu atendimento foi registrado.",
        variables: ["nome"],
        metaTemplateId: `meta-approved-${prefix}`,
      },
      {
        clientId: businessClientId,
        name: `pending_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "pending",
        content: "Aviso pendente",
      },
      {
        clientId: businessClientId,
        name: `rejected_template_${prefix}`,
        category: "MARKETING",
        language: "pt_BR",
        status: "rejected",
        content: "Aviso rejeitado",
        rejectionReason: "policy",
      },
      {
        clientId: businessClientId,
        name: `recategorized_template_${prefix}`,
        category: "MARKETING",
        submittedCategory: "UTILITY",
        wasRecategorized: true,
        language: "pt_BR",
        status: "approved",
        content: "Aviso institucional aprovado pela Meta",
      },
      {
        clientId: overrideClientId,
        name: `other_tenant_template_${prefix}`,
        category: "UTILITY",
        language: "pt_BR",
        status: "approved",
        content: "Outro tenant",
      },
    ],
  });

  const response = await request<{
    ok: true;
    count: number;
    items: Array<{
      id: string;
      name: string;
      status: string;
      metaTemplateId: string | null;
      canUseInCampaign: boolean;
      canUseInInbox: boolean;
      locallyDisabled: boolean;
      blockedReason: string | null;
      blockedReasonLabel: string | null;
      variablesDetected: string[];
      componentsSummary: Array<{ type: string; text: string }>;
      requestedCategory: string | null;
      metaCategory: string | null;
      effectiveCategory: string | null;
      categoryChanged: boolean;
      categoryChangeLabel: string | null;
    }>;
  }>("GET", "/app/templates?clientId=malicious", businessAdmin);

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.items.some((item) => item.name.includes("other_tenant")), false);

  const approved = response.body.items.find((item) => item.name === `approved_template_${prefix}`);
  assert.ok(approved);
  assert.equal(approved.canUseInCampaign, true);
  assert.equal(approved.canUseInInbox, true);
  assert.equal(approved.locallyDisabled, false);
  assert.equal(approved.blockedReason, null);
  assert.deepEqual(approved.variablesDetected, ["1", "nome"]);
  assert.deepEqual(approved.componentsSummary, [
    { type: "BODY", text: "Ola {{1}}, seu atendimento foi registrado." },
  ]);
  assert.equal(JSON.stringify(approved).includes("businessToken"), false);

  const pending = response.body.items.find((item) => item.name === `pending_template_${prefix}`);
  assert.ok(pending);
  assert.equal(pending.canUseInCampaign, false);
  assert.equal(pending.blockedReason, "pending_review");
  assert.equal(pending.blockedReasonLabel, "Em analise");

  const rejected = response.body.items.find((item) => item.name === `rejected_template_${prefix}`);
  assert.ok(rejected);
  assert.equal(rejected.canUseInCampaign, false);
  assert.equal(rejected.blockedReason, "rejected");
  assert.equal(rejected.blockedReasonLabel, "Rejeitado");

  const recategorized = response.body.items.find((item) => item.name === `recategorized_template_${prefix}`);
  assert.ok(recategorized);
  assert.equal(recategorized.canUseInCampaign, true);
  assert.equal(recategorized.requestedCategory, "UTILITY");
  assert.equal(recategorized.metaCategory, "MARKETING");
  assert.equal(recategorized.effectiveCategory, "MARKETING");
  assert.equal(recategorized.categoryChanged, true);
  assert.match(recategorized.categoryChangeLabel ?? "", /MARKETING/);
  assert.match(recategorized.categoryChangeLabel ?? "", /UTILITY/);
});

test("template local availability blocks campaign usage and preserves tenant isolation", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `local_disabled_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, aviso operacional.",
    },
  });

  const disabledByOtherTenant = await request<ErrorPayload>(
    "POST",
    `/app/templates/${template.id}/disable`,
    overrideAdmin
  );
  assert.equal(disabledByOtherTenant.status, 404);
  assert.equal(getErrorCode(disabledByOtherTenant.body), "template_not_found");

  const disabled = await request<{
    ok: true;
    template: {
      id: string;
      locallyDisabled: boolean;
      canUseInCampaign: boolean;
      canUseInInbox: boolean;
      blockedReason: string | null;
      blockedReasonLabel: string | null;
    };
  }>("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.template.locallyDisabled, true);
  assert.equal(disabled.body.template.canUseInCampaign, false);
  assert.equal(disabled.body.template.canUseInInbox, false);
  assert.equal(disabled.body.template.blockedReason, "locally_disabled");
  assert.equal(disabled.body.template.blockedReasonLabel, "Inativo no Converta");

  const listed = await request<{
    ok: true;
    items: Array<{
      id: string;
      locallyDisabled: boolean;
      canUseInCampaign: boolean;
      blockedReason: string | null;
    }>;
  }>("GET", "/app/templates", businessAdmin);
  const listedTemplate = listed.body.items.find((item) => item.id === template.id);
  assert.ok(listedTemplate);
  assert.equal(listedTemplate.locallyDisabled, true);
  assert.equal(listedTemplate.canUseInCampaign, false);
  assert.equal(listedTemplate.blockedReason, "locally_disabled");

  const disabledEvents = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: template.id,
      eventName: "template.local_disabled",
    },
  });
  assert.equal(disabledEvents, 1);

  const adminEnabled = await requestAdmin<{
    ok: true;
    template: { id: string; locallyDisabled: boolean };
  }>("POST", `/admin/templates/${template.id}/enable`);
  assert.equal(adminEnabled.status, 200);
  assert.equal(adminEnabled.body.template.locallyDisabled, false);

  const relisted = await request<{
    ok: true;
    items: Array<{ id: string; locallyDisabled: boolean; canUseInCampaign: boolean }>;
  }>("GET", "/app/templates", businessAdmin);
  const reactivated = relisted.body.items.find((item) => item.id === template.id);
  assert.ok(reactivated);
  assert.equal(reactivated.locallyDisabled, false);
  assert.equal(reactivated.canUseInCampaign, true);

  const adminDisabled = await requestAdmin<{
    ok: true;
    template: { id: string; locallyDisabled: boolean };
  }>("POST", `/admin/templates/${template.id}/disable`);
  assert.equal(adminDisabled.status, 200);
  assert.equal(adminDisabled.body.template.locallyDisabled, true);
});

test("inbox template send uses approved active template and updates timeline safely", async (t) => {
  const waId = "5541991177801";
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_template_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, continuamos seu atendimento.",
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: false,
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await seedHybridRuntimeState({
    waId,
    waIdCanonical: waId,
    firstSeenAt: "2026-01-01T08:00:00.000Z",
    lastInboundAt: "2026-01-01T08:00:00.000Z",
    window: { isOpen: false, expiresAt: "2026-01-01T10:00:00.000Z" },
    mode: "HUMAN",
    status: "IN_PROGRESS",
    assignedUserId: businessAdmin.id,
    assignedTo: businessAdmin.name,
  });
  const freeText = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Mensagem livre fora da janela",
  });
  assert.equal(freeText.status, 409);
  assert.equal(getErrorCode(freeText.body), "window_closed");

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.inbox.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: true;
    message: { type: string; status: string; bodyText: string; templateName: string; metaMessageId: string | null };
  }>("POST", `/app/conversation/${waId}/send-template?clientId=malicious`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.message.type, "TEMPLATE");
  assert.equal(response.body.message.status, "SENT");
  assert.equal(response.body.message.bodyText, "Ola Maria, continuamos seu atendimento.");
  assert.equal(response.body.message.templateName, template.name);
  assert.equal(response.body.message.metaMessageId, `wamid.inbox.${safeTemplatePrefix}`);
  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string }).to, waId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(outbound.type, "TEMPLATE");
  assert.equal(outbound.bodyText, "Ola Maria, continuamos seu atendimento.");
  assert.equal(outbound.templateName, template.name);
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "inbox_template");
  assert.equal(JSON.stringify(outbound.rawPayload).includes(waId), false);
  const outboundUsage = (outbound.rawPayload as Record<string, unknown>).metaUsage as Record<string, unknown>;
  assert.equal(outboundUsage.source, "inbox_template");
  assert.equal(outboundUsage.messageKind, "template");
  assert.equal(outboundUsage.metaCategory, "utility");
  assert.equal(outboundUsage.windowOpenAtSend, false);
  assert.equal(outboundUsage.estimatedBillable, true);
  assert.equal(outboundUsage.waIdLast4, waId.slice(-4));
  assert.equal(JSON.stringify(outboundUsage).includes(waId), false);

  const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.ok(updatedConversation.lastOutboundAt);
  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "IN_PROGRESS");
  assert.equal(runtime.assignedUserId, businessAdmin.id);
  assert.equal(runtime.lastOutboundMessageId, outbound.messageId);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.template.sent" },
  });
  assert.equal((event.payloadJson as Record<string, unknown>).templateName, template.name);
  const usageEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "meta.usage.estimated" },
  });
  const usagePayload = usageEvent.payloadJson as Record<string, unknown>;
  assert.equal(usagePayload.source, "inbox_template");
  assert.equal(usagePayload.metaCategory, "utility");
  assert.equal(usagePayload.billingRule, "utility_billable");
  assert.equal(usagePayload.estimatedMetaUnitCostUsd, 0.008);
  assert.equal(JSON.stringify(usagePayload).includes(waId), false);
});

test("inbox text contextual reply resolves internal message references safely", async (t) => {
  const waId = "5541991177807";
  const otherWaId = "5541991177808";
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-reply-token",
      phoneNumberId: `phone-reply-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-reply-token",
      phoneNumberId: `phone-reply-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: otherWaId,
      waIdCanonical: otherWaId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
    },
  });
  const inbound = await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      messageId: `wamid.inbound.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Qual documento devo enviar?",
      allowlistHit: true,
    },
  });
  const outbound = await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      messageId: `previous.outbound.${safeTemplatePrefix}`,
      metaMessageId: `wamid.previous.${safeTemplatePrefix}`,
      type: "TEMPLATE",
      status: "SENT",
      templateName: "boas_vindas",
    },
  });
  const otherConversationInbound = await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      waId: otherWaId,
      waIdCanonical: otherWaId,
      messageId: `wamid.other.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Mensagem de outra conversa",
      allowlistHit: true,
    },
  });
  const otherTenantInbound = await prisma.inboundMessage.create({
    data: {
      clientId: governmentClientId,
      waId,
      waIdCanonical: waId,
      messageId: `wamid.gov.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Mensagem de outro tenant",
      allowlistHit: true,
    },
  });
  const outboundWithoutMeta = await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      messageId: `previous.outbound.no-meta.${safeTemplatePrefix}`,
      type: "TEXT",
      status: "SENT",
      bodyText: "Mensagem antiga sem Meta ID",
    },
  });
  const mediaInboundMessages = await Promise.all(
    (["AUDIO", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"] as const).map((type) =>
      prisma.inboundMessage.create({
        data: {
          clientId: businessClientId,
          waId,
          waIdCanonical: waId,
          messageId: `wamid.inbound.${type.toLowerCase()}.${safeTemplatePrefix}`,
          type,
          bodyText: null,
          allowlistHit: true,
          rawPayload:
            type === "LOCATION"
              ? {
                  location: {
                    latitude: -5.7945,
                    longitude: -35.211,
                    name: "Sala de atendimento",
                    address: "Endereco sanitizado",
                  },
                }
              : {
                  media: {
                    mediaId: `media-${type.toLowerCase()}-${safeTemplatePrefix}`,
                    mimeType:
                      type === "AUDIO"
                        ? "audio/ogg"
                        : type === "IMAGE"
                          ? "image/jpeg"
                          : type === "VIDEO"
                            ? "video/mp4"
                            : "application/pdf",
                    fileName: type === "DOCUMENT" ? "orientacoes.pdf" : undefined,
                    caption: type === "IMAGE" ? "Imagem de referencia" : undefined,
                  },
                },
        },
      })
    )
  );
  const outboundMedia = await prisma.outboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      messageId: `previous.outbound.media.${safeTemplatePrefix}`,
      metaMessageId: `wamid.previous.media.${safeTemplatePrefix}`,
      type: "IMAGE",
      status: "SENT",
      rawPayload: { media: { mediaId: `out-media-${safeTemplatePrefix}` } },
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      metaPayloads.push(payload);
      if (String((payload.text as Record<string, unknown> | undefined)?.body ?? "").includes("Falha controlada")) {
        return new Response(JSON.stringify({ error: { message: "Context rejected" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.reply.${metaPayloads.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const inboundReply = await request<{
    ok: true;
    message: {
      messageId: string;
      internalMessageId: string | null;
      status: string;
      replyTo: { kind: string; id: string; previewType: string };
      actor: { source: string; userId: string; displayName: string | null };
    };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Envie RG e CPF.",
    replyTo: { kind: "inbound", id: inbound.id },
  });
  assert.equal(inboundReply.status, 200, JSON.stringify(inboundReply.body));
  assert.ok(inboundReply.body.message.internalMessageId);
  assert.deepEqual(inboundReply.body.message.replyTo, { kind: "inbound", id: inbound.id, previewType: "TEXT", mode: "reply" });
  assert.deepEqual(inboundReply.body.message.actor, {
    source: "human_inbox",
    userId: businessAdmin.id,
    displayName: businessAdmin.name,
  });
  assert.equal((metaPayloads[0] as { context?: { message_id?: string } }).context?.message_id, inbound.messageId);

  const outboundReply = await request<{
    ok: true;
    message: { status: string; internalMessageId: string | null; replyTo: { kind: string; id: string; previewType: string } };
  }>(
    "POST",
    `/app/conversation/${waId}/send`,
    businessAdmin,
    {
      text: "Complementando a mensagem anterior.",
      replyTo: { kind: "outbound", id: outbound.id },
    }
  );
  assert.equal(outboundReply.status, 200, JSON.stringify(outboundReply.body));
  assert.ok(outboundReply.body.message.internalMessageId);
  assert.deepEqual(outboundReply.body.message.replyTo, { kind: "outbound", id: outbound.id, previewType: "TEMPLATE", mode: "reply" });
  assert.equal((metaPayloads[1] as { context?: { message_id?: string } }).context?.message_id, outbound.metaMessageId);

  const rectification = await request<{
    ok: true;
    message: {
      messageId: string;
      status: string;
      replyTo: { kind: string; id: string; previewType: string; mode: string };
    };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "O prazo correto e sexta-feira.",
    replyTo: { kind: "outbound", id: outbound.id, mode: "rectify" },
  });
  assert.equal(rectification.status, 200, JSON.stringify(rectification.body));
  assert.deepEqual(rectification.body.message.replyTo, { kind: "outbound", id: outbound.id, previewType: "TEMPLATE", mode: "rectify" });
  assert.equal((metaPayloads[2] as { context?: { message_id?: string } }).context?.message_id, outbound.metaMessageId);
  assert.equal((metaPayloads[2] as { text?: { body?: string } }).text?.body, "O prazo correto e sexta-feira.");

  const persistedRectification = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: rectification.body.message.messageId },
  });
  assert.equal(persistedRectification.bodyText, "O prazo correto e sexta-feira.");
  const rectificationPayload = (persistedRectification.rawPayload as Record<string, unknown>).contextualReply as Record<string, unknown>;
  assert.equal(rectificationPayload.mode, "rectify");
  assert.equal(rectificationPayload.replyToInternalMessageId, outbound.id);
  assert.equal(JSON.stringify(rectificationPayload).includes("wamid."), false);
  assert.equal(JSON.stringify(rectificationPayload).includes(waId), false);

  const inboundLegacyRectification = await request<{
    ok: true;
    message: { status: string; replyTo: { kind: string; id: string; previewType: string; mode: string } };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Referencia antiga tambem envia sem prefixo.",
    replyTo: { kind: "inbound", id: inbound.id, mode: "rectify" },
  });
  assert.equal(inboundLegacyRectification.status, 200, JSON.stringify(inboundLegacyRectification.body));
  assert.deepEqual(inboundLegacyRectification.body.message.replyTo, {
    kind: "inbound",
    id: inbound.id,
    previewType: "TEXT",
    mode: "rectify",
  });
  assert.equal((metaPayloads[3] as { context?: { message_id?: string } }).context?.message_id, inbound.messageId);
  assert.equal(
    (metaPayloads[3] as { text?: { body?: string } }).text?.body,
    "Referencia antiga tambem envia sem prefixo."
  );

  const failedRectification = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Falha controlada de contexto",
    replyTo: { kind: "outbound", id: outbound.id, mode: "rectify" },
  });
  assert.equal(failedRectification.status, 502);
  assert.equal(getErrorCode(failedRectification.body), "message_send_failed");
  assert.equal(metaPayloads.length, 5);
  assert.equal((metaPayloads[4] as { context?: { message_id?: string } }).context?.message_id, outbound.metaMessageId);
  assert.equal((metaPayloads[4] as { text?: { body?: string } }).text?.body, "Falha controlada de contexto");

  const failedEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.reply.failed" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal((failedEvent.payloadJson as Record<string, unknown>).mode, "rectify");
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes("wamid."), false);
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes(waId), false);

  const normalSend = await request<{ ok: true; message: { status: string } }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Mensagem simples sem citacao.",
  });
  assert.equal(normalSend.status, 200, JSON.stringify(normalSend.body));
  assert.equal((metaPayloads[5] as { context?: unknown }).context, undefined);

  const mediaReplyMessageIds = new Map<string, string>();
  for (const mediaInbound of mediaInboundMessages) {
    const payloadIndex: number = metaPayloads.length;
    const mediaReply = await request<{
      ok: true;
      message: { messageId: string; status: string; replyTo: { kind: string; id: string; previewType: string; mode: string } };
    }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
      text: `Resposta para ${mediaInbound.type.toLowerCase()}.`,
      replyTo: { kind: "inbound", id: mediaInbound.id },
    });
    assert.equal(mediaReply.status, 200, JSON.stringify(mediaReply.body));
    mediaReplyMessageIds.set(mediaInbound.type, mediaReply.body.message.messageId);
    assert.deepEqual(mediaReply.body.message.replyTo, {
      kind: "inbound",
      id: mediaInbound.id,
      previewType: mediaInbound.type,
      mode: "reply",
    });
    assert.equal(
      (metaPayloads[payloadIndex] as { context?: { message_id?: string } }).context?.message_id,
      mediaInbound.messageId
    );
    if (mediaInbound.type === "AUDIO") {
      const mediaId = (mediaInbound.rawPayload as { media?: { mediaId?: string } } | null)?.media?.mediaId;
      assert.notEqual(
        (metaPayloads[payloadIndex] as { context?: { message_id?: string } }).context?.message_id,
        mediaId
      );
      const persistedAudioReply = await prisma.outboundMessage.findFirstOrThrow({
        where: { clientId: businessClientId, waId, messageId: mediaReply.body.message.messageId },
      });
      const audioContextualReply = (persistedAudioReply.rawPayload as Record<string, unknown>).contextualReply as Record<
        string,
        unknown
      >;
      const audioProviderRequest = (persistedAudioReply.rawPayload as Record<string, unknown>)
        .contextualReplyProviderRequest as Record<string, unknown>;
      assert.equal(audioContextualReply.originalType, "AUDIO");
      assert.equal(audioContextualReply.contextRequested, true);
      assert.equal(audioContextualReply.contextResolved, true);
      assert.equal(audioContextualReply.contextAttached, true);
      assert.deepEqual(audioProviderRequest, {
        messageType: "text",
        contextPresent: true,
        contextMessageIdPresent: true,
        replyToOriginalType: "AUDIO",
      });
      assert.equal(JSON.stringify(audioProviderRequest).includes("wamid."), false);
      assert.equal(JSON.stringify(audioProviderRequest).includes(waId), false);
    }
  }

  const mediaRectificationPayloadIndex = metaPayloads.length;
  const mediaRectification = await request<{
    ok: true;
    message: { status: string; replyTo: { kind: string; id: string; previewType: string; mode: string } };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "A imagem correta e a segunda.",
    replyTo: { kind: "outbound", id: outboundMedia.id, mode: "rectify" },
  });
  assert.equal(mediaRectification.status, 200, JSON.stringify(mediaRectification.body));
  assert.deepEqual(mediaRectification.body.message.replyTo, {
    kind: "outbound",
    id: outboundMedia.id,
    previewType: "IMAGE",
    mode: "rectify",
  });
  assert.equal(
    (metaPayloads[mediaRectificationPayloadIndex] as { context?: { message_id?: string } }).context?.message_id,
    outboundMedia.metaMessageId
  );
  assert.equal(
    (metaPayloads[mediaRectificationPayloadIndex] as { text?: { body?: string } }).text?.body,
    "A imagem correta e a segunda."
  );

  const persisted = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: inboundReply.body.message.messageId },
  });
  const actorPayload = (persisted.rawPayload as Record<string, unknown>).actor as Record<string, unknown>;
  assert.equal(actorPayload.source, "human_inbox");
  assert.equal(actorPayload.userId, businessAdmin.id);
  assert.equal(JSON.stringify(actorPayload).includes(waId), false);
  const contextualReply = (persisted.rawPayload as Record<string, unknown>).contextualReply as Record<string, unknown>;
  assert.equal(contextualReply.replyToKind, "inbound");
  assert.equal(contextualReply.replyToInternalMessageId, inbound.id);
  assert.equal(contextualReply.replyToMetaMessagePresent, true);
  assert.equal(contextualReply.mode, "reply");
  assert.equal(contextualReply.replyToType, "TEXT");
  assert.equal(contextualReply.originalType, "TEXT");
  assert.equal(contextualReply.contextRequested, true);
  assert.equal(contextualReply.contextResolved, true);
  assert.equal(contextualReply.contextAttached, true);
  assert.equal(JSON.stringify(contextualReply).includes("wamid."), false);
  assert.equal(JSON.stringify(contextualReply).includes(waId), false);

  const detail = await request<{
    ok: true;
    items: Array<{
      internalMessageId: string;
      messageKind: string;
      direction: string;
      messageId: string;
      actor: { source: string; userId: string; displayName: string | null } | null;
      replyTo?: {
        kind: string;
        id: string;
        previewType: string | null;
        previewBody?: string | null;
        previewDirection?: string | null;
        previewMedia?: {
          kind: string;
          mimeType?: string;
          fileName?: string;
          caption?: string;
          hasDownload: boolean;
          downloadUrl?: string;
          messageId?: string | null;
        } | null;
        previewLocation?: {
          latitude: number;
          longitude: number;
          name: string | null;
          address: string | null;
        } | null;
      } | null;
    }>;
  }>("GET", `/app/conversation/${waId}`, businessAdmin);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  const inboundDetail = detail.body.items.find((message) => message.internalMessageId === inbound.id);
  assert.equal(inboundDetail?.messageKind, "inbound");
  assert.equal(inboundDetail?.messageId, inbound.messageId);
  const outboundDetail = detail.body.items.find((message) => message.internalMessageId === persisted.id);
  assert.equal(outboundDetail?.messageKind, "outbound");
  assert.deepEqual(outboundDetail?.actor, {
    source: "human_inbox",
    userId: businessAdmin.id,
    displayName: businessAdmin.name,
  });
  const imageReplyDetail = detail.body.items.find((message) => message.messageId === mediaReplyMessageIds.get("IMAGE"));
  assert.equal(imageReplyDetail?.replyTo?.previewType, "IMAGE");
  assert.equal(imageReplyDetail?.replyTo?.previewMedia?.kind, "image");
  assert.equal(imageReplyDetail?.replyTo?.previewMedia?.caption, "Imagem de referencia");
  assert.equal(imageReplyDetail?.replyTo?.previewMedia?.mimeType, "image/jpeg");
  assert.equal(imageReplyDetail?.replyTo?.previewMedia?.hasDownload, true);
  assert.equal(imageReplyDetail?.replyTo?.previewMedia?.messageId?.startsWith("wamid.inbound.image."), true);
  assert.equal(Boolean(imageReplyDetail?.replyTo?.previewMedia?.downloadUrl), true);

  const audioReplyDetail = detail.body.items.find((message) => message.messageId === mediaReplyMessageIds.get("AUDIO"));
  assert.equal(audioReplyDetail?.replyTo?.previewMedia?.kind, "audio");
  assert.equal(audioReplyDetail?.replyTo?.previewMedia?.mimeType, "audio/ogg");

  const videoReplyDetail = detail.body.items.find((message) => message.messageId === mediaReplyMessageIds.get("VIDEO"));
  assert.equal(videoReplyDetail?.replyTo?.previewMedia?.kind, "video");
  assert.equal(videoReplyDetail?.replyTo?.previewMedia?.mimeType, "video/mp4");

  const documentReplyDetail = detail.body.items.find(
    (message) => message.messageId === mediaReplyMessageIds.get("DOCUMENT")
  );
  assert.equal(documentReplyDetail?.replyTo?.previewMedia?.kind, "document");
  assert.equal(documentReplyDetail?.replyTo?.previewMedia?.fileName, "orientacoes.pdf");
  assert.equal(documentReplyDetail?.replyTo?.previewMedia?.mimeType, "application/pdf");

  const locationReplyDetail = detail.body.items.find(
    (message) => message.messageId === mediaReplyMessageIds.get("LOCATION")
  );
  assert.equal(locationReplyDetail?.replyTo?.previewType, "LOCATION");
  assert.equal(locationReplyDetail?.replyTo?.previewLocation?.name, "Sala de atendimento");
  assert.equal(locationReplyDetail?.replyTo?.previewLocation?.address, "Endereco sanitizado");
  assert.equal(locationReplyDetail?.replyTo?.previewMedia ?? null, null);

  const compactDetail = await request<{
    ok: true;
    items: Array<{
      messageId: string;
      replyTo?: {
        previewType?: string | null;
        previewBody?: string | null;
        previewMedia?: unknown;
        previewLocation?: unknown;
      } | null;
    }>;
  }>("GET", `/app/conversation/${waId}?limit=1&order=desc`, businessAdmin);
  assert.equal(compactDetail.status, 200, JSON.stringify(compactDetail.body));
  assert.equal(compactDetail.body.items.length, 1);
  assert.equal(compactDetail.body.items[0]?.replyTo?.previewType, "IMAGE");
  assert.equal(compactDetail.body.items[0]?.replyTo?.previewBody ?? null, null);
  assert.equal(compactDetail.body.items[0]?.replyTo?.previewMedia ?? null, null);
  assert.equal(compactDetail.body.items[0]?.replyTo?.previewLocation ?? null, null);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.reply.sent" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal((event.payloadJson as Record<string, unknown>).replyToInternalMessageId, inbound.id);
  assert.equal(JSON.stringify(event.payloadJson).includes("wamid."), false);
  assert.equal(JSON.stringify(event.payloadJson).includes(waId), false);
  assert.equal((event.payloadJson as Record<string, unknown>).originalType, "TEXT");
  assert.equal((event.payloadJson as Record<string, unknown>).contextRequested, true);
  assert.equal((event.payloadJson as Record<string, unknown>).contextResolved, true);
  assert.equal((event.payloadJson as Record<string, unknown>).contextAttached, true);

  const crossConversation = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Nao deve enviar",
    replyTo: { kind: "inbound", id: otherConversationInbound.id },
  });
  assert.equal(crossConversation.status, 404);
  assert.equal(getErrorCode(crossConversation.body), "reply_context_not_found");

  const crossTenant = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Nao deve enviar",
    replyTo: { kind: "inbound", id: otherTenantInbound.id },
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "reply_context_not_found");

  const missingMeta = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Nao deve enviar",
    replyTo: { kind: "outbound", id: outboundWithoutMeta.id },
  });
  assert.equal(missingMeta.status, 409);
  assert.equal(getErrorCode(missingMeta.body), "reply_context_unavailable");
  assert.equal(metaPayloads.length, 12);
});

test("inbox template send blocks opt-out, inactive templates, missing variables and cross tenant template", async (t) => {
  const waId = "5541991177802";
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_block_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, mensagem de atendimento.",
    },
  });
  const otherTemplate = await prisma.template.create({
    data: {
      clientId: overrideClientId,
      name: `inbox_cross_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Outro tenant",
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaCalls += 1;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const missing = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: {},
  });
  assert.equal(missing.status, 400, JSON.stringify(missing.body));
  assert.equal(getErrorCode(missing.body), "template_variables_required");

  const crossTenant = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: otherTemplate.id,
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "template_not_found");

  await request("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  const disabled = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });
  assert.equal(disabled.status, 409);
  assert.equal(getErrorCode(disabled.body), "template_locally_disabled");
  await request("POST", `/app/templates/${template.id}/enable`, businessAdmin);

  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "inbox template block",
  });
  const optOut = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });
  assert.equal(optOut.status, 409, JSON.stringify(optOut.body));
  assert.equal(getErrorCode(optOut.body), "active_send_blocked");

  assert.equal(metaCalls, 0);
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(outboundCount, 0);
});

test("inbox template send blocks unsafe conversations and records Meta failure without SENT success", async (t) => {
  const activeWaId = "5541991177803";
  const deletedWaId = "5541991177804";
  const anonymizedWaId = "5541991177805";
  const markedWaId = "5541991177806";
  const approved = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_failure_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso operacional.",
    },
  });
  const pending = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `inbox_pending_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "pending",
      content: "Aviso pendente.",
    },
  });
  for (const [waId, extra] of [
    [activeWaId, {}],
    [deletedWaId, { deletedAt: new Date("2026-01-02T10:00:00.000Z") }],
    [anonymizedWaId, { anonymizedAt: new Date("2026-01-02T10:00:00.000Z") }],
    [markedWaId, {}],
  ] as Array<[string, Record<string, Date>]>) {
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
        ...extra,
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        conversationKey: `${prefix}-business:${waId}`,
        channel: "whatsapp",
        provider: "meta",
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: businessAdmin.id,
        assignedTo: businessAdmin.name,
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  }
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: markedWaId,
      waIdCanonical: markedWaId,
      channel: "whatsapp",
      provider: "meta",
      name: "Usuario Anonimizado",
      phone: markedWaId,
      status: "INBOX_TEMPLATE_TEST",
    },
  });

  const deleted = await request<ErrorPayload>("POST", `/app/conversation/${deletedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(deleted.status, 404);
  assert.equal(getErrorCode(deleted.body), "conversation_not_found");

  const anonymized = await request<ErrorPayload>("POST", `/app/conversation/${anonymizedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(anonymized.status, 404);
  assert.equal(getErrorCode(anonymized.body), "conversation_not_found");

  const marked = await request<ErrorPayload>("POST", `/app/conversation/${markedWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(marked.status, 409);
  assert.equal(getErrorCode(marked.body), "anonymized_contact");

  const pendingResponse = await request<ErrorPayload>("POST", `/app/conversation/${activeWaId}/send-template`, businessAdmin, {
    templateId: pending.id,
  });
  assert.equal(pendingResponse.status, 409);
  assert.equal(getErrorCode(pendingResponse.body), "pending_review");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const failed = await request<ErrorPayload>("POST", `/app/conversation/${activeWaId}/send-template`, businessAdmin, {
    templateId: approved.id,
  });
  assert.equal(failed.status, 502, JSON.stringify(failed.body));
  assert.equal(getErrorCode(failed.body), "template_send_failed");

  const sentCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId: activeWaId, messageId: { startsWith: "inbox.template." }, status: "SENT" },
  });
  assert.equal(sentCount, 0);
  const failedOutbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId: activeWaId, messageId: { startsWith: "inbox.template." } },
  });
  assert.equal(failedOutbound.status, "FAILED");
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId: activeWaId } },
  });
  assert.equal(conversation.lastOutboundAt, null);
  const failedEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, waId: activeWaId, eventName: "inbox.template.failed" },
  });
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes(activeWaId), false);
});

test("canned replies are tenant scoped and managed by admin or supervisor", async () => {
  const agentCreate = await request<ErrorPayload>("POST", "/app/canned-replies", businessAgent, {
    title: "Saudacao",
    body: "Ola, tudo bem?",
  });
  assert.equal(agentCreate.status, 403);
  assert.equal(getErrorCode(agentCreate.body), "forbidden");

  const created = await request<{ ok: true; item: { id: string; title: string; active: boolean } }>(
    "POST",
    "/app/canned-replies?clientId=malicious",
    businessAdmin,
    {
      title: "Saudacao",
      category: "Atendimento",
      body: "Ola, tudo bem?",
    }
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.item.title, "Saudacao");
  assert.equal(created.body.item.active, true);

  const supervisorUpdate = await request<{ ok: true; item: { title: string } }>(
    "PATCH",
    `/app/canned-replies/${created.body.item.id}`,
    businessSupervisor,
    {
      title: "Saudacao revisada",
      category: "Atendimento",
      body: "Ola, tudo bem? Como posso ajudar?",
    }
  );
  assert.equal(supervisorUpdate.status, 200);
  assert.equal(supervisorUpdate.body.item.title, "Saudacao revisada");

  const agentList = await request<{ ok: true; items: Array<{ id: string }>; permissions: { canManage: boolean } }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAgent
  );
  assert.equal(agentList.status, 200);
  assert.equal(agentList.body.permissions.canManage, false);
  assert.ok(agentList.body.items.some((item) => item.id === created.body.item.id));

  const crossTenant = await request<ErrorPayload>("PATCH", `/app/canned-replies/${created.body.item.id}`, overrideAdmin, {
    title: "Nao deve alterar",
    body: "Tenant errado",
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(getErrorCode(crossTenant.body), "canned_reply_not_found");

  const disabled = await request<{ ok: true; item: { active: boolean } }>(
    "POST",
    `/app/canned-replies/${created.body.item.id}/disable`,
    businessAdmin
  );
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.item.active, false);

  const agentAfterDisable = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAgent
  );
  assert.equal(agentAfterDisable.status, 200);
  assert.equal(agentAfterDisable.body.items.some((item) => item.id === created.body.item.id), false);

  const adminWithInactive = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    "/app/canned-replies?includeInactive=true",
    businessAdmin
  );
  assert.equal(adminWithInactive.status, 200);
  assert.equal(adminWithInactive.body.items.some((item) => item.id === created.body.item.id), true);
});

test("inbox canned reply sends only in open owned WhatsApp conversations", async (t) => {
  const waId = "5541991177811";
  const created = await request<{ ok: true; item: { id: string; title: string; body: string } }>(
    "POST",
    "/app/canned-replies",
    businessAdmin,
    {
      title: "Resposta rapida",
      category: "Suporte",
      body: "Obrigado pelo contato. Vou verificar.",
    }
  );
  assert.equal(created.status, 201);
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  const replyInbound = await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      messageId: `wamid.canned.reply.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Mensagem para resposta pronta",
      allowlistHit: true,
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.canned.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: true;
    message: {
      type: string;
      status: string;
      bodyText: string;
      source: string;
      cannedReplyId: string;
      metaMessageId: string | null;
      actor: { source: string; userId: string; displayName: string | null };
    };
  }>("POST", `/app/conversation/${waId}/send-canned-reply?clientId=malicious`, businessAdmin, {
    cannedReplyId: created.body.item.id,
    replyTo: { kind: "inbound", id: replyInbound.id },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.message.type, "TEXT");
  assert.equal(response.body.message.status, "SENT");
  assert.equal(response.body.message.bodyText, created.body.item.body);
  assert.equal(response.body.message.source, "canned_reply");
  assert.equal(response.body.message.cannedReplyId, created.body.item.id);
  assert.equal(response.body.message.metaMessageId, `wamid.canned.${safeTemplatePrefix}`);
  assert.deepEqual(response.body.message.actor, {
    source: "human_inbox",
    userId: businessAdmin.id,
    displayName: businessAdmin.name,
  });
  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string; text?: { body?: string } }).to, waId);
  assert.equal((metaPayloads[0] as { text?: { body?: string } }).text?.body, created.body.item.body);
  assert.equal((metaPayloads[0] as { context?: { message_id?: string } }).context?.message_id, replyInbound.messageId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "admin.send." } },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(outbound.type, "TEXT");
  assert.equal(outbound.status, "SENT");
  assert.equal(outbound.bodyText, created.body.item.body);
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "canned_reply");
  assert.equal((outbound.rawPayload as Record<string, unknown>).cannedReplyId, created.body.item.id);
  const actorPayload = (outbound.rawPayload as Record<string, unknown>).actor as Record<string, unknown>;
  assert.equal(actorPayload.source, "human_inbox");
  assert.equal(actorPayload.userId, businessAdmin.id);
  assert.equal(JSON.stringify(actorPayload).includes(waId), false);
  const contextualReply = (outbound.rawPayload as Record<string, unknown>).contextualReply as Record<string, unknown>;
  assert.equal(contextualReply.replyToKind, "inbound");
  assert.equal(contextualReply.replyToInternalMessageId, replyInbound.id);
  assert.equal(contextualReply.replyToMetaMessagePresent, true);
  assert.equal(JSON.stringify(outbound.rawPayload).includes(waId), false);
  const outboundUsage = (outbound.rawPayload as Record<string, unknown>).metaUsage as Record<string, unknown>;
  assert.equal(outboundUsage.source, "canned_reply");
  assert.equal(outboundUsage.messageKind, "canned_reply");
  assert.equal(outboundUsage.metaCategory, "service");
  assert.equal(outboundUsage.billingRule, "current_service_free");
  assert.equal(outboundUsage.estimatedBillable, false);
  assert.equal(JSON.stringify(outboundUsage).includes(waId), false);

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "IN_PROGRESS");
  assert.equal(runtime.assignedUserId, businessAdmin.id);
  assert.equal(runtime.lastOutboundMessageId, outbound.messageId);

  const event = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, conversationId: conversation.id, eventName: "inbox.canned_reply.sent" },
  });
  assert.equal((event.payloadJson as Record<string, unknown>).source, "canned_reply");
  assert.equal(JSON.stringify(event.payloadJson).includes(waId), false);
  const usageEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, eventName: "meta.usage.estimated", messageId: outbound.messageId },
  });
  const usagePayload = usageEvent.payloadJson as Record<string, unknown>;
  assert.equal(usagePayload.source, "canned_reply");
  assert.equal(usagePayload.metaCategory, "service");
  assert.equal(usagePayload.billingRule, "current_service_free");
  assert.equal(JSON.stringify(usagePayload).includes(waId), false);
});

test("agent signature is tenant-scoped and applies only to human text and canned replies", async (t) => {
  const waId = "5541991177881";
  const templateWaId = "5541991177882";
  const canned = await request<{ ok: true; item: { id: string; body: string } }>(
    "POST",
    "/app/canned-replies",
    businessAdmin,
    {
      title: "Assinada",
      body: "Vou verificar sua solicitacao.",
    }
  );
  assert.equal(canned.status, 201);
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `signed_template_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, seu atendimento continua.",
    },
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-agent-signature-token",
      phoneNumberId: `phone-signature-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-agent-signature-token",
      phoneNumberId: `phone-signature-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  t.after(async () => {
    const existing = await prisma.tenantOperationalConfig.findUnique({
      where: { clientId: businessClientId },
      select: { config: true },
    });
    const existingConfig =
      existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
        ? (existing.config as Record<string, unknown>)
        : {};
    await prisma.tenantOperationalConfig.upsert({
      where: { clientId: businessClientId },
      create: {
        clientId: businessClientId,
        config: { agentSignature: { enabled: false, mode: "user_name", format: "bold_line" } },
      },
      update: {
        config: { ...existingConfig, agentSignature: { enabled: false, mode: "user_name", format: "bold_line" } },
      },
    });
  });

  for (const currentWaId of [waId, templateWaId]) {
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId: currentWaId,
        waIdCanonical: currentWaId,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen: true,
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId: currentWaId,
        waIdCanonical: currentWaId,
        conversationKey: `${prefix}-business:${currentWaId}`,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen: true,
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: businessAdmin.id,
        assignedTo: businessAdmin.name,
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  }

  const defaultSettings = await request<{
    ok: true;
    settings: { enabled: boolean; mode: string; format: string };
    permissions: { canUpdate: boolean };
  }>("GET", "/app/settings/agent-signature", businessSupervisor);
  assert.equal(defaultSettings.status, 200);
  assert.equal(defaultSettings.body.settings.enabled, false);
  assert.equal(defaultSettings.body.permissions.canUpdate, true);

  const agentSettings = await request<ErrorPayload>("GET", "/app/settings/agent-signature", businessAgent);
  assert.equal(agentSettings.status, 403);

  const updatedSettings = await request<{
    ok: true;
    settings: { enabled: boolean; mode: string; format: string };
  }>("PUT", "/app/settings/agent-signature?clientId=malicious", businessSupervisor, {
    enabled: true,
    mode: "ignored",
    format: "ignored",
  });
  assert.equal(updatedSettings.status, 200);
  assert.deepEqual(updatedSettings.body.settings, { enabled: true, mode: "user_name", format: "bold_line" });

  const governmentSettings = await request<{ ok: true; settings: { enabled: boolean } }>(
    "GET",
    "/app/settings/agent-signature",
    governmentAdmin
  );
  assert.equal(governmentSettings.status, 200);
  assert.equal(governmentSettings.body.settings.enabled, false);

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.signature.${metaPayloads.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const freeText = await request<{
    ok: true;
    message: {
      bodyText: string;
      agentSignatureApplied: boolean;
      agentSignatureFormat: string | null;
    };
  }>("POST", `/app/conversation/${waId}/send`, businessAdmin, {
    text: "Ola, vou verificar.",
  });
  const expectedSignatureName = businessAdmin.name.trim().split(/\s+/)[0];
  assert.equal(freeText.status, 200, JSON.stringify(freeText.body));
  assert.equal(freeText.body.message.bodyText, "Ola, vou verificar.");
  assert.equal(freeText.body.message.agentSignatureApplied, true);
  assert.equal(freeText.body.message.agentSignatureFormat, "bold_line");
  assert.equal((metaPayloads[0] as { text?: { body?: string } }).text?.body, `*${expectedSignatureName}*\nOla, vou verificar.`);

  const cannedResponse = await request<{
    ok: true;
    message: {
      bodyText: string;
      agentSignatureApplied: boolean;
      agentSignatureFormat: string | null;
    };
  }>("POST", `/app/conversation/${waId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: canned.body.item.id,
  });
  assert.equal(cannedResponse.status, 200, JSON.stringify(cannedResponse.body));
  assert.equal(cannedResponse.body.message.bodyText, canned.body.item.body);
  assert.equal(cannedResponse.body.message.agentSignatureApplied, true);
  assert.equal((metaPayloads[1] as { text?: { body?: string } }).text?.body, `*${expectedSignatureName}*\n${canned.body.item.body}`);

  const storedCanned = await request<{ ok: true; items: Array<{ id: string; body: string }> }>(
    "GET",
    "/app/canned-replies",
    businessAdmin
  );
  assert.equal(storedCanned.body.items.find((item) => item.id === canned.body.item.id)?.body, canned.body.item.body);

  const templateResponse = await request<{
    ok: true;
    message: {
      bodyText: string;
      agentSignatureApplied?: boolean;
    };
  }>("POST", `/app/conversation/${templateWaId}/send-template`, businessAdmin, {
    templateId: template.id,
    variables: { "1": "Maria" },
  });
  assert.equal(templateResponse.status, 200, JSON.stringify(templateResponse.body));
  assert.equal(templateResponse.body.message.bodyText, "Ola Maria, seu atendimento continua.");
  assert.equal(templateResponse.body.message.agentSignatureApplied ?? false, false);
  assert.equal((metaPayloads[2] as { template?: { name?: string } }).template?.name, template.name);

  const signedOutbounds = await prisma.outboundMessage.findMany({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "admin.send." } },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(signedOutbounds.length, 2);
  for (const outbound of signedOutbounds) {
    const rawPayload = outbound.rawPayload as Record<string, unknown>;
    assert.equal(rawPayload.agentSignatureApplied, true);
    assert.equal(rawPayload.agentSignatureFormat, "bold_line");
    assert.equal(JSON.stringify(rawPayload).includes(businessAdmin.email), false);
  }
  assert.deepEqual(signedOutbounds.map((item) => item.bodyText), [
    "Ola, vou verificar.",
    canned.body.item.body,
  ]);
});

test("conversation unread state cannot be marked by a non-assigned user", async () => {
  const waId = "5541991177884";
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await runtimeStorage.upsertConversation({
    clientKey: `${prefix}-business`,
    conversationKey: `${prefix}-business:${waId}`,
    waId,
    waIdCanonical: waId,
    firstSeenAt: "2026-01-01T08:00:00.000Z",
    lastInboundAt: "2026-01-01T08:00:00.000Z",
    window: { isOpen: true, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    handoff: { status: "active" },
    mode: "HUMAN",
    status: "IN_PROGRESS",
    assignedUserId: businessAdmin.id,
    assignedTo: businessAdmin.name,
    answers: {},
    chatbotActive: false,
  });

  const blocked = await request<ErrorPayload>("POST", `/app/conversation/${waId}/read-state`, businessAgent, {
    unread: true,
  });
  assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
  assert.equal(getErrorCode(blocked.body), "conversation_assigned_to_another_user");

  const readBlocked = await request<ErrorPayload>("POST", `/app/conversation/${waId}/read-state`, businessAgent, {
    unread: false,
    activityAt: "2026-01-01T08:01:00.000Z",
  });
  assert.equal(readBlocked.status, 403, JSON.stringify(readBlocked.body));
  assert.equal(getErrorCode(readBlocked.body), "conversation_assigned_to_another_user");

  const assigned = await request<{ ok: true }>("POST", `/app/conversation/${waId}/read-state`, businessAdmin, {
    unread: true,
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
});

test("inbox canned reply blocks closed, inactive, opt-out and anonymized conversations", async () => {
  const closedWaId = "5541991177812";
  const inactiveWaId = "5541991177813";
  const optOutWaId = "5541991177814";
  const markedWaId = "5541991177815";
  const deletedWaId = "5541991177816";
  const created = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Operacional",
    body: "Mensagem operacional.",
  });
  assert.equal(created.status, 201);
  const inactive = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Inativa",
    body: "Mensagem inativa.",
  });
  assert.equal(inactive.status, 201);
  await request("POST", `/app/canned-replies/${inactive.body.item.id}/disable`, businessAdmin);

  for (const [waId, windowIsOpen, extra] of [
    [closedWaId, false, {}],
    [inactiveWaId, true, {}],
    [optOutWaId, true, {}],
    [markedWaId, true, {}],
    [deletedWaId, true, { deletedAt: new Date("2026-01-02T10:00:00.000Z") }],
  ] as Array<[string, boolean, Record<string, Date>]>) {
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen,
        windowExpiresAt: new Date("2026-01-01T10:00:00.000Z"),
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
        ...extra,
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId,
        waIdCanonical: waId,
        conversationKey: `${prefix}-business:${waId}`,
        channel: "whatsapp",
        provider: "meta",
        windowIsOpen,
        windowExpiresAt: windowIsOpen ? new Date(Date.now() + 60 * 60 * 1000) : new Date("2026-01-01T10:00:00.000Z"),
        mode: "HUMAN",
        status: "IN_PROGRESS",
        assignedUserId: businessAdmin.id,
        assignedTo: businessAdmin.name,
        lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
      },
    });
  }
  await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: markedWaId,
      waIdCanonical: markedWaId,
      channel: "whatsapp",
      provider: "meta",
      name: "Usuario Anonimizado",
      phone: markedWaId,
      status: "CANNED_REPLY_TEST",
    },
  });
  await recordContactOptOut({
    clientId: businessClientId,
    waId: optOutWaId,
    channel: "whatsapp",
    source: "test",
    reason: "test",
    requestedAt: new Date("2026-01-02T10:00:00.000Z"),
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });

  const closed = await request<ErrorPayload>("POST", `/app/conversation/${closedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(closed.status, 409);
  assert.equal(getErrorCode(closed.body), "window_closed");

  const disabled = await request<ErrorPayload>("POST", `/app/conversation/${inactiveWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: inactive.body.item.id,
  });
  assert.equal(disabled.status, 409);
  assert.equal(getErrorCode(disabled.body), "canned_reply_inactive");

  const optOut = await request<ErrorPayload>("POST", `/app/conversation/${optOutWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(optOut.status, 409);
  assert.equal(getErrorCode(optOut.body), "active_send_blocked");

  const marked = await request<ErrorPayload>("POST", `/app/conversation/${markedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(marked.status, 409);
  assert.equal(getErrorCode(marked.body), "anonymized_contact");

  const deleted = await request<ErrorPayload>("POST", `/app/conversation/${deletedWaId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(deleted.status, 404);
  assert.equal(getErrorCode(deleted.body), "conversation_not_found");
});

test("inbox canned reply records safe failure without sent event", async (t) => {
  const waId = "5541991177817";
  const created = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Falha Meta",
    body: "Teste de falha.",
  });
  assert.equal(created.status, 201);
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "test-canned-token",
      phoneNumberId: `phone-canned-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T08:00:00.000Z"),
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const failed = await request<ErrorPayload>("POST", `/app/conversation/${waId}/send-canned-reply`, businessAdmin, {
    cannedReplyId: created.body.item.id,
  });
  assert.equal(failed.status, 502);
  assert.equal(getErrorCode(failed.body), "message_send_failed");

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, waId, messageId: { startsWith: "admin.send." } },
  });
  assert.equal(outbound.status, "FAILED");
  assert.equal((outbound.rawPayload as Record<string, unknown>).source, "canned_reply");

  const sentCount = await prisma.event.count({
    where: { clientId: businessClientId, waId, eventName: "inbox.canned_reply.sent" },
  });
  assert.equal(sentCount, 0);
  const failedEvent = await prisma.event.findFirstOrThrow({
    where: { clientId: businessClientId, waId, eventName: "inbox.canned_reply.failed" },
  });
  assert.equal(JSON.stringify(failedEvent.payloadJson).includes(waId), false);
});

test("template routes require auth and bulk sync fails safely without Meta config", async () => {
  const list = await requestUnauth<ErrorPayload>("GET", "/app/templates");
  assert.equal(list.status, 401);
  assert.equal(getErrorCode(list.body), "missing_token");

  const sync = await requestUnauth<ErrorPayload>("POST", "/app/templates/sync");
  assert.equal(sync.status, 401);
  assert.equal(getErrorCode(sync.body), "missing_token");

  const response = await request<{
    error: string;
    message: string;
    summary: {
      checked: number;
      updated: number;
      approved: number;
      pending: number;
      rejected: number;
      failed: number;
      lastSyncedAt: string | null;
    };
  }>("POST", "/app/templates/sync?clientId=malicious", businessAdmin);

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "meta_config_missing");
  assert.equal(JSON.stringify(response.body).includes("token"), false);
});

test("bulk template sync can use env WABA only when env phone belongs to tenant", async (t) => {
  const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = "test-env-business-token";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "test-env-waba";
  process.env.WHATSAPP_PHONE_NUMBER_ID = `env-phone-${safeTemplatePrefix}`;
  const envPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  t.after(() => {
    if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
    if (originalWabaId === undefined) delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    else process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = originalWabaId;
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
  });

  await prisma.tenantMetaConfig.deleteMany({ where: { clientId: businessClientId } });
  await prisma.waPhoneNumber.create({
    data: {
      clientId: businessClientId,
      phoneNumberId: envPhoneNumberId,
      display: "Env matched phone",
    },
  });
  const templateName = `env_sync_${safeTemplatePrefix}`;
  await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: templateName,
      category: "UTILITY",
      language: "pt_BR",
      content: "Aviso institucional de teste",
      status: "pending",
    },
  });

  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const authHeaders: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      urls.push(url);
      authHeaders.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: `meta-${templateName}`,
              name: templateName,
              language: "pt_BR",
              category: "UTILITY",
              status: "APPROVED",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{
    ok: boolean;
    summary: { checked: number; approved: number; failed: number };
  }>("POST", "/app/templates/sync", businessAdmin);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.summary.checked > 0, true);
  assert.equal(response.body.summary.approved > 0, true);
  assert.equal(response.body.summary.failed, 0);
  assert.equal(urls.some((url) => url.includes("/test-env-waba/message_templates")), true);
  assert.equal(authHeaders.every((value) => value === "Bearer test-env-business-token"), true);
});

test("tenant template request stays in internal review and ignores auto submit", async (t) => {
  const originalNotifyEmail = process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  const originalFallbackEmail = process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  t.after(() => {
    if (originalNotifyEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = originalNotifyEmail;
    }
    if (originalFallbackEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = originalFallbackEmail;
    }
    setTemplateReviewNotificationSenderForTests(null);
  });

  const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
  setTemplateReviewNotificationSenderForTests(async (message) => {
    sentEmails.push({ to: message.to, subject: message.subject, text: message.text });
  });
  const templatesBefore = await prisma.template.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: true;
    request: {
      id: string;
      name: string;
      category: string;
      language: string;
      status: string;
      statusLabel: string;
      variableDetails: Array<{ key: string; description: string; example: string }>;
    };
    notification: { attempted: boolean; delivered: boolean };
    warnings: string[];
  }>("POST", "/app/templates/request?clientId=malicious", businessAdmin, {
    name: `utility_request_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, seu atendimento foi atualizado.",
    variableDetails: [{ key: "1", description: "Nome do contato", example: "Maria" }],
    autoSubmit: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "requested");
  assert.equal(response.body.request.statusLabel, "Em análise pela Re7online");
  assert.equal(response.body.request.language, "pt_BR");
  assert.deepEqual(response.body.request.variableDetails, [
    { key: "1", description: "Nome do contato", example: "Maria" },
  ]);
  assert.equal(response.body.notification.delivered, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "re7online@gmail.com");
  assert.match(sentEmails[0].subject, /Nova solicitação de template/);
  assert.match(sentEmails[0].text, /Campaigns Feature Business|campaigns-feature/);

  const templatesAfter = await prisma.template.count({ where: { clientId: businessClientId } });
  assert.equal(templatesAfter, templatesBefore);
  const createdEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.created",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(createdEvent);
  assert.equal((createdEvent.payloadJson as Record<string, unknown>).templateName, `utility_request_${safeTemplatePrefix}`);
});

test("template request validation blocks unsafe variables and missing fields", async () => {
  const missing = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: "",
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola",
  });
  assert.equal(missing.status, 400);
  assert.equal(getErrorCode(missing.body), "validation_error");

  const skipped = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `bad_vars_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{2}}",
    variableDetails: [{ key: "2", description: "Nome", example: "Maria" }],
  });
  assert.equal(skipped.status, 400);
  assert.equal(getErrorCode(skipped.body), "validation_error");

  const atEdge = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `edge_vars_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "{{1}} recebeu atualizacao",
    variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
  });
  assert.equal(atEdge.status, 400);
  assert.equal(getErrorCode(atEdge.body), "validation_error");

  const missingExample = await request<ErrorPayload>("POST", "/app/templates/request", businessAdmin, {
    name: `missing_example_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, sua solicitacao foi atualizada.",
    variableDetails: [{ key: "1", description: "Nome", example: "" }],
  });
  assert.equal(missingExample.status, 400);
  assert.equal(getErrorCode(missingExample.body), "validation_error");
});

test("template request email failure is audited without failing creation", async (t) => {
  const originalNotifyEmail = process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  const originalFallbackEmail = process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  t.after(() => {
    if (originalNotifyEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = originalNotifyEmail;
    }
    if (originalFallbackEmail === undefined) {
      delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
    } else {
      process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = originalFallbackEmail;
    }
    setTemplateReviewNotificationSenderForTests(null);
  });

  setTemplateReviewNotificationSenderForTests(async () => {
    throw new Error("smtp_test_failure token=supersecret Bearer abc123");
  });
  const response = await request<{
    ok: true;
    request: { id: string; status: string };
    notification: { attempted: boolean; delivered: boolean; reason: string };
  }>("POST", "/app/templates/request", businessAdmin, {
    name: `notification_failure_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Aviso institucional",
    variableDetails: [],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "requested");
  assert.equal(response.body.notification.delivered, false);
  assert.equal(response.body.notification.reason.includes("supersecret"), false);
  assert.equal(response.body.notification.reason.includes("abc123"), false);

  const event = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.notification_failed",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(event);
  const payload = event.payloadJson as Record<string, unknown>;
  assert.equal(payload.recipient, "re7online@gmail.com");
  assert.equal(JSON.stringify(payload).includes("supersecret"), false);
  assert.equal(JSON.stringify(payload).includes("abc123"), false);
});

test("tenant template request listing is scoped to tenant", async () => {
  const ownRequestName = `tenant_visible_${safeTemplatePrefix}`;
  await prisma.templateRequest.createMany({
    data: [
      {
        clientId: businessClientId,
        name: ownRequestName,
        category: "UTILITY",
        content: "Visivel",
        status: "requested",
      },
      {
        clientId: overrideClientId,
        name: `tenant_hidden_${safeTemplatePrefix}`,
        category: "UTILITY",
        content: "Oculto",
        status: "requested",
      },
    ],
  });
  const response = await request<{ ok: true; items: Array<{ name: string }> }>(
    "GET",
    "/app/templates/requests?clientId=malicious",
    businessAdmin
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.items.some((item) => item.name === ownRequestName), true);
  assert.equal(response.body.items.some((item) => item.name === `tenant_hidden_${safeTemplatePrefix}`), false);

  const ownRequest = await prisma.templateRequest.findFirstOrThrow({
    where: { clientId: businessClientId, name: ownRequestName },
    select: { id: true },
  });
  const cancelled = await request<{
    ok: true;
    request: { id: string; status: string; statusLabel: string };
  }>("POST", `/app/templates/requests/${ownRequest.id}/cancel?clientId=malicious`, businessAdmin);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.request.status, "cancelled");
  assert.equal(cancelled.body.request.statusLabel, "Cancelada");

  const cancelEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.cancelled",
      payloadJson: { path: ["templateRequestId"], equals: ownRequest.id },
    },
    select: { payloadJson: true },
  });
  assert.ok(cancelEvent);
  assert.equal((cancelEvent.payloadJson as Record<string, unknown>).source, "app");

  const otherRequest = await prisma.templateRequest.findFirstOrThrow({
    where: { clientId: overrideClientId, name: `tenant_hidden_${safeTemplatePrefix}` },
    select: { id: true },
  });
  const crossTenantCancel = await request<ErrorPayload>(
    "POST",
    `/app/templates/requests/${otherRequest.id}/cancel`,
    businessAdmin
  );
  assert.equal(crossTenantCancel.status, 404);
});

test("admin can list and edit template requests without exposing tokens", async () => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `admin_review_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Ola {{1}}",
      variables: {
        language: "pt_BR",
        variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
        variables: [{ key: "1", description: "Nome", example: "Maria" }],
      },
      status: "requested",
    },
  });
  const list = await requestAdmin<{
    ok: true;
    items: Array<{ id: string; clientKey: string; language: string; variableDetails: unknown[] }>;
  }>("GET", `/admin/templates/requests?clientKey=${encodeURIComponent(`${prefix}-business`)}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.some((item) => item.id === created.id), true);
  assert.equal(JSON.stringify(list.body).includes("businessToken"), false);

  const updated = await requestAdmin<{
    ok: true;
    request: { id: string; status: string; name: string; language: string };
  }>("PATCH", `/admin/templates/requests/${created.id}`, {
    name: `admin_review_updated_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Ola {{1}}, tudo bem?",
    variableDetails: [{ key: "1", description: "Nome", example: "Maria" }],
    notes: "Revisado internamente",
    status: "review_started",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.request.status, "review_started");
  assert.equal(updated.body.request.name, `admin_review_updated_${safeTemplatePrefix}`);
  assert.equal(updated.body.request.language, "pt_BR");

  const cancel = await requestAdmin<{
    ok: true;
    request: { id: string; status: string; statusLabel: string };
  }>("POST", `/admin/templates/requests/${created.id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.request.status, "cancelled");
  assert.equal(cancel.body.request.statusLabel, "Cancelada");

  const cancelEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "template.request.cancelled",
      payloadJson: { path: ["templateRequestId"], equals: created.id },
    },
    select: { payloadJson: true },
  });
  assert.ok(cancelEvent);
  assert.equal((cancelEvent.payloadJson as Record<string, unknown>).source, "admin");
});

test("submitted and closed template requests are locked for review actions", async () => {
  const submitted = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submitted_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso ja submetido",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "submitted_to_meta",
    },
  });
  const cancelled = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `cancelled_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso cancelado",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "cancelled",
    },
  });
  const metaApproved = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `meta_approved_locked_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso aprovado",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "meta_approved",
    },
  });

  const editSubmitted = await requestAdmin<ErrorPayload>("PATCH", `/admin/templates/requests/${submitted.id}`, {
    name: `submitted_locked_updated_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    content: "Conteudo alterado indevidamente",
    variableDetails: [],
  });
  assert.equal(editSubmitted.status, 409);
  assert.equal(getErrorCode(editSubmitted.body), "template_request_locked");

  const resubmit = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${submitted.id}/submit`);
  assert.equal(resubmit.status, 409);
  assert.equal(getErrorCode(resubmit.body), "template_already_submitted");

  const submitCancelled = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${cancelled.id}/submit`);
  assert.equal(submitCancelled.status, 409);
  assert.equal(getErrorCode(submitCancelled.body), "template_request_locked");

  const cancelMetaApproved = await requestAdmin<ErrorPayload>("POST", `/admin/templates/requests/${metaApproved.id}/cancel`);
  assert.equal(cancelMetaApproved.status, 409);
  assert.equal(getErrorCode(cancelMetaApproved.body), "template_request_not_cancellable");
});

test("admin submit requires tenant Meta config and does not expose tokens", async () => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submit_without_meta_${safeTemplatePrefix}`,
      category: "UTILITY",
      content: "Aviso institucional",
      variables: { language: "pt_BR", variableDetails: [], variables: [] },
      status: "internal_approved",
    },
  });
  const response = await requestAdmin<ErrorPayload>(
    "POST",
    `/admin/templates/requests/${created.id}/submit`
  );
  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "meta_config_missing");
  assert.equal(JSON.stringify(response.body).includes("businessToken"), false);
  assert.equal(JSON.stringify(response.body).includes("token"), false);
});

test("admin submit uses saved variable examples in Meta payload", async (t) => {
  const created = await prisma.templateRequest.create({
    data: {
      clientId: businessClientId,
      name: `submit_with_example_${safeTemplatePrefix}`,
      category: "UTILITY",
      content:
        "Olá {{1}}, tudo bem? Estamos retornando sobre sua solicitação. Responda esta mensagem para continuar o atendimento com nossa equipe.",
      variables: {
        language: "pt_BR",
        variableDetails: [{ key: "1", description: "nome do contato", example: "Maria" }],
        variables: [{ key: "1", description: "nome do contato", example: "Maria" }],
      },
      status: "internal_approved",
    },
  });
  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "test-business-token",
      wabaId: "test-waba-id",
      rawPayload: {},
    },
    update: {
      businessToken: "test-business-token",
      wabaId: "test-waba-id",
      rawPayload: {},
    },
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ id: `meta-${safeTemplatePrefix}`, status: "PENDING" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await requestAdmin<{
    ok: boolean;
    request: { status: string };
    submission: { submitted: boolean; status: string; templateId: string; errorMessage: string | null };
  }>("POST", `/admin/templates/requests/${created.id}/submit`);
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.request.status, "submitted_to_meta");
  assert.equal(response.body.submission.submitted, true);
  assert.equal(metaPayloads.length, 1);
  assert.deepEqual(metaPayloads[0], {
    name: `submit_with_example_${safeTemplatePrefix}`,
    category: "UTILITY",
    language: "pt_BR",
    components: [
      {
        type: "BODY",
        text:
          "Olá {{1}}, tudo bem? Estamos retornando sobre sua solicitação. Responda esta mensagem para continuar o atendimento com nossa equipe.",
        example: {
          body_text: [["Maria"]],
        },
      },
    ],
  });
});

test("campaign audience preview is tenant scoped and does not create operational records", async () => {
  const eligibleWaId = "5541991177001";
  const blockedWaId = "5541991177002";
  const otherTenantWaId = "5541991177003";
  const anonymizedWaId = "5541******7004:anon001";

  await prisma.lead.createMany({
    data: [
      {
        tenantId: businessClientId,
        waId: eligibleWaId,
        waIdCanonical: eligibleWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Cliente Elegivel",
        phone: eligibleWaId,
        company: "Empresa Elegivel",
        city: "Curitiba",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: blockedWaId,
        waIdCanonical: blockedWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Cliente Bloqueado",
        phone: blockedWaId,
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: `${prefix}-instagram-audience`,
        channel: "instagram",
        provider: "meta",
        name: "Contato Instagram",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: businessClientId,
        waId: anonymizedWaId,
        waIdCanonical: anonymizedWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Usuario Anonimizado",
        phone: "5541991177004",
        status: "RETORNO_FUTURO",
      },
      {
        tenantId: overrideClientId,
        waId: otherTenantWaId,
        waIdCanonical: otherTenantWaId,
        channel: "whatsapp",
        provider: "meta",
        name: "Outro Tenant",
        phone: otherTenantWaId,
        status: "RETORNO_FUTURO",
      },
    ],
  });
  await recordContactOptOut({
    clientId: businessClientId,
    waId: blockedWaId,
    source: "test",
    reason: "preview block",
  });

  const campaignsBefore = await prisma.campaign.count({ where: { clientId: businessClientId } });
  const eventsBefore = await prisma.event.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: boolean;
    summary: {
      total: number;
      eligible: number;
      blocked: number;
      blockedByReason: Array<{ reason: string; label: string; count: number }>;
    };
    items: Array<{
      leadId: string;
      displayName: string | null;
      phoneDisplay: string | null;
      identifierDisplay: string;
      channel: string | null;
      eligible: boolean;
      blockedReason: string | null;
      activeOptOut: boolean;
      isAnonymized: boolean;
    }>;
    pagination: { total: number; page: number; limit: number };
  }>(
    "GET",
    "/app/campaigns/audience-preview?status=RETORNO_FUTURO&limit=20&clientId=malicious",
    businessAdmin
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.summary.total, 4);
  assert.equal(response.body.summary.eligible, 1);
  assert.equal(response.body.summary.blocked, 3);
  assert.equal(response.body.items.some((item) => item.displayName === "Outro Tenant"), false);

  const eligible = response.body.items.find((item) => item.displayName === "Cliente Elegivel");
  assert.ok(eligible);
  assert.equal(eligible.eligible, true);
  assert.notEqual(eligible.phoneDisplay, eligibleWaId);
  assert.equal(JSON.stringify(eligible).includes(eligibleWaId), false);

  const blocked = response.body.items.find((item) => item.displayName === "Cliente Bloqueado");
  assert.ok(blocked);
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.activeOptOut, true);
  assert.equal(blocked.blockedReason, "active_send_blocked");

  const anonymized = response.body.items.find((item) => item.displayName === "Usuario Anonimizado");
  assert.ok(anonymized);
  assert.equal(anonymized.eligible, false);
  assert.equal(anonymized.isAnonymized, true);
  assert.equal(anonymized.blockedReason, "anonymized_contact");
  assert.equal(JSON.stringify(anonymized).includes("5541991177004"), false);

  const instagram = response.body.items.find((item) => item.displayName === "Contato Instagram");
  assert.ok(instagram);
  assert.equal(instagram.eligible, false);
  assert.equal(instagram.blockedReason, "non_whatsapp_channel");

  const anonymizedSummary = response.body.summary.blockedByReason.find(
    (item) => item.reason === "anonymized_contact"
  );
  assert.ok(anonymizedSummary);
  assert.equal(anonymizedSummary.label, "Contato anonimizado");
  assert.equal(anonymizedSummary.count, 1);

  const campaignsAfter = await prisma.campaign.count({ where: { clientId: businessClientId } });
  const eventsAfter = await prisma.event.count({ where: { clientId: businessClientId } });
  assert.equal(campaignsAfter, campaignsBefore);
  assert.equal(eventsAfter, eventsBefore);
});

test("campaign draft uses approved template and stores safe seed without sending", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_template_${prefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso institucional",
    },
  });
  const eligibleWaId = "5541991188001";
  const duplicateWaId = "5541991188002";
  const optOutWaId = "5541991188003";
  const [eligible, duplicateA, duplicateB, optOut, anonymized, instagram] =
    await Promise.all([
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: eligibleWaId,
          waIdCanonical: eligibleWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Elegivel",
          phone: eligibleWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: duplicateWaId,
          waIdCanonical: duplicateWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Duplicado A",
          phone: duplicateWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: `${duplicateWaId}9`,
          waIdCanonical: `${duplicateWaId}9`,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Duplicado B",
          phone: duplicateWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: optOutWaId,
          waIdCanonical: optOutWaId,
          channel: "whatsapp",
          provider: "meta",
          name: "Draft Opt Out",
          phone: optOutWaId,
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: "5541******8804:anon001",
          waIdCanonical: "5541******8804:anon001",
          channel: "whatsapp",
          provider: "meta",
          name: "Usuario Anonimizado",
          phone: "5541991188004",
          status: "RETORNO_FUTURO",
        },
      }),
      prisma.lead.create({
        data: {
          tenantId: businessClientId,
          waId: `${prefix}-draft-instagram`,
          channel: "instagram",
          provider: "meta",
          name: "Draft Instagram",
          status: "RETORNO_FUTURO",
        },
      }),
    ]);
  await recordContactOptOut({
    clientId: businessClientId,
    waId: optOutWaId,
    source: "test",
    reason: "draft block",
  });

  const outboundBefore = await prisma.outboundMessage.count({ where: { clientId: businessClientId } });
  const response = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number; sentCount: number; blockedCount: number };
    draft: {
      summary: {
        requested: number;
        accepted: number;
        blocked: number;
        duplicatesRemoved: number;
        blockedByReason: Array<{ reason: string; label: string; count: number }>;
      };
      recipients: Array<{ leadId: string; phoneDisplay: string | null; identifierDisplay: string }>;
    };
  }>("POST", "/app/campaigns/drafts?clientId=malicious", businessAdmin, {
    name: "Rascunho CRM",
    templateId: template.id,
    selectedLeadIds: [
      eligible.id,
      duplicateA.id,
      duplicateB.id,
      optOut.id,
      anonymized.id,
      instagram.id,
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.campaign.status, "draft");
  assert.equal(response.body.campaign.totalRecipients, 2);
  assert.equal(response.body.campaign.sentCount, 0);
  assert.equal(response.body.campaign.blockedCount, 0);
  assert.equal(response.body.draft.summary.requested, 6);
  assert.equal(response.body.draft.summary.accepted, 2);
  assert.equal(response.body.draft.summary.blocked, 4);
  assert.equal(response.body.draft.summary.duplicatesRemoved, 1);
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "anonymized_contact" && item.label === "Contato anonimizado"
    )
  );
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "active_send_blocked"
    )
  );
  assert.ok(
    response.body.draft.summary.blockedByReason.some(
      (item) => item.reason === "non_whatsapp_channel"
    )
  );
  assert.equal(JSON.stringify(response.body).includes(eligibleWaId), false);

  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: response.body.campaign.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const seedPayload = seed.payloadJson as Record<string, unknown>;
  assert.equal(seedPayload.templateId, template.id);
  assert.equal(seedPayload.source, "crm_audience_preview");
  assert.deepEqual(seedPayload.leadIds, [
    eligible.id,
    duplicateA.id,
    duplicateB.id,
    optOut.id,
    anonymized.id,
    instagram.id,
  ]);

  const outboundAfter = await prisma.outboundMessage.count({ where: { clientId: businessClientId } });
  const sendEvents = await prisma.event.count({
    where: {
      clientId: businessClientId,
      eventName: { in: ["campaign.draft.sent", "campaign.message.sent", "campaign.message.failed"] },
      messageId: response.body.campaign.id,
    },
  });
  assert.equal(outboundAfter, outboundBefore);
  assert.equal(sendEvents, 0);

  const detail = await request<{
    campaign: {
      status: string;
      metaSummary: { totalSent: number; totalDelivered: number; totalRead: number; totalFailed: number };
      messagesMetaStatus: Array<{ status: string }>;
      draftReview: { recipients: Array<{ phoneDisplay: string | null; identifierDisplay: string }> };
    };
  }>("GET", `/app/campaigns/${response.body.campaign.id}`, businessAdmin);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.campaign.status, "draft");
  assert.equal(detail.body.campaign.metaSummary.totalSent, 0);
  assert.equal(detail.body.campaign.metaSummary.totalDelivered, 0);
  assert.equal(detail.body.campaign.metaSummary.totalRead, 0);
  assert.equal(detail.body.campaign.metaSummary.totalFailed, 0);
  assert.equal(detail.body.campaign.messagesMetaStatus.length, 0);
  assert.equal(detail.body.campaign.draftReview.recipients.length, 2);
  assert.equal(JSON.stringify(detail.body).includes(eligibleWaId), false);

  const crossTenantDiscard = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/discard`,
    overrideAdmin
  );
  assert.equal(crossTenantDiscard.status, 404);
  assert.equal(getErrorCode(crossTenantDiscard.body), "campaign_not_found");

  const discarded = await request<{
    ok: boolean;
    campaign: { id: string; status: string; sentCount: number; blockedCount: number };
  }>("POST", `/app/campaigns/${response.body.campaign.id}/discard`, businessAdmin);
  assert.equal(discarded.status, 200);
  assert.equal(discarded.body.ok, true);
  assert.equal(discarded.body.campaign.status, "cancelled");
  assert.equal(discarded.body.campaign.sentCount, 0);
  assert.equal(discarded.body.campaign.blockedCount, 0);

  const discardEvent = await prisma.event.count({
    where: {
      clientId: businessClientId,
      eventName: "campaign.draft.discarded",
      messageId: response.body.campaign.id,
    },
  });
  assert.equal(discardEvent, 1);

  const sendDiscarded = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(sendDiscarded.status, 409);
  assert.equal(getErrorCode(sendDiscarded.body), "campaign_not_draft");

  const discardAgain = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${response.body.campaign.id}/discard`,
    businessAdmin
  );
  assert.equal(discardAgain.status, 409);
  assert.equal(getErrorCode(discardAgain.body), "campaign_not_draft");

  const sendingCampaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "Campanha em envio",
      templateName: template.name,
      status: "sending",
      totalRecipients: 1,
      sentCount: 0,
      blockedCount: 0,
    },
  });
  const discardSending = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${sendingCampaign.id}/discard`,
    businessAdmin
  );
  assert.equal(discardSending.status, 409);
  assert.equal(getErrorCode(discardSending.body), "campaign_not_draft");
});

test("campaign draft send revalidates recipients before starting", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_send_template_${prefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola",
    },
  });
  const waId = "5541991189001";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Enviar Draft",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho para envio",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");
  assert.equal(created.body.campaign.totalRecipients, 1);

  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "blocked before explicit send",
  });

  const send = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${created.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(send.status, 400);
  assert.equal(getErrorCode(send.body), "no_eligible_recipients");

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  assert.equal(campaign?.status, "draft");
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, waId },
  });
  const sentEventCount = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: created.body.campaign.id,
      eventName: "campaign.draft.sent",
    },
  });
  assert.equal(outboundCount, 0);
  assert.equal(sentEventCount, 0);
});

test("campaign draft requires mappings for approved template variables", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_required_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua solicitacao foi atualizada.",
    },
  });
  const waId = "5541991189101";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Sem Mapeamento",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const response = await request<ErrorPayload>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho sem variavel",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "template_variables_required");
  const campaigns = await prisma.campaign.count({
    where: { clientId: businessClientId, name: "Rascunho sem variavel" },
  });
  assert.equal(campaigns, 0);
});

test("campaign draft explicit send blocks locally disabled template without sending", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_local_disabled_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso sem variaveis.",
    },
  });
  const waId = "5541991189105";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Template Inativo",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho com template inativado",
    templateId: template.id,
    selectedLeadIds: [lead.id],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");

  const disabled = await request("POST", `/app/templates/${template.id}/disable`, businessAdmin);
  assert.equal(disabled.status, 200);

  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaCalls += 1;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const send = await request<ErrorPayload>(
      "POST",
      `/app/campaigns/${created.body.campaign.id}/send`,
      businessAdmin
    );
    assert.equal(send.status, 400);
    assert.equal(getErrorCode(send.body), "template_locally_disabled");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  const outboundCount = await prisma.outboundMessage.count({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
  });
  const sentEventCount = await prisma.event.count({
    where: {
      clientId: businessClientId,
      messageId: created.body.campaign.id,
      eventName: "campaign.draft.sent",
    },
  });
  assert.equal(campaign?.status, "draft");
  assert.equal(outboundCount, 0);
  assert.equal(sentEventCount, 0);
  assert.equal(metaCalls, 0);
});

test("campaign draft rejects invalid fixed variable mapping", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_invalid_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua solicitacao foi atualizada.",
    },
  });
  const waId = "5541991189102";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Fixo Vazio",
      phone: waId,
      status: "RETORNO_FUTURO",
    },
  });

  const response = await request<ErrorPayload>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho fixo vazio",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [{ position: "1", source: "fixed", value: "" }],
  });

  assert.equal(response.status, 400);
  assert.equal(getErrorCode(response.body), "invalid_template_variable_mapping");
});

test("campaign draft explicit send renders mapped variables per contact", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_send_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua empresa {{2}} em {{3}} recebeu {{4}}.",
      variables: ["nome", "empresa", "cidade", "aviso"],
    },
  });
  const waId = "5541991189103";
  const normalizedWaId = "55419991189103";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Cliente Variavel",
      phone: waId,
      company: "Empresa Variavel",
      city: "Curitiba",
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho variavel",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [
      { position: "1", source: "contact.displayName" },
      { position: "2", source: "lead.companyName" },
      { position: "3", source: "lead.city" },
      { position: "4", source: "fixed", value: "atualizacao" },
    ],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.campaign.status, "draft");

  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: created.body.campaign.id,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const seedPayload = seed.payloadJson as Record<string, unknown>;
  assert.deepEqual(seedPayload.templateVariableMappings, [
    { position: "1", source: "contact.displayName" },
    { position: "2", source: "lead.companyName" },
    { position: "3", source: "lead.city" },
    { position: "4", source: "fixed", value: "atualizacao" },
  ]);
  assert.equal(JSON.stringify(seedPayload).includes(waId), false);

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const sent = await request<{
    ok: true;
    campaign: { id: string; status: string };
    send: {
      summary: {
        accepted: number;
        blocked: number;
      };
    };
  }>("POST", `/app/campaigns/${created.body.campaign.id}/send`, businessAdmin);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.send.summary.accepted, 1);
  assert.equal(sent.body.send.summary.blocked, 0);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
    });
    return count === 1;
  });
  assert.equal(metaPayloads.length, 1);
  assert.deepEqual(metaPayloads[0], {
    messaging_product: "whatsapp",
    to: normalizedWaId,
    type: "template",
    template: {
      name: template.name,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Cliente Variavel" },
            { type: "text", text: "Empresa Variavel" },
            { type: "text", text: "Curitiba" },
            { type: "text", text: "atualizacao" },
          ],
        },
      ],
    },
  });

  const outbound = await prisma.outboundMessage.findFirst({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${created.body.campaign.id}.` } },
    select: { rawPayload: true },
  });
  assert.ok(outbound);
  assert.deepEqual((outbound.rawPayload as Record<string, unknown>).components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Cliente Variavel" },
        { type: "text", text: "Empresa Variavel" },
        { type: "text", text: "Curitiba" },
        { type: "text", text: "atualizacao" },
      ],
    },
  ]);
});

test("campaign send resolves safe ninth digit variant to existing conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_bridge_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso de atendimento",
    },
  });
  const conversationWaId = "554112349614";
  const inputWaId = "5541912349614";
  const previousOutboundAt = new Date("2026-01-01T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: conversationWaId,
      waIdCanonical: conversationWaId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      lastOutboundAt: previousOutboundAt,
    },
    select: { id: true },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: conversationWaId,
      waIdCanonical: conversationWaId,
      conversationKey: `${prefix}-business:${conversationWaId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "IN_PROGRESS",
      assignedUserId: businessAdmin.id,
      assignedTo: businessAdmin.name,
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      lastOutboundAt: previousOutboundAt,
    },
  });
  await seedHybridRuntimeState({
    waId: conversationWaId,
    waIdCanonical: conversationWaId,
    firstSeenAt: "2026-01-01T09:00:00.000Z",
    lastInboundAt: "2026-01-01T09:00:00.000Z",
    lastOutboundAt: previousOutboundAt.toISOString(),
    window: { isOpen: false },
    mode: "HUMAN",
    status: "IN_PROGRESS",
    assignedUserId: businessAdmin.id,
    assignedTo: businessAdmin.name,
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.bridge.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string; status: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio com variacao segura",
      templateId: template.id,
      recipients: [inputWaId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    });
    return count === 1;
  });

  assert.equal(metaPayloads.length, 1);
  assert.equal((metaPayloads[0] as { to?: string }).to, conversationWaId);

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    select: { waId: true, waIdCanonical: true, rawPayload: true },
  });
  assert.equal(outbound.waId, conversationWaId);
  assert.equal(outbound.waIdCanonical, conversationWaId);
  const resolution = (outbound.rawPayload as { recipientResolution?: { matchedBy?: string; inputLast4?: string } })
    .recipientResolution;
  assert.equal(resolution?.matchedBy, "brazil_ninth_digit_safe");
  assert.equal(resolution?.inputLast4, "9614");
  assert.equal(JSON.stringify(resolution).includes(inputWaId), false);

  const updatedConversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { lastOutboundAt: true },
  });
  if ((updatedConversation.lastOutboundAt?.getTime() ?? 0) <= previousOutboundAt.getTime()) {
    await waitFor(async () => {
      const refreshed = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: { lastOutboundAt: true },
      });
      return (refreshed?.lastOutboundAt?.getTime() ?? 0) > previousOutboundAt.getTime();
    });
  }

  const runtimeStates = await prisma.conversationRuntimeState.findMany({
    where: {
      clientId: businessClientId,
      OR: [{ waId: conversationWaId }, { waId: inputWaId }],
    },
    select: { waId: true, mode: true, status: true, assignedUserId: true, lastOutboundMessageId: true },
  });
  assert.equal(runtimeStates.length, 1);
  assert.equal(runtimeStates[0].waId, conversationWaId);
  assert.equal(runtimeStates[0].mode, "HUMAN");
  assert.equal(runtimeStates[0].status, "IN_PROGRESS");
  assert.equal(runtimeStates[0].assignedUserId, businessAdmin.id);
  assert.ok(runtimeStates[0].lastOutboundMessageId);

  const resolutionEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolved",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.ok(resolutionEvent);
  assert.equal(JSON.stringify(resolutionEvent.payloadJson).includes(inputWaId), false);
});

test("campaign send reactivates soft-deleted non-anonymized conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_reactivate_deleted_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Retorno de atendimento",
    },
  });
  const waId = "558494786787";
  const deletedAt = new Date("2026-01-03T10:00:00.000Z");
  const previousOutboundAt = new Date("2026-01-02T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      lastOutboundAt: previousOutboundAt,
    },
    select: { id: true },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      mode: "HUMAN",
      status: "WAITING",
      closedAt: deletedAt,
      lastOutboundAt: previousOutboundAt,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.reactivated.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio reativa conversa excluida",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const event = await prisma.event.findFirst({
      where: {
        clientId: businessClientId,
        eventName: "campaign.recipient.conversation_reactivated",
        conversationId: conversation.id,
      },
      select: { id: true },
    });
    return Boolean(event);
  });

  const updated = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true, lastOutboundAt: true },
  });
  assert.equal(updated.deletedAt, null);
  assert.equal(updated.anonymizedAt, null);
  assert.ok((updated.lastOutboundAt?.getTime() ?? 0) > previousOutboundAt.getTime());
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: { status: true, mode: true, closedAt: true, lastOutboundMessageId: true },
  });
  assert.equal(runtime.status, "WAITING");
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.closedAt, null);
  assert.equal(runtime.lastOutboundMessageId, `campaign.${response.body.campaign.id}.1`);

  const reactivatedEvent = await prisma.event.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_reactivated",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.equal((reactivatedEvent.payloadJson as { reason?: string }).reason, "outbound_template_sent");
  assert.equal(JSON.stringify(reactivatedEvent.payloadJson).includes(waId), false);

  const list = await request<{
    ok: boolean;
    conversations: Array<{ waId: string; lastMessage: { direction: string; type: string } | null }>;
  }>("GET", `/app/conversations?search=${encodeURIComponent(waId)}&limit=10`, businessAdmin);
  assert.equal(list.status, 200);
  const listItem = list.body.conversations.find((item) => item.waId === waId);
  assert.ok(listItem);
  assert.equal(listItem.lastMessage?.direction, "OUTBOUND");
  assert.equal(listItem.lastMessage?.type, "TEMPLATE");
});

test("campaign send does not reactivate anonymized soft-deleted conversation", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_skip_anonymized_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Retorno bloqueado",
    },
  });
  const waId = "558494817470";
  const deletedAt = new Date("2026-01-04T10:00:00.000Z");
  const anonymizedAt = new Date("2026-01-04T10:01:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      anonymizedAt,
      lastOutboundAt: new Date("2026-01-01T10:00:00.000Z"),
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.anonymized.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio nao reativa anonimizada",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    });
    return count === 1;
  });

  const preserved = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true, lastOutboundAt: true },
  });
  assert.deepEqual(preserved.deletedAt, deletedAt);
  assert.deepEqual(preserved.anonymizedAt, anonymizedAt);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId, waId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: { clientId: businessClientId, eventName: "campaign.recipient.conversation_reactivated", conversationId: conversation.id },
    }),
    0
  );

  const outbound = await prisma.outboundMessage.findFirstOrThrow({
    where: { clientId: businessClientId, messageId: { startsWith: `campaign.${response.body.campaign.id}.` } },
    select: { rawPayload: true },
  });
  assert.equal((outbound.rawPayload as { conversationId?: string | null }).conversationId, null);
});

test("campaign send creates inbox conversation and timeline for new recipient", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_new_conversation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, aviso inicial",
    },
  });
  const waId = "5584951957784";
  const anonymizedWaId = "5584******7784:anon001";
  const anonymizedLead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId: anonymizedWaId,
      waIdCanonical: anonymizedWaId,
      name: "Usuario Anonimizado",
      phone: anonymizedWaId,
      status: "NEW",
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
      assert.equal(payload.to, waId);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.new.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio cria conversa",
      templateId: template.id,
      recipients: [waId],
      templateParams: ["Cliente Novo"],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const event = await prisma.event.findFirst({
      where: {
        clientId: businessClientId,
        eventName: "campaign.message.sent",
        messageId: `campaign.${response.body.campaign.id}.1`,
        conversationId: { not: null },
      },
      select: { id: true },
    });
    return Boolean(event);
  });

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { clientId: businessClientId, waId },
    select: {
      id: true,
      channel: true,
      provider: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      departmentId: true,
      anonymizedAt: true,
      deletedAt: true,
    },
  });
  assert.equal(conversation.channel, "whatsapp");
  assert.equal(conversation.provider, "meta");
  assert.equal(conversation.lastInboundAt, null);
  assert.ok(conversation.lastOutboundAt);
  assert.ok(conversation.departmentId);
  assert.equal(conversation.anonymizedAt, null);
  assert.equal(conversation.deletedAt, null);

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: { id: true, name: true, channel: true, provider: true, externalUserHash: true },
  });
  assert.equal(contact.name, null);
  assert.equal(contact.channel, "whatsapp");
  assert.equal(contact.provider, "meta");
  assert.ok(contact.externalUserHash?.startsWith("whatsapp:"));

  const lead = await prisma.lead.findUniqueOrThrow({
    where: { tenantId_waId: { tenantId: businessClientId, waId } },
    select: { id: true, name: true, phone: true, channel: true, provider: true, contactChannelIdentityId: true },
  });
  assert.equal(lead.name, null);
  assert.equal(lead.phone, waId);
  assert.equal(lead.channel, "whatsapp");
  assert.equal(lead.provider, "meta");
  assert.ok(lead.contactChannelIdentityId);
  const identity = await prisma.contactChannelIdentity.findUniqueOrThrow({
    where: { id: lead.contactChannelIdentityId },
    select: { displayName: true, legacyWaId: true },
  });
  assert.equal(identity.displayName, null);
  assert.equal(identity.legacyWaId, waId);

  const preservedAnonymizedLead = await prisma.lead.findUniqueOrThrow({
    where: { id: anonymizedLead.id },
    select: { waId: true, waIdCanonical: true, name: true, phone: true },
  });
  assert.equal(preservedAnonymizedLead.waId, anonymizedWaId);
  assert.equal(preservedAnonymizedLead.waIdCanonical, anonymizedWaId);
  assert.equal(preservedAnonymizedLead.name, "Usuario Anonimizado");
  assert.equal(preservedAnonymizedLead.phone, anonymizedWaId);

  const runtime = await prisma.conversationRuntimeState.findUniqueOrThrow({
    where: { clientId_waId: { clientId: businessClientId, waId } },
    select: {
      mode: true,
      status: true,
      queueId: true,
      departmentId: true,
      lastOutboundMessageId: true,
      assignedUserId: true,
    },
  });
  assert.equal(runtime.mode, "HUMAN");
  assert.equal(runtime.status, "WAITING");
  assert.equal(runtime.assignedUserId, null);
  assert.ok(runtime.departmentId);
  assert.ok(runtime.queueId);
  assert.equal(runtime.lastOutboundMessageId, `campaign.${response.body.campaign.id}.1`);

  const creationEvent = await prisma.event.findFirstOrThrow({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_created",
      conversationId: conversation.id,
    },
    select: { payloadJson: true },
  });
  assert.equal((creationEvent.payloadJson as { matchedBy?: string }).matchedBy, "new_recipient");
  assert.equal(JSON.stringify(creationEvent.payloadJson).includes(waId), false);

  const list = await request<{
    ok: boolean;
    conversations: Array<{
      waId: string;
      leadId: string | null;
      leadName: string | null;
      leadPhone: string | null;
      status: string | null;
      mode: string | null;
      lastMessage: { direction: string; type: string; templateName: string | null; bodyText: string | null } | null;
    }>;
  }>("GET", `/app/conversations?search=${encodeURIComponent(waId)}&limit=10`, businessAdmin);
  assert.equal(list.status, 200);
  const listItem = list.body.conversations.find((item) => item.waId === waId);
  assert.ok(listItem);
  assert.equal(listItem.leadId, lead.id);
  assert.equal(listItem.leadName, null);
  assert.equal(listItem.leadPhone, waId);
  assert.equal(listItem.status, "WAITING");
  assert.equal(listItem.mode, "HUMAN");
  assert.equal(listItem.lastMessage?.direction, "OUTBOUND");
  assert.equal(listItem.lastMessage?.type, "TEMPLATE");
  assert.equal(listItem.lastMessage?.templateName, template.name);
  assert.equal(listItem.lastMessage?.bodyText, "Ola Cliente Novo, aviso inicial");

  const detail = await request<{
    ok: boolean;
    items: Array<{
      direction: string;
      type: string;
      bodyText: string | null;
      templateName: string | null;
      messageId: string | null;
    }>;
  }>("GET", `/app/conversation/${encodeURIComponent(waId)}?order=asc`, businessAdmin);
  assert.equal(detail.status, 200);
  assert.ok(
    detail.body.items.some(
      (item) =>
        item.direction === "OUTBOUND" &&
        item.type === "TEMPLATE" &&
        item.bodyText === "Ola Cliente Novo, aviso inicial" &&
        item.templateName === template.name &&
        item.messageId === `campaign.${response.body.campaign.id}.1`
    )
  );
});

test("campaign send failure does not reactivate soft-deleted conversation or CRM bootstrap", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_failure_no_conversation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso nao entregue",
    },
  });
  const waId = "5584951957799";
  const deletedAt = new Date("2026-01-05T10:00:00.000Z");
  const conversation = await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      deletedAt,
      lastOutboundAt: new Date("2026-01-01T10:00:00.000Z"),
    },
    select: { id: true },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ error: { message: "Meta unavailable" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio falha sem reativar conversa",
      templateId: template.id,
      recipients: [waId],
    }
  );
  assert.equal(response.status, 200);

  await waitFor(async () => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: response.body.campaign.id },
      select: { status: true },
    });
    return campaign?.status === "failed";
  });

  const preserved = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    select: { deletedAt: true, anonymizedAt: true },
  });
  assert.deepEqual(preserved.deletedAt, deletedAt);
  assert.equal(preserved.anonymizedAt, null);
  assert.equal(await prisma.conversation.count({ where: { clientId: businessClientId, waId } }), 1);
  assert.equal(await prisma.conversationRuntimeState.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.contact.count({ where: { clientId: businessClientId, waId } }), 0);
  assert.equal(await prisma.lead.count({ where: { tenantId: businessClientId, waId } }), 0);
  assert.equal(
    await prisma.event.count({
      where: { clientId: businessClientId, eventName: "campaign.recipient.conversation_reactivated", conversationId: conversation.id },
    }),
    0
  );
});

test("campaign recipient bridge does not cross tenants and skips ambiguous matches", async (t) => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `campaign_bridge_isolation_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Aviso de isolamento",
    },
  });
  const otherTenantWaId = "554198889614";
  await prisma.conversation.create({
    data: {
      clientId: governmentClientId,
      waId: otherTenantWaId,
      waIdCanonical: otherTenantWaId,
      channel: "whatsapp",
      provider: "meta",
      lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
    },
  });
  await prisma.conversation.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "554176549614",
        waIdCanonical: "554176549614",
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T09:00:00.000Z"),
      },
      {
        clientId: businessClientId,
        waId: "alt-554176549614",
        waIdCanonical: null,
        channel: "whatsapp",
        provider: "meta",
        lastInboundAt: new Date("2026-01-01T09:05:00.000Z"),
      },
    ],
  });

  const originalFetch = globalThis.fetch;
  const metaPayloads: unknown[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      metaPayloads.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.isolation.${metaPayloads.length}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const crossTenant = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio sem cruzar tenant",
      templateId: template.id,
      recipients: [otherTenantWaId],
    }
  );
  assert.equal(crossTenant.status, 200);
  const ambiguousInput = "5541976549614";
  const ambiguous = await request<{ ok: boolean; campaign: { id: string } }>(
    "POST",
    "/app/campaigns",
    businessAdmin,
    {
      name: "Envio ambiguo",
      templateId: template.id,
      recipients: [ambiguousInput],
    }
  );
  assert.equal(ambiguous.status, 200);

  await waitFor(async () => {
    const count = await prisma.outboundMessage.count({
      where: {
        clientId: businessClientId,
        messageId: {
          in: [`campaign.${crossTenant.body.campaign.id}.1`, `campaign.${ambiguous.body.campaign.id}.1`],
        },
      },
    });
    return count === 2;
  });

  const metaRecipients = metaPayloads.map((payload) => (payload as { to?: string }).to);
  assert.equal(metaRecipients.includes(otherTenantWaId), true);
  assert.equal(metaRecipients.includes(ambiguousInput), true);

  const crossTenantEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolved",
      messageId: `campaign.${crossTenant.body.campaign.id}.1`,
    },
  });
  assert.equal(crossTenantEvent, null);
  const governmentConversation = await prisma.conversation.findFirstOrThrow({
    where: { clientId: governmentClientId, waId: otherTenantWaId },
    select: { lastOutboundAt: true },
  });
  assert.equal(governmentConversation.lastOutboundAt, null);

  const ambiguousEvent = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.recipient.conversation_resolution_ambiguous",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(ambiguousEvent);
  assert.equal((ambiguousEvent.payloadJson as { reason?: string }).reason, "ambiguous");
  assert.equal(JSON.stringify(ambiguousEvent.payloadJson).includes(ambiguousInput), false);
  const usageEvents = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: "meta.usage.estimated",
      messageId: {
        in: [`campaign.${crossTenant.body.campaign.id}.1`, `campaign.${ambiguous.body.campaign.id}.1`],
      },
    },
    orderBy: { messageId: "asc" },
  });
  assert.equal(usageEvents.length, 2);
  for (const event of usageEvents) {
    const payload = event.payloadJson as Record<string, unknown>;
    assert.equal(payload.source, "manual_campaign_send");
    assert.equal(payload.messageKind, "template");
    assert.equal(payload.metaCategory, "utility");
    assert.equal(payload.campaignId === crossTenant.body.campaign.id || payload.campaignId === ambiguous.body.campaign.id, true);
    assert.equal(JSON.stringify(payload).includes(otherTenantWaId), false);
    assert.equal(JSON.stringify(payload).includes(ambiguousInput), false);
  }
});

test("campaign draft send blocks mapped recipients without value or fallback", async () => {
  const template = await prisma.template.create({
    data: {
      clientId: businessClientId,
      name: `draft_variable_block_${safeTemplatePrefix}`,
      category: "UTILITY",
      language: "pt_BR",
      status: "approved",
      content: "Ola {{1}}, sua cidade e {{2}}.",
    },
  });
  const waId = "5541991189104";
  const lead = await prisma.lead.create({
    data: {
      tenantId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      name: "Sem Cidade",
      phone: waId,
      city: "",
      status: "RETORNO_FUTURO",
    },
  });

  const created = await request<{
    ok: boolean;
    campaign: { id: string; status: string; totalRecipients: number };
  }>("POST", "/app/campaigns/drafts", businessAdmin, {
    name: "Rascunho variavel bloqueada",
    templateId: template.id,
    selectedLeadIds: [lead.id],
    templateVariableMappings: [
      { position: "1", source: "contact.displayName" },
      { position: "2", source: "lead.city" },
    ],
  });
  assert.equal(created.status, 200);

  const send = await request<ErrorPayload>(
    "POST",
    `/app/campaigns/${created.body.campaign.id}/send`,
    businessAdmin
  );
  assert.equal(send.status, 400);
  assert.equal(getErrorCode(send.body), "no_eligible_recipients");

  const campaign = await prisma.campaign.findUnique({
    where: { id: created.body.campaign.id },
    select: { status: true },
  });
  assert.equal(campaign?.status, "draft");
  const seed = await prisma.event.findFirst({
    where: {
      clientId: businessClientId,
      eventName: "campaign.seed.saved",
      messageId: created.body.campaign.id,
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });
  assert.ok(seed);
  const summary = (seed.payloadJson as { summary?: { blockedByReason?: Array<{ reason: string; count: number }> } })
    .summary;
  assert.ok(summary?.blockedByReason?.some((item) => item.reason === "variable_missing_value" && item.count === 1));
  const outboundCount = await prisma.outboundMessage.count({ where: { clientId: businessClientId, waId } });
  assert.equal(outboundCount, 0);
});

test("tenant override can enable campaigns for a non-business profile", async () => {
  const response = await request<{ ok: boolean; count: number }>(
    "GET",
    "/app/campaigns",
    overrideAdmin
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("tenant kill switch can disable campaigns for business profile", async () => {
  const response = await request<ErrorPayload>("GET", "/app/campaigns", killSwitchAdmin);

  assert.equal(response.status, 403);
  assert.equal(getErrorCode(response.body), "feature_not_enabled");
  assert.equal(response.body.feature, "campaigns");
});

test("campaign export reports delivered utility messages as billable", async () => {
  const campaign = await prisma.campaign.create({
    data: {
      clientId: businessClientId,
      name: "CRA-PR consumo",
      templateName: "cra_pr_utility",
      status: "completed",
      totalRecipients: 3,
      sentCount: 3,
      blockedCount: 0,
    },
  });
  await prisma.outboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: "5541999990001",
        waIdCanonical: "5541999990001",
        messageId: `campaign.${campaign.id}.1`,
        type: "TEMPLATE",
        status: "SENT",
        templateName: "cra_pr_utility",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "delivered",
            lastStatusAt: "2026-07-13T10:00:00.000Z",
            pricingCategory: "utility",
            pricingBillable: true,
            pricingModel: "PMP",
          },
        },
      },
      {
        clientId: businessClientId,
        waId: "5541999990002",
        waIdCanonical: "5541999990002",
        messageId: `campaign.${campaign.id}.2`,
        type: "TEMPLATE",
        status: "SENT",
        templateName: "cra_pr_utility",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "sent",
            lastStatusAt: "2026-07-13T10:01:00.000Z",
            pricingCategory: "utility",
            pricingBillable: true,
            pricingModel: "PMP",
          },
        },
      },
      {
        clientId: businessClientId,
        waId: "5541999990003",
        waIdCanonical: "5541999990003",
        messageId: `campaign.${campaign.id}.3`,
        type: "TEMPLATE",
        status: "FAILED",
        templateName: "cra_pr_utility",
        errorBody: "blocked by opt-out",
        rawPayload: {
          campaignId: campaign.id,
          metaStatus: {
            lastStatus: "failed",
            pricingCategory: "utility",
            pricingBillable: false,
            pricingModel: "PMP",
          },
        },
      },
    ],
  });

  const response = await requestText("GET", `/app/campaigns/${campaign.id}/export`, businessAdmin);

  assert.equal(response.status, 200);
  assert.match(response.contentType ?? "", /text\/csv/);
  assert.match(response.text, /campaign_id,campaign_name,template,category,contact,status,sent_at,delivered_at,billable,non_billing_reason/);
  assert.match(response.text, /5541999990001,delivered,/);
  assert.match(response.text, /5541999990001,delivered,[^\n]*,sim,/);
  assert.match(response.text, /5541999990002,sent,[^\n]*,nao,nao_entregue/);
  assert.match(response.text, /5541999990003,failed,[^\n]*,nao,falha/);
});

test("event-based opt-out blocks recipient in app campaign and export", async () => {
  const waId = "5541999981001";
  const optOut = await request<{ ok: boolean; status: string; waIdCanonical: string }>(
    "POST",
    "/app/campaigns/opt-out",
    businessAdmin,
    {
      waId,
      channel: "whatsapp",
      source: "manual",
      reason: "descadastro solicitado",
      note: "Pedido registrado em atendimento",
    }
  );

  assert.equal(optOut.status, 200);
  assert.equal(optOut.body.ok, true);
  assert.equal(optOut.body.status, "recorded");

  const created = await request<{
    ok: boolean;
    campaign: {
      id: string;
      campaignId: string;
      totalRecipients: number;
      sentCount: number;
      blockedCount: number;
    };
  }>("POST", "/app/campaigns", businessAdmin, {
    name: "Campanha com opt-out",
    templateName: "cra_pr_utility",
    recipients: [waId],
  });

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.campaign.totalRecipients, 1);
  assert.equal(created.body.campaign.blockedCount, 1);
  assert.equal(created.body.campaign.sentCount, 0);

  const outboundCount = await prisma.outboundMessage.count({
    where: {
      clientId: businessClientId,
      waId,
    },
  });
  assert.equal(outboundCount, 0);

  const response = await requestText(
    "GET",
    `/app/campaigns/${created.body.campaign.id}/export`,
    businessAdmin
  );
  assert.equal(response.status, 200);
  assert.match(response.text, /5541999981001,opt_out,[^\n]*,nao,opt_out/);
});

test("event-based opt-out revoke allows recipient and tenant isolation is preserved", async () => {
  const waId = "5541999981002";
  await recordContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "tenant business block",
  });

  const otherTenantFilter = await filterOptedOutCampaignRecipients(prisma, {
    clientId: overrideClientId,
    waIds: [waId],
  });
  assert.deepEqual(otherTenantFilter.allowed, [waId]);
  assert.deepEqual(otherTenantFilter.blocked, []);

  const blocked = await filterOptedOutCampaignRecipients(prisma, {
    clientId: businessClientId,
    waIds: [waId],
  });
  assert.deepEqual(blocked.allowed, []);
  assert.equal(blocked.blocked.length, 1);

  await revokeContactOptOut({
    clientId: businessClientId,
    waId,
    source: "test",
    reason: "consent restored",
  });

  const revoked = await filterOptedOutCampaignRecipients(prisma, {
    clientId: businessClientId,
    waIds: [waId],
  });
  assert.deepEqual(revoked.allowed, [waId]);
  assert.deepEqual(revoked.blocked, []);
});

test("campaign export remains capability protected", async () => {
  const response = await request<ErrorPayload>("GET", "/app/campaigns/missing/export", governmentAdmin);

  assert.equal(response.status, 403);
  assert.equal(getErrorCode(response.body), "feature_not_enabled");
  assert.equal(response.body.feature, "campaigns");
});

test("inbox operations stay functional when tenant has no active general department", async (t) => {
  const previousFetch = globalThis.fetch;
  const waId = "5584993310101";
  const departments: Array<{ id: string; queueId: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.optional-general.${safeTemplatePrefix}` }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return previousFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await prisma.department.updateMany({
    where: {
      clientId: businessClientId,
      OR: [
        { name: { equals: "Atendimento Geral", mode: "insensitive" } },
        { slug: { equals: "atendimento-geral", mode: "insensitive" } },
        { name: { equals: "Geral", mode: "insensitive" } },
        { slug: { equals: "geral", mode: "insensitive" } },
      ],
    },
    data: { isActive: false },
  });

  for (const [index, name] of ["Setor Alfa", "Setor Beta", "Setor Gama"].entries()) {
    const department = await prisma.department.create({
      data: {
        clientId: businessClientId,
        name: `${prefix} ${name}`,
        slug: `${prefix}-optional-general-${index}`,
      },
      select: { id: true },
    });
    const queue = await prisma.queue.create({
      data: {
        clientId: businessClientId,
        departmentId: department.id,
        name: `${prefix} Fila ${index + 1}`,
      },
      select: { id: true },
    });
    departments.push({ id: department.id, queueId: queue.id });
  }

  await prisma.user.updateMany({
    where: { id: { in: [businessAdmin.id, businessSupervisor.id] }, clientId: businessClientId },
    data: { departmentId: departments[0].id },
  });
  await prisma.userDepartmentMembership.updateMany({
    where: { userId: { in: [businessAdmin.id, businessSupervisor.id] }, clientId: businessClientId },
    data: { isPrimary: false, isActive: false },
  });
  for (const user of [businessAdmin, businessSupervisor]) {
    for (const [index, department] of departments.entries()) {
      await prisma.userDepartmentMembership.upsert({
        where: { userId_departmentId: { userId: user.id, departmentId: department.id } },
        create: {
          clientId: businessClientId,
          userId: user.id,
          departmentId: department.id,
          isPrimary: index === 0,
          isActive: true,
        },
        update: { isPrimary: index === 0, isActive: true },
      });
    }
  }
  const multiDepartmentAgent = await createUser({
    clientId: businessClientId,
    role: "AGENT",
    suffix: "multi-department-agent",
  });
  await prisma.user.update({
    where: { id: multiDepartmentAgent.id },
    data: { departmentId: departments[0].id },
  });
  for (const [index, department] of departments.entries()) {
    await prisma.userDepartmentMembership.upsert({
      where: { userId_departmentId: { userId: multiDepartmentAgent.id, departmentId: department.id } },
      create: {
        clientId: businessClientId,
        userId: multiDepartmentAgent.id,
        departmentId: department.id,
        isPrimary: index === 0,
        isActive: true,
      },
      update: { isPrimary: index === 0, isActive: true },
    });
  }
  const agentDepartments = await request<{
    ok: true;
    items: Array<{ id: string; isActive: boolean }>;
  }>("GET", "/app/departments", multiDepartmentAgent);
  assert.equal(agentDepartments.status, 200, JSON.stringify(agentDepartments.body));
  assert.deepEqual(
    agentDepartments.body.items.map((item) => item.id).sort(),
    departments.map((department) => department.id).sort()
  );

  await prisma.tenantMetaConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      businessToken: "optional-general-token",
      phoneNumberId: `optional-general-phone-${safeTemplatePrefix}`,
      rawPayload: {},
    },
    update: {
      businessToken: "optional-general-token",
      phoneNumberId: `optional-general-phone-${safeTemplatePrefix}`,
      rawPayload: {},
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      departmentId: departments[0].id,
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date(),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      conversationKey: `${prefix}-business:${waId}`,
      channel: "whatsapp",
      provider: "meta",
      departmentId: departments[0].id,
      queueId: departments[0].queueId,
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "WAITING",
      lastInboundAt: new Date(),
    },
  });
  await runtimeStorage.upsertConversation({
    clientKey: `${prefix}-business`,
    conversationKey: `${prefix}-business:${waId}`,
    waId,
    waIdCanonical: waId,
    firstSeenAt: new Date().toISOString(),
    lastInboundAt: new Date().toISOString(),
    window: { isOpen: true, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    handoff: { status: "active" },
    mode: "HUMAN",
    status: "WAITING",
    assignedUserId: null,
    assignedTo: null,
    answers: {},
    chatbotActive: false,
    departmentId: departments[0].id,
    queueId: departments[0].queueId,
  } as ConversationState);
  await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      waId,
      waIdCanonical: waId,
      channel: "whatsapp",
      provider: "meta",
      messageId: `wamid.optional-general.inbound.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Mensagem inicial",
      allowlistHit: true,
      rawPayload: { provider: "meta" },
    },
  });
  const unscopedDepartment = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Setor Delta`,
      slug: `${prefix}-optional-general-unscoped`,
    },
    select: { id: true },
  });
  const unscopedQueue = await prisma.queue.create({
    data: {
      clientId: businessClientId,
      departmentId: unscopedDepartment.id,
      name: `${prefix} Fila sem membership`,
    },
    select: { id: true },
  });
  const createVisibleConversation = async (
    suffix: string,
    department: { id: string; queueId: string }
  ) => {
    const scopedWaId = `55849933102${suffix}`;
    await prisma.conversation.create({
      data: {
        clientId: businessClientId,
        waId: scopedWaId,
        waIdCanonical: scopedWaId,
        channel: "whatsapp",
        provider: "meta",
        departmentId: department.id,
        windowIsOpen: true,
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastInboundAt: new Date(),
      },
    });
    await prisma.conversationRuntimeState.create({
      data: {
        clientId: businessClientId,
        waId: scopedWaId,
        waIdCanonical: scopedWaId,
        conversationKey: `${prefix}-business:${scopedWaId}`,
        channel: "whatsapp",
        provider: "meta",
        departmentId: department.id,
        queueId: department.queueId,
        windowIsOpen: true,
        windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        mode: "HUMAN",
        status: "WAITING",
        handoffStatus: "ACTIVE",
        lastInboundAt: new Date(),
      },
    });
    await prisma.inboundMessage.create({
      data: {
        clientId: businessClientId,
        waId: scopedWaId,
        waIdCanonical: scopedWaId,
        channel: "whatsapp",
        provider: "meta",
        messageId: `wamid.optional-general.${suffix}.${safeTemplatePrefix}`,
        type: "TEXT",
        bodyText: `Mensagem ${suffix}`,
        allowlistHit: true,
        rawPayload: { provider: "meta" },
      },
    });
    return scopedWaId;
  };
  const waIdDepartmentB = await createVisibleConversation("02", departments[1]);
  const waIdDepartmentC = await createVisibleConversation("03", departments[2]);
  const waIdDepartmentD = await createVisibleConversation("04", {
    id: unscopedDepartment.id,
    queueId: unscopedQueue.id,
  });

  const agentDepartmentsAfterUnscoped = await request<{
    ok: true;
    items: Array<{ id: string; isActive: boolean }>;
  }>("GET", "/app/departments", multiDepartmentAgent);
  assert.equal(agentDepartmentsAfterUnscoped.status, 200, JSON.stringify(agentDepartmentsAfterUnscoped.body));
  assert.deepEqual(
    agentDepartmentsAfterUnscoped.body.items.map((item) => item.id).sort(),
    departments.map((department) => department.id).sort()
  );
  const agentTransferDepartments = await request<{
    ok: true;
    items: Array<{ id: string; isActive: boolean }>;
  }>("GET", "/app/departments?purpose=transfer", multiDepartmentAgent);
  assert.equal(agentTransferDepartments.status, 200, JSON.stringify(agentTransferDepartments.body));
  const agentTransferDepartmentIds = new Set(
    agentTransferDepartments.body.items.map((item) => item.id)
  );
  for (const department of departments) {
    assert.equal(agentTransferDepartmentIds.has(department.id), true);
  }
  assert.equal(agentTransferDepartmentIds.has(unscopedDepartment.id), true);
  const preConsentWaId = `55849933${String(process.pid).slice(-3)}${String(Date.now()).slice(-6)}`;
  await prisma.chatbotFlow.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Consent flow`,
      isActive: true,
      entryPoint: true,
      definition: {
        start: "consent",
        nodes: {
          consent: {
            type: "consent",
            purpose: "lgpd",
            textVersion: "test",
            message: "Consentimento",
            acceptOption: "1",
            onAccepted: "menu",
          },
          menu: {
            type: "menu",
            text: "Menu",
            options: [{ label: "Atendimento", next: "handoff" }],
          },
          handoff: { type: "handoff", text: "Direcionando atendimento." },
        },
      },
    },
  });
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: preConsentWaId,
      waIdCanonical: preConsentWaId,
      channel: "whatsapp",
      provider: "web_session",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date(),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: preConsentWaId,
      waIdCanonical: preConsentWaId,
      conversationKey: `${prefix}-business:${preConsentWaId}`,
      channel: "whatsapp",
      provider: "web_session",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "BOT",
      status: null,
      handoffStatus: "NONE",
      chatbotActive: true,
      chatbotNodeId: "consent",
      flow: "chatbot:test-consent-flow",
      lastInboundAt: new Date(),
    },
  });
  await prisma.inboundMessage.create({
    data: {
      clientId: businessClientId,
      waId: preConsentWaId,
      waIdCanonical: preConsentWaId,
      channel: "whatsapp",
      provider: "web_session",
      messageId: `web.preconsent.${safeTemplatePrefix}`,
      type: "TEXT",
      bodyText: "Oi",
      allowlistHit: true,
      rawPayload: { provider: "web_session" },
    },
  });
  const managementOnlyWaId = `558499${String(Date.now()).slice(-7)}`;
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: managementOnlyWaId,
      waIdCanonical: managementOnlyWaId,
      channel: "whatsapp",
      provider: "web_session",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date("2026-08-20T11:59:00.000Z"),
      lastInboundAt: new Date("2026-08-20T12:05:00.000Z"),
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: managementOnlyWaId,
      waIdCanonical: managementOnlyWaId,
      conversationKey: `${prefix}-business:${managementOnlyWaId}`,
      channel: "whatsapp",
      provider: "web_session",
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "WAITING",
      handoffStatus: "ACTIVE",
      departmentId: departments[0].id,
      queueId: departments[0].queueId,
      lastInboundAt: new Date("2026-08-20T12:05:00.000Z"),
    },
  });
  await prisma.inboundMessage.createMany({
    data: [
      {
        clientId: businessClientId,
        waId: managementOnlyWaId,
        waIdCanonical: managementOnlyWaId,
        channel: "whatsapp",
        provider: "web_session",
        messageId: `web.operational.${safeTemplatePrefix}`,
        type: "TEXT",
        bodyText: "Mensagem operacional",
        allowlistHit: true,
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        rawPayload: { provider: "web_session" },
      },
      {
        clientId: businessClientId,
        waId: managementOnlyWaId,
        waIdCanonical: managementOnlyWaId,
        channel: "whatsapp",
        provider: "web_session",
        messageId: `web.management.${safeTemplatePrefix}`,
        type: "TEXT",
        bodyText: "Pesquisa interna",
        allowlistHit: true,
        createdAt: new Date("2026-08-20T12:05:00.000Z"),
        rawPayload: {
          provider: "web_session",
          inboxVisibility: "management_only",
          inboxInteractionKind: "satisfaction",
        },
      },
    ],
  });

  const agentInbox = await request<{
    ok: true;
    items: Array<{ waId: string; departmentId: string | null; lastMessage?: { bodyText: string | null } | null; unreadCount?: number }>;
  }>("GET", "/app/conversations", multiDepartmentAgent);
  assert.equal(agentInbox.status, 200, JSON.stringify(agentInbox.body));
  const agentInboxByWaId = new Map(agentInbox.body.items.map((item) => [item.waId, item]));
  assert.equal(agentInboxByWaId.get(waId)?.departmentId, departments[0].id);
  assert.equal(agentInboxByWaId.get(waIdDepartmentB)?.departmentId, departments[1].id);
  assert.equal(agentInboxByWaId.get(waIdDepartmentC)?.departmentId, departments[2].id);
  assert.equal(agentInboxByWaId.has(waIdDepartmentD), false);
  assert.equal(agentInboxByWaId.has(preConsentWaId), false);
  assert.equal(agentInboxByWaId.get(managementOnlyWaId)?.lastMessage?.bodyText, "Mensagem operacional");
  assert.equal(agentInboxByWaId.get(managementOnlyWaId)?.unreadCount, 1);

  const agentInboxDepartmentC = await request<{
    ok: true;
    items: Array<{ waId: string; departmentId: string | null }>;
  }>("GET", `/app/conversations?departmentId=${departments[2].id}`, multiDepartmentAgent);
  assert.equal(agentInboxDepartmentC.status, 200, JSON.stringify(agentInboxDepartmentC.body));
  assert.ok(agentInboxDepartmentC.body.items.every((item) => item.departmentId === departments[2].id));
  assert.ok(agentInboxDepartmentC.body.items.some((item) => item.waId === waIdDepartmentC));

  const agentInboxDepartmentD = await request<{
    ok: true;
    items: Array<{ waId: string; departmentId: string | null }>;
  }>("GET", `/app/conversations?departmentId=${unscopedDepartment.id}`, multiDepartmentAgent);
  assert.equal(agentInboxDepartmentD.status, 200, JSON.stringify(agentInboxDepartmentD.body));
  assert.equal(agentInboxDepartmentD.body.items.length, 0);

  await prisma.conversationRuntimeState.updateMany({
    where: { clientId: businessClientId, waId: waIdDepartmentD },
    data: {
      assignedUserId: multiDepartmentAgent.id,
      assignedTo: `user:${multiDepartmentAgent.id}`,
      assignedAt: new Date(),
      status: "IN_PROGRESS",
    },
  });
  const assignedOutsideMembershipInbox = await request<{
    ok: true;
    items: Array<{ waId: string; departmentId: string | null; assignedUserId: string | null }>;
  }>("GET", "/app/conversations", multiDepartmentAgent);
  assert.equal(
    assignedOutsideMembershipInbox.status,
    200,
    JSON.stringify(assignedOutsideMembershipInbox.body)
  );
  const assignedOutsideMembershipItem = assignedOutsideMembershipInbox.body.items.find(
    (item) => item.waId === waIdDepartmentD
  );
  assert.equal(assignedOutsideMembershipItem?.departmentId, unscopedDepartment.id);
  assert.equal(assignedOutsideMembershipItem?.assignedUserId, multiDepartmentAgent.id);
  const assignedOutsideMembershipDetail = await request<{ ok: true; departmentId: string | null; assignedUserId: string | null }>(
    "GET",
    `/app/conversation/${waIdDepartmentD}`,
    multiDepartmentAgent
  );
  assert.equal(
    assignedOutsideMembershipDetail.status,
    200,
    JSON.stringify(assignedOutsideMembershipDetail.body)
  );
  assert.equal(assignedOutsideMembershipDetail.body.departmentId, unscopedDepartment.id);
  assert.equal(assignedOutsideMembershipDetail.body.assignedUserId, multiDepartmentAgent.id);
  const assignedOutsideMembershipTimeline = await request<{ ok: true }>(
    "GET",
    `/app/conversation/${waIdDepartmentD}/timeline`,
    multiDepartmentAgent
  );
  assert.equal(
    assignedOutsideMembershipTimeline.status,
    200,
    JSON.stringify(assignedOutsideMembershipTimeline.body)
  );

  const inbox = await request<{ ok: true }>("GET", "/app/conversations", businessAdmin);
  assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
  assert.equal(
    (inbox.body as { items?: Array<{ waId: string }> }).items?.some((item) => item.waId === preConsentWaId),
    false
  );
  const detail = await request<{ ok: true }>("GET", `/app/conversation/${waId}`, businessAdmin);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  const timeline = await request<{ ok: true }>("GET", `/app/conversation/${waId}/timeline`, businessAdmin);
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  const managementTimeline = await request<{ ok: true; items: Array<{ body: string | null }> }>(
    "GET",
    `/app/conversation/${managementOnlyWaId}/timeline`,
    multiDepartmentAgent
  );
  assert.equal(managementTimeline.status, 200, JSON.stringify(managementTimeline.body));
  assert.equal(managementTimeline.body.items.some((item) => item.body === "Pesquisa interna"), false);
  assert.equal(managementTimeline.body.items.some((item) => item.body === "Mensagem operacional"), true);

  const claim = await request<{ ok: true; assignedUserId: string | null; departmentId: string | null }>(
    "POST",
    `/app/conversation/${waId}/claim`,
    businessAdmin,
    {}
  );
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  assert.equal(claim.body.assignedUserId, businessAdmin.id);
  assert.equal(claim.body.departmentId, departments[0].id);

  const textSend = await request<{ ok: true; message: { status: string; metaMessageId: string | null } }>(
    "POST",
    `/app/conversation/${waId}/send`,
    businessAdmin,
    { text: "Resposta sem setor geral." }
  );
  assert.equal(textSend.status, 200, JSON.stringify(textSend.body));
  assert.equal(textSend.body.message.status, "SENT");
  assert.ok(textSend.body.message.metaMessageId);

  const canned = await request<{ ok: true; item: { id: string } }>("POST", "/app/canned-replies", businessAdmin, {
    title: "Sem setor geral",
    body: "Mensagem pronta sem setor geral.",
  });
  assert.equal(canned.status, 201, JSON.stringify(canned.body));
  const cannedSend = await request<{ ok: true; message: { status: string; metaMessageId: string | null } }>(
    "POST",
    `/app/conversation/${waId}/send-canned-reply`,
    businessAdmin,
    { cannedReplyId: canned.body.item.id }
  );
  assert.equal(cannedSend.status, 200, JSON.stringify(cannedSend.body));
  assert.equal(cannedSend.body.message.status, "SENT");
  assert.ok(cannedSend.body.message.metaMessageId);

  const transfer = await request<{ ok: true; assignedUserId: string | null; departmentId: string | null }>(
    "POST",
    `/app/conversation/${waId}/transfer`,
    businessAdmin,
    { userId: businessSupervisor.id }
  );
  assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
  assert.equal(transfer.body.assignedUserId, businessSupervisor.id);
  assert.equal(transfer.body.departmentId, departments[0].id);

  const releaseToCurrentQueue = await request<{
    ok: true;
    assignedUserId: string | null;
    departmentId: string | null;
    queueId: string | null;
    status: string | null;
  }>(
    "POST",
    `/app/conversation/${waId}/release-to-general`,
    businessSupervisor
  );
  assert.equal(releaseToCurrentQueue.status, 200, JSON.stringify(releaseToCurrentQueue.body));
  assert.equal(releaseToCurrentQueue.body.assignedUserId, null);
  assert.equal(releaseToCurrentQueue.body.departmentId, departments[0].id);
  assert.equal(releaseToCurrentQueue.body.queueId, departments[0].queueId);
  assert.equal(releaseToCurrentQueue.body.status, "WAITING");

  const releasedDetail = await request<{
    ok: true;
    assignedUserId: string | null;
    departmentId: string | null;
    queueId: string | null;
    status: string | null;
    mode: string | null;
    handoffStatus: string | null;
  }>("GET", `/app/conversation/${waId}`, businessAdmin);
  assert.equal(releasedDetail.status, 200, JSON.stringify(releasedDetail.body));
  assert.equal(releasedDetail.body.assignedUserId, null);
  assert.equal(releasedDetail.body.departmentId, departments[0].id);
  assert.equal(releasedDetail.body.queueId, departments[0].queueId);
  assert.equal(releasedDetail.body.status, "WAITING");
  assert.equal(releasedDetail.body.mode, "HUMAN");
  assert.equal(releasedDetail.body.handoffStatus, "active");

  const transferDepartment = await request<{
    ok: true;
    assignedUserId: string | null;
    departmentId: string | null;
    queueId: string | null;
    status: string | null;
  }>("POST", `/app/conversation/${waId}/transfer-department`, businessSupervisor, {
    departmentId: departments[1].id,
  });
  assert.equal(transferDepartment.status, 200, JSON.stringify(transferDepartment.body));
  assert.equal(transferDepartment.body.assignedUserId, null);
  assert.equal(transferDepartment.body.departmentId, departments[1].id);
  assert.ok(transferDepartment.body.queueId);
  assert.equal(transferDepartment.body.status, "WAITING");
  const transferredDepartmentQueueId = transferDepartment.body.queueId;
  const destinationMemberInbox = await request<{
    ok: true;
    readState?: {
      manuallyUnreadByConversationKey: Record<string, boolean>;
    };
  }>("GET", `/app/conversations?departmentId=${departments[1].id}`, multiDepartmentAgent);
  assert.equal(destinationMemberInbox.status, 200, JSON.stringify(destinationMemberInbox.body));
  assert.equal(destinationMemberInbox.body.readState?.manuallyUnreadByConversationKey[waId], true);

  const transferToMember = await request<{ ok: true; assignedUserId: string | null; departmentId: string | null; queueId: string | null }>(
    "POST",
    `/app/conversation/${waId}/transfer`,
    businessSupervisor,
    { userId: businessAdmin.id }
  );
  assert.equal(transferToMember.status, 200, JSON.stringify(transferToMember.body));
  assert.equal(transferToMember.body.assignedUserId, businessAdmin.id);
  assert.equal(transferToMember.body.departmentId, departments[1].id);
  assert.equal(transferToMember.body.queueId, transferredDepartmentQueueId);

  const nonMember = await createUser({
    clientId: businessClientId,
    role: "AGENT",
    suffix: "non-member-current-queue",
  });
  await prisma.userDepartmentMembership.create({
    data: {
      clientId: businessClientId,
      userId: nonMember.id,
      departmentId: departments[2].id,
      isPrimary: true,
      isActive: true,
    },
  });
  const transferToNonMember = await request<{
    ok: true;
    assignedUserId: string | null;
    departmentId: string | null;
    queueId: string | null;
  }>(
    "POST",
    `/app/conversation/${waId}/transfer`,
    businessAdmin,
    { userId: nonMember.id }
  );
  assert.equal(transferToNonMember.status, 200, JSON.stringify(transferToNonMember.body));
  assert.equal(transferToNonMember.body.assignedUserId, nonMember.id);
  assert.equal(transferToNonMember.body.departmentId, departments[1].id);
  assert.equal(transferToNonMember.body.queueId, transferredDepartmentQueueId);
  const afterNonMemberTransfer = await request<{
    ok: true;
    assignedUserId: string | null;
    departmentId: string | null;
    queueId: string | null;
  }>("GET", `/app/conversation/${waId}`, businessAdmin);
  assert.equal(afterNonMemberTransfer.status, 200, JSON.stringify(afterNonMemberTransfer.body));
  assert.equal(afterNonMemberTransfer.body.assignedUserId, nonMember.id);
  assert.equal(afterNonMemberTransfer.body.departmentId, departments[1].id);
  assert.equal(afterNonMemberTransfer.body.queueId, transferredDepartmentQueueId);

  await prisma.tenantOperationalConfig.upsert({
    where: { clientId: businessClientId },
    create: {
      clientId: businessClientId,
      config: {
        queueAssignmentPolicy: {
          enabled: false,
          mode: "manual",
          scope: "department",
          maxActivePerAgent: 1,
          includeSupervisors: true,
          requireOnline: false,
          notifyAssignedOnly: false,
          lastAssignedUserIdByScope: {},
        },
      },
    },
    update: {
      config: {
        queueAssignmentPolicy: {
          enabled: false,
          mode: "manual",
          scope: "department",
          maxActivePerAgent: 1,
          includeSupervisors: true,
          requireOnline: false,
          notifyAssignedOnly: false,
          lastAssignedUserIdByScope: {},
        },
      },
    },
  });
  await prisma.conversationRuntimeState.create({
    data: {
      clientId: businessClientId,
      waId: "5584993310199",
      waIdCanonical: "5584993310199",
      conversationKey: `${prefix}-business:5584993310199`,
      channel: "whatsapp",
      provider: "meta",
      departmentId: departments[1].id,
      queueId: transferredDepartmentQueueId,
      assignedUserId: businessAdmin.id,
      assignedTo: `user:${businessAdmin.id}`,
      assignedAt: new Date(),
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mode: "HUMAN",
      status: "IN_PROGRESS",
      handoffStatus: "ACTIVE",
      lastInboundAt: new Date(),
    },
  });
  const waIdCapacity = "5584993310102";
  await prisma.conversation.create({
    data: {
      clientId: businessClientId,
      waId: waIdCapacity,
      waIdCanonical: waIdCapacity,
      channel: "whatsapp",
      provider: "meta",
      departmentId: departments[1].id,
      windowIsOpen: true,
      windowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastInboundAt: new Date(),
    },
  });
  await runtimeStorage.upsertConversation({
    clientKey: `${prefix}-business`,
    conversationKey: `${prefix}-business:${waIdCapacity}`,
    waId: waIdCapacity,
    waIdCanonical: waIdCapacity,
    firstSeenAt: new Date().toISOString(),
    lastInboundAt: new Date().toISOString(),
    window: { isOpen: true, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    handoff: { status: "active" },
    mode: "HUMAN",
    status: "WAITING",
    assignedUserId: null,
    assignedTo: null,
    answers: {},
    chatbotActive: false,
    departmentId: departments[1].id,
    queueId: transferredDepartmentQueueId,
  } as ConversationState);
  const capacityClaim = await request<ErrorPayload>(
    "POST",
    `/app/conversation/${waIdCapacity}/claim`,
    businessAdmin,
    {}
  );
  assert.equal(capacityClaim.status, 409, JSON.stringify(capacityClaim.body));
  assert.equal(getErrorCode(capacityClaim.body), "max_active_reached");
  const capacityTransfer = await request<ErrorPayload>(
    "POST",
    `/app/conversation/${waIdCapacity}/transfer`,
    businessSupervisor,
    { userId: businessAdmin.id }
  );
  assert.equal(capacityTransfer.status, 409, JSON.stringify(capacityTransfer.body));
  assert.equal(getErrorCode(capacityTransfer.body), "max_active_reached");

  const closeToGeneral = await request<ErrorPayload>(
    "POST",
    `/app/conversation/${waId}/close-to-general`,
    businessSupervisor
  );
  assert.equal(closeToGeneral.status, 409, JSON.stringify(closeToGeneral.body));
  assert.equal(getErrorCode(closeToGeneral.body), "general_queue_unavailable");

  const activeGeneralDepartments = await prisma.department.count({
    where: {
      clientId: businessClientId,
      isActive: true,
      OR: [
        { name: { equals: "Atendimento Geral", mode: "insensitive" } },
        { slug: { equals: "atendimento-geral", mode: "insensitive" } },
        { name: { equals: "Geral", mode: "insensitive" } },
        { slug: { equals: "geral", mode: "insensitive" } },
      ],
    },
  });
  assert.equal(activeGeneralDepartments, 0);
});

test("tenant admins manage department schedule exceptions with RBAC and tenant isolation", async () => {
  const departmentA = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Agenda A`,
      slug: `${prefix}-agenda-a`,
    },
    select: { id: true },
  });
  const departmentB = await prisma.department.create({
    data: {
      clientId: businessClientId,
      name: `${prefix} Agenda B`,
      slug: `${prefix}-agenda-b`,
    },
    select: { id: true },
  });
  const otherDepartment = await prisma.department.create({
    data: {
      clientId: governmentClientId,
      name: `${prefix} Agenda Gov`,
      slug: `${prefix}-agenda-gov`,
    },
    select: { id: true },
  });
  const regularHours = [
    { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
    { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
    { weekday: 2, startMinute: 8 * 60, endMinute: 12 * 60 },
    { weekday: 2, startMinute: 13 * 60, endMinute: 17 * 60 },
  ];

  for (const department of [departmentA, departmentB]) {
    const saved = await request<{ ok: true; department: { businessHours: unknown[] } }>(
      "PUT",
      `/app/departments/${department.id}`,
      businessAdmin,
      { businessHours: regularHours }
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.body.department.businessHours.length, regularHours.length);
  }

  const supervisorList = await request<{ ok: true; items: Array<{ id: string; businessHourExceptions?: unknown[] }> }>(
    "GET",
    "/app/departments",
    businessSupervisor
  );
  assert.equal(supervisorList.status, 200);
  assert.ok(supervisorList.body.items.some((item) => item.id === departmentA.id));

  const supervisorCreated = await request<{ ok: true; department: { id: string; name: string; isActive: boolean } }>(
    "POST",
    "/app/departments",
    businessSupervisor,
    {
      name: `${prefix} Supervisor Created Department`,
      isActive: true,
      businessHours: regularHours,
    }
  );
  assert.equal(supervisorCreated.status, 200, JSON.stringify(supervisorCreated.body));
  assert.equal(supervisorCreated.body.department.isActive, true);

  const supervisorMutation = await request<{ ok: true; department: { businessHourExceptions: Array<{ date: string; type: string }> } }>(
    "PUT",
    `/app/departments/${departmentA.id}`,
    businessSupervisor,
    {
      businessHourExceptions: [{ date: "2026-09-07", type: "CLOSED", reason: "Teste supervisor" }],
    }
  );
  assert.equal(supervisorMutation.status, 200);
  assert.equal(supervisorMutation.body.department.businessHourExceptions[0].type, "CLOSED");

  const supervisorToggle = await request<{ ok: true; department: { isActive: boolean } }>(
    "PUT",
    `/app/departments/${supervisorCreated.body.department.id}`,
    businessSupervisor,
    { isActive: false }
  );
  assert.equal(supervisorToggle.status, 200);
  assert.equal(supervisorToggle.body.department.isActive, false);

  const agentMutation = await request<ErrorPayload>(
    "PUT",
    `/app/departments/${departmentA.id}`,
    businessAgent,
    {
      businessHourExceptions: [{ date: "2026-09-07", type: "CLOSED", reason: "Teste agente" }],
    }
  );
  assert.equal(agentMutation.status, 403);

  const crossTenantMutation = await request<ErrorPayload>(
    "PUT",
    `/app/departments/${otherDepartment.id}`,
    businessAdmin,
    {
      businessHourExceptions: [{ date: "2026-09-07", type: "CLOSED", reason: "Outro tenant" }],
    }
  );
  assert.equal(crossTenantMutation.status, 404);
  assert.equal(getErrorCode(crossTenantMutation.body), "department_not_found");

  const closedPayload = {
    businessHourExceptions: [{ date: "2026-09-07", type: "CLOSED", reason: "Independencia do Brasil" }],
  };
  const closedA = await request<{ ok: true; department: { businessHourExceptions: Array<{ date: string; type: string }> } }>(
    "PUT",
    `/app/departments/${departmentA.id}`,
    businessAdmin,
    closedPayload
  );
  const closedB = await request<{ ok: true; department: { businessHourExceptions: Array<{ date: string; type: string }> } }>(
    "PUT",
    `/app/departments/${departmentB.id}`,
    businessAdmin,
    closedPayload
  );
  assert.equal(closedA.status, 200);
  assert.equal(closedB.status, 200);
  assert.equal(closedA.body.department.businessHourExceptions[0].type, "CLOSED");
  assert.equal(closedB.body.department.businessHourExceptions[0].date, "2026-09-07");

  const closedAvailability = await getDepartmentAvailability(prisma, {
    clientId: businessClientId,
    departmentId: departmentA.id,
    at: new Date("2026-09-07T13:00:00.000Z"),
  });
  assert.equal(closedAvailability.status, "CLOSED");
  assert.equal(closedAvailability.reason, "EXCEPTION");

  const nextOpen = await getNextDepartmentOpenAt(prisma, {
    clientId: businessClientId,
    departmentId: departmentA.id,
    after: new Date("2026-09-04T20:30:00.000Z"),
  });
  assert.equal(nextOpen?.date, "2026-09-08");

  const custom = await request<{ ok: true; department: { businessHourExceptions: Array<{ date: string; type: string; intervals: unknown[] }> } }>(
    "PUT",
    `/app/departments/${departmentA.id}`,
    businessAdmin,
    {
      businessHourExceptions: [
        {
          date: "2026-09-07",
          type: "CUSTOM_HOURS",
          reason: "Expediente especial",
          intervals: [{ startMinute: 10 * 60, endMinute: 11 * 60 }],
        },
      ],
    }
  );
  assert.equal(custom.status, 200);
  assert.equal(custom.body.department.businessHourExceptions[0].type, "CUSTOM_HOURS");
  assert.equal(custom.body.department.businessHourExceptions[0].intervals.length, 1);

  const customOpen = await getDepartmentAvailability(prisma, {
    clientId: businessClientId,
    departmentId: departmentA.id,
    at: new Date("2026-09-07T13:30:00.000Z"),
  });
  const customClosed = await getDepartmentAvailability(prisma, {
    clientId: businessClientId,
    departmentId: departmentA.id,
    at: new Date("2026-09-07T15:30:00.000Z"),
  });
  assert.equal(customOpen.status, "OPEN");
  assert.equal(customClosed.status, "CLOSED");

  const removed = await request<{ ok: true; department: { businessHourExceptions: unknown[] } }>(
    "PUT",
    `/app/departments/${departmentA.id}`,
    businessAdmin,
    { businessHourExceptions: [] }
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.body.department.businessHourExceptions.length, 0);

  const isolatedRead = await request<{ ok: true; items: Array<{ id: string }> }>(
    "GET",
    `/app/departments?clientId=${encodeURIComponent(governmentClientId)}`,
    businessAdmin
  );
  assert.equal(isolatedRead.status, 200);
  assert.ok(isolatedRead.body.items.some((item) => item.id === departmentA.id));
  assert.equal(isolatedRead.body.items.some((item) => item.id === otherDepartment.id), false);

  const platformList = await requestAdmin<{ ok: true; items: Array<{ id: string; businessHourExceptions?: unknown[] }> }>(
    "GET",
    `/admin/departments?clientKey=${prefix}-business&includeInactive=true`
  );
  assert.equal(platformList.status, 200);
  assert.ok(platformList.body.items.some((item) => item.id === departmentB.id));

  const auditEvents = await prisma.event.findMany({
    where: {
      clientId: businessClientId,
      eventName: { in: ["department.business_hour_exceptions.updated", "department.business_hour_exceptions.deleted"] },
    },
    select: { payloadJson: true },
  });
  assert.ok(auditEvents.some((event) => JSON.stringify(event.payloadJson).includes(businessAdmin.id)));
});
