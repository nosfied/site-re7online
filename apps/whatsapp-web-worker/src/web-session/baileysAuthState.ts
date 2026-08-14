import type { WebSessionAuthStore } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";
import crypto from "node:crypto";

type BaileysAuthModuleLike = {
  BufferJSON: {
    replacer: (key: string, value: unknown) => unknown;
    reviver: (key: string, value: unknown) => unknown;
  };
  initAuthCreds: () => unknown;
  makeCacheableSignalKeyStore?: (store: unknown, logger?: unknown) => unknown;
};

type SignalKeyData = Record<string, Record<string, unknown>>;

type AuthStateLogger = {
  trace?: (payload: unknown, message?: string) => void;
  debug?: (payload: unknown, message?: string) => void;
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
  error?: (payload: unknown, message?: string) => void;
  fatal?: (payload: unknown, message?: string) => void;
  child?: (bindings?: unknown) => AuthStateLogger;
};

export type BaileysAuthStateScope = {
  tenantKey: string;
  channelAccountId: string;
};

type StoredBaileysAuthState = {
  creds: unknown;
  keys: SignalKeyData;
};

function parseStoredState(module: BaileysAuthModuleLike, value: unknown): StoredBaileysAuthState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const text = JSON.stringify(value);
    const parsed = JSON.parse(text, module.BufferJSON.reviver) as Partial<StoredBaileysAuthState>;
    if (!parsed.creds) return null;
    return {
      creds: parsed.creds,
      keys: parsed.keys && typeof parsed.keys === "object" && !Array.isArray(parsed.keys)
        ? parsed.keys
        : {},
    };
  } catch {
    return null;
  }
}

function serializeState(module: BaileysAuthModuleLike, state: StoredBaileysAuthState) {
  return JSON.parse(JSON.stringify(state, module.BufferJSON.replacer)) as Record<string, unknown>;
}

function createSignalKeyStoreLogger(logger?: AuthStateLogger): AuthStateLogger {
  const wrapped: AuthStateLogger = {
    trace() {},
    debug() {},
    info() {},
    warn(payload, message) {
      logger?.warn?.(payload, message);
    },
    error(payload, message) {
      logger?.error?.(payload, message);
    },
    fatal(payload, message) {
      logger?.fatal?.(payload, message);
    },
    child() {
      return wrapped;
    },
  };
  return wrapped;
}

function sanitizeScope(scope: BaileysAuthStateScope) {
  const hash = crypto
    .createHash("sha256")
    .update(`${scope.tenantKey}:${scope.channelAccountId}`)
    .digest("hex")
    .slice(0, 12);
  const digits = scope.channelAccountId.replace(/\D/g, "");
  return {
    tenantKey: scope.tenantKey,
    channelAccountRef: hash,
    channelAccountIdLast4: digits.length >= 4 ? digits.slice(-4) : null,
  };
}

export async function createBaileysAuthState(params: {
  module: BaileysAuthModuleLike;
  store: WebSessionAuthStore;
  scope: BaileysAuthStateScope;
  logger?: AuthStateLogger;
}) {
  const loaded = parseStoredState(params.module, await params.store.load(params.scope));
  const state: StoredBaileysAuthState = loaded ?? {
    creds: params.module.initAuthCreds(),
    keys: {},
  };

  async function save() {
    await params.store.save({
      ...params.scope,
      state: serializeState(params.module, state),
    });
  }

  const keyStore = {
    get: async (type: string, ids: string[]) => {
      const values: Record<string, unknown> = {};
      for (const id of ids) {
        const value = state.keys[type]?.[id];
        if (value !== undefined) values[id] = value;
      }
      params.logger?.info?.({
        event: "whatsapp.web.auth.keys_get",
        ...sanitizeScope(params.scope),
        keyType: type,
        requestedCount: ids.length,
        foundCount: Object.keys(values).length,
      });
      return values;
    },
    set: async (data: Record<string, Record<string, unknown | null>>) => {
      const summary: Array<{ keyType: string; setCount: number; deleteCount: number }> = [];
      for (const [type, entries] of Object.entries(data)) {
        state.keys[type] = state.keys[type] ?? {};
        let setCount = 0;
        let deleteCount = 0;
        for (const [id, value] of Object.entries(entries)) {
          if (value === null) {
            delete state.keys[type][id];
            deleteCount += 1;
          } else {
            state.keys[type][id] = value;
            setCount += 1;
          }
        }
        summary.push({ keyType: type, setCount, deleteCount });
      }
      params.logger?.info?.({
        event: "whatsapp.web.auth.keys_set",
        ...sanitizeScope(params.scope),
        summary,
      });
      await save();
    },
  };
  const authState = {
    creds: state.creds,
    keys: params.module.makeCacheableSignalKeyStore?.(keyStore, createSignalKeyStoreLogger(params.logger)) ?? keyStore,
  };

  return {
    state: authState,
    save,
    mergeCredentials(patch: Record<string, unknown>) {
      params.logger?.info?.({
        event: "whatsapp.web.auth.creds_update",
        ...sanitizeScope(params.scope),
        keys: Object.keys(patch).sort(),
        hasMe: Boolean(patch.me),
        registered: patch.registered === true ? true : patch.registered === false ? false : null,
      });
      if (!state.creds || typeof state.creds !== "object" || Array.isArray(state.creds)) {
        state.creds = {};
        authState.creds = state.creds;
      }
      Object.assign(state.creds as Record<string, unknown>, patch);
    },
  };
}
