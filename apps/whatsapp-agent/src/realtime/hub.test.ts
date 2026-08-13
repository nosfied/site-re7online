import { strict as assert } from "node:assert";
import test from "node:test";
import { WebSocket } from "ws";
import {
  addConnection,
  closeRealtimeConnectionsForClient,
  closeRealtimeConnectionsForClientSupport,
  closeRealtimeConnectionsForSupportGrant,
  publishRealtimeEvent,
} from "./hub.js";

type FakeSocketShape = {
  readyState: number;
  sent: string[];
  closed: Array<{ code: number; reason: string }>;
  on: () => FakeSocketShape;
  send: (payload: string) => void;
  close: (code: number, reason: string) => void;
  terminate: () => void;
  ping: () => undefined;
};

function fakeSocket() {
  const socket: FakeSocketShape = {
    readyState: WebSocket.OPEN,
    sent: [] as string[],
    closed: [] as Array<{ code: number; reason: string }>,
    on() {
      return this;
    },
    send(payload: string) {
      socket.sent.push(payload);
    },
    close(code: number, reason: string) {
      socket.readyState = WebSocket.CLOSED;
      socket.closed.push({ code, reason });
    },
    terminate() {
      socket.readyState = WebSocket.CLOSED;
    },
    ping() {
      return undefined;
    },
  };
  return socket as unknown as WebSocket & {
    readyState: number;
    sent: string[];
    closed: Array<{ code: number; reason: string }>;
  };
}

function eventFor(clientId: string) {
  return {
    type: "message.created" as const,
    clientId,
    waId: "support:test",
    message: {
      direction: "INBOUND" as const,
      type: "TEXT",
      status: "RECEIVED" as const,
      intent: null,
      bodyText: "teste",
      templateName: null,
      templateLang: null,
      requestId: null,
      messageId: "msg_1",
      metaMessageId: null,
      errorBody: null,
      createdAt: new Date().toISOString(),
    },
  };
}

test("platform support realtime connections close on grant revocation and replacement", () => {
  const normal = fakeSocket();
  const support = fakeSocket();
  addConnection(normal, {
    clientId: "tenant-a",
    userId: "tenant-user",
    email: "tenant@example.test",
    role: "ADMIN",
  });
  addConnection(support, {
    clientId: "tenant-a",
    userId: "support-user",
    email: "support@example.test",
    role: "ADMIN",
    supportAccess: {
      grantId: "grant-a",
      supportSessionId: "support-session-a",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });

  publishRealtimeEvent(eventFor("tenant-a"));
  assert.equal(normal.sent.length, 1);
  assert.equal(support.sent.length, 1);

  closeRealtimeConnectionsForSupportGrant("grant-a", "support_grant_revoked");
  publishRealtimeEvent(eventFor("tenant-a"));

  assert.equal(normal.sent.length, 2);
  assert.equal(support.sent.length, 1);
  assert.equal(support.closed[0]?.reason, "support_grant_revoked");

  const replaced = fakeSocket();
  addConnection(replaced, {
    clientId: "tenant-a",
    userId: "support-user",
    email: "support@example.test",
    role: "ADMIN",
    supportAccess: {
      grantId: "grant-b",
      supportSessionId: "support-session-b",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });

  closeRealtimeConnectionsForClientSupport("tenant-a", "support_grant_replaced");
  publishRealtimeEvent(eventFor("tenant-a"));
  assert.equal(normal.sent.length, 3);
  assert.equal(replaced.sent.length, 0);
  assert.equal(replaced.closed[0]?.reason, "support_grant_replaced");
  closeRealtimeConnectionsForClient("tenant-a", "test_cleanup");
});

test("expired platform support realtime connection does not receive new events", () => {
  const support = fakeSocket();
  addConnection(support, {
    clientId: "tenant-expired",
    userId: "support-user",
    email: "support@example.test",
    role: "ADMIN",
    supportAccess: {
      grantId: "grant-expired",
      supportSessionId: "support-session-expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
  });

  publishRealtimeEvent(eventFor("tenant-expired"));

  assert.equal(support.sent.length, 0);
  assert.equal(support.closed[0]?.reason, "support_access_expired");
});
