export function hasExplicitHumanTransferDestination(conversation: { departmentId?: string | null } | null) {
  return Boolean(String(conversation?.departmentId ?? "").trim());
}
