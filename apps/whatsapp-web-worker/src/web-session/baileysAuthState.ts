import type { WebSessionAuthStore } from "../../../whatsapp-agent/src/web-session/webSessionAuthStore.js";

type BaileysAuthModuleLike = {
  BufferJSON: {
    replacer: (key: string, value: unknown) => unknown;
    reviver: (key: string, value: unknown) => unknown;
  };
  initAuthCreds: () => unknown;
  makeCacheableSignalKeyStore?: (store: unknown, logger?: unknown) => unknown;
};

type SignalKeyData = Record<string, Record<string, unknown>>;

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

export async function createBaileysAuthState(params: {
  module: BaileysAuthModuleLike;
  store: WebSessionAuthStore;
  scope: BaileysAuthStateScope;
  logger?: unknown;
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
      return values;
    },
    set: async (data: Record<string, Record<string, unknown | null>>) => {
      for (const [type, entries] of Object.entries(data)) {
        state.keys[type] = state.keys[type] ?? {};
        for (const [id, value] of Object.entries(entries)) {
          if (value === null) {
            delete state.keys[type][id];
          } else {
            state.keys[type][id] = value;
          }
        }
      }
      await save();
    },
  };
  const authState = {
    creds: state.creds,
    keys: params.module.makeCacheableSignalKeyStore?.(keyStore, params.logger) ?? keyStore,
  };

  return {
    state: authState,
    save,
    mergeCredentials(patch: Record<string, unknown>) {
      if (!state.creds || typeof state.creds !== "object" || Array.isArray(state.creds)) {
        state.creds = {};
        authState.creds = state.creds;
      }
      Object.assign(state.creds as Record<string, unknown>, patch);
    },
  };
}
