import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/settings/departments/page.tsx"), "utf8");

test("departments management uses expandable rows with header/body hierarchy", () => {
  assert.ok(pageSource.includes("departments-settings-filter-panel"));
  assert.ok(pageSource.includes("departments-settings-department-header"));
  assert.ok(pageSource.includes("bg-white/[0.075]"));
  assert.ok(pageSource.includes("departments-settings-department-body"));
  assert.ok(pageSource.includes("bg-black/10 px-3 py-3"));
  assert.ok(pageSource.includes("id={`department-panel-${item.id}`}"));
});

test("departments management exposes the shared circular expand button", () => {
  assert.ok(pageSource.includes("aria-expanded={isExpanded}"));
  assert.ok(pageSource.includes("aria-controls={`department-panel-${item.id}`}"));
  assert.ok(pageSource.includes('aria-label={isExpanded ? "Recolher linha" : "Expandir linha"}'));
  assert.ok(pageSource.includes('title={isExpanded ? "Recolher linha" : "Expandir linha"}'));
  assert.ok(pageSource.includes("event.stopPropagation();"));
  assert.ok(pageSource.includes("grid h-8 w-8 place-items-center rounded-full border"));
  assert.ok(pageSource.includes('isExpanded ? "rotate-90 border-re7-sky/50 bg-re7-sky/20 text-sky-50"'));
  assert.ok(pageSource.includes("›"));
});

test("departments management anchors the expand button in a fixed right-side header slot", () => {
  assert.ok(pageSource.includes("departments-settings-department-header grid"));
  assert.ok(pageSource.includes("grid-cols-[minmax(0,1fr)_auto]"));
  assert.ok(pageSource.includes("expand-row-action-slot"));
  assert.ok(pageSource.includes("min-w-max shrink-0"));
  assert.ok(pageSource.includes("justify-self-end whitespace-nowrap"));
});

test("departments management keeps one row open and preserves viewport context", () => {
  assert.ok(pageSource.includes("const [expandedDepartmentId, setExpandedDepartmentId]"));
  assert.ok(pageSource.includes("const isExpanded = expandedDepartmentId === item.id"));
  assert.ok(pageSource.includes("setExpandedDepartmentId((current) =>"));
  assert.ok(pageSource.includes("if (current && current !== item.id)"));
  assert.ok(pageSource.includes("scrollIntoView({ block: \"nearest\" })"));
});

test("departments management resets unsaved draft state on collapse, row switch and filters", () => {
  assert.ok(pageSource.includes("function buildDepartmentDraft(item: AdminDepartmentItem): DepartmentDraft"));
  assert.ok(pageSource.includes("resetDraftForDepartment(expandedDepartmentId)"));
  assert.ok(pageSource.includes("if (previous) nextDrafts[current] = buildDepartmentDraft(previous)"));
  assert.ok(pageSource.includes("collapseExpandedDepartment();"));
  assert.ok(pageSource.includes("setHoursEditor((current) => current?.departmentId === expandedDepartmentId ? null : current)"));
});

test("departments management summaries and filters derive from persisted departments", () => {
  const filteredDepartmentsBlock = pageSource.slice(
    pageSource.indexOf("const filteredDepartments = useMemo"),
    pageSource.indexOf("const resetDraftForDepartment = useCallback")
  );
  assert.ok(filteredDepartmentsBlock.includes("return sortedDepartments.filter((item) =>"));
  assert.ok(filteredDepartmentsBlock.includes("const isActive = item.isActive"));
  assert.ok(filteredDepartmentsBlock.includes("const searchable = [item.name, item.slug, item.id]"));
  assert.ok(!filteredDepartmentsBlock.includes("drafts"));
  assert.ok(pageSource.includes("label={isPersistedActive ? \"Ativo\" : \"Inativo\"}"));
});

test("departments management keeps the approved filled save action", () => {
  assert.ok(pageSource.includes("bg-re7-orange px-3 py-1.5"));
  assert.ok(pageSource.includes("disabled:bg-white/15"));
  assert.ok(pageSource.includes('{savingId === item.id ? "Salvando..." : "Salvar"}'));
});
