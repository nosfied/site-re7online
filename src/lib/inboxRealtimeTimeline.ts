import type { AppRealtimeEvent } from "@/lib/appRealtime";

export function normalizeConversationIdentity(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function uniqueConversationIdentities(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeConversationIdentity).filter(Boolean)));
}

export function realtimeConversationCandidates(
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">
) {
  return uniqueConversationIdentities([event.waIdCanonical, event.waId]);
}

export function selectedConversationCandidates(input: {
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  return uniqueConversationIdentities([
    ...input.selectedConversationIdentityCandidates,
    input.selectedConversationKey,
    input.selectedConversationWaId,
  ]);
}

export function realtimeEventTargetsSelectedConversation(input: {
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">;
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  const selectedCandidates = selectedConversationCandidates(input);
  if (selectedCandidates.length === 0) return false;
  const eventCandidates = realtimeConversationCandidates(input.event);
  return eventCandidates.some((candidate) => selectedCandidates.includes(candidate));
}

export function resolveRealtimeTimelineConversationKey(input: {
  event: Pick<AppRealtimeEvent, "waId" | "waIdCanonical">;
  selectedConversationKey: string | null;
  selectedConversationWaId: string | null;
  selectedConversationIdentityCandidates: string[];
}) {
  if (realtimeEventTargetsSelectedConversation(input)) {
    return input.selectedConversationKey ?? realtimeConversationCandidates(input.event)[0] ?? null;
  }
  return realtimeConversationCandidates(input.event)[0] ?? null;
}
