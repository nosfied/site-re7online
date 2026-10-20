"use client";

export default function ScreenProcessingOverlay({
  active,
  title,
  message,
}: {
  active: boolean;
  title: string;
  message: string;
}) {
  if (!active) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex min-h-[240px] items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${title}: ${message}`}
    >
      <div className="theme-surface-strong theme-shadow flex max-w-sm items-center gap-4 rounded-xl border px-5 py-4">
        <span aria-hidden="true" className="h-7 w-7 shrink-0 animate-spin rounded-full border-2 border-sky-100/30 border-t-sky-100" />
        <div>
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-sm theme-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}
