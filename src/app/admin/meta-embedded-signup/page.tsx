"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: unknown) => void,
        options?: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const APP_ID = "2074361376674006";
const CONFIG_ID = "1261464002116286";
const SDK_VERSION = "v23.0";

type CapturedEntry = {
  timestamp: string;
  source: "query" | "postMessage" | "fb.login";
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
  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [sdkReady, setSdkReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [runtimeUrl, setRuntimeUrl] = useState("");
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

  useEffect(() => {
    const defaultRuntimeUrl = `${window.location.origin}/admin/meta-embedded-signup`;
    setRuntimeUrl(defaultRuntimeUrl);

    const params = new URLSearchParams(window.location.search);
    const nextQueryData = {
      code: params.get("code") ?? "",
      state: params.get("state") ?? "",
      error: params.get("error") ?? "",
    };
    setQueryData(nextQueryData);
    if (!nextQueryData.code && !nextQueryData.error) return;
    appendEntry({
      timestamp: new Date().toISOString(),
      source: "query",
      raw: {
        code: nextQueryData.code || null,
        state: nextQueryData.state || null,
        error: nextQueryData.error || null,
        runtimeUrl: defaultRuntimeUrl,
      },
      parsed: {
        code: nextQueryData.code || null,
        state: nextQueryData.state || null,
        error: nextQueryData.error || null,
        runtimeUrl: defaultRuntimeUrl,
      },
    });
  }, [appendEntry]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsed = safeParseEventData(event.data);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "postMessage",
        raw: event.data,
        parsed,
        origin: event.origin,
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appendEntry]);

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }

    const scriptId = "meta-jssdk";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId: APP_ID,
          autoLogAppEvents: true,
          xfbml: false,
          version: SDK_VERSION,
        });
        setSdkReady(true);
        setSdkError(null);
      } catch (error) {
        setSdkError((error as Error).message);
      }
    };

    if (existing) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = `https://connect.facebook.net/en_US/sdk.js`;
    script.onerror = () => {
      setSdkError("Falha ao carregar Facebook SDK.");
    };
    document.body.appendChild(script);
  }, []);

  const startEmbeddedSignup = useCallback(() => {
    if (!window.FB) {
      setSdkError("Facebook SDK ainda nao carregou.");
      return;
    }

    setStarting(true);
    setSdkError(null);
    const effectiveRuntimeUrl = runtimeUrl.trim() || `${window.location.origin}/admin/meta-embedded-signup`;
    const statePayload = {
      runtimeUrl: effectiveRuntimeUrl,
      startedAt: new Date().toISOString(),
    };
    window.FB.login(
      (response) => {
        appendEntry({
          timestamp: new Date().toISOString(),
          source: "fb.login",
          raw: { response, runtimeUrl: effectiveRuntimeUrl, state: statePayload },
          parsed: { response, runtimeUrl: effectiveRuntimeUrl, state: statePayload },
        });
        setStarting(false);
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          feature: "whatsapp_embedded_signup",
          sessionInfoVersion: 3,
        },
        state: JSON.stringify(statePayload),
      }
    );
  }, [appendEntry, runtimeUrl]);

  const rawEntries = useMemo(() => JSON.stringify(entries, null, 2), [entries]);

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold">Meta Embedded Signup Debug</h1>
          <p className="mt-1 text-sm text-white/70">
            app_id={APP_ID} • config_id={CONFIG_ID}
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
                placeholder="https://admin.re7online.com/admin/meta-embedded-signup"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startEmbeddedSignup}
                disabled={!sdkReady || starting}
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

        <section className="grid gap-4 lg:grid-cols-2">
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
