const nativeFetch = globalThis.fetch;
let blockedProviderAttempts = 0;

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

export function isMetaProviderUrl(input: RequestInfo | URL) {
  try {
    const hostname = new URL(requestUrl(input)).hostname.toLowerCase();
    return hostname === "graph.facebook.com" || hostname === "graph-video.facebook.com" ||
      hostname === "facebook.com" || hostname.endsWith(".facebook.com") ||
      hostname === "whatsapp.com" || hostname.endsWith(".whatsapp.com");
  } catch {
    return false;
  }
}

export const campaignProviderFailClosedFetch: typeof fetch = async (input, init) => {
  if (isMetaProviderUrl(input)) {
    blockedProviderAttempts += 1;
    throw new Error("unexpected_real_provider_call");
  }
  return nativeFetch(input, init);
};

export function installCampaignProviderTestGuard() {
  if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
  globalThis.fetch = campaignProviderFailClosedFetch;
}

export function campaignProviderBlockedAttemptCount() {
  return blockedProviderAttempts;
}

export function resetCampaignProviderBlockedAttemptCount() {
  blockedProviderAttempts = 0;
}

installCampaignProviderTestGuard();
