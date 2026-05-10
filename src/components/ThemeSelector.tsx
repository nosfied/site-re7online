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

export default function ThemeSelector({ className = "" }: { className?: string }) {
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
