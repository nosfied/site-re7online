import assert from "node:assert/strict";
import test from "node:test";
import {
  META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE,
  META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION,
  buildMetaEmbeddedSignupLoginOptions,
  isTrustedMetaEmbeddedSignupOrigin,
  parseEmbeddedSignupSessionMessage,
} from "./metaEmbeddedSignup";

test("coexistence launcher uses WhatsApp Business App onboarding session info", () => {
  assert.deepEqual(buildMetaEmbeddedSignupLoginOptions({ configId: "config-123", mode: "coexistence" }), {
    config_id: "config-123",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE,
      sessionInfoVersion: META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION,
    },
  });
});

test("standard launcher preserves the existing Cloud-only options", () => {
  assert.deepEqual(buildMetaEmbeddedSignupLoginOptions({ configId: "config-123", mode: "standard" }), {
    config_id: "config-123",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
    },
  });
});

test("session parser captures FINISH data without relying on generic traversal first", () => {
  const parsed = parseEmbeddedSignupSessionMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: {
      waba_id: "waba-1",
      phone_number_id: "phone-1",
      business_id: "business-1",
      business_portfolio_id: "portfolio-1",
    },
  });

  assert.equal(parsed.status, "FINISH");
  assert.equal(parsed.data.wabaId, "waba-1");
  assert.equal(parsed.data.phoneNumberId, "phone-1");
  assert.equal(parsed.data.businessId, "business-1");
  assert.equal(parsed.data.businessPortfolioId, "portfolio-1");
});

test("session parser captures CANCEL and ERROR without ids", () => {
  const cancelled = parseEmbeddedSignupSessionMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "CANCEL",
    data: {},
  });
  const failed = parseEmbeddedSignupSessionMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "ERROR",
    data: { error_message: "Meta failed" },
  });

  assert.equal(cancelled.status, "CANCEL");
  assert.equal(cancelled.data.phoneNumberId, "");
  assert.equal(failed.status, "ERROR");
  assert.equal(failed.errorMessage, "Meta failed");
});

test("origin validation accepts only Meta Facebook origins", () => {
  assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://www.facebook.com"), true);
  assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://web.facebook.com"), true);
  assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://evilfacebook.com"), false);
  assert.equal(isTrustedMetaEmbeddedSignupOrigin("not a url"), false);
});
