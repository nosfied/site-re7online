export const APP_AUTH_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const APP_AUTH_SESSION_TTL_MS = APP_AUTH_SESSION_TTL_SECONDS * 1000;

export function buildAppAuthSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + APP_AUTH_SESSION_TTL_MS);
}

export function getEffectiveAppAuthSessionExpiresAt(params: {
  createdAt: Date;
  expiresAt: Date;
}) {
  const legacyCappedExpiresAt = buildAppAuthSessionExpiresAt(params.createdAt);
  return params.expiresAt.getTime() <= legacyCappedExpiresAt.getTime()
    ? params.expiresAt
    : legacyCappedExpiresAt;
}

export function isAppAuthSessionExpired(params: {
  createdAt: Date;
  expiresAt: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  return getEffectiveAppAuthSessionExpiresAt(params).getTime() <= now.getTime();
}
