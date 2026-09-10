import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalResendPayload,
  classifyMailDeliveryError,
  isCanonicalMailConfigured,
  resolveCanonicalMailProvider,
  resolveCanonicalMailSmtpSecure,
  sanitizeMailDeliveryError,
  sendCanonicalMail,
} from "./canonicalMail.js";

const message = {
  to: "user@example.test",
  subject: "Assunto",
  text: "Texto seguro",
  html: "<p>Texto seguro</p>",
};

test("canonical mail config selects Resend HTTPS API for Resend SMTP host", () => {
  const env = {
    SMTP_HOST: "smtp.resend.com",
    SMTP_PORT: "2465",
    SMTP_FROM: "Converta <noreply@example.test>",
    SMTP_PASS: "secret",
  };

  assert.equal(isCanonicalMailConfigured(env), true);
  assert.equal(resolveCanonicalMailProvider(env), "resend_api");
  assert.deepEqual(
    buildCanonicalResendPayload({
      from: env.SMTP_FROM,
      to: "user@example.test",
      subject: "Assunto",
      text: "Texto",
      html: "<p>Texto</p>",
    }),
    {
      from: env.SMTP_FROM,
      to: ["user@example.test"],
      subject: "Assunto",
      text: "Texto",
      html: "<p>Texto</p>",
    }
  );
});

test("canonical SMTP secure mode covers standard and Resend TLS ports", () => {
  assert.equal(resolveCanonicalMailSmtpSecure(465), true);
  assert.equal(resolveCanonicalMailSmtpSecure(2465), true);
  assert.equal(resolveCanonicalMailSmtpSecure(587), false);
});

test("canonical SMTP sender normalizes TLS, timeouts, auth and envelope", async () => {
  const transportOptions: unknown[] = [];
  const sent: unknown[] = [];

  const result = await sendCanonicalMail({
    env: {
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "2465",
      SMTP_FROM: "ops@example.test",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    },
    message,
    smtpTransportFactory: ((options: unknown) => {
      transportOptions.push(options);
      return {
        sendMail: async (payload: unknown) => {
          sent.push(payload);
        },
      };
    }) as never,
  });

  assert.equal(result.status, "DELIVERED");
  assert.equal(result.provider, "smtp");
  assert.deepEqual(transportOptions, [
    {
      host: "smtp.example.test",
      port: 2465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: { user: "user", pass: "pass" },
    },
  ]);
  assert.deepEqual(sent, [
    {
      from: "ops@example.test",
      to: "user@example.test",
      subject: "Assunto",
      text: "Texto seguro",
      html: "<p>Texto seguro</p>",
    },
  ]);
});

test("canonical Resend API sender does not expose API key in payload metadata", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendCanonicalMail({
      env: {
        SMTP_HOST: "smtp.resend.com",
        SMTP_PORT: "2465",
        SMTP_FROM: "Converta <noreply@example.test>",
        SMTP_PASS: "re_secret",
      },
      message,
    });

    assert.equal(result.status, "DELIVERED");
    assert.equal(result.provider, "resend_api");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(String(calls[0].init.body).includes("re_secret"), false);
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer re_secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canonical result classifies retryable and permanent delivery failures safely", async () => {
  const retryable = await sendCanonicalMail({
    env: { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_FROM: "ops@example.test" },
    message,
    smtpTransportFactory: (() => ({
      sendMail: async () => {
        throw new Error("Greeting never received token=secret");
      },
    })) as never,
  });

  assert.equal(retryable.status, "RETRYABLE_TRANSPORT_FAILURE");
  assert.equal(retryable.reason?.includes("token=secret"), false);
  assert.equal(retryable.reason?.includes("token=[REDACTED]"), true);
  assert.equal(classifyMailDeliveryError(new Error("Invalid login 535")), "PERMANENT_FAILURE");
  assert.equal(
    sanitizeMailDeliveryError("Bearer abc token=secret ops@example.test +55 84 99999-1234"),
    "Bearer [REDACTED] token=[REDACTED] [redacted] [redacted]"
  );
});
