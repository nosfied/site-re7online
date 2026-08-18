import assert from "node:assert/strict";
import test from "node:test";
import { canUserReceiveTargetedNotification } from "./appRealtime";

test("ADMIN receives unassigned notifications from every department", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-b" },
      { id: "admin-a", role: "ADMIN", departmentId: "department-a" }
    ),
    true
  );
});

test("department-scoped roles remain restricted to their primary department", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-b" },
      { id: "supervisor-a", role: "SUPERVISOR", departmentId: "department-a" }
    ),
    false
  );
  assert.equal(
    canUserReceiveTargetedNotification(
      { departmentId: "department-a" },
      { id: "agent-a", role: "AGENT", departmentId: "department-a" }
    ),
    true
  );
});

test("an explicit assignment remains visible only to the assigned user", () => {
  assert.equal(
    canUserReceiveTargetedNotification(
      { assignedUserId: "admin-b", departmentId: "department-b" },
      { id: "admin-a", role: "ADMIN", departmentId: "department-a" }
    ),
    false
  );
});
