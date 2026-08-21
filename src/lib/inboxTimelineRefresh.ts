export type TimelineRefreshReadIntent = {
  skipMarkRead?: boolean;
};

export function shouldMarkReadAfterTimelineRefresh(input: {
  canMutateReadState: boolean;
  isForegroundFocused: boolean;
  intent?: TimelineRefreshReadIntent;
}) {
  if (input.intent?.skipMarkRead) return false;
  return input.isForegroundFocused && input.canMutateReadState;
}
