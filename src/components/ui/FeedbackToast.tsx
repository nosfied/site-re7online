"use client";

import { useEffect, useRef, useState } from "react";

type FeedbackToastProps = {
  message: string | null;
  variant?: "success" | "error";
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function usePausableFeedbackAutoDismiss(
  active: boolean,
  onDismiss: () => void,
  delayMs = 3000
) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active || paused) return;
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs, paused]);

  return {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };
}

export function FeedbackToast({
  message,
  variant = "success",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: FeedbackToastProps) {
  if (!message) return null;

  const style =
    variant === "error"
      ? "border-red-800 bg-red-600 text-white"
      : "border-emerald-800 bg-emerald-600 text-white";

  return (
    <div
      className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[90] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 whitespace-pre-line rounded-md border px-4 py-3 text-sm shadow-lg sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-auto sm:translate-x-0 ${style}`}
      role="status"
      aria-live="polite"
      tabIndex={0}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {message}
    </div>
  );
}
