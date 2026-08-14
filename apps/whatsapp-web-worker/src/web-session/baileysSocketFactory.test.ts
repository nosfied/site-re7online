import test from "node:test";
import assert from "node:assert/strict";
import { createBaileysSocketFromModule } from "./baileysSocketFactory.js";

test("baileys socket factory disables terminal QR and exposes safe event hooks", async () => {
  const handlers = new Map<string, (...args: never[]) => unknown>();
  const calls: Record<string, unknown>[] = [];
  const socket = {
    ev: {
      on(eventName: string, handler: (...args: never[]) => unknown) {
        handlers.set(eventName, handler);
      },
      process(handler: (events: Record<string, unknown>) => unknown) {
        handlers.set("process", handler as (...args: never[]) => unknown);
      },
    },
    ws: {
      on(eventName: string, handler: (node: unknown) => unknown) {
        handlers.set(eventName, handler as (...args: never[]) => unknown);
      },
    },
    user: { id: "5584999997784:1@s.whatsapp.net" },
  };
  const module = {
    Browsers: {
      macOS: (browserName: string) => ["Mac OS", browserName, "14.4.1"],
      ubuntu: (browserName: string) => ["Ubuntu", browserName, "1.0.0"],
    },
    makeWASocket: (params: Record<string, unknown>) => {
      calls.push(params);
      return socket;
    },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 123456789] }),
  };
  const qrValues: string[] = [];
  let credentialsUpdated = false;
  let connectionUpdateSeen = false;
  let upsertType = "";
  let updateCount = 0;
  let receiptCount = 0;
  let socketNodeName = "";
  let socketNodeChildTags: string[] = [];
  let socketNodeChildAttrsKeys: string[] = [];
  let socketNodeEncTypes: string[] = [];
  let batchKeys: string[] = [];
  let connectedUserId = "";

  const result = await createBaileysSocketFromModule(module, {
    authState: { creds: "redacted" },
    browserName: "Converta Lab",
    onQr: (qr) => qrValues.push(qr),
    onConnectionUpdate: () => {
      connectionUpdateSeen = true;
    },
    onConnected: (connectedSocket) => {
      const user = connectedSocket.user as { id?: string } | undefined;
      connectedUserId = user?.id ?? "";
    },
    onCredentialsUpdate: () => {
      credentialsUpdated = true;
    },
    onMessagesUpsert: (event) => {
      upsertType = event.type ?? "";
    },
    onMessagesUpdate: (event) => {
      updateCount = event.length;
    },
    onMessageReceiptUpdate: (event) => {
      receiptCount = event.length;
    },
    onSocketNode: (event) => {
      socketNodeName = event.name;
      socketNodeChildTags = event.childTags;
      socketNodeChildAttrsKeys = event.childAttrsKeys;
      socketNodeEncTypes = event.encTypes;
    },
    onEventBatch: (events) => {
      batchKeys = Object.keys(events);
    },
  });

  assert.equal(result, socket);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.printQRInTerminal, false);
  assert.equal(calls[0]?.markOnlineOnConnect, true);
  assert.equal(calls[0]?.syncFullHistory, false);
  assert.equal("shouldSyncHistoryMessage" in (calls[0] ?? {}), false);
  assert.deepEqual(calls[0]?.version, [2, 3000, 123456789]);
  assert.deepEqual(calls[0]?.browser, ["Mac OS", "Desktop", "14.4.1"]);
  assert.equal(handlers.has("connection.update"), true);
  assert.equal(handlers.has("creds.update"), true);
  assert.equal(handlers.has("messages.upsert"), true);
  assert.equal(handlers.has("messages.update"), true);
  assert.equal(handlers.has("message-receipt.update"), true);
  assert.equal(handlers.has("CB:message"), true);
  assert.equal(handlers.has("CB:notification"), true);
  assert.equal(handlers.has("CB:receipt"), true);
  assert.equal(handlers.has("CB:ack,class:message"), true);
  assert.equal(handlers.has("process"), true);

  handlers.get("connection.update")?.({ qr: "qr-payload" } as never);
  handlers.get("connection.update")?.({ connection: "open" } as never);
  await handlers.get("creds.update")?.();
  await handlers.get("messages.upsert")?.({ type: "notify", messages: [] } as never);
  await handlers.get("messages.update")?.([{ key: {}, update: {} }] as never);
  await handlers.get("message-receipt.update")?.([{ key: {}, receipt: {} }] as never);
  await handlers.get("CB:message")?.({
    tag: "message",
    attrs: { type: "text", from: "redacted@s.whatsapp.net", id: "redacted" },
    content: [
      { tag: "enc", attrs: { type: "pkmsg", from: "redacted@s.whatsapp.net", count: "1" } },
      { tag: "unavailable", attrs: { jid: "redacted@s.whatsapp.net" } },
    ],
  } as never);
  await handlers.get("process")?.({ "messages.upsert": { messages: [] } } as never);

  assert.deepEqual(qrValues, ["qr-payload"]);
  assert.equal(connectionUpdateSeen, true);
  assert.equal(connectedUserId, "5584999997784:1@s.whatsapp.net");
  assert.equal(credentialsUpdated, true);
  assert.equal(upsertType, "notify");
  assert.equal(updateCount, 1);
  assert.equal(receiptCount, 1);
  assert.equal(socketNodeName, "CB:message");
  assert.deepEqual(socketNodeChildTags, ["enc", "unavailable"]);
  assert.deepEqual(socketNodeChildAttrsKeys, ["count", "jid", "type"]);
  assert.deepEqual(socketNodeEncTypes, ["pkmsg"]);
  assert.deepEqual(batchKeys, ["messages.upsert"]);
});
