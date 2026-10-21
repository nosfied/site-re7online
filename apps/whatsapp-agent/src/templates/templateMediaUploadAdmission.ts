const activeByTenant = new Map<string, number>();
let activeGlobal = 0;

function configuredGlobalLimit() {
  const parsed = Number.parseInt(process.env.TEMPLATE_MEDIA_UPLOAD_CONCURRENCY ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 2 ? parsed : 1;
}

export function tryAdmitTemplateMediaUpload(clientId: string): (() => void) | null {
  if (activeGlobal >= configuredGlobalLimit() || (activeByTenant.get(clientId) ?? 0) >= 1) return null;
  activeGlobal += 1;
  activeByTenant.set(clientId, (activeByTenant.get(clientId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeGlobal = Math.max(0, activeGlobal - 1);
    const tenantActive = Math.max(0, (activeByTenant.get(clientId) ?? 1) - 1);
    if (tenantActive === 0) activeByTenant.delete(clientId);
    else activeByTenant.set(clientId, tenantActive);
  };
}

export function resetTemplateMediaUploadAdmissionForTests() {
  activeGlobal = 0;
  activeByTenant.clear();
}
