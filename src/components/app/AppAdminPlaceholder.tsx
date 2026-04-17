"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { AppSession, loadAppSession } from "@/lib/appClientApi";

type AppAdminPlaceholderProps = {
  title: string;
  subtitle: string;
  description: string;
};

function canViewAdministration(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

export default function AppAdminPlaceholder({
  title,
  subtitle,
  description,
}: AppAdminPlaceholderProps) {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canViewAdministration(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    setSession(stored);
  }, [router]);

  if (!session) {
    return (
      <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/70">Carregando...</p>
        </div>
      </main>
    );
  }

  return (
    <AppShell session={session} title={title} subtitle={subtitle}>
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="max-w-3xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">
            Estrutura pronta
          </p>
          <p className="text-base text-white/85">{description}</p>
          <p className="text-sm text-white/60">
            Esta tela foi criada para separar operacao e administracao no portal do cliente.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
