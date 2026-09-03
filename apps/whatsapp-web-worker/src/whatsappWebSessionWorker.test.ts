import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWebSessionDisconnectObservabilityPayload,
  buildWebSessionHandoffRealtimePayload,
  buildWebSessionMessageCreatedRealtimePayload,
  buildWebSessionReceiptRealtimePayload,
  connectionOpenTimeoutRuntimeState,
  getBaileysInboundMediaDescriptor,
  isTransientConnectingState,
  isEligibleWebSessionAccount,
  listEligibleWebSessionAccounts,
  nextWebSessionReconnectCount,
  resolveWebSessionDisconnectRuntimeState,
  resolveWebSessionSenderJid,
  sendMediaViaActiveWebSession,
  sendTextViaActiveWebSession,
  resolveRecipientViaActiveWebSession,
  setActiveWebSessionConnectionForTesting,
  shouldKeepActiveWebSessionConnection,
} from "./whatsappWebSessionWorker.js";

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-a",
    clientId: "client-a",
    tenantKey: "tenant-a",
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

test("web session worker resolves recipient candidates through active socket lookup", async (t) => {
  const lookedUp: string[][] = [];
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      onWhatsApp: async (...jids) => {
        lookedUp.push(jids);
        return [{ jid: "5584951957784@s.whatsapp.net", exists: true }];
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

  const result = await resolveRecipientViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    candidates: ["5584951957784", "558451957784"],
    requestId: "resolve-a",
  });

  assert.deepEqual(result, {
    ok: true,
    recipientWaId: "5584951957784",
    resolvedJid: "5584951957784@s.whatsapp.net",
  });
  assert.deepEqual(lookedUp, [["5584951957784@s.whatsapp.net", "558451957784@s.whatsapp.net"]]);
});

