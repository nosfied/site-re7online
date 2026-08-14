import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWebSessionReceiptRealtimePayload,
  connectionOpenTimeoutRuntimeState,
  isTransientConnectingState,
  isEligibleWebSessionAccount,
  listEligibleWebSessionAccounts,
  nextWebSessionReconnectCount,
  resolveWebSessionDisconnectRuntimeState,
  resolveWebSessionSenderJid,
  sendMediaViaActiveWebSession,
  sendTextViaActiveWebSession,
  setActiveWebSessionConnectionForTesting,
  shouldKeepActiveWebSessionConnection,
} from "./whatsappWebSessionWorker.js";

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-a",
    clientId: "client-a",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: "session-a",
    enabled: true,
    runtimeEnabled: true,
    status: "connected",
    metadata: { webSession: { desiredState: "CONNECTED" } },
    client: {
      id: "client-a",
      clientKey: "tenant-a",
      status: "ACTIVE",
      profile: "business",
      features: { whatsappWebSession: true },
    },
    ...overrides,
  };
}

test("web session worker gates ignore non eligible accounts", () => {
  assert.equal(isEligibleWebSessionAccount(account({ client: { ...account().client, features: {} } }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ client: { ...account().client, status: "INACTIVE" } }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ provider: "meta" }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ channel: "instagram" }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ enabled: false }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ runtimeEnabled: false }) as never), false);
  assert.equal(isEligibleWebSessionAccount(account({ metadata: { webSession: { desiredState: "DISCONNECTED" } } }) as never), false);
});

test("web session worker finds only future eligible web session account", async () => {
  const prisma = {
    channelAccount: {
      findMany: async () => [
        account(),
        account({ id: "account-meta", provider: "meta" }),
        account({ id: "account-disabled", enabled: false }),
      ],
    },
  };
  const result = await listEligibleWebSessionAccounts(prisma as never);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.tenantKey, "tenant-a");
  assert.equal(result[0]?.channelAccountId, "session-a");
});

test("web session worker stops active connection when admin requests disconnect", () => {
  assert.equal(shouldKeepActiveWebSessionConnection(account() as never), true);
  assert.equal(
    shouldKeepActiveWebSessionConnection(account({
      runtimeEnabled: false,
      status: "disconnected",
      metadata: { webSession: { desiredState: "DISCONNECTED", observedState: "DISCONNECTED" } },
    }) as never),
    false
  );
  assert.equal(
    shouldKeepActiveWebSessionConnection(account({
      metadata: { webSession: { desiredState: "DISCONNECTED", observedState: "DISCONNECTED" } },
    }) as never),
    false
  );
});

test("web session worker identifies only transient active connection states", () => {
  assert.equal(isTransientConnectingState(account({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTING" } },
  }) as never), true);
  assert.equal(isTransientConnectingState(account({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "RECONNECTING" } },
  }) as never), true);
  assert.equal(isTransientConnectingState(account({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "QR_REQUIRED" } },
  }) as never), false);
  assert.equal(isTransientConnectingState(account({
    metadata: { webSession: { desiredState: "CONNECTED", observedState: "CONNECTED" } },
  }) as never), false);
});

test("web session worker builds receipt realtime payload without message content", () => {
  const payload = buildWebSessionReceiptRealtimePayload({
    clientId: "client-a",
    messageId: "web.session.send.1",
    externalMessageId: "baileys-ext-1",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    status: "read",
    updatedAt: "2026-08-12T12:00:00.000Z",
  });

  assert.deepEqual(payload, {
    clientId: "client-a",
    messageId: "web.session.send.1",
    externalMessageId: "baileys-ext-1",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    status: "READ",
    updatedAt: "2026-08-12T12:00:00.000Z",
  });
  assert.equal("bodyText" in payload, false);
  assert.equal("rawPayload" in payload, false);
  assert.equal("token" in payload, false);
});

