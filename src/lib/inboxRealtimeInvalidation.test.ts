import assert from "node:assert/strict";
import test from "node:test";

import type { AppRealtimeEvent, AppRealtimeStatus } from "./appRealtime";
import {
  createCoalescedAsyncRefetchScheduler,
  INBOX_LIST_FALLBACK_POLL_MS,
  SELECTED_TIMELINE_FALLBACK_POLL_MS,
  shouldRealtimeEventRefreshInboxList,
  shouldRealtimeEventRefreshSelectedTimeline,
  shouldRealtimeStatusReconcile,
} from "./inboxRealtimeInvalidation";

function messageCreated(overrides: Partial<Extract<AppRealtimeEvent, { type: "message.created" }>> = {}) {
  return {
    type: "message.created",
    clientId: "tenant-a",
    waId: "conversation-a",
    waIdCanonical: "tenant-a:conversation-a",
    message: {
      id: "message-a",
      direction: "INBOUND",
      type: "TEXT",
      bodyText: "Oi",
      status: "received",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
    ...overrides,
  } as Extract<AppRealtimeEvent, { type: "message.created" }>;
}

test("realtime conversation events invalidate the inbox list", () => {
  const events: AppRealtimeEvent[] = [
    messageCreated(),
    {
      type: "message.status.updated",
      clientId: "tenant-a",
      waId: "conversation-a",
      status: "DELIVERED",
      updatedAt: "2026-09-02T10:00:01.000Z",
    },
    {
      type: "conversation.handoff.updated",
      clientId: "tenant-a",
      waId: "conversation-a",
      updatedAt: "2026-09-02T10:00:02.000Z",
    },
    {
      type: "conversation.read_state.updated",
      clientId: "tenant-a",
      waId: "conversation-a",
      readState: {
        lastReadAtByConversationKey: {},
        manuallyUnreadByConversationKey: {},
      },
      unread: false,
      updatedAt: "2026-09-02T10:00:03.000Z",
    },
  ];

  assert.deepEqual(events.map(shouldRealtimeEventRefreshInboxList), [true, true, true, true]);
});

test("selected conversation events invalidate only the selected timeline", () => {
  assert.equal(
    shouldRealtimeEventRefreshSelectedTimeline({
      event: messageCreated(),
      selectedConversationKey: "tenant-a:conversation-a",
      selectedConversationWaId: "conversation-a",
      selectedConversationIdentityCandidates: ["tenant-a:conversation-a", "conversation-a"],
    }),
    true
  );

  assert.equal(
    shouldRealtimeEventRefreshSelectedTimeline({
      event: messageCreated({ waId: "conversation-b", waIdCanonical: "tenant-a:conversation-b" }),
      selectedConversationKey: "tenant-a:conversation-a",
      selectedConversationWaId: "conversation-a",
      selectedConversationIdentityCandidates: ["tenant-a:conversation-a", "conversation-a"],
    }),
    false
  );
});

test("read-state events do not invalidate the selected timeline", () => {
  assert.equal(
    shouldRealtimeEventRefreshSelectedTimeline({
      event: {
        type: "conversation.read_state.updated",
        clientId: "tenant-a",
        waId: "conversation-a",
        waIdCanonical: "tenant-a:conversation-a",
        readState: {
          lastReadAtByConversationKey: {},
          manuallyUnreadByConversationKey: {},
        },
        unread: false,
        updatedAt: "2026-09-02T10:00:03.000Z",
      },
      selectedConversationKey: "tenant-a:conversation-a",
      selectedConversationWaId: "conversation-a",
      selectedConversationIdentityCandidates: ["tenant-a:conversation-a", "conversation-a"],
    }),
    false
  );
});

test("coalesced scheduler turns rapid invalidations into one refetch", async () => {
  const timers: Array<() => void> = [];
  let calls = 0;
  const scheduler = createCoalescedAsyncRefetchScheduler(
    () => {
      calls += 1;
    },
    {
      delayMs: 250,
      setTimeoutFn: (callback) => {
        timers.push(callback as () => void);
        return timers.length as never;
      },
      clearTimeoutFn: () => undefined,
    }
  );

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();

  assert.equal(timers.length, 1);
  timers[0]?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test("coalesced scheduler runs one follow-up after in-flight invalidation", async () => {
  const timers: Array<() => void> = [];
  let calls = 0;
  let resolveFirst: (() => void) | null = null;
  const scheduler = createCoalescedAsyncRefetchScheduler(
    () => {
      calls += 1;
      if (calls === 1) {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
    },
    {
      delayMs: 250,
      setTimeoutFn: (callback) => {
        timers.push(callback as () => void);
        return timers.length as never;
      },
      clearTimeoutFn: () => undefined,
    }
  );

  scheduler.schedule();
  timers[0]?.();
  await new Promise((resolve) => setImmediate(resolve));
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(calls, 1);
  resolveFirst?.();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.length, 2);
  timers[1]?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});

test("reconnect reconciliation triggers only when socket returns to connected", () => {
  const sequence: Array<[AppRealtimeStatus | null, AppRealtimeStatus]> = [
    [null, "connected"],
    ["connected", "connected"],
    ["reconnecting", "connected"],
    ["offline", "connected"],
    ["connected", "reconnecting"],
  ];

  assert.deepEqual(
    sequence.map(([previousStatus, nextStatus]) => shouldRealtimeStatusReconcile({ previousStatus, nextStatus })),
    [true, false, true, true, false]
  );
});

test("polling remains available as slower fallback", () => {
  assert.equal(INBOX_LIST_FALLBACK_POLL_MS, 30_000);
  assert.equal(SELECTED_TIMELINE_FALLBACK_POLL_MS, 60_000);
});
