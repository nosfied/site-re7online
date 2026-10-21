export type TemplateProviderMediaResult =
  | { ok: true; mediaId: string }
  | { ok: false; status: number; errorBody: string };

export type TemplateProviderSubmissionGateResult =
  | { ok: true; mediaId?: string }
  | { ok: false; blockedByEligibility?: boolean; status?: number; errorBody: string };

export async function runTemplateProviderSubmissionGate(params: {
  beforeSubmit?: () => Promise<string | null>;
  resolveMedia?: () => Promise<TemplateProviderMediaResult>;
}): Promise<TemplateProviderSubmissionGateResult> {
  const eligibilityReason = await params.beforeSubmit?.();
  if (eligibilityReason) return { ok: false, blockedByEligibility: true, errorBody: eligibilityReason };
  if (!params.resolveMedia) return { ok: true };
  const media = await params.resolveMedia();
  if (!media.ok) return media;
  const postMediaEligibilityReason = await params.beforeSubmit?.();
  if (postMediaEligibilityReason) {
    return { ok: false, blockedByEligibility: true, errorBody: postMediaEligibilityReason };
  }
  return media;
}
