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
  let batchKeys: string[] = [];

  const result = await createBaileysSocketFromModule(module, {
    authState: { creds: "redacted" },
    browserName: "Converta Lab",
    onQr: (qr) => qrValues.push(qr),
    onConnectionUpdate: () => {
      connectionUpdateSeen = true;
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
  assert.equal(handlers.has("process"), true);

  handlers.get("connection.update")?.({ qr: "qr-payload" } as never);
  await handlers.get("creds.update")?.();
  await handlers.get("messages.upsert")?.({ type: "notify", messages: [] } as never);
  await handlers.get("messages.update")?.([{ key: {}, update: {} }] as never);
  await handlers.get("process")?.({ "messages.upsert": { messages: [] } } as never);

  assert.deepEqual(qrValues, ["qr-payload"]);
  assert.equal(connectionUpdateSeen, true);
  assert.equal(credentialsUpdated, true);
  assert.equal(upsertType, "notify");
  assert.equal(updateCount, 1);
  assert.deepEqual(batchKeys, ["messages.upsert"]);
});
