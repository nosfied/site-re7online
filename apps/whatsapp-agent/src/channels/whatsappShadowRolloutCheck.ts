import type { WhatsAppShadowCompareReport } from "./whatsappShadowCompare.js";

export type WhatsAppShadowRolloutCheckKey =
  | "multichannel_columns_available"
  | "shadow_compare_healthy"
  | "shadow_write_enabled"
  | "shadow_strict_disabled"
  | "replay_passed";

export type WhatsAppShadowRolloutCheck = {
  key: WhatsAppShadowRolloutCheckKey;
  passed: boolean;
  severity: "blocker" | "warning" | "info";
  reason?: string;
};

export type WhatsAppShadowRolloutCheckReport = {
  ok: boolean;
  generatedAt: string;
  checks: WhatsAppShadowRolloutCheck[];
  summary: {
    columnsAvailable: boolean;
    compareChecked: number;
    compareMissing: number;
    compareMismatched: number;
    shadowWriteEnabled: boolean;
    shadowStrictDisabled: boolean;
    replayPassed: boolean;
  };
};

function isTrue(value: string | undefined) {
  return (value ?? "false").trim().toLowerCase() === "true";
}

function makeCheck(input: WhatsAppShadowRolloutCheck): WhatsAppShadowRolloutCheck {
  return input;
}

export function buildWhatsAppShadowRolloutCheckReport(input: {
  columnsAvailable: boolean;
  compareReport?: Pick<WhatsAppShadowCompareReport, "counts"> | null;
  env?: Pick<NodeJS.ProcessEnv, "MULTICHANNEL_SHADOW_WRITE" | "MULTICHANNEL_SHADOW_STRICT">;
  replayPassed?: boolean;
  nowIso?: string;
}): WhatsAppShadowRolloutCheckReport {
  const env = input.env ?? process.env;
  const compareCounts = input.compareReport?.counts ?? {
    checked: 0,
    matched: 0,
    missing: 0,
    mismatched: 0,
    warnings: 0,
  };
  const shadowWriteEnabled = isTrue(env.MULTICHANNEL_SHADOW_WRITE);
  const shadowStrictDisabled = !isTrue(env.MULTICHANNEL_SHADOW_STRICT);
  const replayPassed = input.replayPassed === true;

  const checks: WhatsAppShadowRolloutCheck[] = [
    makeCheck({
      key: "multichannel_columns_available",
      passed: input.columnsAvailable,
      severity: "blocker",
      ...(input.columnsAvailable ? {} : { reason: "multichannel_columns_not_available" }),
    }),
    makeCheck({
      key: "shadow_compare_healthy",
      passed: compareCounts.missing === 0 && compareCounts.mismatched === 0,
      severity: "blocker",
      ...(compareCounts.missing === 0 && compareCounts.mismatched === 0
        ? {}
        : {
            reason: `missing=${compareCounts.missing};mismatched=${compareCounts.mismatched}`,
          }),
    }),
    makeCheck({
      key: "shadow_write_enabled",
      passed: shadowWriteEnabled,
      severity: "blocker",
      ...(shadowWriteEnabled ? {} : { reason: "MULTICHANNEL_SHADOW_WRITE must be true for rollout check" }),
    }),
    makeCheck({
      key: "shadow_strict_disabled",
      passed: shadowStrictDisabled,
      severity: "blocker",
      ...(shadowStrictDisabled ? {} : { reason: "MULTICHANNEL_SHADOW_STRICT must remain false initially" }),
    }),
    makeCheck({
      key: "replay_passed",
      passed: replayPassed,
      severity: "blocker",
      ...(replayPassed ? {} : { reason: "evaluation replay did not pass or was not executed" }),
    }),
  ];

  return {
    ok: checks.every((check) => check.passed || check.severity !== "blocker"),
    generatedAt: input.nowIso ?? new Date().toISOString(),
    checks,
    summary: {
      columnsAvailable: input.columnsAvailable,
      compareChecked: compareCounts.checked,
      compareMissing: compareCounts.missing,
      compareMismatched: compareCounts.mismatched,
      shadowWriteEnabled,
      shadowStrictDisabled,
      replayPassed,
    },
  };
}