test("web session worker keeps connection timeout retryable", () => {
  const timeoutState = connectionOpenTimeoutRuntimeState();
  assert.equal(timeoutState.observedState, "RECONNECTING");
  assert.equal(timeoutState.status, "pending");
  assert.equal(timeoutState.errorCode, "connection_open_timeout");
  assert.equal(
    isEligibleWebSessionAccount(account({
      status: timeoutState.status,
      metadata: {
        webSession: {
          desiredState: "CONNECTED",
          observedState: timeoutState.observedState,
          lastErrorCode: timeoutState.errorCode,
        },
      },
    }) as never),
    true
  );
});

test("web session worker keeps internal socket close retryable while connect is requested", () => {
  const runtimeState = resolveWebSessionDisconnectRuntimeState({
    classification: "terminal_manual",
    stillRequested: true,
    reconnectCount: 2,
  });
  assert.equal(runtimeState.observedState, "RECONNECTING");
  assert.equal(runtimeState.status, "pending");
  assert.equal(runtimeState.errorCode, "terminal_manual");
  assert.equal(runtimeState.eventName, "whatsapp.web_session.reconnecting");
  assert.equal(runtimeState.eventReason, "internal_socket_closed");
  assert.equal(runtimeState.reconnectCount, 3);
  assert.equal(nextWebSessionReconnectCount(0), 1);
});

test("web session worker only requires QR for proven auth loss", () => {
  const loggedOut = resolveWebSessionDisconnectRuntimeState({
    classification: "qr_required",
    stillRequested: true,
    reconnectCount: 4,
  });
  assert.equal(loggedOut.observedState, "QR_REQUIRED");
  assert.equal(loggedOut.status, "disconnected");
  assert.equal(loggedOut.reconnectCount, 4);

  const adminStopped = resolveWebSessionDisconnectRuntimeState({
    classification: "terminal_manual",
    stillRequested: false,
    reconnectCount: 5,
  });
  assert.equal(adminStopped.observedState, "DISCONNECTED");
  assert.equal(adminStopped.status, "disconnected");
  assert.equal(adminStopped.reconnectCount, 5);
});

test("web session worker resolves LID sender through persisted reverse mapping", async () => {
  const requested: Array<{ type: string; ids: string[] }> = [];
  const resolved = await resolveWebSessionSenderJid({
    message: {
      key: { id: "m1", remoteJid: "123456789012345@lid", fromMe: false },
      message: { conversation: "teste" },
    },
    keys: {
      get: async (type, ids) => {
        requested.push({ type, ids });
        return { "123456789012345_reverse": "5584999997784" };
      },
    },
  });

  assert.equal(resolved, "5584999997784@s.whatsapp.net");
  assert.deepEqual(requested, [{ type: "lid-mapping", ids: ["123456789012345_reverse"] }]);
});

test("web session worker sends text through an active socket", async (t) => {
  const sent: Array<{ jid: string; text: string; options?: Record<string, unknown> }> = [];
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      sendMessage: async (jid, content, options) => {
        sent.push({ jid, text: String(content.text), options });
        return { key: { id: "baileys-message-id" } };
      },
    },
    release: async () => {},
  });
  t.after(() => setActiveWebSessionConnectionForTesting("account-a", null));
  const prisma = {
    channelAccount: {
      findFirst: async () => account({
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
      }),
    },
  };

  const result = await sendTextViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    recipientWaId: "5584999997784",
    text: "Mensagem de teste",
    requestId: "request-a",
  });

  assert.deepEqual(result, { ok: true, externalMessageId: "baileys-message-id" });
  assert.deepEqual(sent, [{ jid: "5584999997784@s.whatsapp.net", text: "Mensagem de teste", options: undefined }]);
});

