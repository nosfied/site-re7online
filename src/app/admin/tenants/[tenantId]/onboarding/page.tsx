"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  createUser,
  fetchTenantById,
  onboardingExchangeCode,
  onboardingManualBindNumber,
  onboardingRegisterPhoneNumber,
  TenantConfigResponse,
} from "@/lib/whatsappAdminApi";
import {
  EmbeddedSignupCaptureEntry,
  extractMetaCodeFromUnknownPayload,
  extractEmbeddedSignupData,
  loadMetaEmbeddedSignupSdk,
  readEmbeddedSignupQuery,
  safeParseEventData,
  startMetaEmbeddedSignup,
} from "@/lib/metaEmbeddedSignup";

type OnboardingStatus = "idle" | "processing" | "success" | "error";
type UserFormState = {
  name: string;
  email: string;
  password: string;
};

const EMPTY_USER_FORM: UserFormState = {
  name: "",
  email: "",
  password: "",
};

function debugLog(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info(`[tenant-onboarding] ${event}`, payload ?? {});
}

function maskSensitiveValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function sanitizeDebugValue(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeDebugValue(item));
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const sensitiveKeys = new Set([
    "accessToken",
    "access_token",
    "signedRequest",
    "signed_request",
    "token",
    "accessTokenData",
  ]);

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (sensitiveKeys.has(key) && typeof value === "string") {
      next[key] = maskSensitiveValue(value);
      continue;
    }
    next[key] = sanitizeDebugValue(value);
  }
  return next;
}

function buildDebugPayload(input: unknown, origin?: string) {
  const parsed = safeParseEventData(input);
  const extracted = extractEmbeddedSignupData(parsed);
  const typed =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const authResponse =
    typed?.authResponse && typeof typed.authResponse === "object"
      ? (typed.authResponse as Record<string, unknown>)
      : null;
  const tokenCandidate =
    typeof typed?.accessToken === "string"
      ? typed.accessToken
      : typeof authResponse?.accessToken === "string"
        ? authResponse.accessToken
        : typeof authResponse?.access_token === "string"
          ? authResponse.access_token
          : "";
  const signedRequestCandidate =
    typeof typed?.signedRequest === "string"
      ? typed.signedRequest
      : typeof authResponse?.signedRequest === "string"
        ? authResponse.signedRequest
        : "";
  const statusCandidate =
    typeof typed?.status === "string"
      ? typed.status
      : typeof authResponse?.status === "string"
        ? authResponse.status
        : "";

  return {
    code: extracted.code || null,
    wabaId: extracted.wabaId || null,
    phoneNumberId: extracted.phoneNumberId || null,
    businessId: extracted.businessId || null,
    businessPortfolioId: extracted.businessPortfolioId || null,
    status: statusCandidate || null,
    accessToken: tokenCandidate ? maskSensitiveValue(tokenCandidate) : null,
    signedRequest: signedRequestCandidate ? maskSensitiveValue(signedRequestCandidate) : null,
    origin: origin ?? null,
  };
}

