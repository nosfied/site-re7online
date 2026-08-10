"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import {
  AppSession,
  clearAppSession,
  loadAppSession,
  loginAppUser,
  saveAppSession,
  verifyAppMfaLoginChallenge,
} from "@/lib/appClientApi";

const MOBILE_NOTIFICATION_NOTICE_AFTER_LOGIN_KEY = "converta_mobile_notification_notice_after_login";

export default function AppLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{
    challengeToken: string;
    expiresAt: string;
    email: string;
    userName: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    let fallbackTimer: number | null = null;
    try {
      const existing = loadAppSession();
      if (existing?.token) {
        router.replace("/app/inbox");
        fallbackTimer = window.setTimeout(() => {
          setCheckingSession(false);
        }, 800);
        return () => {
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        };
      }
    } catch {
      clearAppSession();
    }
    setCheckingSession(false);
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Informe email e senha.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await loginAppUser(normalizedEmail, password);
      if (response.mfaRequired) {
        setMfaChallenge({
          challengeToken: response.challengeToken,
          expiresAt: response.expiresAt,
          email: normalizedEmail,
          userName: response.user.name || normalizedEmail,
        });
        setPassword("");
        setMfaCode("");
        return;
      }
      const session: AppSession = {
        baseUrl: process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api",
        token: response.token,
        expiresAt: response.expiresAt,
        user: response.user,
        features: response.features,
        profile: response.profile,
      };
      saveAppSession(session);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(MOBILE_NOTIFICATION_NOTICE_AFTER_LOGIN_KEY, "1");
      }
      router.replace("/app/inbox");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mfaChallenge) return;
    const code = mfaCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setError("Informe o codigo de 6 digitos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await verifyAppMfaLoginChallenge(mfaChallenge.challengeToken, code);
      const session: AppSession = {
        baseUrl: process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api",
        token: response.token,
        expiresAt: response.expiresAt,
        user: response.user,
        features: response.features,
        profile: response.profile,
      };
      saveAppSession(session);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(MOBILE_NOTIFICATION_NOTICE_AFTER_LOGIN_KEY, "1");
      }
      router.replace("/app/inbox");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Não foi possível validar o código de verificação.");
    } finally {
      setLoading(false);
    }
  };

  const resetMfaChallenge = () => {
    setMfaChallenge(null);
    setMfaCode("");
    setError(null);
  };

  return (
    <main className="theme-bg flex min-h-[100dvh] w-full max-w-full overflow-x-hidden px-3 pb-[calc(0.75rem+var(--safe-bottom))] pt-[calc(0.75rem+var(--safe-top))] sm:min-h-screen sm:items-center sm:justify-center sm:px-4 sm:py-8">
      <div className="theme-surface mx-auto w-full max-w-[calc(100dvw-1.5rem)] rounded-xl border p-3 shadow-2xl shadow-black/10 sm:max-w-md sm:rounded-2xl sm:p-6">
        <div className="mb-2 flex justify-end sm:mb-4">
          <ThemeSelector />
        </div>
        <div className="mb-3 flex justify-center sm:mb-6">
          <Image
            src="/images/converta-logo-light.png"
            alt="Converta"
            width={240}
            height={88}
            priority
            className="theme-logo-light h-auto w-full max-w-[168px] object-contain sm:max-w-[220px]"
          />
          <Image
            src="/images/converta-logo-dark-20260526.png"
            alt="Converta"
            width={240}
            height={88}
            priority
            className="theme-logo-dark h-auto w-full max-w-[168px] object-contain sm:max-w-[220px]"
          />
        </div>

        {checkingSession ? <p className="theme-muted text-sm">Verificando acesso...</p> : null}

        {!checkingSession && !mfaChallenge ? (
          <form className="grid gap-3 sm:gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="theme-muted">Email</span>
              <input
                type="email"
                className="theme-select w-full min-w-0 rounded-md px-3 py-2 outline-none focus:border-re7-sky"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="theme-muted">Senha</span>
              <div className="theme-select flex items-center rounded-md focus-within:border-re7-sky">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full min-w-0 bg-transparent px-3 py-2 outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="shrink-0 px-3 text-xs font-semibold text-re7-sky hover:brightness-110"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>
            {error ? (
              <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : null}

        {!checkingSession && mfaChallenge ? (
          <form className="grid gap-3 sm:gap-4" onSubmit={handleMfaSubmit}>
            <div className="rounded-md border border-white/10 bg-black/10 p-3 text-sm">
              <p className="font-semibold">Verificação em duas etapas</p>
              <p className="theme-muted mt-1">
                Informe o código do autenticador para {mfaChallenge.userName}. Esta etapa expira em poucos minutos.
              </p>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="theme-muted">Código de 6 dígitos</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                className="theme-select w-full min-w-0 rounded-md px-3 py-2 text-center text-lg outline-none focus:border-re7-sky"
                value={mfaCode}
                maxLength={6}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            {error ? (
              <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Validando..." : "Validar codigo"}
            </button>
            <button
              type="button"
              onClick={resetMfaChallenge}
              className="theme-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
            >
              Voltar ao login
            </button>
          </form>
        ) : null}

        <div className="theme-soft mt-4 text-center text-xs sm:mt-6">
          <Link href="/app/forgot-password" className="hover:text-re7-sky">
            Recuperar senha
          </Link>
        </div>
      </div>
    </main>
  );
}
