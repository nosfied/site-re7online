import type { AppRealtimeEvent, AppRealtimeStatus } from "@/lib/appRealtime";
import { realtimeEventTargetsSelectedConversation } from "@/lib/inboxRealtimeTimeline";

export const INBOX_LIST_FALLBACK_POLL_MS = 30_000;
export const SELECTED_TIMELINE_FALLBACK_POLL_MS = 60_000;
export const INBOX_REALTIME_REFETCH_DEBOUNCE_MS = 250;

export type RealtimeRefetchScheduler = {
  schedule: () => void;
  cancel: () => void;
};

type SchedulerOptions = {
  delayMs: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  onError?: (error: unknown) => void;
};

export function shouldRealtimeEventRefreshInboxList(event: AppRealtimeEvent) {
  return (
    event.type === "message.created" ||
    event.type === "message.status.updated" ||
    event.type === "conversation.handoff.updated" ||
    event.type === "conversation.read_state.updated"
  );
}

export function shouldRealtimeEventRefreshSelectedTimeline(input: {
  event: AppRealtimeEvent;
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  if (input.event.type === "conversation.read_state.updated") return false;
  if (!("waId" in input.event)) return false;
  return realtimeEventTargetsSelectedConversation(input);
}

export function shouldRealtimeStatusReconcile(input: {
  previousStatus: AppRealtimeStatus | null;
  nextStatus: AppRealtimeStatus;
}) {
  return input.nextStatus === "connected" && input.previousStatus !== "connected";
}

export function createCoalescedAsyncRefetchScheduler(
  task: () => Promise<void> | void,
  options: SchedulerOptions
): RealtimeRefetchScheduler {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;

  const run = () => {
    timer = null;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    Promise.resolve()
      .then(task)
      .catch((error) => options.onError?.(error))
      .finally(() => {
        inFlight = false;
        if (!queued) return;
        queued = false;
        schedule();
      });
  };

  const schedule = () => {
    if (timer !== null) return;
    if (inFlight) {
      queued = true;
      return;
    }
    timer = setTimeoutFn(run, options.delayMs);
  };

  const cancel = () => {
    queued = false;
    if (timer === null) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  return { schedule, cancel };
}
