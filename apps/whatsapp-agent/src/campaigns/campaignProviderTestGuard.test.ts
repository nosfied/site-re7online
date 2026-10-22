import "./campaignOperationsTestSupport.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignProviderBlockedAttemptCount,
  campaignProviderFailClosedFetch,
  installCampaignProviderTestGuard,
  resetCampaignProviderBlockedAttemptCount,
} from "./campaignProviderTestGuard.js";

test("late provider attempt is blocked after a test fake is restored and the runner is drained", async () => {
  resetCampaignProviderBlockedAttemptCount();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let fakeMessages = 0;
  globalThis.fetch = (async () => {
    fakeMessages += 1;
    return new Response(JSON.stringify({ messages: [{ id: "should-not-run" }] }), { status: 200 });
  }) as typeof fetch;

  const runner = (async () => {
    await delayed;
    await globalThis.fetch("https://graph.facebook.com/v1/messages", { method: "POST" });
  })();
  globalThis.fetch = campaignProviderFailClosedFetch;
  release();
  await assert.rejects(runner, /unexpected_real_provider_call/);

  assert.equal(fakeMessages, 0);
  assert.equal(campaignProviderBlockedAttemptCount(), 1);
  installCampaignProviderTestGuard();
});
