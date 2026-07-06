import test from "node:test";
import assert from "node:assert/strict";
import { ConversationOperationalStatus, HandoffStatus } from "@prisma/client";
import { createDualWriteStorage } from "./dualWriteStorage.js";
import { ConversationState } from "../conversation/conversation.types.js";
import { Storage, StoredRecord, MessageStatus } from "./storage.js";

const baseDate = new Date("2026-05-06T12:00:00.000Z");

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    clientKey: "justa-advocacia",
    conversationKey: "justa-advocacia:5584999999999",
    waId: "5584999999999",
    waIdCanonical: "5584999999999",
    firstSeenAt: baseDate.toISOString(),
    lastInboundAt: baseDate.toISOString(),
    window: {
      isOpen: true,
      expiresAt: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    intent: "unknown",
    handoff: { status: "none" },
    answers: {},
    mode: "BOT",
    assignedUserId: null,
    assignedTo: null,
    departmentId: null,
    queueId: null,
    status: null,
    closedAt: null,
    ...overrides,
  };
}

function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: baseDate,
    waId: "5584999999999",
    waIdCanonical: "5584999999999",
    conversationKey: "justa-advocacia:5584999999999",
    firstSeenAt: baseDate,
    windowIsOpen: true,
    windowExpiresAt: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
    lastInboundAt: baseDate,
    lastOutboundAt: null,
    lastInboundMessageId: null,
    lastOutboundMessageId: null,
    intent: "unknown",
    handoffStatus: HandoffStatus.NONE,
    handoffRequestedAt: null,
    handoffActivatedAt: null,
    handoffReleasedAt: null,
    templateNeeded: false,
    templateSuggested: null,
    lastNeedAt: null,
    lastIntent: null,
    leadRequestedAt: null,
    leadCapturedAt: null,
    demoStatus: null,
    lastDemoRequestedAt: null,
    lastDemoScheduledAt: null,
    demoPreferredSchedule: null,
    lastHandoffDemoScheduledKey: null,
    lastHandoffDemoScheduledAt: null,
    flow: null,
    flowStep: null,
    chatbotNodeId: null,
    chatbotActive: false,
    answers: {},
    mode: "BOT",
    assignedUserId: null,
    assignedTo: null,
    assignedAt: null,
    departmentId: null,
    queueId: null,
    status: ConversationOperationalStatus.WAITING,
    closedAt: null,
    ...overrides,
  };
}

function makePrimaryStorage(state = makeState()) {
  const calls = {
    upsert: 0,
    delete: 0,
    updateWindow: 0,
    get: 0,
  };
  const storage: Storage = {
    async saveIncomingMessage(_record: StoredRecord) {},
    async appendOutboundEvent(_record: StoredRecord) {},
    async findByMessageId(_messageId: string) {
      return null;
    },
    async updateStatus(
      _messageId: string,
      _status: MessageStatus,
      _extra?: Record<string, unknown>
    ) {},
    async updateMessage(_messageId: string, _patch: Partial<StoredRecord>) {},
    async getConversation(_waId: string, _clientKey?: string) {
      calls.get += 1;
      return state;
    },
    async upsertConversation(_state: ConversationState) {
      calls.upsert += 1;
    },
    async updateConversationWindow(_waId: string, lastInboundAt: string, _clientKey?: string) {
      calls.updateWindow += 1;
      return {
        ...state,
        lastInboundAt,
      };
    },
    async deleteConversation(_waId: string, _clientKey?: string) {
      calls.delete += 1;
    },
  };
  return { storage, calls };
}

let activePrismaMock: {
  findMany?: () => Promise<unknown[]>;
  upsert?: () => Promise<unknown>;
  deleteMany?: () => Promise<unknown>;
} = {};
let activePrismaCalls = {
  upsert: 0,
  deleteMany: 0,
  findMany: 0,
};

function installPrismaMock(params: {
  findMany?: () => Promise<unknown[]>;
  upsert?: () => Promise<unknown>;
  deleteMany?: () => Promise<unknown>;
} = {}) {
  activePrismaMock = params;
  activePrismaCalls = {
    upsert: 0,
    deleteMany: 0,
    findMany: 0,
  };
  const globalWithPrisma = globalThis as unknown as { prisma?: unknown };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = {
      client: {
        async findUnique() {
          return { id: "client-1" };
        },
      },
      conversationRuntimeState: {
        async upsert() {
          activePrismaCalls.upsert += 1;
          return activePrismaMock.upsert ? activePrismaMock.upsert() : {};
        },
        async findMany() {
          activePrismaCalls.findMany += 1;
          return activePrismaMock.findMany ? activePrismaMock.findMany() : [];
        },
        async deleteMany() {
          activePrismaCalls.deleteMany += 1;
          return activePrismaMock.deleteMany ? activePrismaMock.deleteMany() : {};
        },
      },
      async $disconnect() {},
    };
  }
  return activePrismaCalls;
}

function captureConsole() {
  const records: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = ((line: string) => {
    records.push(JSON.parse(line) as Record<string, unknown>);
  }) as typeof console.info;
  console.warn = ((line: string) => {
    records.push(JSON.parse(line) as Record<string, unknown>);
  }) as typeof console.warn;
  return {
    records,
    restore() {
      console.info = originalInfo;
      console.warn = originalWarn;
    },
  };
}

test("dual write keeps legacy JSON writes when json write is enabled", async () => {
  installPrismaMock();
  const { storage: primary, calls } = makePrimaryStorage();
  const storage = createDualWriteStorage(primary, {
    readSource: "postgres",
    jsonWriteEnabled: true,
  });

  await storage.upsertConversation(makeState());

  assert.equal(calls.upsert, 1);
});

