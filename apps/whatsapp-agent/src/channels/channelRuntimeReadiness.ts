import type { TenantConfigMap } from "../config/tenantConfig.js";
import type { Channel, Provider } from "./channel.types.js";
import type { DryRunSessionState } from "./channelDryRunSessions.js";
import type { ObservedChannelEvent } from "./observedChannelEvents.js";
import { resolveChannelRuntimeGate } from "./tenantChannelAccount.js";
import type { TenantChannelAccount } from "./tenantChannelAccount.types.js";

export type ChannelRuntimeReadinessReport = {
  tenantKey: string;
  provider: Provider;
  channel: Channel;
  channelAccountId: string;
  account: {
    enabled: boolean;
    automationEnabled: boolean;
    runtimeEnabled: boolean;
    outboundEnabled: boolean;
    aiEnabled: boolean;
    handoffEnabled: boolean;
    status?: string;
    tokenStatus?: string;
  };
  gate: {
    allowed: boolean;
    reason: string;
    outboundAllowed: boolean;
    aiAllowed: boolean;
    handoffAllowed: boolean;
  };
  observed: {
    totalEvents: number;
    lastEventAt?: string;
    lastResolution?: string;
  };
  dryRun: {
    sessions: number;
    lastShadowPlan?: {
      wouldEnterRuntime: boolean;
      wouldPersist: boolean;
      wouldRunQualification: boolean;
      wouldRunAi: boolean;
      wouldEvaluateHandoff: boolean;
      wouldSendOutbound: boolean;
    };
  };
  readiness: {
    canObserve: boolean;
    canDryRun: boolean;
    canPersist: boolean;
    canSendOutbound: boolean;
    blockers: string[];
    warnings: string[];
  };
};

type BuildChannelRuntimeReadinessReportsInput = {
  tenants: TenantConfigMap;
  observedEvents?: ObservedChannelEvent[];
  dryRunSessions?: DryRunSessionState[];
  filter?: {
    tenantKey?: string;
    channel?: Channel;
    provider?: Provider;
  };
};

function accountMatchesFilter(
  tenantKey: string,
  account: TenantChannelAccount,
  filter?: BuildChannelRuntimeReadinessReportsInput["filter"]
) {
  if (filter?.tenantKey && filter.tenantKey !== tenantKey) return false;
  if (filter?.channel && filter.channel !== account.channel) return false;
  if (filter?.provider && filter.provider !== account.provider) return false;
  return true;
}