export default function TenantOnboardingPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = useMemo(() => {
    const rawTenantId = params?.tenantId;
    if (Array.isArray(rawTenantId)) {
      return rawTenantId[0] ? decodeURIComponent(rawTenantId[0]) : "";
    }
    return rawTenantId ? decodeURIComponent(rawTenantId) : "";
  }, [params]);

  const popupCheckRef = useRef<number | null>(null);
  const { connection } = useAdminConsole();
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [popupOpened, setPopupOpened] = useState(false);
  const [popupClosed, setPopupClosed] = useState(false);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [entries, setEntries] = useState<EmbeddedSignupCaptureEntry[]>([]);
  const [status, setStatus] = useState<OnboardingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tenantSnapshot, setTenantSnapshot] = useState<TenantConfigResponse | null>(null);
  const [code, setCode] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [businessPortfolioId, setBusinessPortfolioId] = useState("");
  const [reconnectMode, setReconnectMode] = useState(false);
  const [registrationPin, setRegistrationPin] = useState("");
  const [registeringPhone, setRegisteringPhone] = useState(false);
  const [rawPayload, setRawPayload] = useState<unknown>(null);
  const [resultSnapshot, setResultSnapshot] = useState<{
    phoneNumberId: string | null;
    wabaId: string | null;
    businessId: string | null;
    businessPortfolioId: string | null;
    businessTokenStored: boolean;
    warning?: string | null;
  } | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  const appendEntry = useCallback((entry: EmbeddedSignupCaptureEntry) => {
    setEntries((prev) => [entry, ...prev].slice(0, 30));
    debugLog("capture", {
      source: entry.source,
      code:
        entry.parsed && typeof entry.parsed === "object" && !Array.isArray(entry.parsed)
          ? (entry.parsed as Record<string, unknown>).code ?? null
          : null,
      origin: entry.origin ?? null,
    });
    if (process.env.NODE_ENV === "development") {
      fetch("/api/debug/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch((error) => {
        console.warn("[tenant-onboarding] persist failed", error);
      });
    }
  }, []);

  const applyCapturedData = useCallback((input: unknown) => {
    const extracted = extractEmbeddedSignupData(input);
    if (extracted.code) setCode(extracted.code);
    if (extracted.wabaId) setWabaId((current) => (reconnectMode ? extracted.wabaId : current || extracted.wabaId));
    if (extracted.phoneNumberId) {
      setPhoneNumberId((current) => (reconnectMode ? extracted.phoneNumberId : current || extracted.phoneNumberId));
    }
    if (extracted.businessId) setBusinessId((current) => (reconnectMode ? extracted.businessId : current || extracted.businessId));
    if (extracted.businessPortfolioId) {
      setBusinessPortfolioId((current) =>
        reconnectMode ? extracted.businessPortfolioId : current || extracted.businessPortfolioId
      );
    }
    if (input != null) setRawPayload(input);
  }, [reconnectMode]);

  const refreshLocationState = useCallback(
    (source: EmbeddedSignupCaptureEntry["source"]) => {
      const querySnapshot = readEmbeddedSignupQuery(window);
      const parsed = {
        ...querySnapshot,
        ...buildDebugPayload(querySnapshot),
      };
      appendEntry({
        timestamp: new Date().toISOString(),
        source,
        raw: querySnapshot,
        parsed,
      });
      applyCapturedData(querySnapshot);
      const capturedCode = extractMetaCodeFromUnknownPayload(querySnapshot);
      if (capturedCode) {
        debugLog("code captured via query", { code: maskSensitiveValue(capturedCode) });
      }
    },
    [appendEntry, applyCapturedData]
  );

  useEffect(() => {
    if (!tenantId || !connection.baseUrl || !connection.adminToken) return;
    let cancelled = false;
    setLoadingTenant(true);
    setErrorMessage(null);

    fetchTenantById(connection, tenantId)
      .then((response) => {
        if (cancelled) return;
        setTenantSnapshot(response);
        setPhoneNumberId((current) => current || response.tenant.metaPhoneNumberId || "");
        setDisplayPhoneNumber((current) => current || response.tenant.displayPhoneNumber || "");
      })
      .catch((error: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (error.status === 404) {
          setErrorMessage("Tenant nao encontrado.");
          return;
        }
        setErrorMessage(error.message || "Falha ao carregar tenant.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTenant(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, tenantId]);

  useEffect(() => {
    refreshLocationState("query");
  }, [refreshLocationState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("facebook.com")) return;
      const parsed = safeParseEventData(event.data);
      const debugPayload = buildDebugPayload(parsed, event.origin);
      setMessagesReceived((count) => count + 1);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "fb.postMessage",
        raw: event.data,
        parsed: debugPayload,
        origin: event.origin,
      });
      applyCapturedData(parsed);
      const capturedCode = extractMetaCodeFromUnknownPayload(parsed);
      if (capturedCode) {
        debugLog("code captured via postMessage", { code: maskSensitiveValue(capturedCode) });
      }
    };

    const onFocus = () => {
      if (popupOpened && !popupClosed) {
        setPopupClosed(true);
        const queryState = readEmbeddedSignupQuery(window);
        appendEntry({
          timestamp: new Date().toISOString(),
          source: "popup.closed",
          raw: queryState,
          parsed: {
            ...queryState,
            ...buildDebugPayload(queryState),
          },
        });
      }
      refreshLocationState("window.focus");
    };

    const onBlur = () => {
      const queryState = readEmbeddedSignupQuery(window);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "window.blur",
        raw: queryState,
        parsed: {
          ...queryState,
          ...buildDebugPayload(queryState),
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
  }, [appendEntry, applyCapturedData, popupClosed, popupOpened, refreshLocationState]);

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

  const handleStart = async () => {
    setStarting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPopupOpened(true);
    setPopupClosed(false);

    if (popupCheckRef.current) {
      window.clearTimeout(popupCheckRef.current);
    }
    popupCheckRef.current = window.setTimeout(() => {
      setPopupClosed(true);
      refreshLocationState("query");
    }, 60000);

    try {
      const response = await startMetaEmbeddedSignup();
      const debugPayload = buildDebugPayload(response);
      appendEntry({
        timestamp: new Date().toISOString(),
        source: "fb.callback",
        raw: response,
        parsed: debugPayload,
      });
      applyCapturedData(response);
      const capturedCode = extractMetaCodeFromUnknownPayload(response);
      if (capturedCode) {
        debugLog("code captured via callback", { code: maskSensitiveValue(capturedCode) });
      }
      setPopupClosed(true);
      refreshLocationState("query");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleStartReconnect = () => {
    const currentPhoneNumberId =
      resultSnapshot?.phoneNumberId || tenantSnapshot?.tenant.metaPhoneNumberId || phoneNumberId;
    const confirmed = window.confirm(
      [
        "Alterar numero e refazer a conexao Meta?",
        "",
        currentPhoneNumberId
          ? `Numero atual: ${currentPhoneNumberId}`
          : "Nao ha numero atual carregado.",
        "",
        "A acao limpa os campos capturados nesta tela para evitar reenviar o numero antigo. Nada sera salvo ate processar a nova conexao ou vincular manualmente.",
      ].join("\n")
    );
    if (!confirmed) return;
    setReconnectMode(true);
    setCode("");
    setWabaId("");
    setPhoneNumberId("");
    setDisplayPhoneNumber("");
    setBusinessId("");
    setBusinessPortfolioId("");
    setRawPayload(null);
    setResultSnapshot(null);
    setEntries([]);
    setStatus("idle");
    setErrorMessage(null);
    setSuccessMessage("Modo de troca ativado. Inicie a conexao Meta ou informe o novo phoneNumberId manualmente.");
  };

  const handleCancelReconnect = () => {
    setReconnectMode(false);
    setCode("");
    setRawPayload(null);
    setResultSnapshot(null);
    setPhoneNumberId(tenantSnapshot?.tenant.metaPhoneNumberId || "");
    setDisplayPhoneNumber(tenantSnapshot?.tenant.displayPhoneNumber || "");
    setWabaId("");
    setBusinessId("");
    setBusinessPortfolioId("");
    setStatus("idle");
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleCreateUser = async () => {
    if (!tenantId) return;
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) {
      setUserError("Preencha nome, email e senha.");
      return;
    }
    const emailUsed = userForm.email.trim().toLowerCase();
    const passwordUsed = userForm.password;
    setCreatingUser(true);
    setUserError(null);
    setUserSuccess(null);
    try {
      await createUser(connection, tenantId, {
        name: userForm.name.trim(),
        email: emailUsed,
        password: passwordUsed,
        role: "AGENT",
      });
      setUserForm(EMPTY_USER_FORM);
      setUserSuccess(
        `Usuario criado com sucesso.\n\nLogin: ${emailUsed}\nSenha: ${passwordUsed}\nAcesso: /app/login`
      );
    } catch (error) {
      const typed = error as { message?: string };
      const message = typed.message || "Erro ao criar usuario.";
      setUserError(
        /user_already_exists|unique/i.test(message) ? "Email ja existe." : message
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const handleProcess = async () => {
    if (processing) return;
    if (!tenantId) return;
    if (!connection.baseUrl || !connection.adminToken) {
      setStatus("error");
      setErrorMessage("Configure a conexao admin antes de processar.");
      return;
    }
    if (!code.trim()) {
      setStatus("error");
      setErrorMessage("Informe o code antes de processar.");
      return;
    }

    setProcessing(true);
    setStatus("processing");
    setErrorMessage(null);
    setSuccessMessage(null);
    debugLog("processing started", {
      tenantId,
      hasCode: Boolean(code.trim()),
      hasWabaId: Boolean(wabaId.trim()),
      hasPhoneNumberId: Boolean(phoneNumberId.trim()),
    });

    try {
      const response = await onboardingExchangeCode(connection, tenantId, {
        code: code.trim(),
        redirectUri: "",
        replaceExistingMetaIdentity: reconnectMode,
        embeddedSignup: {
          wabaId: wabaId.trim() || null,
          phoneNumberId: phoneNumberId.trim() || null,
          businessId: businessId.trim() || null,
          businessPortfolioId: businessPortfolioId.trim() || null,
          raw: rawPayload ?? null,
        },
      });
      setResultSnapshot(response);
      if (response.phoneNumberId) setPhoneNumberId(response.phoneNumberId);
      if (response.wabaId) setWabaId(response.wabaId);
      if (response.businessId) setBusinessId(response.businessId);
      if (response.businessPortfolioId) setBusinessPortfolioId(response.businessPortfolioId);
      if (response.phoneNumberId) {
        setTenantSnapshot((current) =>
          current
            ? {
                ...current,
                tenant: {
                  ...current.tenant,
                  metaPhoneNumberId: response.phoneNumberId || current.tenant.metaPhoneNumberId,
                },
              }
            : current
        );
      }
      setReconnectMode(false);
      setStatus("success");
      setSuccessMessage(
        response.warning ||
          "Conexao Meta processada com sucesso. Credenciais do tenant salvas."
      );
    } catch (error) {
      const typed = error as { message?: string; status?: number };
      setStatus("error");
      setErrorMessage(
        typed.message ||
          (typed.status ? `Falha ao processar conexao (${typed.status}).` : "Falha ao processar conexao.")
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleManualBind = async () => {
    if (!tenantId) return;
    if (!connection.baseUrl || !connection.adminToken) {
      setStatus("error");
      setErrorMessage("Configure a conexao admin antes de vincular.");
      return;
    }
    if (!phoneNumberId.trim()) {
      setStatus("error");
      setErrorMessage("Informe o phoneNumberId antes de vincular manualmente.");
      return;
    }

    setProcessing(true);
    setStatus("processing");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await onboardingManualBindNumber(connection, tenantId, {
        phoneNumberId: phoneNumberId.trim(),
        displayPhoneNumber: displayPhoneNumber.trim() || null,
        wabaId: wabaId.trim() || null,
        businessId: businessId.trim() || null,
        businessPortfolioId: businessPortfolioId.trim() || null,
        replaceExistingMetaIdentity: reconnectMode,
        raw: rawPayload ?? null,
      });
      setResultSnapshot(response);
      if (response.phoneNumberId) setPhoneNumberId(response.phoneNumberId);
      if (response.wabaId) setWabaId(response.wabaId);
      if (response.businessId) setBusinessId(response.businessId);
      if (response.businessPortfolioId) setBusinessPortfolioId(response.businessPortfolioId);
      if (response.phoneNumberId) {
        setTenantSnapshot((current) =>
          current
            ? {
                ...current,
                tenant: {
                  ...current.tenant,
                  metaPhoneNumberId: response.phoneNumberId || current.tenant.metaPhoneNumberId,
                },
              }
            : current
        );
      }
      setReconnectMode(false);
      setStatus("success");
      setSuccessMessage(response.warning || "Numero conectado vinculado ao tenant com sucesso.");
    } catch (error) {
      const typed = error as { message?: string; status?: number };
      setStatus("error");
      setErrorMessage(
        typed.message ||
          (typed.status
            ? `Falha ao vincular numero conectado (${typed.status}).`
            : "Falha ao vincular numero conectado.")
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleRegisterPhoneNumber = async () => {
    if (!tenantId) return;
    if (!connection.baseUrl || !connection.adminToken) {
      setStatus("error");
      setErrorMessage("Configure a conexao admin antes de registrar o numero.");
      return;
    }
    if (!phoneNumberId.trim()) {
      setStatus("error");
      setErrorMessage("Informe o phoneNumberId antes de registrar o numero.");
      return;
    }
    if (!/^\d{6}$/.test(registrationPin.trim())) {
      setStatus("error");
      setErrorMessage("Informe o PIN de registro com 6 digitos.");
      return;
    }

    setRegisteringPhone(true);
    setStatus("processing");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await onboardingRegisterPhoneNumber(connection, tenantId, {
        phoneNumberId: phoneNumberId.trim(),
        pin: registrationPin.trim(),
      });
      setStatus("success");
      setRegistrationPin("");
      if (response.displayPhoneNumber) setDisplayPhoneNumber(response.displayPhoneNumber);
      if (response.displayPhoneNumber || response.phoneNumberId) {
        setTenantSnapshot((current) =>
          current
            ? {
                ...current,
                tenant: {
                  ...current.tenant,
                  metaPhoneNumberId: response.phoneNumberId || current.tenant.metaPhoneNumberId,
                  displayPhoneNumber:
                    response.displayPhoneNumber || current.tenant.displayPhoneNumber,
                },
              }
            : current
        );
      }
      setSuccessMessage(
        response.warning ||
          `Numero ${response.phoneNumberId} registrado na Cloud API com sucesso.`
      );
    } catch (error) {
      const typed = error as { message?: string; status?: number };
      setStatus("error");
      setErrorMessage(
        typed.message ||
          (typed.status
            ? `Falha ao registrar numero na Cloud API (${typed.status}).`
            : "Falha ao registrar numero na Cloud API.")
      );
    } finally {
      setRegisteringPhone(false);
    }
  };

  const rawPayloadJson = useMemo(
    () => (rawPayload == null ? "-" : JSON.stringify(sanitizeDebugValue(rawPayload), null, 2)),
    [rawPayload]
  );
  const sanitizedEntriesJson = useMemo(
    () => JSON.stringify(sanitizeDebugValue(entries), null, 2),
    [entries]
  );
  const effectivePhoneNumberId =
    resultSnapshot?.phoneNumberId || phoneNumberId.trim() || tenantSnapshot?.tenant.metaPhoneNumberId || "";
  const hasEffectivePhoneLink =
    Boolean(effectivePhoneNumberId) &&
    phoneNumberId.trim() === effectivePhoneNumberId &&
    !reconnectMode;

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Onboarding assistido</h1>
            <p className="text-sm font-mono text-white/70">{tenantId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tenants/${encodeURIComponent(tenantId)}`}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Config tenant
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Voltar
            </Link>
          </div>
        </header>

        {loadingTenant ? <p className="text-sm text-white/70">Carregando tenant...</p> : null}
        {sdkError ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {sdkError}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Status do tenant
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <p className="text-xs uppercase tracking-wide text-white/60">Nome</p>
              <p className="mt-2 text-sm font-semibold">
                {tenantSnapshot?.tenant.name || "-"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <p className="text-xs uppercase tracking-wide text-white/60">Client ID</p>
              <p className="mt-2 break-all font-mono text-sm">
                {tenantSnapshot?.client?.id || "-"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <p className="text-xs uppercase tracking-wide text-white/60">phoneNumberId</p>
              <p className="mt-2 break-all font-mono text-sm">
                {effectivePhoneNumberId || "-"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
              <p className="text-xs uppercase tracking-wide text-white/60">Status</p>
              <p className="mt-2 text-sm font-semibold">
                {tenantSnapshot?.client?.status || (tenantSnapshot?.tenant.metaPhoneNumberId ? "CONNECTED" : "PENDING")}
              </p>
            </div>
          </div>
          <div className="theme-soft-warning-panel mt-4 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-current">
                  Alterar numero conectado
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-current opacity-80">
                  Use esta acao quando o tenant foi conectado com o numero errado ou quando precisa refazer
                  o Embedded Signup. Ela limpa os campos da tela para evitar reaproveitar o phoneNumberId antigo.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {reconnectMode ? (
                  <button
                    type="button"
                    onClick={handleCancelReconnect}
                    disabled={processing || starting}
                    className="rounded-md border border-current/25 px-3 py-2 text-sm font-semibold text-current hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar troca
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleStartReconnect}
                  disabled={processing || starting}
                  className="rounded-md border border-current/25 bg-black/10 px-3 py-2 text-sm font-semibold text-current hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Alterar numero / refazer conexao
                </button>
              </div>
            </div>
            {reconnectMode ? (
              <p className="mt-3 rounded-md border border-current/20 bg-black/10 px-3 py-2 text-xs font-medium text-current">
                Modo de troca ativo: capture uma nova conexao Meta ou informe o novo phoneNumberId e use
                "Vincular numero conectado". Nada sera salvo ate processar.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Conexao Meta
          </h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <article className="grid min-w-0 gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-2 rounded-lg border border-white/10 bg-re7-navy/40 p-3 text-sm text-white/80">
              <p>
                <span className="font-semibold text-white">Passo 1: Iniciar conexao</span> -
                captura o code e os dados retornados pela Meta. Ainda nao salva nada no sistema.
              </p>
              <p>
                <span className="font-semibold text-white">Passo 2: Processar conexao</span> -
                envia o code ao backend e persiste o TenantMetaConfig do tenant.
              </p>
              <p>
                <span className="font-semibold text-white">Numero ja conectado</span> -
                quando a WABA ja esta no portfolio da operacao, informe o phoneNumberId
                e use o vinculo manual sem novo Embedded Signup.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleStart}
                disabled={!sdkReady || starting}
                className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting ? "Abrindo..." : reconnectMode ? "Iniciar nova conexao" : "Iniciar conexao"}
              </button>
              <button
                type="button"
                onClick={handleProcess}
                disabled={processing || !code.trim()}
                className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? "Processando..." : "Processar conexao"}
              </button>
              <button
                type="button"
                onClick={handleManualBind}
                disabled={processing || !phoneNumberId.trim()}
                className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing
                  ? "Vinculando..."
                  : hasEffectivePhoneLink
                    ? "Atualizar vinculo do numero"
                    : "Vincular numero conectado"}
              </button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  sdkReady ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"
                }`}
              >
                SDK {sdkReady ? "carregado" : "pendente"}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-white/70">Code</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                {!code.trim() ? (
                  <span className="text-xs text-amber-200">
                    Conclua o fluxo da Meta para capturar o codigo de conexao.
                  </span>
                ) : (
                  <span className="text-xs text-emerald-200">Codigo capturado e pronto para processar.</span>
                )}
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-white/70">phoneNumberId (manual opcional)</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={phoneNumberId}
                  onChange={(event) => setPhoneNumberId(event.target.value)}
                />
                {reconnectMode ? (
                  <span className="text-xs text-amber-200">
                    Informe o novo phoneNumberId ou aguarde a captura da nova conexao Meta.
                  </span>
                ) : null}
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-white/70">Telefone exibido</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={displayPhoneNumber}
                  onChange={(event) => setDisplayPhoneNumber(event.target.value)}
                  placeholder="55 84 9459-6848"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-white/70">WABA ID do tenant</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={wabaId}
                  onChange={(event) => setWabaId(event.target.value)}
                  placeholder="Ex.: 1733840571328720"
                />
                <span className="text-xs text-white/50">
                  Use este campo quando o numero ja estiver conectado em uma WABA conhecida.
                </span>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-white/70">Business ID</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={businessId}
                  onChange={(event) => setBusinessId(event.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-sm lg:col-span-2">
                <span className="text-white/70">Business Portfolio ID</span>
                <input
                  className="min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                  value={businessPortfolioId}
                  onChange={(event) => setBusinessPortfolioId(event.target.value)}
                />
              </label>
            </div>

            <div className="theme-surface-strong rounded-lg border border-sky-300/25 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-[180px] max-w-[220px] gap-1 text-sm">
                  <span className="theme-text font-semibold">PIN de registro Cloud API</span>
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    className="theme-select rounded-md px-3 py-2 outline-none"
                    value={registrationPin}
                    onChange={(event) =>
                      setRegistrationPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="6 digitos"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRegisterPhoneNumber}
                  disabled={
                    registeringPhone ||
                    !phoneNumberId.trim() ||
                    !/^\d{6}$/.test(registrationPin.trim())
                  }
                  className="rounded-md border border-sky-300/45 bg-re7-sky px-4 py-2 text-sm font-semibold text-[#06132a] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {registeringPhone ? "Registrando..." : "Registrar numero na Cloud API"}
                </button>
              </div>
              <p className="theme-muted mt-2 text-xs leading-relaxed">
                Use quando a Meta exibir que o numero precisa ser registrado. Este PIN e o codigo de
                verificacao em duas etapas da Cloud API, nao o codigo SMS de posse do numero. Ele nao e salvo;
                e enviado apenas para a API de registro do phoneNumberId configurado neste tenant.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/60">Status</p>
                <p className="mt-2 text-sm font-semibold">{status}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/60">Popup</p>
                <p className="mt-2 text-sm font-semibold">{popupOpened ? "opened" : "not opened"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/60">Popup state</p>
                <p className="mt-2 text-sm font-semibold">{popupClosed ? "closed" : "open or pending"}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-re7-navy/40 p-3">
                <p className="text-xs uppercase tracking-wide text-white/60">Messages</p>
                <p className="mt-2 text-sm font-semibold">{messagesReceived}</p>
              </div>
            </div>
          </article>

          <article className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                Resultado da conexao
              </h2>
              <div className="mt-3 grid gap-2 text-sm">
                <p><span className="text-white/70">phoneNumberId:</span> {resultSnapshot?.phoneNumberId || phoneNumberId || "-"}</p>
                <p><span className="text-white/70">wabaId:</span> {resultSnapshot?.wabaId || wabaId || "-"}</p>
                <p><span className="text-white/70">businessId:</span> {resultSnapshot?.businessId || businessId || "-"}</p>
                <p><span className="text-white/70">businessPortfolioId:</span> {resultSnapshot?.businessPortfolioId || businessPortfolioId || "-"}</p>
                <p><span className="text-white/70">token salvo:</span> {resultSnapshot ? (resultSnapshot.businessTokenStored ? "sim" : "nao") : "-"}</p>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                Raw payload
              </h2>
              <pre className="mt-3 w-full max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-re7-navy/60 p-3 text-xs text-white/80">
                {rawPayloadJson}
              </pre>
            </div>
          </article>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Criar usuario
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Nome</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.name}
                onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Email</span>
              <input
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-white/70">Senha</span>
              <input
                type="password"
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={userForm.password}
                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
          </div>
          {userError ? (
            <p className="mt-3 rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {userError}
            </p>
          ) : null}
          {userSuccess ? (
            <p className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">
              {userSuccess}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={creatingUser}
              onClick={handleCreateUser}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingUser ? "Criando..." : "CRIAR ACESSO AO CLIENTE"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
            Eventos capturados
          </h2>
          <pre className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-white/10 bg-re7-navy/60 p-3 text-xs text-white/80">
            {sanitizedEntriesJson}
          </pre>
        </section>
      </div>
    </div>
  );
}
