"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import ThemeSelector from "@/components/ThemeSelector";
import { resetAppPassword } from "@/lib/appClientApi";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("Link de recuperacao invalido.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas nao conferem.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await resetAppPassword(token, password);
      setMessage(response.message || "Senha alterada com sucesso.");
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError((err as Error).message || "Nao foi possivel alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="grid gap-3 sm:gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-1">
        <h1 className="text-base font-semibold sm:text-lg">Definir nova senha</h1>
        <p className="theme-muted text-sm">Escolha uma senha com pelo menos 8 caracteres.</p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="theme-muted">Nova senha</span>
        <input
          type="password"
          className="theme-select w-full min-w-0 rounded-md px-3 py-2 outline-none focus:border-re7-sky"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="theme-muted">Confirmar senha</span>
        <input
          type="password"
          className="theme-select w-full min-w-0 rounded-md px-3 py-2 outline-none focus:border-re7-sky"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="new-password"
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
        disabled={loading || !token}
        className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}

export default function AppResetPasswordPage() {
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
        <Suspense fallback={<p className="theme-muted text-sm">Carregando...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <div className="theme-soft mt-4 text-center text-xs sm:mt-6">
          <Link href="/app/login" className="hover:text-re7-sky">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  );
}
