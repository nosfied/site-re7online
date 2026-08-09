import { type AgentSignatureSettings, getDefaultAgentSignatureSettings, normalizeAgentSignatureSettings } from "../config/tenantOperationalConfig.js";

export const WHATSAPP_TEXT_BODY_MAX_LENGTH = 4096;
const MAX_AGENT_SIGNATURE_NAME_LENGTH = 48;

export type AgentSignatureResult =
  | {
      ok: true;
      bodyText: string;
      signatureApplied: boolean;
      signatureFormat: "bold_line" | null;
    }
  | {
      ok: false;
      error: "message_too_long";
      maxLength: number;
      finalLength: number;
    };

export function sanitizeAgentSignatureName(value: unknown) {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const sanitized = collapsed.replace(/[*_~`]+/g, "").trim();
  if (!sanitized) return null;
  return sanitized.slice(0, MAX_AGENT_SIGNATURE_NAME_LENGTH).trim() || null;
}

export function buildAgentSignaturePrefix(displayName: string) {
  return `*${displayName}*`;
}

export function applyAgentSignature(params: {
  bodyText: string;
  actorDisplayName?: string | null;
  settings?: AgentSignatureSettings | null;
  maxLength?: number;
}): AgentSignatureResult {
  const settings = normalizeAgentSignatureSettings(params.settings ?? getDefaultAgentSignatureSettings());
  const originalBody = params.bodyText;
  const maxLength = params.maxLength ?? WHATSAPP_TEXT_BODY_MAX_LENGTH;
  if (!settings.enabled) {
    return {
      ok: true,
      bodyText: originalBody,
      signatureApplied: false,
      signatureFormat: null,
    };
  }
  const displayName = sanitizeAgentSignatureName(params.actorDisplayName);
  if (!displayName) {
    return {
      ok: true,
      bodyText: originalBody,
      signatureApplied: false,
      signatureFormat: null,
    };
  }
  const bodyText = `${buildAgentSignaturePrefix(displayName)}\n${originalBody}`;
  if (bodyText.length > maxLength) {
    return {
      ok: false,
      error: "message_too_long",
      maxLength,
      finalLength: bodyText.length,
    };
  }
  return {
    ok: true,
    bodyText,
    signatureApplied: true,
    signatureFormat: "bold_line",
  };
}

export function stripAgentSignatureForDisplay(params: {
  bodyText: string | null | undefined;
  actorDisplayName?: string | null;
  signatureApplied?: boolean | null;
}) {
  const bodyText = params.bodyText ?? "";
  if (!params.signatureApplied) return bodyText;
  const displayName = sanitizeAgentSignatureName(params.actorDisplayName);
  if (!displayName) return bodyText;
  const prefix = `${buildAgentSignaturePrefix(displayName)}\n`;
  return bodyText.startsWith(prefix) ? bodyText.slice(prefix.length) : bodyText;
}
