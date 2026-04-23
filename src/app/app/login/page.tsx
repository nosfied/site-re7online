"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppSession, loadAppSession, loginAppUser, saveAppSession } from "@/lib/appClientApi";

export default function AppLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadAppSession();
    if (existing?.token) {
      router.replace("/app/inbox");
      return;
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
      const session: AppSession = {
        baseUrl: process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL || "/agent-api",
        token: response.token,
        user: response.user,
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
    <main className="flex min-h-screen items-center justify-center bg-re7-navy px-4 py-8 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-re7-sky">Re7Online</p>
          <h1 className="mt-2 text-3xl font-bold">Area do cliente</h1>
          <p className="mt-2 text-sm text-white/70">
            Entre com seu acesso para acompanhar conversas, campanhas e configuracoes.
          </p>
        </div>

        {checkingSession ? <p className="text-sm text-white/70">Verificando acesso...</p> : null}

        {!checkingSession ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Email</span>
              <input
                type="email"
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operador@cliente.com"
                autoComplete="email"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Senha</span>
              <input
                type="password"
                className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                autoComplete="current-password"
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
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : null}

        <div className="mt-6 text-xs text-white/50">
          <Link href="/" className="hover:text-white">
            Voltar para o site
          </Link>
        </div>
      </div>
    </main>
  );
}
