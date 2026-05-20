"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const PWA_INSTALL_COACH_DISMISSED_KEY = "converta_pwa_install_coach_dismissed_v1";

function isIosLikeDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const platform = window.navigator.platform || "";
  const touchPoints = window.navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export default function PwaInstallCoach() {
  const pathname = usePathname();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname?.startsWith("/app") || pathname === "/app/login") {
      setShouldShow(false);
      return;
    }
    if (!isIosLikeDevice() || isStandalonePwa()) {
      setShouldShow(false);
      return;
    }
    setShouldShow(window.localStorage.getItem(PWA_INSTALL_COACH_DISMISSED_KEY) !== "1");
  }, [pathname]);

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PWA_INSTALL_COACH_DISMISSED_KEY, "1");
    }
    setShouldShow(false);
  };

  if (!shouldShow) return null;

  return (
    <aside className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[65] mx-auto w-[min(92vw,420px)] rounded-2xl border border-white/14 bg-[#081327]/95 p-3 text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)] backdrop-blur md:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-[#06132a]">
          C
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">Instale o Converta no iPhone</p>
          <p className="mt-1 text-xs leading-relaxed text-white/72">
            Use em tela cheia, como aplicativo. Toque em Compartilhar e depois em
            &quot;Adicionar à Tela de Início&quot;.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 rounded-lg border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/82 transition hover:bg-white/12 hover:text-white"
          >
            Não mostrar novamente
          </button>
        </div>
      </div>
    </aside>
  );
}