test("web session worker blocks ambiguous recipient candidate lookup", async (t) => {
  setActiveWebSessionConnectionForTesting("account-a", {
    tenantKey: "tenant-a",
    channelAccountId: "session-a",
    startedAtMs: Date.now(),
    socket: {
      ev: { on() {} },
      onWhatsApp: async () => [
        { jid: "5584951957784@s.whatsapp.net", exists: true },
        { jid: "558451957784@s.whatsapp.net", exists: true },
      ],
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

  const result = await resolveRecipientViaActiveWebSession({
    prisma: prisma as never,
    clientId: "client-a",
    tenantKey: "tenant-a",
    accountId: "account-a",
    channelAccountId: "session-a",
    candidates: ["5584951957784", "558451957784"],
    requestId: "resolve-b",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.reason, "ambiguous");
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

test("web session worker builds sanitized handoff realtime payload", () => {
  const payload = buildWebSessionHandoffRealtimePayload({
    type: "conversation.handoff.updated",
    clientId: "client-a",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    mode: "HUMAN",
    handoffStatus: "active",
    assignedUserId: null,
    departmentId: "department-a",
    updatedAt: "2026-08-18T12:00:00.000Z",
    notificationMessage: {
      messageId: "web.session.inbound.1",
      type: "TEXT",
      bodyText: "Quero atendimento",
      createdAt: "2026-08-18T12:00:00.000Z",
    },
  });

  assert.equal(payload.handoffStatus, "active");
  assert.equal(payload.departmentId, "department-a");
  assert.equal(payload.notificationMessage?.messageId, "web.session.inbound.1");
  assert.equal("rawPayload" in payload, false);
  assert.equal("token" in payload, false);
  assert.equal("senderJid" in payload, false);
});

test("web session worker builds sanitized message created realtime payload", () => {
  const payload = buildWebSessionMessageCreatedRealtimePayload({
    type: "message.created",
    clientId: "client-a",
    waId: "5584999997784",
    waIdCanonical: "55849999997784",
    mode: "HUMAN",
    handoffStatus: "active",
    humanInboxVisible: true,
    assignedUserId: "user-a",
    departmentId: "department-a",
    protocol: "CVT-ABC123",
    cycleId: "cycle-a",
    message: {
      inboxVisibility: "human_timeline",
      protocol: "CVT-ABC123",
      cycleId: "cycle-a",
      internalMessageId: "inbound-a",
      messageKind: "inbound",
      direction: "INBOUND",
      type: "TEXT",
      status: "RECEIVED",
      intent: null,
      bodyText: "Ola",
      templateName: null,
      templateLang: null,
      requestId: "request-a",
      messageId: "web.session.inbound.1",
      metaMessageId: null,
      errorBody: null,
      createdAt: "2026-08-18T12:00:00.000Z",
      replyTo: null,
    },
  });

  assert.equal(payload.clientId, "client-a");
  assert.equal(payload.message.messageId, "web.session.inbound.1");
  assert.equal(payload.message.direction, "INBOUND");
  assert.equal("rawPayload" in payload, false);
  assert.equal("token" in payload, false);
  assert.equal("senderJid" in payload, false);
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

test("web session worker builds safe disconnect observability payload", () => {
  const qrRequired = resolveWebSessionDisconnectRuntimeState({
    classification: "qr_required",
    stillRequested: true,
    reconnectCount: 4,
  });
  const loggedOut = buildWebSessionDisconnectObservabilityPayload({
    account: account({ channelAccountId: "558491955328" }) as never,
    disconnectInfo: {
      statusCode: 401,
      boomStatusCode: 401,
      reasonCode: "loggedOut",
      classification: "qr_required",
      classificationSource: "reason_text",
    },
    runtimeState: qrRequired,
    occurredAt: "2026-08-22T15:06:59.103Z",
  });
  assert.equal(loggedOut.rawStatusCode, 401);
  assert.equal(loggedOut.boomOutputStatusCode, 401);
  assert.equal(loggedOut.disconnectReasonCode, "loggedOut");
  assert.equal(loggedOut.rawClassification, "qr_required");
  assert.equal(loggedOut.classificationSource, "reason_text");
  assert.equal(loggedOut.observedState, "QR_REQUIRED");
  assert.equal(loggedOut.action, "auth_clear");
  assert.equal(loggedOut.provider, "web_session");
  assert.equal(loggedOut.channelAccountIdLast4, "5328");
  assert.equal(JSON.stringify(loggedOut).includes("558491955328"), false);

  const connectionReplaced = buildWebSessionDisconnectObservabilityPayload({
    account: account() as never,
    disconnectInfo: {
      statusCode: 440,
      boomStatusCode: 440,
      reasonCode: "connectionReplaced",
      classification: "qr_required",
      classificationSource: "status_code",
    },
    runtimeState: qrRequired,
    occurredAt: "2026-08-22T15:06:59.103Z",
  });
  assert.equal(connectionReplaced.disconnectReasonCode, "connectionReplaced");
  assert.equal(connectionReplaced.rawStatusCode, 440);

  const reconnecting = resolveWebSessionDisconnectRuntimeState({
    classification: "reconnectable",
    stillRequested: true,
    reconnectCount: 2,
  });
  const connectionLost = buildWebSessionDisconnectObservabilityPayload({
    account: account() as never,
    disconnectInfo: {
      statusCode: 408,
      boomStatusCode: 408,
      reasonCode: "baileys_408",
      classification: "reconnectable",
      classificationSource: "status_code",
    },
    runtimeState: reconnecting,
    occurredAt: "2026-08-22T15:06:59.103Z",
  });
  assert.equal(connectionLost.rawClassification, "reconnectable");
  assert.equal(connectionLost.action, "reconnect");

  const unknown = buildWebSessionDisconnectObservabilityPayload({
    account: account() as never,
    disconnectInfo: {
      statusCode: null,
      boomStatusCode: null,
      reasonCode: "unknown_disconnect",
      classification: "reconnectable",
      classificationSource: "default",
    },
    runtimeState: reconnecting,
    occurredAt: "2026-08-22T15:06:59.103Z",
  });
  assert.equal(unknown.rawStatusCode, null);
  assert.equal(unknown.disconnectReasonCode, "unknown_disconnect");
  assert.equal(unknown.classificationSource, "default");
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

test("web session worker detects ephemeral wrapped inbound media for the existing download path", () => {
  const descriptor = getBaileysInboundMediaDescriptor({
    key: { id: "MSG_EPHEMERAL_IMAGE", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
    message: {
      ephemeralMessage: {
        message: {
          imageMessage: {
            mimetype: "image/jpeg",
            caption: "imagem do atendimento",
          },
        },
      },
    },
  });

  assert.deepEqual(descriptor, {
    kind: "image",
    mimeType: "image/jpeg",
    fileName: null,
    caption: "imagem do atendimento",
  });
});

test("web session worker detects documentWithCaptionMessage for the existing download path", () => {
  const descriptor = getBaileysInboundMediaDescriptor({
    key: { id: "MSG_DOC_CAPTION", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
    message: {
      documentWithCaptionMessage: {
        message: {
          documentMessage: {
            mimetype: "application/pdf",
            fileName: "requerimento.pdf",
            caption: "requerimento preenchido",
          },
        },
      },
    },
  });

  assert.deepEqual(descriptor, {
    kind: "document",
    mimeType: "application/pdf",
    fileName: "requerimento.pdf",
    caption: "requerimento preenchido",
  });
});

test("web session worker does not download view-once media as a normal retained attachment", () => {
  const descriptor = getBaileysInboundMediaDescriptor({
    key: { id: "MSG_VIEW_ONCE", remoteJid: "5584999997784@s.whatsapp.net", fromMe: false },
    message: {
      viewOnceMessageV2: {
        message: {
          imageMessage: {
            mimetype: "image/jpeg",
            caption: "restrito",
          },
        },
      },
    },
  });

  assert.equal(descriptor, null);
});
