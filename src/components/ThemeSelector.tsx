"use client";

import { useEffect, useState } from "react";

type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "converta-theme";

function normalizePreference(value: string | null): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "dark";
}

function resolveTheme(preference: ThemePreference) {
  if (preference !== "system" || typeof window === "undefined") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export default function ThemeSelector({
  className = "",
  variant = "select",
}: {
  className?: string;
  variant?: "select" | "switch";
}) {
  const [preference, setPreference] = useState<ThemePreference>("dark");

  useEffect(() => {
    const storedPreference = normalizePreference(window.localStorage.getItem(STORAGE_KEY));
    setPreference(storedPreference);
    applyTheme(storedPreference);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => applyTheme("system");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [preference]);

  const handleChange = (nextPreference: ThemePreference) => {
    window.localStorage.setItem(STORAGE_KEY, nextPreference);
    setPreference(nextPreference);
    applyTheme(nextPreference);
  };

  if (variant === "switch") {
    const resolvedPreference = preference === "light" ? "light" : "dark";
    const isLight = resolvedPreference === "light";

    return (
      <div className={`theme-surface grid min-w-0 gap-1 rounded-lg border px-2 py-1.5 ${className}`}>
        <p className="theme-soft text-left text-[11px] font-semibold uppercase leading-none tracking-[0.16em]">
          Tema
        </p>
        <button
          type="button"
          aria-label={`Alternar para tema ${isLight ? "escuro" : "claro"}`}
          aria-pressed={isLight}
          className="theme-select inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium transition"
          onClick={() => handleChange(isLight ? "dark" : "light")}
        >
          <span className="theme-muted min-w-[36px] text-right">{isLight ? "Claro" : "Escuro"}</span>
          <span
            className={`relative h-4 w-8 rounded-full border transition ${
              isLight ? "border-re7-sky/50 bg-re7-sky/35" : "border-white/20 bg-white/10"
            }`}
          >
            <span
              className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-re7-orange transition ${
                isLight ? "left-[17px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-xs theme-muted ${className}`}>
      <span className="hidden sm:inline">Tema</span>
      <select
        aria-label="Tema visual"
        className="theme-select h-8 rounded-md px-2 text-xs outline-none transition"
        value={preference}
        onChange={(event) => handleChange(event.target.value as ThemePreference)}
      >
        <option value="dark">Escuro</option>
        <option value="light">Claro</option>
        <option value="system">Sistema</option>
      </select>
    </label>
  );
}
