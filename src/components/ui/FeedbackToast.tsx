"use client";

type FeedbackToastProps = {
  message: string | null;
  variant?: "success" | "error";
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

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
      ? "border-red-400/30 bg-red-900/90 text-red-100"
      : "border-emerald-400/30 bg-emerald-900/90 text-emerald-100";

  return (
    <div
      className={`fixed right-4 top-4 z-50 max-w-md whitespace-pre-line rounded-md border px-4 py-3 text-sm shadow-lg ${style}`}
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
