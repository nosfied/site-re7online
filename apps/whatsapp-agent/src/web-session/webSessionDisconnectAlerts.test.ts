import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWebSessionDisconnectAlertEmail,
  closeWebSessionDisconnectAlertIncident,
  notifyWebSessionDisconnectAlert,
  setWebSessionDisconnectAlertSenderForTests,
  WEB_SESSION_RECOVERABLE_DISCONNECT_ALERT_GRACE_MS,
} from "./webSessionDisconnectAlerts.js";

type EventRow = {
  id: string;
  clientId: string;
  requestId: string;
  eventName: string;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
};

function createPrismaMock() {
  let now = Date.parse("2026-08-22T15:00:00.000Z");
  const events: EventRow[] = [];
  const tenantConfigs = new Map<string, Record<string, unknown>>([
    ["client-a", { webSessionAlertEmails: ["ops-a@example.test", "invalid", "ops-a@example.test"] }],
    ["client-b", { webSessionAlertEmails: ["ops-b@example.test"] }],
  ]);
  return {
    events,
    tenantConfigs,
    advance(ms: number) {
      now += ms;
    },
    prisma: {
      tenantOperationalConfig: {
        findUnique: async (args: { where: { clientId: string }; select: { config: boolean } }) => ({
          config: tenantConfigs.get(args.where.clientId) ?? null,
        }),
        upsert: async () => {
          throw new Error("unexpected_tenant_operational_config_write");
        },
      },
      event: {
        findMany: async (args: {
          where: { clientId: string; eventName: { in: string[] } };
          orderBy: { createdAt: "desc" };
          take: number;
        }) => events
          .filter((event) => event.clientId === args.where.clientId && args.where.eventName.in.includes(event.eventName))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, args.take),
        create: async (args: { data: Omit<EventRow, "id" | "createdAt"> }) => {
          const row = {
            id: `event-${events.length + 1}`,
            createdAt: new Date(now + events.length),
            ...args.data,
          };
          events.push(row);
          return row;
        },
      },
      user: {
        findMany: async () => {
          throw new Error("tenant_app_users_must_not_be_alert_recipients");
        },
      },
    },
  };
}

test("web session terminal disconnect alert sends once and dedupes duplicates", async () => {
  const db = createPrismaMock();
  const sent: Array<{ to: string[]; subject: string; text: string; html: string }> = [];
  setWebSessionDisconnectAlertSenderForTests(async (message) => {
    sent.push(message);
  });

  const first = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "QR_REQUIRED",
    disconnectInfo: { statusCode: 401, reasonCode: "loggedOut", classification: "qr_required" },
    reconnectStatus: "nao disponivel",
    detectedAt: "2026-08-22T15:00:00.000Z",
  });
  const duplicate = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "QR_REQUIRED",
    disconnectInfo: { statusCode: 401, reasonCode: "loggedOut", classification: "qr_required" },
    reconnectStatus: "nao disponivel",
    detectedAt: "2026-08-22T15:00:01.000Z",
  });

  assert.equal(first.sent, true);
  assert.deepEqual(sent[0]?.to, ["ops-a@example.test"]);
  assert.equal(duplicate.sent, false);
  assert.equal(duplicate.reason, "deduped");
  assert.equal(sent.length, 1);
  assert.equal(db.events.filter((event) => event.eventName === "web_session.disconnect_alert.sent").length, 1);
  setWebSessionDisconnectAlertSenderForTests(null);
});

test("web session recoverable alert can be canceled by reconnect before grace", async () => {
  assert.equal(WEB_SESSION_RECOVERABLE_DISCONNECT_ALERT_GRACE_MS, 180000);
  const db = createPrismaMock();
  const sent: unknown[] = [];
  setWebSessionDisconnectAlertSenderForTests(async (message) => {
    sent.push(message);
  });

  await closeWebSessionDisconnectAlertIncident({
    prisma: db.prisma as never,
    clientId: "client-a",
    channelAccountId: "558491955328",
    observedState: "CONNECTED",
  });

  assert.equal(sent.length, 0);
  assert.equal(db.events.length, 0);
  setWebSessionDisconnectAlertSenderForTests(null);
});

