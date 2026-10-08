import { sanitizeMailDeliveryError } from '../mail/canonicalMail.js';
export function campaignFailureDiagnostic(error: unknown) {
  const scrub = (value: unknown) => sanitizeMailDeliveryError((value instanceof Error ? value.message : String(value ?? "unknown_error"))
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/(["']?(?:token|secret|password|pass|api[_-]?key)["']?\s*:\s*)(?:["'][^"']*["']|[^\s,}]+)/gi, '$1[REDACTED]')
    .replace(/(?:hash:)?anon:[a-z0-9:_.-]+/gi, '[redacted-identity]'));
  return { errorName: error instanceof Error ? scrub(error.name) : 'UnknownError', errorMessage: scrub(error) };
}
