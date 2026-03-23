export function httpError(code: string, message: string, details?: unknown) {
  return {
    code,
    message,
    details: details ?? null,
  };
}
