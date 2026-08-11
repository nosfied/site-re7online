import test from "node:test";
import assert from "node:assert/strict";
import { createBaileysAuthState } from "./baileysAuthState.js";

test("baileys auth state merges credentials without replacing the socket reference", async () => {
  let savedState: Record<string, unknown> | null = null;
  const store = {
    load: async () => null,
    save: async (params: { state: Record<string, unknown> }) => {
      savedState = params.state;
      return { ok: true as const };
    },
    clear: async () => ({ ok: true as const }),
  };
  const auth = await createBaileysAuthState({
    module: {
      BufferJSON: {
        replacer: (_key: string, value: unknown) => value,
        reviver: (_key: string, value: unknown) => value,
      },
      initAuthCreds: () => ({ registered: false }),
    },
    store,
    scope: { tenantKey: "tenant", channelAccountId: "web-session-default" },
  });
  const socketCredsReference = auth.state.creds;

  auth.mergeCredentials({ registered: true, me: { id: "redacted@s.whatsapp.net" } });
  await auth.save();

  assert.equal(auth.state.creds, socketCredsReference);
  assert.deepEqual(auth.state.creds, { registered: true, me: { id: "redacted@s.whatsapp.net" } });
  assert.deepEqual(savedState?.creds, { registered: true, me: { id: "redacted@s.whatsapp.net" } });
});
