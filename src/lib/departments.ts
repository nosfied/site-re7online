import type { AdminDepartmentItem } from "@/lib/whatsappAdminApi";

const LEGACY_OPERATIONAL_DEPARTMENT_NAMES = new Set(["atendimento"]);
const LEGACY_OPERATIONAL_DEPARTMENT_SLUGS = new Set(["atendimento"]);
const LEGACY_OPERATIONAL_DEPARTMENT_NAME_PREFIX = "departamento legado";
const LEGACY_OPERATIONAL_DEPARTMENT_SLUG_PREFIX = "departamento-legado";

export function isLegacyOperationalDepartment(department: Pick<AdminDepartmentItem, "name" | "slug">) {
  const name = department.name.trim().toLowerCase();
  const slug = department.slug?.trim().toLowerCase() ?? "";
  return (
    LEGACY_OPERATIONAL_DEPARTMENT_NAMES.has(name) ||
    LEGACY_OPERATIONAL_DEPARTMENT_SLUGS.has(slug) ||
    name.startsWith(LEGACY_OPERATIONAL_DEPARTMENT_NAME_PREFIX) ||
    slug.startsWith(LEGACY_OPERATIONAL_DEPARTMENT_SLUG_PREFIX)
  );
}

export function isSelectableDepartment(department: AdminDepartmentItem) {
  return department.isActive && !isLegacyOperationalDepartment(department);
}
