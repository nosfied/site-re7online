import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_LIFECYCLE_ACTIVE,
  CONTACT_LIFECYCLE_PROVISIONAL,
  isOperationalContactLifecycle,
  resolveInitialContactLifecycle,
} from "./contactLifecycle.js";

test("contact lifecycle derives initial state from consent requirement", () => {
  assert.equal(resolveInitialContactLifecycle({ consentRequired: true }), CONTACT_LIFECYCLE_PROVISIONAL);
  assert.equal(resolveInitialContactLifecycle({ consentRequired: false }), CONTACT_LIFECYCLE_ACTIVE);
});

test("only active contacts are operational", () => {
  assert.equal(isOperationalContactLifecycle(CONTACT_LIFECYCLE_ACTIVE), true);
  assert.equal(isOperationalContactLifecycle(CONTACT_LIFECYCLE_PROVISIONAL), false);
  assert.equal(isOperationalContactLifecycle(null), false);
  assert.equal(isOperationalContactLifecycle(undefined), false);
});