test("web session recoverable disconnect after grace sends one tenant-scoped alert and closes on reconnect", async () => {
  const db = createPrismaMock();
  const sent: Array<{ to: string[] }> = [];
  setWebSessionDisconnectAlertSenderForTests(async (message) => {
    sent.push(message);
  });

  const alert = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "RECONNECTING",
    disconnectInfo: { statusCode: 408, reasonCode: "baileys_408", classification: "reconnectable" },
    reconnectStatus: "falhou",
  });
  const closed = await closeWebSessionDisconnectAlertIncident({
    prisma: db.prisma as never,
    clientId: "client-a",
    channelAccountId: "558491955328",
    observedState: "CONNECTED",
  });
  db.advance(WEB_SESSION_RECOVERABLE_DISCONNECT_ALERT_GRACE_MS);
  const second = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "RECONNECTING",
    disconnectInfo: { statusCode: 408, reasonCode: "baileys_408", classification: "reconnectable" },
    reconnectStatus: "falhou",
  });

  assert.equal(alert.sent, true);
  assert.equal(closed.closed, true);
  assert.equal(second.sent, true);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((item) => item.to), [["ops-a@example.test"], ["ops-a@example.test"]]);
  assert.equal(JSON.stringify(sent).includes("ops-b@example.test"), false);
  setWebSessionDisconnectAlertSenderForTests(null);
});

test("web session disconnect alert skips email when no operational alert recipients are configured", async () => {
  const db = createPrismaMock();
  db.tenantConfigs.set("client-a", {});
  const sent: unknown[] = [];
  setWebSessionDisconnectAlertSenderForTests(async (message) => {
    sent.push(message);
  });

  const result = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "QR_REQUIRED",
    disconnectInfo: { statusCode: 401, reasonCode: "loggedOut", classification: "qr_required" },
    reconnectStatus: "nao disponivel",
  });

  assert.equal(result.sent, false);
  assert.equal(result.reason, "no_recipients");
  assert.equal(sent.length, 0);
  const skipped = db.events.find((event) => event.eventName === "web_session.disconnect_alert.skipped");
  assert.ok(skipped);
  assert.equal(skipped.payloadJson.reason, "no_web_session_alert_emails");
  setWebSessionDisconnectAlertSenderForTests(null);
});

test("web session alert email failure is recorded without throwing", async () => {
  const db = createPrismaMock();
  setWebSessionDisconnectAlertSenderForTests(async () => {
    throw new Error("smtp_failed token=secret");
  });
  const result = await notifyWebSessionDisconnectAlert({
    prisma: db.prisma as never,
    clientId: "client-a",
    clientKey: "tenant-a",
    tenantName: "Tenant A",
    channelAccountId: "558491955328",
    observedState: "QR_REQUIRED",
    disconnectInfo: { statusCode: 401, reasonCode: "loggedOut", classification: "qr_required" },
    reconnectStatus: "nao disponivel",
  });

  assert.equal(result.sent, false);
  assert.equal(result.reason, "email_failed");
  const failure = db.events.find((event) => event.eventName === "web_session.disconnect_alert.failed");
  assert.ok(failure);
  assert.equal(JSON.stringify(failure).includes("token=secret"), false);
  assert.equal(JSON.stringify(failure).includes("token=[REDACTED]"), true);
  setWebSessionDisconnectAlertSenderForTests(null);
});

test("web session disconnect alert email is sanitized", () => {
  const email = buildWebSessionDisconnectAlertEmail({
    tenantName: "Tenant A",
    clientKey: "tenant-a",
    channelAccountId: "558491955328",
    observedState: "QR_REQUIRED",
    detectedAt: "2026-08-22T15:00:00.000Z",
    disconnectInfo: { statusCode: 440, reasonCode: "connectionReplaced", classification: "qr_required" },
    reconnectStatus: "nao disponivel",
  });
  const serialized = JSON.stringify(email);
  assert.equal(serialized.includes("558491955328"), false);
  assert.equal(serialized.includes("****5328"), true);
  assert.equal(serialized.includes("connectionReplaced"), true);
  assert.equal(serialized.includes("QR"), true);
});
