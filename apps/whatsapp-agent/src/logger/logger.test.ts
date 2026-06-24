import test from "node:test";
import assert from "node:assert/strict";
import { buildLogRecord, logger, redactLogValue } from "./logger.js";

test("redactLogValue removes secrets recursively and masks PII identifiers", () => {
  const redacted = redactLogValue({
    authorization: "Bearer secret-token",
    nested: {
      pageAccessToken: "token-123",
      secretCiphertext: "ciphertext-123",
      recoveryCode: "ABCD-EFGH",
      transcript: "audio text with private data",
      rawPayload: { token: "nested-token" },
      email: "admin@example.com",
      phone: "+55 11 99999-1234",
      waId: "5511999991234",
    },
  }) as Record<string, any>;

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.nested.pageAccessToken, "[REDACTED]");
  assert.equal(redacted.nested.secretCiphertext, "[REDACTED]");
  assert.equal(redacted.nested.recoveryCode, "[REDACTED]");
  assert.equal(redacted.nested.transcript, "[REDACTED]");
  assert.equal(redacted.nested.rawPayload, "[REDACTED]");
  assert.equal(redacted.nested.email, "ad***@example.com");
  assert.equal(redacted.nested.phone, "***1234");
  assert.equal(redacted.nested.waId, "***1234");
});

test("buildLogRecord adds standard operational fields and derives tenantId from clientId", () => {
  const record = buildLogRecord("warn", {
    event: "public_api.denied",
    requestId: "req-1",
    clientId: "client-1",
    userId: "user-1",
    channel: "whatsapp",
    module: "public_api",
    durationMs: 42,
  });

  assert.equal(record.level, "warn");
  assert.equal(record.event, "public_api.denied");
  assert.equal(record.requestId, "req-1");
  assert.equal(record.correlationId, "req-1");
  assert.equal(record.tenantId, "client-1");
  assert.equal(record.clientId, "client-1");
  assert.equal(record.userId, "user-1");
  assert.equal(record.channel, "whatsapp");
  assert.equal(record.module, "public_api");
  assert.equal(record.durationMs, 42);
  assert.equal(typeof record.timestamp, "string");
});

test("logger preserves context fields without leaking sensitive values", () => {
  const originalInfo = console.info;
  const lines: string[] = [];
  console.info = (line?: unknown) => {
    lines.push(String(line));
  };

  try {
    logger.withContext(
      {
        requestId: "ctx-request",
        correlationId: "ctx-correlation",
        tenantId: "tenant-1",
      },
      () => {
        logger.info({
          event: "mfa.shadow.verify_failed",
          module: "mfa",
          code: "123456",
          metadata: {
            cookie: "session-cookie",
            mediaUrl: "https://example.com/private.ogg",
          },
        });
      }
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]) as Record<string, any>;
  assert.equal(parsed.requestId, "ctx-request");
  assert.equal(parsed.correlationId, "ctx-correlation");
  assert.equal(parsed.tenantId, "tenant-1");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "mfa.shadow.verify_failed");
  assert.equal(parsed.module, "mfa");
  assert.equal(parsed.code, "[REDACTED]");
  assert.equal(parsed.metadata.cookie, "[REDACTED]");
  assert.equal(parsed.metadata.mediaUrl, "[REDACTED]");
});
