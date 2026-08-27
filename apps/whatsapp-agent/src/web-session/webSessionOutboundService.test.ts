import assert from "node:assert/strict";
import test from "node:test";
import {
  isWebSessionTextOutboundReady,
  normalizeBotMenuOptionMarkdown,
  resolveWebSessionChannelSwitchWarning,
  resolveWebSessionTextRecipient,
} from "./webSessionOutboundService.js";

function makeWebSessionAccount(overrides: {
  channelAccountId: string;
  status?: string;
  enabled?: boolean;
  outboundEnabled?: boolean;
  runtimeEnabled?: boolean;
  observedState?: string;
  updatedAt?: Date;
}) {
  return {
    id: `db-${overrides.channelAccountId}`,
    clientId: "client-1",
    channel: "whatsapp",
    provider: "web_session",
    channelAccountId: overrides.channelAccountId,
    enabled: overrides.enabled ?? true,
    outboundEnabled: overrides.outboundEnabled ?? true,
    runtimeEnabled: overrides.runtimeEnabled ?? true,
    status: overrides.status ?? "connected",
    metadata: {
      webSession: {
        observedState: overrides.observedState ?? "CONNECTED",
      },
    },
    updatedAt: overrides.updatedAt ?? new Date("2026-08-27T12:00:00.000Z"),
    client: {
      id: "client-1",
      clientKey: "tenant-1",
      status: "ACTIVE",
      features: { whatsappWebSession: true },
    },
  };
}

test("normalizeBotMenuOptionMarkdown bolds numbered menu options", () => {
  const result = normalizeBotMenuOptionMarkdown(
    [
      "😁 Digite o número de acordo com o assunto desejado:",
      "4. Dúvidas Técnicas - Plataforma Mapa Cultural",
      "5 - Fundarpe",
      "*7* - Cultura Viva",
    ].join("\n")
  );

  assert.equal(
    result,
    [
      "😁 Digite o número de acordo com o assunto desejado:",
      "*4* - Dúvidas Técnicas - Plataforma Mapa Cultural",
      "*5* - Fundarpe",
      "*7* - Cultura Viva",
    ].join("\n")
  );
});

test("normalizeBotMenuOptionMarkdown leaves non-menu text unchanged", () => {
  const text = ["Checklist interno:", "1. Conferir documento", "2. Salvar protocolo"].join("\n");

  assert.equal(normalizeBotMenuOptionMarkdown(text), text);
});

