"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  AppSession,
  clearAppSession,
  loadAppSession,
  loginAppUser,
  saveAppSession,
} from "@/lib/appClientApi";

export default function AppLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

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
    setInfoMessage(null);
    try {
      const response = await loginAppUser(normalizedEmail, password);
      const session: AppSession = {
        baseUrl: process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api",
        token: response.token,
        user: response.user,
        features: response.features,
        profile: response.profile,
      };
      saveAppSession(session);
      router.replace("/app/inbox");
    } catch (err) {
      const typed = err as { message?: string };
      setError(typed.message || "Falha ao autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen overflow-x-hidden bg-re7-navy px-3 py-6 text-white sm:items-center sm:justify-center sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 sm:p-6">
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/converta-logo-light.png"
            alt="Converta"
            width={240}
            height={88}
            priority
            className="h-auto w-full max-w-[220px] object-contain"
          />
        </div>

        {checkingSession ? <p className="text-sm text-white/70">Verificando acesso...</p> : null}

        {!checkingSession ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Email</span>
              <input
                type="email"
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Senha</span>
              <input
                type="password"
                className="w-full min-w-0 rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error ? (
              <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
            {infoMessage ? (
              <p className="rounded-md border border-amber-400/30 bg-amber-900/30 p-3 text-sm text-amber-100">
                {infoMessage}
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

        <div className="mt-6 text-center text-xs text-white/50">
          <button
            type="button"
            onClick={() =>
              setInfoMessage("Recuperacao de senha ainda nao esta disponivel no portal. Solicite o reset ao administrador.")
            }
            className="hover:text-white"
          >
            Recuperar senha
          </button>
        </div>
      </div>
    </main>
  );
}
