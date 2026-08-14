const APP_SESSION_END_REASONS = new Set<string>([
  "session_expired",
  "session_revoked",
  "session_replaced",
  "support_access_expired",
  "support_access_revoked",
  "user_inactive",
]);

export type AppSessionEndReason =
  | "session_expired"
  | "session_revoked"
  | "session_replaced"
  | "support_access_expired"
  | "support_access_revoked"
  | "user_inactive";

export function normalizeSessionEndReason(reason: string | null | undefined): AppSessionEndReason | null {
  const normalized = String(reason ?? "").trim();
  if (normalized === "token_expired") return "session_expired";
  if (APP_SESSION_END_REASONS.has(normalized)) return normalized as AppSessionEndReason;
  return null;
}

export function sanitizeAppReturnTo(value: string | null | undefined) {
  const candidate = String(value ?? "").trim();
  if (!candidate || !candidate.startsWith("/")) return "/app/inbox";
  if (candidate.startsWith("//") || candidate.includes("\\") || candidate.includes("\u0000")) {
    return "/app/inbox";
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://converta.local");
  } catch {
    return "/app/inbox";
  }
  if (parsed.origin !== "https://converta.local") return "/app/inbox";
  if (!parsed.pathname.startsWith("/app/")) return "/app/inbox";
  if (parsed.pathname === "/app/login" || parsed.pathname.startsWith("/app/login/")) {
    return "/app/inbox";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildAppLoginPath(params?: {
  reason?: string | null;
  returnTo?: string | null;
}) {
  const query = new URLSearchParams();
  const reason = normalizeSessionEndReason(params?.reason);
  if (reason) query.set("reason", reason);
  const returnTo = params?.returnTo ? sanitizeAppReturnTo(params.returnTo) : "";
  if (returnTo && returnTo !== "/app/inbox") query.set("returnTo", returnTo);
  const serialized = query.toString();
  return serialized ? `/app/login?${serialized}` : "/app/login";
}