test("dual write skips JSON conversation write when disabled", async () => {
  const prismaCalls = installPrismaMock();
  const { storage: primary, calls } = makePrimaryStorage();
  const consoleCapture = captureConsole();
  try {
    const storage = createDualWriteStorage(primary, {
      readSource: "postgres",
      jsonWriteEnabled: false,
    });

    await storage.upsertConversation(makeState());

    assert.equal(calls.upsert, 0);
    assert.equal(prismaCalls.upsert, 1);
    assert.ok(
      consoleCapture.records.some(
        (record) =>
          record.event === "state.json.write_skipped" &&
          record.reason === "json_write_disabled" &&
          record.operation === "upsertConversation"
      )
    );
  } finally {
    consoleCapture.restore();
  }
});

test("dual write reads Postgres state when read source is postgres", async () => {
  installPrismaMock({
    async findMany() {
      return [makeDbRow({ status: ConversationOperationalStatus.WAITING })];
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const storage = createDualWriteStorage(primary, {
    readSource: "postgres",
    jsonWriteEnabled: false,
  });

  const state = await storage.getConversation("5584999999999", "justa-advocacia");

  assert.equal(state?.status, "WAITING");
  assert.equal(calls.get, 0);
});

test("dual write reads synthetic Messenger state with multichannel conversation key", async () => {
  const syntheticWaId = "messenger:8483671231fdbf90dd354fe2f43c85ae";
  installPrismaMock({
    async findMany() {
      return [
        makeDbRow({
          waId: syntheticWaId,
          waIdCanonical: syntheticWaId,
          conversationKey:
            "tendencia-modas:messenger:page_smoke_001:8483671231fdbf90dd354fe2f43c85ae",
          channelAccountId: "page_smoke_001",
          externalUserHash: "8483671231fdbf90dd354fe2f43c85ae",
          legacyWaId: null,
          mode: "HUMAN",
          status: ConversationOperationalStatus.WAITING,
        }),
      ];
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const storage = createDualWriteStorage(primary, {
    readSource: "postgres",
    jsonWriteEnabled: false,
  });

  const state = await storage.getConversation(syntheticWaId, "tendencia-modas");

  assert.equal(state?.waId, syntheticWaId);
  assert.equal(state?.conversationKey, "tendencia-modas:messenger:page_smoke_001:8483671231fdbf90dd354fe2f43c85ae");
  assert.equal(state?.mode, "HUMAN");
  assert.equal(state?.status, "WAITING");
  assert.equal(calls.get, 0);
});

test("dual write reads synthetic Webchat state with site-scoped conversation key", async () => {
  const syntheticWaId = "webchat:e39170eac92f0e8b32e1f0a3f8ed60f9";
  installPrismaMock({
    async findMany() {
      return [
        makeDbRow({
          waId: syntheticWaId,
          waIdCanonical: syntheticWaId,
          conversationKey:
            "re7online:webchat:cmr9aldo600014sv6f13rnx0j:e39170eac92f0e8b32e1f0a3f8ed60f9",
          channelAccountId: "cmr9aldo600014sv6f13rnx0j",
          externalUserHash: "e39170eac92f0e8b32e1f0a3f8ed60f9",
          legacyWaId: null,
          mode: "HUMAN",
          status: ConversationOperationalStatus.WAITING,
        }),
      ];
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const storage = createDualWriteStorage(primary, {
    readSource: "postgres",
    jsonWriteEnabled: false,
  });

  const state = await storage.getConversation(syntheticWaId, "re7online");

  assert.equal(state?.waId, syntheticWaId);
  assert.equal(
    state?.conversationKey,
    "re7online:webchat:cmr9aldo600014sv6f13rnx0j:e39170eac92f0e8b32e1f0a3f8ed60f9"
  );
  assert.equal(state?.mode, "HUMAN");
  assert.equal(state?.status, "WAITING");
  assert.equal(calls.get, 0);
});

test("dual write does not read JSON when Postgres read fails", async () => {
  installPrismaMock({
    async findMany() {
      throw new Error("db unavailable");
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const consoleCapture = captureConsole();
  try {
    const storage = createDualWriteStorage(primary, {
      readSource: "postgres",
      jsonWriteEnabled: false,
    });

    await assert.rejects(
      storage.getConversation("5584999999999", "justa-advocacia"),
      /db unavailable/
    );

    assert.equal(calls.get, 0);
    assert.ok(
      consoleCapture.records.some(
        (record) =>
          record.event === "state.postgres.read_failed" &&
          record.reason === "postgres_read_error"
      )
    );
  } finally {
    consoleCapture.restore();
  }
});

test("dual write returns null without JSON fallback when Postgres state is missing", async () => {
  installPrismaMock({
    async findMany() {
      return [];
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const consoleCapture = captureConsole();
  try {
    const storage = createDualWriteStorage(primary, {
      readSource: "postgres",
      jsonWriteEnabled: false,
    });

    const state = await storage.getConversation("5584999999999", "justa-advocacia");

    assert.equal(state, null);
    assert.equal(calls.get, 0);
    assert.ok(
      consoleCapture.records.some(
        (record) =>
          record.event === "state.postgres.read_missing" &&
          record.reason === "postgres_not_found"
      )
    );
  } finally {
    consoleCapture.restore();
  }
});

test("dual write still supports explicit JSON read source", async () => {
  installPrismaMock({
    async findMany() {
      throw new Error("postgres should not be read");
    },
  });
  const { storage: primary, calls } = makePrimaryStorage(makeState({ status: "CLOSED" }));
  const storage = createDualWriteStorage(primary, {
    readSource: "json",
    jsonWriteEnabled: true,
  });

  const state = await storage.getConversation("5584999999999", "justa-advocacia");

  assert.equal(state?.status, "CLOSED");
  assert.equal(calls.get, 1);
});