test("Web Session readiness falls back from historical disconnected account to current connected account", async () => {
  const historical = makeWebSessionAccount({
    channelAccountId: "archived:web-session-a",
    status: "disabled",
    outboundEnabled: false,
    runtimeEnabled: false,
    observedState: "DISCONNECTED",
    updatedAt: new Date("2026-08-26T12:00:00.000Z"),
  });
  const current = makeWebSessionAccount({
    channelAccountId: "web-session-b",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
  const prisma = {
    channelAccount: {
      findFirst: async ({ where }: { where: { channelAccountId?: string } }) => {
        if (where.channelAccountId === historical.channelAccountId) return historical;
        if (!where.channelAccountId) return current;
        return null;
      },
    },
  };

  const ready = await isWebSessionTextOutboundReady({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    channelAccountId: historical.channelAccountId,
  });

  assert.equal(ready, true);
});

test("Web Session readiness falls back when historical channel account id was archived away", async () => {
  const current = makeWebSessionAccount({
    channelAccountId: "web-session-b",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
  const prisma = {
    channelAccount: {
      findFirst: async ({ where }: { where: { channelAccountId?: string } }) => {
        if (!where.channelAccountId) return current;
        return null;
      },
    },
  };

  const ready = await isWebSessionTextOutboundReady({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    channelAccountId: "558491955328",
  });

  assert.equal(ready, true);
});

test("Web Session readiness stays blocked when no current account is connected", async () => {
  const prisma = {
    channelAccount: {
      findFirst: async () => null,
    },
  };

  const ready = await isWebSessionTextOutboundReady({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    channelAccountId: "558491955328",
  });

  assert.equal(ready, false);
});

test("Web Session recipient resolution uses current account when historical account is disconnected", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousWorkerUrl = process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
  const workerRequests: Array<Record<string, unknown>> = [];
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousWorkerUrl === undefined) delete process.env.WHATSAPP_WEB_WORKER_CONTROL_URL;
    else process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = previousWorkerUrl;
  });
  process.env.WHATSAPP_WEB_WORKER_CONTROL_URL = "http://127.0.0.1:65535";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    workerRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true, recipientWaId: "558494784366", resolvedJid: "558494784366@s.whatsapp.net" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const historical = makeWebSessionAccount({
    channelAccountId: "archived:web-session-a",
    status: "disabled",
    outboundEnabled: false,
    runtimeEnabled: false,
    observedState: "DISCONNECTED",
    updatedAt: new Date("2026-08-26T12:00:00.000Z"),
  });
  const current = makeWebSessionAccount({
    channelAccountId: "web-session-b",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
  const prisma = {
    channelAccount: {
      findFirst: async ({ where }: { where: { channelAccountId?: string } }) => {
        if (where.channelAccountId === historical.channelAccountId) return historical;
        if (!where.channelAccountId) return current;
        return null;
      },
    },
  };

  const result = await resolveWebSessionTextRecipient({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    channelAccountId: historical.channelAccountId,
    candidates: ["558494784366"],
    requestId: "req-1",
  });

  assert.equal(result.ok, true);
  assert.equal(workerRequests.length, 1);
  assert.equal(workerRequests[0]?.channelAccountId, current.channelAccountId);
});

test("Web Session channel switch warning is derived from latest sent outbound identity", async () => {
  const current = makeWebSessionAccount({
    channelAccountId: "558494784366",
    updatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
  const prisma = {
    channelAccount: {
      findFirst: async ({ where }: { where: { channelAccountId?: string } }) => {
        if (!where.channelAccountId) return current;
        return null;
      },
    },
    outboundMessage: {
      findFirst: async () => ({ channelAccountId: "558491955328" }),
    },
  };

  const warning = await resolveWebSessionChannelSwitchWarning({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    waId: "558499992982",
    waIdCanonical: "558499992982",
    channelAccountId: "558491955328",
  });

  assert.deepEqual(warning, {
    pending: true,
    previousIdentityMasked: "****5328",
    currentIdentityMasked: "****4366",
  });
});

test("Web Session channel switch warning ignores account id changes for the same phone identity", async () => {
  const historical = makeWebSessionAccount({
    channelAccountId: "old-account-same-phone",
    status: "disabled",
    outboundEnabled: false,
    runtimeEnabled: false,
    observedState: "DISCONNECTED",
  });
  const current = makeWebSessionAccount({
    channelAccountId: "558494784366",
  });
  const prisma = {
    channelAccount: {
      findFirst: async ({ where }: { where: { channelAccountId?: string } }) => {
        if (where.channelAccountId === historical.channelAccountId) return historical;
        if (!where.channelAccountId) return current;
        return null;
      },
    },
    outboundMessage: {
      findFirst: async () => ({ channelAccountId: "558494784366" }),
    },
  };

  const warning = await resolveWebSessionChannelSwitchWarning({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    waId: "558499992982",
    channelAccountId: historical.channelAccountId,
  });

  assert.equal(warning, null);
});

test("Web Session channel switch warning clears after the latest sent outbound uses current identity", async () => {
  const current = makeWebSessionAccount({ channelAccountId: "558494784366" });
  const prisma = {
    channelAccount: {
      findFirst: async () => current,
    },
    outboundMessage: {
      findFirst: async () => ({ channelAccountId: "558494784366" }),
    },
  };

  const warning = await resolveWebSessionChannelSwitchWarning({
    prisma: prisma as never,
    clientId: "client-1",
    clientKey: "tenant-1",
    waId: "558499992982",
    channelAccountId: "558491955328",
  });

  assert.equal(warning, null);
});
