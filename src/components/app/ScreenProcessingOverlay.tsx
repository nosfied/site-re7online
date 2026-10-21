"use client";

import { useEffect, useRef, useState } from "react";
import { ScreenProcessingRegistry } from "@/lib/screenProcessing";

export type ScreenProcessingOperation = {
  key: string;
  active: boolean;
  title: string;
  message: string;
};

export function useScreenProcessingOperations(operations: ScreenProcessingOperation[]) {
  const registry = useRef(new ScreenProcessingRegistry());
  const tokens = useRef(new Map<string, number>());
  const [visible, setVisible] = useState<ScreenProcessingOperation | null>(null);
  const signature = operations.map((item) => `${item.key}:${item.active ? 1 : 0}:${item.title}:${item.message}`).join("\u001f");
  useEffect(() => {
    const activeKeys = new Set(operations.filter((item) => item.active).map((item) => item.key));
    for (const operation of operations) {
      if (operation.active && !tokens.current.has(operation.key)) {
        tokens.current.set(operation.key, registry.current.begin(operation.title, operation.message));
      }
    }
    for (const key of tokens.current.keys()) {
      if (!activeKeys.has(key)) {
        registry.current.end(tokens.current.get(key)!);
        tokens.current.delete(key);
      }
    }
    const current = registry.current.current();
    setVisible(current ? { key: String(current.id), active: true, title: current.title, message: current.message } : null);
    return () => {
      // Each render owns only its reconciliation. Component unmount clears every
      // outstanding token so late promises cannot leave a screen blocked.
      if (operations.every((item) => !item.active)) {
        tokens.current.clear();
        registry.current.clear();
      }
    };
  // The serialized operation contract prevents function/object identity churn
  // from reopening the overlay while preserving independent operation tokens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => () => {
    tokens.current.clear();
    registry.current.clear();
  }, []);
  return visible;
}

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
