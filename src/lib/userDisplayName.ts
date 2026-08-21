export function formatUserDisplayName(
  name: string | null | undefined,
  fallback?: string | null
) {
  const collapsed = name?.replace(/\s+/g, " ").trim() ?? "";
  if (!collapsed) return fallback?.replace(/\s+/g, " ").trim() || "";
  const parts = collapsed.split(" ").filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
