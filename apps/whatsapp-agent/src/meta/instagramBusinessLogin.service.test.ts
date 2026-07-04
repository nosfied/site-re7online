import test from "node:test";
import assert from "node:assert/strict";
import {
  createInstagramBusinessLoginState,
  verifyInstagramBusinessLoginState,
} from "./instagramBusinessLogin.service.js";

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "instagram-business-login-state-test-token";
process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "instagram-business-login-state-test-secret";

test("instagram business login state preserves safe admin return path", () => {
  const state = createInstagramBusinessLoginState({
    tenantKey: "re7online",
    userId: "admin:test",
    returnPath: "/admin/tenants/re7online/channels",
  });

  const verified = verifyInstagramBusinessLoginState(state);

  assert.equal(verified.tenantKey, "re7online");
  assert.equal(verified.userId, "admin:test");
  assert.equal(verified.returnPath, "/admin/tenants/re7online/channels");
});

test("instagram business login state preserves legacy app return path", () => {
  const state = createInstagramBusinessLoginState({
    tenantKey: "re7online",
    userId: "user-1",
    returnPath: "/app/settings/channels/instagram",
  });

  const verified = verifyInstagramBusinessLoginState(state);

  assert.equal(verified.returnPath, "/app/settings/channels/instagram");
});

test("instagram business login state rejects unsafe return path by falling back to legacy route", () => {
  const state = createInstagramBusinessLoginState({
    tenantKey: "re7online",
    userId: "user-1",
    returnPath: "//evil.example/callback",
  });

  const verified = verifyInstagramBusinessLoginState(state);

  assert.equal(verified.returnPath, "/app/settings/channels/instagram");
});
