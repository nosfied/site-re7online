import test from "node:test";
import assert from "node:assert/strict";
import {
  clearObservedChannelEvents,
  getObservedChannelEventStats,
  listObservedChannelEvents,
  recordObservedChannelEvent,
} from "./observedChannelEvents.js";

test.beforeEach(() => {
  clearObservedChannelEvents();
});

test("recordObservedChannelEvent stores redacted observed event", () => {
  const event = recordObservedChannelEvent({
    provider: "meta",
    channel: "messenger",
    channelAccountId: "page-1",
    tenantKey: "tenant-a",
    resolution: "matched_enabled",
    externalMessageId: "mid-1",
    externalUserHash: "hash-1",
    text: "texto sensivel",
    raw: { message: "raw" },
    externalUserId: "psid-1",
    token: "secret",
    eventType: "message",
  });

  assert.equal(event?.channel, "messenger");
  assert.equal(event?.passive, true);
  assert.equal("text" in (event ?? {}), false);
  assert.equal("raw" in (event ?? {}), false);
  assert.equal("token" in (event ?? {}), false);
  assert.equal("externalUserId" in (event ?? {}), false);
});

test("observed channel event buffer keeps maximum 500 events FIFO", () => {
  for (let index = 0; index < 505; index += 1) {
    recordObservedChannelEvent({
      id: `event-${index}`,
      provider: "meta",
      channel: "messenger",
      channelAccountId: "page-1",
      resolution: "matched_enabled",
    });
  }

  const events = listObservedChannelEvents({ limit: 500 });
  assert.equal(events.length, 500);
  assert.equal(events[events.length - 1]?.id, "event-5");
  assert.equal(events[0]?.id, "event-504");
});

test("observed channel event stats are grouped by channel and resolution", () => {
  recordObservedChannelEvent({
    provider: "meta",
    channel: "messenger",
    channelAccountId: "page-1",
    resolution: "matched_enabled",
  });
  recordObservedChannelEvent({
    provider: "meta",
    channel: "messenger",
    channelAccountId: "page-2",
    resolution: "not_found",
  });
  recordObservedChannelEvent({
    provider: "meta",
    channel: "instagram",
    channelAccountId: "ig-1",
    resolution: "unsupported",
  });

  const stats = getObservedChannelEventStats();
  assert.equal(stats.total, 3);
  assert.equal(stats.byChannel.messenger, 2);
  assert.equal(stats.byChannel.instagram, 1);
  assert.equal(stats.byResolution.matched_enabled, 1);
  assert.equal(stats.byResolution.not_found, 1);
  assert.equal(stats.byChannelResolution["messenger:matched_enabled"], 1);
});

test("clearObservedChannelEvents empties buffer", () => {
  recordObservedChannelEvent({
    provider: "meta",
    channel: "messenger",
    channelAccountId: "page-1",
    resolution: "matched_enabled",
  });

  assert.equal(clearObservedChannelEvents(), 1);
  assert.equal(listObservedChannelEvents().length, 0);
});
