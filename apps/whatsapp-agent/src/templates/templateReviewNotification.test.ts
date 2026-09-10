import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTemplateReviewNotifyEmail,
  sanitizeTemplateReviewNotificationError,
  sendTemplateReviewNotification,
  setTemplateReviewNotificationSenderForTests,
} from "./templateReviewNotification.js";

test("template review notification preserves recipient fallback and content", async () => {
  const previousNotify = process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
  const previousFallback = process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
  process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = "";
  process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = "review@example.test";
  const sent: unknown[] = [];
  setTemplateReviewNotificationSenderForTests(async (message) => {
    sent.push(message);
  });
  try {
    assert.equal(resolveTemplateReviewNotifyEmail(), "review@example.test");
    const result = await sendTemplateReviewNotification({
      tenantName: "Tenant A",
      clientKey: "tenant-a",
      requestedBy: "Operador",
      name: "retomar_atendimento",
      category: "UTILITY",
      language: "pt_BR",
      content: "Ola, {{1}}",
      variables: [{ key: "1", description: "Nome", example: "Joao" }],
      adminPath: "/admin/templates/requests",
    });

    assert.deepEqual(result, { to: "review@example.test" });
    assert.equal(sent.length, 1);
    assert.equal(JSON.stringify(sent).includes("retomar_atendimento"), true);
  } finally {
    if (previousNotify === undefined) delete process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL;
    else process.env.TEMPLATE_REVIEW_NOTIFY_EMAIL = previousNotify;
    if (previousFallback === undefined) delete process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL;
    else process.env.TEMPLATE_REVIEW_FALLBACK_EMAIL = previousFallback;
    setTemplateReviewNotificationSenderForTests(null);
  }
});

test("template review notification sanitizes transport errors", () => {
  assert.equal(
    sanitizeTemplateReviewNotificationError("Bearer abc.def token=secret"),
    "Bearer [REDACTED] token=[REDACTED]"
  );
});
