export function getNewFlowDefaultExpanded(flowCount: number) {
  return flowCount === 0;
}

export function getExistingFlowDefaultExpanded(input: { isActive: boolean; entryPoint: boolean }) {
  return input.entryPoint || input.isActive;
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
