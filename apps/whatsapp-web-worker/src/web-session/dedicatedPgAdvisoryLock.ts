import crypto from "node:crypto";
import { Client, type QueryResult } from "pg";

export type DedicatedPgAdvisoryLock = {
  key: bigint;
  lockHash: string;
  acquired: boolean;
  backendPid: number | null;
  release(): Promise<boolean>;
};

type PgClientLike = {
  connect(): Promise<void>;
  query<T = Record<string, unknown>>(query: string, values?: unknown[]): Promise<QueryResult<T>>;
  end(): Promise<void>;
};

export function buildWebSessionLockHash(scope: string) {
  return crypto.createHash("sha256").update(scope, "utf8").digest("hex");
}

export function buildWebSessionAdvisoryLockKey(scope: string) {
  const hash = Buffer.from(buildWebSessionLockHash(scope), "hex");
  return hash.readBigInt64BE(0);
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "t";
}

async function queryBackendPid(client: PgClientLike) {
  const result = await client.query<{ pid: number | string }>("SELECT pg_backend_pid() AS pid");
  const value = result.rows[0]?.pid;
  const pid = Number(value);
  return Number.isFinite(pid) ? pid : null;
}

export async function acquireDedicatedPgAdvisoryLock(params: {
  scope: string;
  databaseUrl?: string;
  clientFactory?: () => PgClientLike;
}): Promise<DedicatedPgAdvisoryLock> {
  const databaseUrl = params.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !params.clientFactory) {
    throw new Error("database_url_required_for_web_session_lock");
  }
  const key = buildWebSessionAdvisoryLockKey(params.scope);
  const lockHash = buildWebSessionLockHash(params.scope).slice(0, 16);
  const client = params.clientFactory ? params.clientFactory() : new Client({ connectionString: databaseUrl });
  let acquired = false;
  let closed = false;

  async function closeClient() {
    if (closed) return;
    closed = true;
    await client.end();
  }

  try {
    await client.connect();
    const backendPid = await queryBackendPid(client);
    const result = await client.query<{ acquired: boolean | string }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      [key.toString()]
    );
    acquired = normalizeBoolean(result.rows[0]?.acquired);
    if (!acquired) {
      await closeClient();
      return {
        key,
        lockHash,
        acquired: false,
        backendPid,
        release: async () => false,
      };
    }
    return {
      key,
      lockHash,
      acquired: true,
      backendPid,
      async release() {
        if (!acquired) return false;
        acquired = false;
        try {
          const releaseResult = await client.query<{ released: boolean | string }>(
            "SELECT pg_advisory_unlock($1::bigint) AS released",
            [key.toString()]
          );
          return normalizeBoolean(releaseResult.rows[0]?.released);
        } finally {
          await closeClient();
        }
      },
    };
  } catch (error) {
    await closeClient().catch(() => undefined);
    throw error;
  }
}

export async function withDedicatedPgAdvisoryLock<T>(params: {
  scope: string;
  databaseUrl?: string;
  clientFactory?: () => PgClientLike;
  onBlocked?: (lock: DedicatedPgAdvisoryLock) => Promise<void> | void;
  run(lock: DedicatedPgAdvisoryLock): Promise<T>;
}): Promise<{ ok: true; value: T; lock: DedicatedPgAdvisoryLock } | { ok: false; error: "lock_unavailable"; lock: DedicatedPgAdvisoryLock }> {
  const lock = await acquireDedicatedPgAdvisoryLock(params);
  if (!lock.acquired) {
    await params.onBlocked?.(lock);
    return { ok: false, error: "lock_unavailable", lock };
  }
  try {
    return { ok: true, value: await params.run(lock), lock };
  } finally {
    await lock.release();
  }
}