test("web session worker sends text with Baileys quoted reference", async (t) => {
  const sent: Array<{ jid: string; content: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      sendMessage: async (jid, content, options) => {
        sent.push({ jid, content, options });
        return { key: { id: "baileys-reply-id" } };
      },
    },
    release: async () => {},
  });
  t.after(() => setActiveWebSessionConnectionForTesting("account-a", null));
  const prisma = {
    channelAccount: {
      findFirst: async () => account({
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
      }),
    },
  };

  const result = await sendTextViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    recipientWaId: "5584999997784",
    text: "Resposta contextual",
    replyTo: {
      externalMessageId: "INBOUND_EXT_1",
      remoteJid: "5584999997784@s.whatsapp.net",
      fromMe: false,
      messageType: "AUDIO",
      mimeType: "audio/ogg",
    },
    requestId: "request-reply-a",
  });

  assert.deepEqual(result, { ok: true, externalMessageId: "baileys-reply-id" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.jid, "5584999997784@s.whatsapp.net");
  assert.deepEqual(sent[0]?.content, { text: "Resposta contextual" });
  const quoted = sent[0]?.options?.quoted as Record<string, unknown>;
  assert.equal((quoted.key as Record<string, unknown>).id, "INBOUND_EXT_1");
  assert.equal((quoted.key as Record<string, unknown>).remoteJid, "5584999997784@s.whatsapp.net");
  assert.equal((quoted.key as Record<string, unknown>).fromMe, false);
  assert.equal(Boolean((quoted.message as Record<string, unknown>).audioMessage), true);
});

test("web session worker refuses text when no active socket is available", async () => {
  setActiveWebSessionConnectionForTesting("account-a", null);
  const prisma = {
    channelAccount: {
      findFirst: async () => account({
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
      }),
    },
  };

  const result = await sendTextViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    recipientWaId: "5584999997784",
    text: "Mensagem de teste",
    requestId: "request-b",
  });

  assert.deepEqual(result, {
    ok: false,
    statusCode: 503,
    error: "web_session_worker_not_connected",
  });
});

test("web session worker sends media through an active socket", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "web-session-worker-media-"));
  const mediaPath = path.join(tmpDir, "document.txt");
  await fs.writeFile(mediaPath, "conteudo");
  t.after(async () => {
    setActiveWebSessionConnectionForTesting("account-a", null);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  const sent: Array<{ jid: string; content: Record<string, unknown> }> = [];
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      sendMessage: async (jid, content) => {
        sent.push({ jid, content });
        return { key: { id: "baileys-media-id" } };
      },
    },
    release: async () => {},
  });
  const prisma = {
    channelAccount: {
      findFirst: async () => account({
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
      }),
    },
  };

  const result = await sendMediaViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    recipientWaId: "5584999997784",
    mediaPath,
    mediaKind: "document",
    mimeType: "text/plain",
    fileName: "document.txt",
    caption: null,
    requestId: "request-media-a",
  });

  assert.deepEqual(result, { ok: true, externalMessageId: "baileys-media-id" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.jid, "5584999997784@s.whatsapp.net");
  assert.deepEqual(Object.keys(sent[0]?.content ?? {}).sort(), ["caption", "document", "fileName", "mimetype"]);
});

test("web session worker sends audio as WhatsApp voice note compatible opus", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "web-session-worker-audio-"));
  const mediaPath = path.join(tmpDir, "audio.ogg");
  await fs.writeFile(mediaPath, Buffer.from("ogg opus audio"));
  t.after(async () => {
    setActiveWebSessionConnectionForTesting("account-a", null);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  const sent: Array<{ jid: string; content: Record<string, unknown> }> = [];
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      sendMessage: async (jid, content) => {
        sent.push({ jid, content });
        return { key: { id: "baileys-audio-id" } };
      },
    },
    release: async () => {},
  });
  const prisma = {
    channelAccount: {
      findFirst: async () => account({
        metadata: {
          webSession: {
            desiredState: "CONNECTED",
            observedState: "CONNECTED",
          },
        },
      }),
    },
  };

  const result = await sendMediaViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    recipientWaId: "5584999997784",
    mediaPath,
    mediaKind: "audio",
    mimeType: "audio/ogg",
    fileName: "audio.ogg",
    caption: null,
    requestId: "request-audio-a",
  });

  assert.deepEqual(result, { ok: true, externalMessageId: "baileys-audio-id" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.jid, "5584999997784@s.whatsapp.net");
  assert.deepEqual(sent[0]?.content, {
    audio: Buffer.from("ogg opus audio"),
    mimetype: "audio/ogg; codecs=opus",
    ptt: true,
  });
});
