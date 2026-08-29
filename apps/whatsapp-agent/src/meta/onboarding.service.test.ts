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
