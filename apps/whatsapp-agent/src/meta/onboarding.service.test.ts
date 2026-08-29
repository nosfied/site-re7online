import assert from "node:assert/strict";
import test from "node:test";

process.env.META_APP_SECRET = process.env.META_APP_SECRET || "test-app-secret";

async function loadService() {
  return import("./onboarding.service.js");
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Meta onboarding discovery selects a debug-token WABA phone matching the target identity", async () => {
  const { enrichMetaOnboardingResult } = await loadService();
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    if (url.pathname.endsWith("/debug_token")) {
      assert.equal(url.searchParams.get("input_token"), "business-token");
      return jsonResponse({
        data: {
          is_valid: true,
          app_id: "2074361376674006",
          scopes: ["whatsapp_business_management"],
          granular_scopes: [
            {
              scope: "whatsapp_business_management",
              target_ids: ["waba-target"],
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/me/businesses")) {
      return jsonResponse({ data: [] });
    }
    if (url.pathname.endsWith("/waba-target")) {
      return jsonResponse({ id: "waba-target", name: "WABA Target" });
    }
    if (url.pathname.endsWith("/waba-target/phone_numbers")) {
      return jsonResponse({
        data: [
          {
            id: "phone-target",
            display_phone_number: "+55 84 9478-4366",
            status: "CONNECTED",
            code_verification_status: "VERIFIED",
            platform_type: "CLOUD_API",
          },
        ],
      });
    }
    return jsonResponse({ error: { message: `unexpected ${url.pathname}` } }, 500);
  }) as typeof fetch;

  try {
    const result = await enrichMetaOnboardingResult({
      businessToken: "business-token",
      expectedPublicIdentity: "558494784366",
    });

    assert.equal(result.wabaId, "waba-target");
    assert.equal(result.phoneNumberId, "phone-target");
    const rawPayload = result.rawPayload as Record<string, unknown>;
    assert.equal(JSON.stringify(rawPayload).includes("business-token"), false);
    assert.equal(calls.some((call) => call.includes("/debug_token?")), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Embedded Signup code exchange omits redirect_uri even when a legacy redirect is provided", async () => {
  const { exchangeEmbeddedSignupCode } = await loadService();
  const previousFetch = globalThis.fetch;
  let capturedUrl: URL | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = new URL(String(input));
    return jsonResponse({
      access_token: "business-token",
      token_type: "bearer",
      business_id: "business-123",
      waba_id: "waba-123",
      phone_number_id: "phone-123",
    });
  }) as typeof fetch;

  try {
    const result = await exchangeEmbeddedSignupCode({
      code: "oauth-code",
      redirectUri: "https://converta.re7online.com/admin/tenants/demo-converta/onboarding",
    });

    assert.equal(result.businessToken, "business-token");
    assert.ok(capturedUrl);
    const requestUrl = capturedUrl as URL;
    assert.equal(requestUrl.pathname.endsWith("/oauth/access_token"), true);
    assert.equal(requestUrl.searchParams.get("client_id"), "2074361376674006");
    assert.equal(requestUrl.searchParams.get("client_secret"), "test-app-secret");
    assert.equal(requestUrl.searchParams.get("code"), "oauth-code");
    assert.equal(requestUrl.searchParams.has("redirect_uri"), false);
    assert.equal(requestUrl.searchParams.has("grant_type"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Embedded Signup code exchange preserves Meta 36008 diagnostics without exposing the raw code", async () => {
  const { exchangeEmbeddedSignupCode, MetaOnboardingExchangeError } = await loadService();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    jsonResponse(
      {
        error: {
          message:
            "Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request",
          type: "OAuthException",
          code: 100,
          error_subcode: 36008,
          fbtrace_id: "trace-123",
        },
      },
      400
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => exchangeEmbeddedSignupCode({ code: "sensitive-oauth-code" }),
      (error: unknown) => {
        assert.ok(error instanceof MetaOnboardingExchangeError);
        assert.equal(error.status, 400);
        assert.equal(error.message, "Meta code exchange failed");
        assert.equal(error.errorBody?.includes('"code":100'), true);
        assert.equal(error.errorBody?.includes('"error_subcode":36008'), true);
        assert.equal(error.errorBody?.includes("trace-123"), true);
        assert.equal(error.errorBody?.includes("sensitive-oauth-code"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta onboarding discovery refuses to bind an old phone during controlled replacement", async () => {
  const { enrichMetaOnboardingResult } = await loadService();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/debug_token")) {
      return jsonResponse({
        data: {
          is_valid: true,
          granular_scopes: [
            { scope: "whatsapp_business_management", target_ids: ["waba-old"] },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/me/businesses")) {
      return jsonResponse({ data: [] });
    }
    if (url.pathname.endsWith("/waba-old")) {
      return jsonResponse({ id: "waba-old", name: "Old WABA" });
    }
    if (url.pathname.endsWith("/waba-old/phone_numbers")) {
      return jsonResponse({
        data: [{ id: "phone-old", display_phone_number: "+55 84 99999-5328" }],
      });
    }
    return jsonResponse({ error: { message: `unexpected ${url.pathname}` } }, 500);
  }) as typeof fetch;

  try {
    const result = await enrichMetaOnboardingResult({
      businessToken: "business-token",
      wabaId: "waba-old",
      phoneNumberId: "phone-old",
      displayPhoneNumber: "+55 84 99999-5328",
      expectedPublicIdentity: "558494784366",
    });

    assert.equal(result.wabaId, null);
    assert.equal(result.phoneNumberId, null);
    const discovery = result.rawPayload.discovery as Record<string, unknown>;
    assert.equal(discovery.reason, "ambiguous_or_mismatched_candidate");
    assert.equal(discovery.expectedPublicIdentity, "558494784366");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta onboarding discovery stages ambiguous authorized phone candidates", async () => {
  const { enrichMetaOnboardingResult } = await loadService();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/debug_token")) {
      return jsonResponse({
        data: {
          is_valid: true,
          granular_scopes: [
            { scope: "whatsapp_business_management", target_ids: ["waba-a", "waba-b"] },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/me/businesses")) {
      return jsonResponse({ data: [] });
    }
    if (url.pathname.endsWith("/waba-a") || url.pathname.endsWith("/waba-b")) {
      const pathParts = url.pathname.split("/");
      return jsonResponse({ id: pathParts[pathParts.length - 1], name: "WABA" });
    }
    if (url.pathname.endsWith("/waba-a/phone_numbers")) {
      return jsonResponse({ data: [{ id: "phone-a", display_phone_number: "+55 84 90000-1111" }] });
    }
    if (url.pathname.endsWith("/waba-b/phone_numbers")) {
      return jsonResponse({ data: [{ id: "phone-b", display_phone_number: "+55 84 90000-2222" }] });
    }
    return jsonResponse({ error: { message: `unexpected ${url.pathname}` } }, 500);
  }) as typeof fetch;

  try {
    const result = await enrichMetaOnboardingResult({ businessToken: "business-token" });

    assert.equal(result.wabaId, null);
    assert.equal(result.phoneNumberId, null);
    const discovery = result.rawPayload.discovery as Record<string, unknown>;
    assert.equal(discovery.stage, "DISCOVERED");
    assert.equal(discovery.matchCount, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Meta onboarding discovery does not bind when token introspection is invalid", async () => {
  const { enrichMetaOnboardingResult } = await loadService();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/debug_token")) {
      return jsonResponse({ data: { is_valid: false } });
    }
    return jsonResponse({ error: { message: `unexpected ${url.pathname}` } }, 500);
  }) as typeof fetch;

  try {
    const result = await enrichMetaOnboardingResult({
      businessToken: "business-token",
      wabaId: "waba-hint",
      phoneNumberId: "phone-hint",
      displayPhoneNumber: "+55 84 9478-4366",
    });

    assert.equal(result.wabaId, null);
    assert.equal(result.phoneNumberId, null);
    const discovery = result.rawPayload.discovery as Record<string, unknown>;
    assert.equal(discovery.reason, "invalid_debug_token");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
