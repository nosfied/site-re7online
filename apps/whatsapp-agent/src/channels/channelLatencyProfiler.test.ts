import assert from "node:assert/strict";
import test from "node:test";
import { channelLatencyNow, createChannelLatencyProfiler } from "./channelLatencyProfiler.js";

function captureConsoleInfo(fn: () => void) {
  const original = console.info;
  const records: string[] = [];
  console.info = (message?: unknown) => {
    records.push(String(message));
  };
  try {
    fn();
  } finally {
    console.info = original;
  }
  return records;
}

test("channel latency profiler is inert when disabled", () => {
  const records = captureConsoleInfo(() => {
    const profiler = createChannelLatencyProfiler({
      CHANNEL_LATENCY_PROFILING: "false",
      CHANNEL_LATENCY_PROFILING_SAMPLE_RATE: "1",
    } as NodeJS.ProcessEnv);
    profiler.duration("tenantResolution", channelLatencyNow());
    profiler.finish("channel_latency.messenger_inbound", {
      requestId: "req_1",
      token: "must-not-log",
      tenantKey: "re7online",
    });
  });

  assert.deepEqual(records, []);
});

test("channel latency profiler logs sampled safe fields", () => {
  const records = captureConsoleInfo(() => {
    const profiler = createChannelLatencyProfiler({
      CHANNEL_LATENCY_PROFILING: "true",
      CHANNEL_LATENCY_PROFILING_SAMPLE_RATE: "1",
    } as NodeJS.ProcessEnv);
    profiler.duration("tenantResolution", channelLatencyNow());
    profiler.finish("channel_latency.messenger_inbound", {
      requestId: "req_2",
      tenantKey: "re7online",
      token: "must-be-redacted",
      nested: { token: "must-not-log" } as unknown as string,
    });
  });

  assert.equal(records.length, 1);
  const parsed = JSON.parse(records[0]);
  assert.equal(parsed.event, "channel_latency.messenger_inbound");
  assert.equal(parsed.requestId, "req_2");
  assert.equal(parsed.tenantKey, "re7online");
  assert.equal(parsed.sampled, true);
  assert.equal(typeof parsed.totalMs, "number");
  assert.equal(parsed.token, "***");
  assert.equal(parsed.nested, undefined);
  assert.ok(!records[0].includes("must-not-log"));
  assert.ok(!records[0].includes("must-be-redacted"));
});

test("channel latency profiler honors zero sample rate", () => {
  const records = captureConsoleInfo(() => {
    const profiler = createChannelLatencyProfiler({
      CHANNEL_LATENCY_PROFILING: "true",
      CHANNEL_LATENCY_PROFILING_SAMPLE_RATE: "0",
    } as NodeJS.ProcessEnv);
    profiler.finish("channel_latency.messenger_outbound", { requestId: "req_3" });
  });

  assert.deepEqual(records, []);
});
