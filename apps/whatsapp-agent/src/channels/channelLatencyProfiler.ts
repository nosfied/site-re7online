import { logger } from "../logger/logger.js";

export type ChannelLatencyEvent = "channel_latency.messenger_inbound" | "channel_latency.messenger_outbound";

type ChannelLatencyFields = Record<string, string | number | boolean | null | undefined>;

export type ChannelLatencyProfiler = {
  readonly enabled: boolean;
  readonly sampled: boolean;
  mark(name: string): void;
  duration(name: string, startedAt: number | null | undefined): void;
  elapsedSince(name: string, startedAt: number | null | undefined): number | undefined;
  finish(event: ChannelLatencyEvent, fields: ChannelLatencyFields): void;
};

function profilingEnabled(env = process.env) {
  return (env.CHANNEL_LATENCY_PROFILING ?? "false") === "true";
}

function sampleRate(env = process.env) {
  const value = Number(env.CHANNEL_LATENCY_PROFILING_SAMPLE_RATE ?? "1");
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function shouldSample(env = process.env) {
  const rate = sampleRate(env);
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function isSafeLatencyField(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function createChannelLatencyProfiler(env = process.env): ChannelLatencyProfiler {
  const enabled = profilingEnabled(env);
  const sampled = enabled && shouldSample(env);
  const startedAt = nowMs();
  const durations = new Map<string, number>();

  function safeRun(fn: () => void) {
    try {
      fn();
    } catch (error) {
      logger.warn({
        event: "channel_latency.profiler_failed",
        message: (error as Error).message,
      });
    }
  }

  return {
    enabled,
    sampled,
    mark(name: string) {
      if (!sampled) return;
      durations.set(`${name}Ms`, nowMs() - startedAt);
    },
    duration(name: string, stepStartedAt: number | null | undefined) {
      if (!sampled || !stepStartedAt) return;
      durations.set(`${name}Ms`, Math.max(0, nowMs() - stepStartedAt));
    },
    elapsedSince(name: string, stepStartedAt: number | null | undefined) {
      if (!sampled || !stepStartedAt) return undefined;
      const elapsed = Math.max(0, nowMs() - stepStartedAt);
      durations.set(`${name}Ms`, elapsed);
      return elapsed;
    },
    finish(event: ChannelLatencyEvent, fields: ChannelLatencyFields) {
      if (!sampled) return;
      safeRun(() => {
        const safeFields: ChannelLatencyFields = {};
        for (const [key, value] of Object.entries(fields)) {
          if (isSafeLatencyField(value)) safeFields[key] = value;
        }
        logger.info({
          event,
          ...safeFields,
          sampled: true,
          totalMs: nowMs() - startedAt,
          ...Object.fromEntries(durations),
        });
      });
    },
  };
}

export function channelLatencyNow() {
  return nowMs();
}
