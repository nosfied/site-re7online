import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/settings/users/page.tsx"), "utf8");

test("users management keeps filters visually grouped and row header/body hierarchy", () => {
  assert.ok(pageSource.includes("users-settings-filter-panel"));
  assert.ok(pageSource.includes("bg-re7-navy/55"));
  assert.ok(pageSource.includes("users-settings-user-header"));
  assert.ok(pageSource.includes("bg-white/[0.075]"));
  assert.ok(pageSource.includes("users-settings-user-body"));
  assert.ok(pageSource.includes("bg-black/10 px-3 py-3"));
});

test("users management exposes an explicit accessible expand button", () => {
  assert.ok(pageSource.includes("aria-expanded={isExpanded}"));
  assert.ok(pageSource.includes("aria-controls={`user-panel-${item.id}`}"));
  assert.ok(pageSource.includes('aria-label={isExpanded ? "Recolher linha" : "Expandir linha"}'));
  assert.ok(pageSource.includes('title={isExpanded ? "Recolher linha" : "Expandir linha"}'));
  assert.ok(pageSource.includes("event.stopPropagation();"));
  assert.ok(pageSource.includes("grid h-8 w-8 place-items-center rounded-full border"));
  assert.ok(pageSource.includes('isExpanded ? "rotate-90 border-re7-sky/50 bg-re7-sky/20 text-sky-50"'));
  assert.ok(pageSource.includes("›"));
});

test("users management uses a filled save action", () => {
  assert.ok(pageSource.includes("bg-re7-orange px-3 py-1.5"));
  assert.ok(pageSource.includes("disabled:bg-white/15"));
  assert.ok(pageSource.includes('{savingUserId === item.id ? "Salvando..." : "Salvar"}'));
});

test("users management resets drafts on collapse, row switch and filter changes", () => {
  assert.ok(pageSource.includes("function buildUserDraft(item: AdminUserItem): UserDraft"));
  assert.ok(pageSource.includes("resetDraftForUser(expandedUserId)"));
  assert.ok(pageSource.includes("if (current && current !== item.id)"));
  assert.ok(pageSource.includes("if (previous) nextDrafts[current] = buildUserDraft(previous)"));
  assert.ok(pageSource.includes("collapseExpandedUser();"));
});

test("users management projections derive from persisted users, not unsaved drafts", () => {
  const filteredUsersBlock = pageSource.slice(
    pageSource.indexOf("const filteredUsers = useMemo"),
    pageSource.indexOf("const resetDraftForUser = useCallback")
  );
  assert.ok(filteredUsersBlock.includes("return users.filter((item) =>"));
  assert.ok(filteredUsersBlock.includes("const role = String(item.role ?? \"\").toUpperCase()"));
  assert.ok(filteredUsersBlock.includes("const isActive = item.isActive ?? true"));
  assert.ok(filteredUsersBlock.includes("const departmentIds = getUserDepartmentIds(item)"));
  assert.ok(!filteredUsersBlock.includes("userDrafts"));
  assert.ok(pageSource.includes("activeUserCapacity.activeUsers"));
});
