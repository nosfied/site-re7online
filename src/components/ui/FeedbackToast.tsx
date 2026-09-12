"use client";

import { useEffect, useRef, useState } from "react";

type FeedbackToastProps = {
  message: string | null;
  variant?: "success" | "error" | "warning" | "info";
  closeLabel?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void;
  onClose?: () => void;
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
  closeLabel = "Fechar aviso",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
  onClose,
}: FeedbackToastProps) {
  if (!message) return null;

  const style =
    variant === "error"
      ? "border-red-800 bg-red-600 text-white"
      : variant === "warning"
        ? "border-amber-800 bg-amber-500 text-slate-950"
      : variant === "info"
        ? "border-sky-800 bg-sky-600 text-white"
      : "border-emerald-800 bg-emerald-600 text-white";
  const closeToast = onClose ?? onClick;
  const clickProps = closeToast
    ? {
        onClick: closeToast,
      }
    : {
        onClick,
      };

  return (
    <div
      className={`fixed bottom-[calc(1rem+var(--safe-bottom))] left-1/2 z-[90] flex w-[calc(100dvw-1.5rem)] max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-start gap-3 whitespace-pre-line rounded-md border px-4 py-3 text-sm shadow-lg sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:w-auto sm:max-w-md sm:translate-x-0 ${closeToast ? "cursor-pointer" : ""} ${style}`}
      role="status"
      aria-live="polite"
      tabIndex={0}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      {...clickProps}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {closeToast ? (
        <button
          type="button"
          className="shrink-0 rounded px-1 text-lg leading-none opacity-85 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/70"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={(event) => {
            event.stopPropagation();
            closeToast();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
