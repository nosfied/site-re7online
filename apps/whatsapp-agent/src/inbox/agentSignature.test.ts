import assert from "node:assert/strict";
import test from "node:test";
import {
  WHATSAPP_TEXT_BODY_MAX_LENGTH,
  applyAgentSignature,
  sanitizeAgentSignatureName,
  stripAgentSignatureForDisplay,
} from "./agentSignature.js";

test("agent signature is off by default and applies bold_line when enabled", () => {
  const disabled = applyAgentSignature({
    bodyText: "Ola",
    actorDisplayName: "Maria",
  });
  assert.deepEqual(disabled, {
    ok: true,
    bodyText: "Ola",
    signatureApplied: false,
    signatureFormat: null,
  });

  const enabled = applyAgentSignature({
    bodyText: "Ola",
    actorDisplayName: "Maria",
    settings: { enabled: true, mode: "user_name", format: "bold_line" },
  });
  assert.deepEqual(enabled, {
    ok: true,
    bodyText: "*Maria*\nOla",
    signatureApplied: true,
    signatureFormat: "bold_line",
  });
});

test("agent signature sanitizes names and does not fallback without actor name", () => {
  assert.equal(sanitizeAgentSignatureName("  Ma*ria\n_Suporte_  "), "Maria Suporte");

  const missing = applyAgentSignature({
    bodyText: "Ola",
    actorDisplayName: "",
    settings: { enabled: true, mode: "user_name", format: "bold_line" },
  });
  assert.deepEqual(missing, {
    ok: true,
    bodyText: "Ola",
    signatureApplied: false,
    signatureFormat: null,
  });
});

test("agent signature validates final body length and strips only deterministic presentation", () => {
  const tooLong = applyAgentSignature({
    bodyText: "x".repeat(WHATSAPP_TEXT_BODY_MAX_LENGTH),
    actorDisplayName: "Maria",
    settings: { enabled: true, mode: "user_name", format: "bold_line" },
  });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.equal(tooLong.error, "message_too_long");
  }

  assert.equal(
    stripAgentSignatureForDisplay({
      bodyText: "*Maria*\nOla",
      actorDisplayName: "Maria",
      signatureApplied: true,
    }),
    "Ola"
  );
  assert.equal(
    stripAgentSignatureForDisplay({
      bodyText: "*Outra*\nOla",
      actorDisplayName: "Maria",
      signatureApplied: true,
    }),
    "*Outra*\nOla"
  );
});
