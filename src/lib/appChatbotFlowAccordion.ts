export function getNewFlowDefaultExpanded() {
  return false;
}

export function getExistingFlowDefaultExpanded() {
  return false;
}

export function getFlowNodeCountFromDefinitionText(definitionText: string) {
  try {
    const parsed = JSON.parse(definitionText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const nodes = (parsed as { nodes?: unknown }).nodes;
    if (!nodes || typeof nodes !== "object" || Array.isArray(nodes)) return null;
    return Object.keys(nodes).length;
  } catch {
    return null;
  }
}
