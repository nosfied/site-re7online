"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APP_ID = "2074361376674006";
const CONFIG_ID = "1261464002116286";
const DEFAULT_ONBOARDING_URL = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=${APP_ID}&config_id=${CONFIG_ID}`;

type CapturedEntry = {
  timestamp: string;
  source: "query" | "postMessage" | "fb.login" | "window.focus" | "window.blur" | "popup.closed";
  raw: unknown;
  parsed: unknown;
  origin?: string;
};

function safeParseEventData(input: unknown) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input;
}

export default function MetaEmbeddedSignupDebugPage() {
  const popupRef = useRef<Window | null>(null);
  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [runtimeUrl, setRuntimeUrl] = useState("");
  const [popupOpened, setPopupOpened] = useState(false);
  const [popupClosed, setPopupClosed] = useState(false);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [windowFocused, setWindowFocused] = useState(true);
  const [locationSnapshot, setLocationSnapshot] = useState({
    href: "",
    search: "",
  });
  const [queryData, setQueryData] = useState({
    code: "",
    state: "",
    error: "",
  });

  const appendEntry = useCallback((entry: CapturedEntry) => {
    setEntries((prev) => [entry, ...prev].slice(0, 30));
    console.log("[embedded-signup-debug]", entry);
    fetch("/api/debug/embedded-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch((error) => {
      console.warn("[embedded-signup-debug] persist failed", error);
    });
  }, []);

  const refreshLocationState = useCallback(
    (source: CapturedEntry["source"]) => {
      const params = new URLSearchParams(window.location.search);
      const nextQueryData = {
        code: params.get("code") ?? "",
        state: params.get("state") ?? "",
        error: params.get("error") ?? "",
      };
      const nextLocationSnapshot = {
        href: window.location.href,
        search: window.location.search,
      };

      setQueryData(nextQueryData);
      setLocationSnapshot(nextLocationSnapshot);

      appendEntry({
        timestamp: new Date().toISOString(),
        source,
        raw: {
          href: nextLocationSnapshot.href,
          search: nextLocationSnapshot.search,
          code: nextQueryData.code || null,
          state: nextQueryData.state || null,
          error: nextQueryData.error || null,
        },
        parsed: {
          href: nextLocationSnapshot.href,
          search: nextLocationSnapshot.search,
          code: nextQueryData.code || null,
          state: nextQueryData.state || null,
          error: nextQueryData.error || null,
        },
      });
    },
    [appendEntry]
  );

  useEffect(() => {
    const defaultRuntimeUrl = DEFAULT_ONBOARDING_URL;
    setRuntimeUrl(defaultRuntimeUrl);
    refreshLocationState("query");
  }, [refreshLocationState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsed = safeParseEventData(event.data);
      setMessagesReceived((count) => count + 1);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "postMessage",
        raw: event.data,
        parsed,
        origin: event.origin,
      });
    };

    const onFocus = () => {
      setWindowFocused(true);
      refreshLocationState("window.focus");
    };

    const onBlur = () => {
      setWindowFocused(false);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "window.blur",
        raw: {
          href: window.location.href,
          search: window.location.search,
        },
        parsed: {
          href: window.location.href,
          search: window.location.search,
        },
      });
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [appendEntry, refreshLocationState]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const popup = popupRef.current;
      if (!popup || popupClosed) return;
      if (popup.closed) {
        setPopupClosed(true);
        popupRef.current = null;
        appendEntry({
          timestamp: new Date().toISOString(),
          source: "popup.closed",
          raw: {
            href: window.location.href,
            search: window.location.search,
          },
          parsed: {
            href: window.location.href,
            search: window.location.search,
          },
        });
        refreshLocationState("query");
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [appendEntry, popupClosed, refreshLocationState]);

  const startEmbeddedSignup = useCallback(() => {
    setStarting(true);
    const effectiveRuntimeUrl = runtimeUrl.trim() || DEFAULT_ONBOARDING_URL;
    const popup = window.open(
      effectiveRuntimeUrl,
      "meta-embedded-signup",
      "popup=yes,width=720,height=820,resizable=yes,scrollbars=yes"
    );
    popupRef.current = popup;
    setPopupOpened(Boolean(popup));
    setPopupClosed(false);

    appendEntry({
      timestamp: new Date().toISOString(),
      source: "fb.login",
      raw: {
        onboardingUrl: effectiveRuntimeUrl,
        popupOpened: Boolean(popup),
      },
      parsed: {
        onboardingUrl: effectiveRuntimeUrl,
        popupOpened: Boolean(popup),
      },
    });
    setStarting(false);
  }, [appendEntry, runtimeUrl]);

  const rawEntries = useMemo(() => JSON.stringify(entries, null, 2), [entries]);

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold">Meta Embedded Signup Debug</h1>
          <p className="mt-1 text-sm text-white/70">
            app_id={APP_ID} • config_id={CONFIG_ID} • direct onboarding URL
          </p>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Onboarding URL</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={runtimeUrl}
                onChange={(event) => setRuntimeUrl(event.target.value)}
                placeholder={DEFAULT_ONBOARDING_URL}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startEmbeddedSignup}
                disabled={starting}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting ? "Abrindo..." : "Iniciar Embedded Signup"}
              </button>
              <span
                className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200"
              >
                abertura direta via popup
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Popup</p>
            <p className="mt-2 text-sm font-semibold">{popupOpened ? "opened" : "not opened"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Popup state</p>
            <p className="mt-2 text-sm font-semibold">{popupClosed ? "closed" : "open or pending"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Code</p>
            <p className="mt-2 text-sm font-semibold">{queryData.code ? "captured" : "not captured"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Messages</p>
            <p className="mt-2 text-sm font-semibold">{messagesReceived}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">Window focus</p>
            <p className="mt-2 text-sm font-semibold">{windowFocused ? "focused" : "blurred"}</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
              URL atual
            </h2>
            <div className="mt-3 grid gap-2 text-sm">
              <p className="break-all">
                <span className="text-white/70">href:</span> {locationSnapshot.href || "-"}
              </p>
              <p className="break-all">
                <span className="text-white/70">search:</span> {locationSnapshot.search || "-"}
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
              Query string
            </h2>
            <div className="mt-3 grid gap-2 text-sm">
              <p>
                <span className="text-white/70">code:</span> {queryData.code || "-"}
              </p>
              <p>
                <span className="text-white/70">state:</span> {queryData.state || "-"}
              </p>
              <p>
                <span className="text-white/70">error:</span> {queryData.error || "-"}
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
              Ultimo evento
            </h2>
            <pre className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-re7-navy/60 p-3 text-xs text-white/80">
              {entries[0] ? JSON.stringify(entries[0], null, 2) : "Nenhum evento capturado ainda."}
            </pre>
          </article>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Eventos capturados
          </h2>
          <pre className="mt-3 max-h-[50vh] overflow-auto rounded-md border border-white/10 bg-re7-navy/60 p-3 text-xs text-white/80">
            {rawEntries}
          </pre>
        </section>
      </div>
    </main>
  );
}
