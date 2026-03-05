"use client";

import { AdminConnection } from "@/lib/whatsappAdminApi";

type Props = {
  connection: AdminConnection;
  onChange: (next: AdminConnection) => void;
  onTestConnection?: () => void;
  testingConnection?: boolean;
};

export default function AdminConfigPanel({
  connection,
  onChange,
  onTestConnection,
  testingConnection = false,
}: Props) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">
        Conexao Admin
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-white/70">Base URL</span>
          <input
            className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
            value={connection.baseUrl}
            onChange={(event) =>
              onChange({ ...connection, baseUrl: event.target.value })
            }
            placeholder="http://127.0.0.1:3001"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-white/70">X-Admin-Token</span>
          <input
            className="rounded-md border border-white/20 bg-re7-navy/80 px-3 py-2 text-white outline-none focus:border-re7-sky"
            type="password"
            value={connection.adminToken}
            onChange={(event) =>
              onChange({ ...connection, adminToken: event.target.value })
            }
            placeholder="cole o token aqui"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2 text-white/70">
          <input
            type="checkbox"
            checked={connection.rememberToken}
            onChange={(event) =>
              onChange({ ...connection, rememberToken: event.target.checked })
            }
          />
          Lembrar token neste navegador
        </label>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testingConnection || !onTestConnection}
          className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testingConnection ? "Testando..." : "Testar conexao"}
        </button>
      </div>
    </section>
  );
}
