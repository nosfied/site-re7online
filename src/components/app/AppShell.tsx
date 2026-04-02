"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppSession, clearAppSession } from "@/lib/appClientApi";

type AppShellProps = {
  session: AppSession;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
};

function getLinkClasses(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm transition ${
    active
      ? "border-re7-sky/50 bg-re7-sky/20 text-white"
      : "border-white/20 text-white/80 hover:bg-white/10"
  }`;
}

export default function AppShell({ session, title, subtitle, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAppSession();
    router.replace("/app/login");
  };

  return (
    <main className="min-h-screen bg-re7-navy px-4 py-8 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
            <p className="mt-1 text-xs text-white/50">{session.user.name || session.user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/app/inbox" className={getLinkClasses(pathname === "/app/inbox")}>
              Inbox
            </Link>
            <Link href="/app/campaigns" className={getLinkClasses(pathname === "/app/campaigns")}>
              Campanhas
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
