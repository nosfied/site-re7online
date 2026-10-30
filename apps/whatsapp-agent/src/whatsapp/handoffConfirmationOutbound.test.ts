import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeHandoffConfirmationOutboundError } from "./handoffConfirmationOutbound.js";

test("handoff confirmation failure keeps closed predicates and removes provider details", () => {
  assert.equal(
    sanitizeHandoffConfirmationOutboundError("late_reply_dropped"),
    "late_reply_dropped"
  );
  assert.equal(
    sanitizeHandoffConfirmationOutboundError("token=secret provider payload"),
    "handoff_confirmation_outbound_failed"
  );
  assert.equal(
    sanitizeHandoffConfirmationOutboundError({ accessToken: "secret" }),
    "handoff_confirmation_outbound_failed"
  );
});
