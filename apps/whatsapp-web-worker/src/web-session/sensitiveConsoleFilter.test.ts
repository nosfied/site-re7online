import test from "node:test";
import assert from "node:assert/strict";
import { installSensitiveConsoleFilter } from "./sensitiveConsoleFilter.js";

test("sensitive console filter suppresses libsignal session dumps only", () => {
  const originalInfo = console.info;
  const lines: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args);
  };
  try {
    installSensitiveConsoleFilter();
    console.info("Closing session:", { privateKey: "secret" });
    console.info("normal worker line", { ok: true });

    assert.deepEqual(lines, [["normal worker line", { ok: true }]]);
  } finally {
    console.info = originalInfo;
  }
});
