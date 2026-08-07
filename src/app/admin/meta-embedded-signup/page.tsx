"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EmbeddedSignupCaptureEntry,
  META_EMBEDDED_SIGNUP_APP_ID,
  META_EMBEDDED_SIGNUP_CONFIG_ID,
  getRuntimeMetaEmbeddedSignupConfigId,
  loadMetaEmbeddedSignupSdk,
  readEmbeddedSignupQuery,
  saveRuntimeMetaEmbeddedSignupConfigId,
  safeParseEventData,
  startMetaEmbeddedSignup,
} from "@/lib/metaEmbeddedSignup";

export default function MetaEmbeddedSignupDebugPage() {
  const popupCheckRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<EmbeddedSignupCaptureEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [runtimeUrl, setRuntimeUrl] = useState("");
  const [configId, setConfigId] = useState(META_EMBEDDED_SIGNUP_CONFIG_ID);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
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

  const appendEntry = useCallback((entry: EmbeddedSignupCaptureEntry) => {
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
    (source: EmbeddedSignupCaptureEntry["source"]) => {
      const params = readEmbeddedSignupQuery(window);
      const nextQueryData = {
        code: params.code,
        state: params.state,
        error: params.error,
      };
      const nextLocationSnapshot = {
        href: params.href,
        search: params.search,
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
    const defaultRuntimeUrl = `${window.location.origin}/admin/meta-embedded-signup`;
    setRuntimeUrl(defaultRuntimeUrl);
    setConfigId(getRuntimeMetaEmbeddedSignupConfigId(window));
    refreshLocationState("query");
  }, [refreshLocationState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("facebook.com")) return;
      const parsed = safeParseEventData(event.data);
      setMessagesReceived((count) => count + 1);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "fb.postMessage",
        raw: event.data,
        parsed,
        origin: event.origin,
      });
    };

    const onFocus = () => {
      setWindowFocused(true);
      if (popupOpened && !popupClosed) {
        setPopupClosed(true);
        appendEntry({
          timestamp: new Date().toISOString(),
          source: "popup.closed",
          raw: {
            href: window.location.href,
            search: window.location.search,
            reason: "window.focus",
          },
          parsed: {
            href: window.location.href,
            search: window.location.search,
            reason: "window.focus",
          },
        });
      }
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
  }, [appendEntry, popupClosed, popupOpened, refreshLocationState]);

  useEffect(() => {
    loadMetaEmbeddedSignupSdk()
      .then(() => {
        setSdkReady(true);
        setSdkError(null);
      })
      .catch((error) => {
        setSdkError((error as Error).message);
      });
  }, []);

  const startEmbeddedSignup = useCallback(() => {
    if (!window.FB) {
      setSdkError("Facebook SDK ainda nao carregou.");
      return;
    }

    setStarting(true);
    setSdkError(null);
    setPopupOpened(true);
    setPopupClosed(false);

    if (popupCheckRef.current) {
      window.clearTimeout(popupCheckRef.current);
    }
    popupCheckRef.current = window.setTimeout(() => {
      setPopupClosed(true);
      refreshLocationState("query");
    }, 60000);

    const activeConfigId = saveRuntimeMetaEmbeddedSignupConfigId(configId, window);
    startMetaEmbeddedSignup({ configId: activeConfigId })
      .then((response) => {
        appendEntry({
          timestamp: new Date().toISOString(),
          source: "fb.callback",
          raw: response,
          parsed: response,
        });
        setStarting(false);
        setPopupClosed(true);
        refreshLocationState("query");
      })
      .catch((error) => {
        setSdkError((error as Error).message);
        setStarting(false);
      });
  }, [appendEntry, refreshLocationState]);

  const rawEntries = useMemo(() => JSON.stringify(entries, null, 2), [entries]);

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold">Meta Embedded Signup Debug v2</h1>
          <p className="mt-1 text-sm text-white/70">
            app_id={META_EMBEDDED_SIGNUP_APP_ID} • config_id={configId || META_EMBEDDED_SIGNUP_CONFIG_ID} • SDK v19.0
          </p>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Runtime / Return URL</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={runtimeUrl}
                onChange={(event) => setRuntimeUrl(event.target.value)}
                placeholder="https://converta.re7online.com/admin/meta-embedded-signup"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Config ID do Embedded Signup</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 font-mono text-white outline-none focus:border-re7-sky"
                value={configId}
                onChange={(event) => setConfigId(event.target.value.replace(/\D/g, ""))}
                placeholder={META_EMBEDDED_SIGNUP_CONFIG_ID}
              />
              <span className="text-xs text-white/50">
                Pode ser sobrescrito por <code>?metaConfigId=...</code>; fica salvo neste navegador.
              </span>
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
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  sdkReady ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"
                }`}
              >
                SDK {sdkReady ? "carregado" : "pendente"}
              </span>
            </div>
          </div>
          {sdkError ? (
            <p className="mt-3 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {sdkError}
            </p>
          ) : null}
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
