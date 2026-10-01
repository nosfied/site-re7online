import assert from "node:assert/strict";
import test from "node:test";

import { isInboxFreeformWindowOpen } from "./inboxWindow";

const now = Date.parse("2026-09-30T12:00:00.000Z");

test("WhatsApp freeform window requires explicit open state and a future valid expiration", () => {
  assert.equal(
    isInboxFreeformWindowOpen(
      { channel: "whatsapp", windowIsOpen: true, windowExpiresAt: "2026-09-30T12:01:00.000Z" },
      now
    ),
    true
  );

  assert.equal(isInboxFreeformWindowOpen({ channel: "whatsapp", windowIsOpen: true, windowExpiresAt: null }, now), false);
  assert.equal(
    isInboxFreeformWindowOpen({ channel: "whatsapp", windowIsOpen: true, windowExpiresAt: "invalid-date" }, now),
    false
  );
  const expiringWindow = { channel: "whatsapp", windowIsOpen: true, windowExpiresAt: "2026-09-30T12:00:00.000Z" };
  assert.equal(isInboxFreeformWindowOpen(expiringWindow, now - 1), true);
  assert.equal(isInboxFreeformWindowOpen(expiringWindow, now), false);
  assert.equal(
    isInboxFreeformWindowOpen(
      { channel: "whatsapp", windowIsOpen: false, windowExpiresAt: "2026-09-30T12:01:00.000Z" },
      now
    ),
    false
  );
});

test("non-WhatsApp channels are not blocked by the WhatsApp 24h freeform window helper", () => {
  assert.equal(isInboxFreeformWindowOpen({ channel: "support", windowIsOpen: null, windowExpiresAt: null }, now), true);
  assert.equal(isInboxFreeformWindowOpen(null, now), true);
});
