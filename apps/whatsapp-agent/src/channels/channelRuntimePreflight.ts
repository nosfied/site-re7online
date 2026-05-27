import type { Channel, Provider } from "./channel.types.js";
import { resolveChannelRuntimeGate } from "./tenantChannelAccount.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export type ChannelRuntimePreflightMode = "observe_only" | "dry_run" | "runtime_candidate";

export type ChannelRuntimePreflightCheckKey =
  | "account_enabled"
  | "status_connected"
  | "automation_enabled"
  | "runtime_enabled"
  | "token_status_ok"
  | "signature_configured"
  | "persistence_supported"
  | "outbound_supported"
  | "readiness_no_blockers";

export type ChannelRuntimePreflightResult = {
  ok: boolean;
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  mode: ChannelRuntimePreflightMode;
  checks: Array<{
    key: ChannelRuntimePreflightCheckKey;
    passed: boolean;
    severity: "blocker" | "warning" | "info";
    reason?: string;
  }>;
  blockers: string[];
  warnings: string[];
  summary: {
    canObserve: boolean;
    canDryRun: boolean;
    canAttemptRuntime: boolean;
    canPersist: boolean;
    canSendOutbound: boolean;
  };
};

type BuildChannelRuntimePreflightInput = {
  tenantKey: string;
  channel: Channel;
  provider: Provider;
  channelAccountId: string;
  account?: TenantChannelAccount | null;
  signatureConfigured?: boolean;
  mode?: ChannelRuntimePreflightMode;
  readinessBlockers?: string[];
};

function normalizeText(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeMode(value: unknown): ChannelRuntimePreflightMode {
  return value === "observe_only" || value === "runtime_candidate" ? value : "dry_run";
}

function tokenStatusOk(account?: TenantChannelAccount | null) {
  if (!account) return false;
  return account.tokenStatus === "configured" || account.tokenStatus === "not_required";
}

function addCheck(
  checks: ChannelRuntimePreflightResult["checks"],
  params: ChannelRuntimePreflightResult["checks"][number]
) {
  checks.push(params);
}

function collectFindings(checks: ChannelRuntimePreflightResult["checks"]) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const check of checks) {
    if (check.passed) continue;
    if (check.severity === "blocker") blockers.push(check.reason ?? check.key);
    if (check.severity === "warning") warnings.push(check.reason ?? check.key);
  }
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export function buildChannelRuntimePreflight(
  input: BuildChannelRuntimePreflightInput
): ChannelRuntimePreflightResult {
  const mode = normalizeMode(input.mode);
  const account = input.account ?? null;
  const gate = resolveChannelRuntimeGate(account);
  const checks: ChannelRuntimePreflightResult["checks"] = [];
  const runtimeCandidate = mode === "runtime_candidate";
  const dryRunMode = mode === "dry_run";
  const observeOnly = mode === "observe_only";
  const accountStatus = account?.status ?? (account?.enabled ? "connected" : undefined);
  const readinessBlockers = input.readinessBlockers ?? [];
  const criticalReadinessBlockers = readinessBlockers.filter(
    (blocker) =>
      blocker !== "outbound_disabled" &&
      blocker !== "persistence_not_implemented" &&
      blocker !== "outbound_not_implemented"
  );

  addCheck(checks, {
    key: "account_enabled",
    passed: account?.enabled === true,
    severity: observeOnly ? "warning" : "blocker",
    reason: "account_disabled",
  });
  addCheck(checks, {
    key: "status_connected",
    passed: accountStatus === "connected",
    severity: observeOnly ? "warning" : "blocker",
    reason: accountStatus === "pending" ? "account_pending" : accountStatus === "error" ? "account_error" : "account_not_connected",
  });
  addCheck(checks, {
    key: "automation_enabled",
    passed: account?.automationEnabled === true,
    severity: observeOnly ? "info" : "blocker",
    reason: "automation_disabled",
  });
  addCheck(checks, {
    key: "runtime_enabled",
    passed: account?.runtimeEnabled === true,
    severity: observeOnly ? "info" : "blocker",
    reason: "runtime_disabled",
  });
  addCheck(checks, {
    key: "token_status_ok",
    passed: tokenStatusOk(account),
    severity: observeOnly ? "warning" : "blocker",
    reason: account?.tokenStatus === "expired" ? "token_expired" : "token_missing",
  });
  addCheck(checks, {
    key: "signature_configured",
    passed: input.signatureConfigured === true,
    severity: observeOnly ? "warning" : "blocker",
    reason: "signature_missing",
  });
  addCheck(checks, {
    key: "readiness_no_blockers",
    passed: dryRunMode
      ? criticalReadinessBlockers.length === 0
      : runtimeCandidate
        ? readinessBlockers.length === 0
        : true,
    severity: observeOnly ? "info" : "blocker",
    reason: "readiness_blocked",
  });
  addCheck(checks, {
    key: "persistence_supported",
    passed: false,
    severity: runtimeCandidate ? "blocker" : "info",
    reason: "persistence_not_implemented",
  });
  addCheck(checks, {
    key: "outbound_supported",
    passed: false,
    severity: runtimeCandidate ? "blocker" : "info",
    reason: "outbound_not_implemented",
  });

  const findings = collectFindings(checks);
  const canDryRun =
    gate.allowed &&
    tokenStatusOk(account) &&
    input.signatureConfigured === true &&
    (dryRunMode || runtimeCandidate) &&
    criticalReadinessBlockers.length === 0;
  const canAttemptRuntime = runtimeCandidate && findings.blockers.length === 0;

  return {
    ok: findings.blockers.length === 0,
    tenantKey: normalizeText(input.tenantKey, 120) || "unknown",
    channel: input.channel,
    provider: input.provider,
    channelAccountId: normalizeText(input.channelAccountId, 160) || "unknown",
    mode,
    checks,
    blockers: findings.blockers,
    warnings: findings.warnings,
    summary: {
      canObserve: true,
      canDryRun,
      canAttemptRuntime,
      canPersist: false,
      canSendOutbound: false,
    },
  };
}
