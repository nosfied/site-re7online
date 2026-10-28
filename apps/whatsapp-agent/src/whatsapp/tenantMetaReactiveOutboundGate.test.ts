import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./webhook.controller.ts", import.meta.url), "utf8");

function extract<T>(start: string, end: string, name: string, context: Record<string, unknown>) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `${name} source boundaries must exist`);
  const sandboxModule = { exports: {} };
  const compiled = ts.transpileModule(
    `${source.slice(from, to)}\nmodule.exports = ${name};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText;
  vm.runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, ...context });
  return sandboxModule.exports as T;
}

test("template fallback never reaches Meta when the tenant runtime is incomplete", async () => {
  let sends = 0;
  let blocks = 0;
  const attempt = extract<(params: Record<string, unknown>) => Promise<void>>(
    "      const attemptTemplateFallback = async",
    "  const shouldSendOutbound =",
    "attemptTemplateFallback",
    {
      isTenantReactiveOutboundReady: () => false,
      tenantReactiveOutboundBlockReason: () => "tenant_db_config_incomplete",
      persistOutboundBlockedSafe: async () => { blocks += 1; },
      sendTemplate: async () => { sends += 1; return { ok: true }; },
      MessageType: { TEMPLATE: "TEMPLATE" },
      env: { OUTBOUND_TEMPLATE_DEFAULT_NAME: "synthetic", OUTBOUND_TEMPLATE_DEFAULT_LANG: "pt_BR" },
    }
  );
  await attempt({ waId: "synthetic", toE164: "synthetic", messageId: "synthetic" });
  assert.equal(sends, 0);
  assert.equal(blocks, 1);
});

test("template fallback never reaches Meta when tenant outboundEnabled is false", async () => {
  let sends = 0;
  const attempt = extract<(params: Record<string, unknown>) => Promise<void>>(
    "      const attemptTemplateFallback = async",
    "  const shouldSendOutbound =",
    "attemptTemplateFallback",
    {
      isTenantReactiveOutboundReady: () => false,
      tenantReactiveOutboundBlockReason: () => "tenant_reactive_outbound_disabled",
      persistOutboundBlockedSafe: async () => undefined,
      sendTemplate: async () => { sends += 1; return { ok: true }; },
      MessageType: { TEMPLATE: "TEMPLATE" },
      env: { OUTBOUND_TEMPLATE_DEFAULT_NAME: "synthetic", OUTBOUND_TEMPLATE_DEFAULT_LANG: "pt_BR" },
    }
  );
  await attempt({ waId: "synthetic", toE164: "synthetic", messageId: "synthetic" });
  assert.equal(sends, 0);
});

test("usage quota is not consulted and cannot reply before the tenant outbound gate", async () => {
  let quotaChecks = 0;
  let sends = 0;
  const send = extract<(params: Record<string, unknown>) => Promise<{ ok: boolean; errorBody?: string }>>(
    "  const sendOutboundText = async",
    "  const sendPassiveOutboundText = async",
    "sendOutboundText",
    {
      shouldSendOutbound: () => false,
      checkUsageGate: async () => { quotaChecks += 1; return { allowed: false }; },
      sendTextMessage: async () => { sends += 1; return { ok: true }; },
      tenantClientId: "synthetic",
      tenantClientKey: "synthetic",
    }
  );
  const result = await send({ waId: "synthetic", toE164: "synthetic", messageId: "synthetic" });
  assert.equal(result.ok, false);
  assert.equal(result.errorBody, "late_reply_dropped");
  assert.equal(quotaChecks, 0);
  assert.equal(sends, 0);
});

test("handoffEnabled=false blocks only automatic routing before activating handoff", async () => {
  let activations = 0;
  const route = extract<(state: Record<string, unknown>, params: Record<string, unknown>) => Promise<Record<string, unknown>>>(
    "  const routeConversationToHumanQueue = async",
    "  const upsertConversationSafe = async",
    "routeConversationToHumanQueue",
    {
      tenantAutomaticHandoffEnabled: false,
      tenantClientId: "synthetic",
      tenantClientKey: "synthetic",
      logger: { info: () => undefined },
      maskNumber: () => "masked",
      meta: { requestId: "synthetic" },
      activateHumanHandoff: () => { activations += 1; return { state: {} }; },
    }
  );
  const activeHuman = { waId: "synthetic", mode: "HUMAN", handoff: { status: "active" } };
  const result = await route(activeHuman, {
    reason: "no_automation_reply_configured",
    messageId: "synthetic",
  });
  assert.deepEqual(result, activeHuman);
  assert.equal(activations, 0);
});

test("inboundPersistenceEnabled independently controls new Meta inbound storage", async () => {
  let writes = 0;
  const disabled = extract<(record: Record<string, unknown>) => Promise<void>>(
    "  const saveIncomingMessageSafe = async",
    "  const persistConversationSafe = async",
    "saveIncomingMessageSafe",
    {
      tenantMetaInboundPersistenceEnabled: false,
      storage: { saveIncomingMessage: async () => { writes += 1; } },
    }
  );
  await disabled({ messageId: "synthetic" });
  assert.equal(writes, 0);

  const enabled = extract<(record: Record<string, unknown>) => Promise<void>>(
    "  const saveIncomingMessageSafe = async",
    "  const persistConversationSafe = async",
    "saveIncomingMessageSafe",
    {
      tenantMetaInboundPersistenceEnabled: true,
      storage: { saveIncomingMessage: async () => { writes += 1; } },
    }
  );
  await enabled({ messageId: "synthetic" });
  assert.equal(writes, 1);
});
