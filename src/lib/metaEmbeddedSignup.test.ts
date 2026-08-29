import assert from "node:assert/strict";
import test from "node:test";
import {
  META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE,
  META_EMBEDDED_SIGNUP_CONFIG_ID,
  buildMetaEmbeddedSignupCallbackAuditPayload,
  buildMetaEmbeddedSignupPopupClosedAuditPayload,
  buildMetaEmbeddedSignupLoginOptions,
  buildMetaEmbeddedSignupSessionAuditPayload,
  buildMetaEmbeddedSignupStartedAuditPayload,
  isTrustedMetaEmbeddedSignupOrigin,
  parseEmbeddedSignupSessionMessage,
  resolveMetaEmbeddedSignupExchangeSubmission,
  sanitizeMetaEmbeddedSignupDiagnosticValue,
} from "./metaEmbeddedSignup";

test("canonical WhatsApp Embedded Signup config defaults to the homologated Meta config", () => {
  assert.equal(META_EMBEDDED_SIGNUP_CONFIG_ID, "1543311723765403");
});

test("coexistence launcher uses WhatsApp Business App onboarding without legacy session info", () => {
  const options = buildMetaEmbeddedSignupLoginOptions({ configId: "config-123", mode: "coexistence" });

  assert.deepEqual(options, {
    config_id: "config-123",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: META_EMBEDDED_SIGNUP_COEXISTENCE_FEATURE_TYPE,
    },
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      options.extras as Record<string, unknown>,
      "sessionInfoVersion"
    ),
    false
  );
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

test("session parser treats coexistence finish event names as completed", () => {
  const parsed = parseEmbeddedSignupSessionMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    data: {
      waba_id: "waba-2",
      phone_number_id: "phone-2",
      business_id: "business-2",
    },
  });

  assert.equal(parsed.status, "FINISH");
  assert.equal(parsed.data.wabaId, "waba-2");
  assert.equal(parsed.data.phoneNumberId, "phone-2");
  assert.equal(parsed.data.businessId, "business-2");
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

test("audit payload records signup start with correlation and masked config reference", () => {
  const payload = buildMetaEmbeddedSignupStartedAuditPayload({
    correlationId: "signup-1",
    mode: "coexistence",
    configId: "1543311723765403",
    timestamp: "2026-08-28T10:00:00.000Z",
  });

  assert.equal(payload.eventName, "meta.embedded_signup.started");
  assert.equal(payload.correlationId, "signup-1");
  assert.equal(payload.mode, "coexistence");
  assert.equal(payload.configIdRef, "1543...5403");
  assert.equal(payload.timestamp, "2026-08-28T10:00:00.000Z");
});

test("audit callback payload stores code presence but never stores the code", () => {
  const payload = buildMetaEmbeddedSignupCallbackAuditPayload({
    correlationId: "signup-2",
    mode: "standard",
    configId: "config-123456789",
    timestamp: "2026-08-28T10:01:00.000Z",
    response: {
      status: "connected",
      authResponse: {
        code: "SECRET_CODE_SHOULD_NOT_APPEAR",
        accessToken: "SECRET_TOKEN_SHOULD_NOT_APPEAR",
      },
    },
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.eventName, "meta.embedded_signup.callback");
  assert.equal(payload.callbackInvoked, true);
  assert.equal(payload.authResponsePresent, true);
  assert.equal(payload.codePresent, true);
  assert.equal(payload.status, "connected");
  assert.equal(serialized.includes("SECRET_CODE_SHOULD_NOT_APPEAR"), false);
  assert.equal(serialized.includes("SECRET_TOKEN_SHOULD_NOT_APPEAR"), false);
});

test("frontend diagnostics redact auth codes and tokens while preserving safe ids", () => {
  const sanitized = sanitizeMetaEmbeddedSignupDiagnosticValue({
    code: "SECRET_CODE_SHOULD_NOT_APPEAR",
    authResponse: {
      code: "NESTED_SECRET_CODE_SHOULD_NOT_APPEAR",
      accessToken: "SECRET_TOKEN_SHOULD_NOT_APPEAR",
    },
    data: {
      phone_number_id: "phone-123",
      waba_id: "waba-123",
    },
  }) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);

  assert.equal(serialized.includes("SECRET_CODE_SHOULD_NOT_APPEAR"), false);
  assert.equal(serialized.includes("NESTED_SECRET_CODE_SHOULD_NOT_APPEAR"), false);
  assert.equal(serialized.includes("SECRET_TOKEN_SHOULD_NOT_APPEAR"), false);
  assert.equal(serialized.includes("phone-123"), true);
  assert.equal(serialized.includes("waba-123"), true);
});

test("exchange submission guard submits a captured code exactly once per correlation", () => {
  assert.deepEqual(
    resolveMetaEmbeddedSignupExchangeSubmission({
      correlationId: "signup-1",
      code: "",
      submittedKey: null,
    }),
    { shouldSubmit: false, key: null }
  );

  const first = resolveMetaEmbeddedSignupExchangeSubmission({
    correlationId: "signup-1",
    code: " CODE-1 ",
    submittedKey: null,
  });
  assert.equal(first.shouldSubmit, true);
  assert.equal(first.key, "signup-1:CODE-1");

  assert.deepEqual(
    resolveMetaEmbeddedSignupExchangeSubmission({
      correlationId: "signup-1",
      code: "CODE-1",
      submittedKey: first.key,
    }),
    { shouldSubmit: false, key: "signup-1:CODE-1" }
  );

  assert.equal(
    resolveMetaEmbeddedSignupExchangeSubmission({
      correlationId: "signup-2",
      code: "CODE-1",
      submittedKey: first.key,
    }).shouldSubmit,
    true
  );
});

test("audit session payload classifies FINISH, CANCEL and ERROR safely", () => {
  const finish = buildMetaEmbeddedSignupSessionAuditPayload({
    correlationId: "signup-3",
    mode: "coexistence",
    configId: "config-123456789",
    origin: "https://www.facebook.com",
    timestamp: "2026-08-28T10:02:00.000Z",
    message: {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: {
        waba_id: "123456789012345",
        phone_number_id: "987654321098765",
        business_id: "456789012345678",
        business_portfolio_id: "567890123456789",
      },
    },
  });
  const cancelled = buildMetaEmbeddedSignupSessionAuditPayload({
    correlationId: "signup-3",
    mode: "coexistence",
    origin: "https://web.facebook.com",
    message: { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" },
  });
  const failed = buildMetaEmbeddedSignupSessionAuditPayload({
    correlationId: "signup-3",
    mode: "coexistence",
    origin: "https://www.facebook.com",
    message: { type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: { error_message: "failed" } },
  });

  assert.equal(finish.eventName, "meta.embedded_signup.completed");
  assert.equal(finish.originClassification, "facebook");
  assert.equal(finish.flowStatus, "FINISH");
  assert.equal(finish.wabaIdRef, "1234...2345");
  assert.equal(finish.phoneNumberIdRef, "9876...8765");
  assert.equal(cancelled.eventName, "meta.embedded_signup.cancelled");
  assert.equal(cancelled.flowStatus, "CANCEL");
  assert.equal(failed.eventName, "meta.embedded_signup.error");
  assert.equal(failed.errorPresent, true);
});

test("audit popup close distinguishes missing callback and session event", () => {
  const payload = buildMetaEmbeddedSignupPopupClosedAuditPayload({
    correlationId: "signup-4",
    mode: "standard",
    configId: "config-123456789",
    callbackInvoked: false,
    sessionEventReceived: false,
    timestamp: "2026-08-28T10:03:00.000Z",
  });

  assert.equal(payload.eventName, "meta.embedded_signup.session_event");
  assert.equal(payload.eventType, "popup.closed");
  assert.equal(payload.callbackInvoked, false);
  assert.equal(payload.flowStatus, "POPUP_CLOSED_WITHOUT_SIGNAL");
});
