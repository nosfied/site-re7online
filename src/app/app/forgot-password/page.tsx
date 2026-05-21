"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import { requestAppPasswordReset } from "@/lib/appClientApi";

export default function AppForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Informe seu email.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await requestAppPasswordReset(normalizedEmail);
      setMessage(response.message || "Se existir uma conta, enviaremos instrucoes.");
    } catch (err) {
      setError((err as Error).message || "Nao foi possivel solicitar a recuperacao.");
    } finally {
      setLoading(false);
    }
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
            src="/images/converta-logo-dark.png"
            alt="Converta"
            width={240}
            height={88}
            priority
            className="theme-logo-dark h-auto w-full max-w-[168px] object-contain sm:max-w-[220px]"
          />
        </div>
        <form className="grid gap-3 sm:gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <h1 className="text-base font-semibold sm:text-lg">Recuperar senha</h1>
            <p className="theme-muted text-sm">
              Informe o email de acesso. Se existir uma conta, enviaremos instrucoes.
            </p>
          </div>
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
          {error ? (
            <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-md border border-emerald-400/30 bg-emerald-900/30 p-3 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar instrucoes"}
          </button>
        </form>
        <div className="theme-soft mt-4 text-center text-xs sm:mt-6">
          <Link href="/app/login" className="hover:text-re7-sky">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  );
}