function sameAccount(
  account: Pick<TenantChannelAccount, "tenantKey" | "channel" | "provider" | "channelAccountId">,
  item: {
    tenantKey?: string;
    channel: Channel;
    provider: Provider;
    channelAccountId: string;
  }
) {
  return (
    item.tenantKey === account.tenantKey &&
    item.channel === account.channel &&
    item.provider === account.provider &&
    item.channelAccountId === account.channelAccountId
  );
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | undefined) {
  return items
    .slice()
    .sort((a, b) => Date.parse(getDate(b) ?? "") - Date.parse(getDate(a) ?? ""))[0];
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function buildReadiness(params: {
  account: TenantChannelAccount;
  gate: ReturnType<typeof resolveChannelRuntimeGate>;
  observedCount: number;
  dryRunCount: number;
  hasShadowPlan: boolean;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!params.account.enabled) pushUnique(blockers, "account_disabled");
  if (params.account.status === "pending") pushUnique(blockers, "account_pending");
  if (params.account.status === "error") pushUnique(blockers, "account_error");
  if (params.account.tokenStatus === "missing") pushUnique(blockers, "token_missing");
  if (params.account.tokenStatus === "expired") pushUnique(blockers, "token_expired");
  if (!params.account.automationEnabled) pushUnique(blockers, "automation_disabled");
  if (!params.account.runtimeEnabled) pushUnique(blockers, "runtime_disabled");
  if (params.gate.reason !== "runtime_allowed") pushUnique(blockers, params.gate.reason);
  if (!params.account.outboundEnabled) pushUnique(blockers, "outbound_disabled");
  pushUnique(blockers, "persistence_not_implemented");
  pushUnique(blockers, "outbound_not_implemented");

  if (params.observedCount === 0) pushUnique(warnings, "no_recent_events");
  if (params.dryRunCount === 0) pushUnique(warnings, "no_dry_run_sessions");
  if (!params.hasShadowPlan) pushUnique(warnings, "no_shadow_plan");

  return {
    canObserve: true,
    canDryRun: params.gate.allowed,
    canPersist: false,
    canSendOutbound: false,
    blockers,
    warnings,
  };
}

export function buildChannelRuntimeReadinessReports(
  input: BuildChannelRuntimeReadinessReportsInput
): ChannelRuntimeReadinessReport[] {
  const observedEvents = input.observedEvents ?? [];
  const dryRunSessions = input.dryRunSessions ?? [];
  const reports: ChannelRuntimeReadinessReport[] = [];

  for (const [tenantMapKey, tenant] of Object.entries(input.tenants)) {
    const tenantKey = tenant.id || tenantMapKey;
    for (const account of tenant.channelAccounts ?? []) {
      if (!accountMatchesFilter(tenantKey, account, input.filter)) continue;

      const accountIdentity = {
        tenantKey: account.tenantKey || tenantKey,
        channel: account.channel,
        provider: account.provider,
        channelAccountId: account.channelAccountId,
      };
      const matchingEvents = observedEvents.filter((event) => sameAccount(accountIdentity, event));
      const matchingSessions = dryRunSessions.filter((session) => sameAccount(accountIdentity, session));
      const lastEvent = latestByDate(matchingEvents, (event) => event.receivedAt);
      const lastSessionWithShadowPlan = latestByDate(
        matchingSessions.filter((session) => Boolean(session.lastShadowPlan)),
        (session) => session.updatedAt
      );
      const lastShadowPlan = lastSessionWithShadowPlan?.lastShadowPlan?.summary;
      const gate = resolveChannelRuntimeGate(account);

      reports.push({
        tenantKey,
        provider: account.provider,
        channel: account.channel,
        channelAccountId: account.channelAccountId,
        account: {
          enabled: account.enabled,
          automationEnabled: account.automationEnabled === true,
          runtimeEnabled: account.runtimeEnabled === true,
          outboundEnabled: account.outboundEnabled === true,
          aiEnabled: account.aiEnabled === true,
          handoffEnabled: account.handoffEnabled === true,
          status: account.status,
          tokenStatus: account.tokenStatus,
        },
        gate,
        observed: {
          totalEvents: matchingEvents.length,
          ...(lastEvent?.receivedAt ? { lastEventAt: lastEvent.receivedAt } : {}),
          ...(lastEvent?.resolution ? { lastResolution: lastEvent.resolution } : {}),
        },
        dryRun: {
          sessions: matchingSessions.length,
          ...(lastShadowPlan
            ? {
                lastShadowPlan: {
                  wouldEnterRuntime: lastShadowPlan.wouldEnterRuntime,
                  wouldPersist: lastShadowPlan.wouldPersist,
                  wouldRunQualification: lastShadowPlan.wouldRunQualification,
                  wouldRunAi: lastShadowPlan.wouldRunAi,
                  wouldEvaluateHandoff: lastShadowPlan.wouldEvaluateHandoff,
                  wouldSendOutbound: lastShadowPlan.wouldSendOutbound,
                },
              }
            : {}),
        },
        readiness: buildReadiness({
          account,
          gate,
          observedCount: matchingEvents.length,
          dryRunCount: matchingSessions.length,
          hasShadowPlan: Boolean(lastShadowPlan),
        }),
      });
    }
  }

  return reports.sort((a, b) =>
    [a.tenantKey, a.channel, a.provider, a.channelAccountId]
      .join(":")
      .localeCompare([b.tenantKey, b.channel, b.provider, b.channelAccountId].join(":"))
  );
}
