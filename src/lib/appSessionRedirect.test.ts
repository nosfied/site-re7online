import test from "node:test";
import assert from "node:assert/strict";
import { buildAppLoginPath, sanitizeAppReturnTo } from "./appSessionRedirect";

test("sanitizeAppReturnTo accepts only internal app paths", () => {
  assert.equal(sanitizeAppReturnTo("/app/inbox?conversation=abc#timeline"), "/app/inbox?conversation=abc#timeline");
  assert.equal(sanitizeAppReturnTo("/app/reports"), "/app/reports");
  assert.equal(sanitizeAppReturnTo("https://evil.example/app/inbox"), "/app/inbox");
  assert.equal(sanitizeAppReturnTo("//evil.example/app/inbox"), "/app/inbox");
  assert.equal(sanitizeAppReturnTo("/admin/tenants/demo"), "/app/inbox");
  assert.equal(sanitizeAppReturnTo("/app/login?reason=session_expired"), "/app/inbox");
  assert.equal(sanitizeAppReturnTo("/app/inbox\\evil"), "/app/inbox");
});

test("buildAppLoginPath keeps structured reasons and safe return paths only", () => {
  assert.equal(
    buildAppLoginPath({ reason: "session_expired", returnTo: "/app/crm?status=open" }),
    "/app/login?reason=session_expired&returnTo=%2Fapp%2Fcrm%3Fstatus%3Dopen"
  );
  assert.equal(
    buildAppLoginPath({ reason: "token_expired", returnTo: "https://evil.example" }),
    "/app/login?reason=session_expired"
  );
  assert.equal(buildAppLoginPath({ reason: "missing_token", returnTo: "/app/inbox" }), "/app/login");
  assert.equal(
    buildAppLoginPath({ reason: "support_access_expired", returnTo: "/app/support" }),
    "/app/login?reason=support_access_expired&returnTo=%2Fapp%2Fsupport"
  );
});
