import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_AUTH_SESSION_EXPIRES_AT } from "../auth/appSessionService.js";
import { issueClientAuthToken } from "../auth/clientAuth.js";
import {
  filterOptedOutCampaignRecipients,
  recordContactOptOut,
  revokeContactOptOut,
} from "../campaigns/optOutRegistry.js";
import { getPrisma } from "../db.js";

process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "campaigns-feature-route-test-secret";

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

let tempRoot = "";
let server: Server;
let baseUrl = "";
let handleRequest: typeof import("./routes.js").handleRequest;

let businessClientId = "";
let governmentClientId = "";
let overrideClientId = "";
let killSwitchClientId = "";
let businessAdmin: TestUser;
let governmentAdmin: TestUser;
let overrideAdmin: TestUser;
let killSwitchAdmin: TestUser;

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
      expiresAt: APP_AUTH_SESSION_EXPIRES_AT,
    },
  });
  return user;
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

async function cleanup() {
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
  await prisma.campaign.deleteMany({
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
      features: { campaigns: true },
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

  businessClientId = businessClient.id;
  governmentClientId = governmentClient.id;
  overrideClientId = overrideClient.id;
  killSwitchClientId = killSwitchClient.id;
  await writeTenants([
    businessClient.clientKey,
    governmentClient.clientKey,
    overrideClient.clientKey,
    killSwitchClient.clientKey,
  ]);

  businessAdmin = await createUser({
    clientId: businessClientId,
    role: "ADMIN",
    suffix: "business-admin",
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

  handleRequest = (await import("./routes.js")).handleRequest;
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

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.count, 0);
});

test("government profile default is blocked from campaigns routes", async () => {
  const routes = [
    { method: "GET", route: "/app/campaigns" },
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
