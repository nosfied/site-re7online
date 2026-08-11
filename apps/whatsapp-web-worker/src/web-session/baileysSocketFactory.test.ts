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
    },
  };
  const module = {
    Browsers: {
      ubuntu: (browserName: string) => ["Ubuntu", browserName, "1.0.0"],
    },
    makeWASocket: (params: Record<string, unknown>) => {
      calls.push(params);
      return socket;
    },
  };
  const qrValues: string[] = [];
  let credentialsUpdated = false;

  const result = createBaileysSocketFromModule(module, {
    authState: { creds: "redacted" },
    browserName: "Converta Lab",
    onQr: (qr) => qrValues.push(qr),
    onCredentialsUpdate: () => {
      credentialsUpdated = true;
    },
  });

  assert.equal(result, socket);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.printQRInTerminal, false);
  assert.equal(calls[0]?.markOnlineOnConnect, false);
  assert.equal(calls[0]?.syncFullHistory, false);
  assert.deepEqual(calls[0]?.browser, ["Ubuntu", "Converta Lab", "1.0.0"]);
  assert.equal(handlers.has("connection.update"), true);
  assert.equal(handlers.has("creds.update"), true);

  handlers.get("connection.update")?.({ qr: "qr-payload" } as never);
  await handlers.get("creds.update")?.();

  assert.deepEqual(qrValues, ["qr-payload"]);
  assert.equal(credentialsUpdated, true);
});
