import { resolveWebSessionTextAvailability } from "../web-session/webSessionOutboundService.js";
import { resolveTenantOutboundCredentials } from "./tenantCredentials.js";
import type { PrismaClient } from "@prisma/client";
import { resolveEffectiveWhatsappOutboundTransport, type ReactiveWhatsappIntent } from "../crm/crmConversationStart.js";
import { runtimeWriteTokenSelect, type RuntimeWriteToken } from "../conversation/runtimeWriteFence.js";

export type ReactiveSubmission = {
  prisma: PrismaClient; clientId: string; clientKey: string; waId: string;
  intent: ReactiveWhatsappIntent; provider: "meta" | "web_session";
  runtimeWriteToken?: RuntimeWriteToken;
  expectedWebAccountId?: string;
  expectedMetaCredentials?: { phoneNumberId: string; accessToken: string };
};

// Recheck after credentials/signatures/media preparation, immediately before I/O.
// This is an observation, not a lock across the provider call. A changed decision
// denies this attempt; it never invokes a second sender.
export async function revalidateReactiveSubmission(params: ReactiveSubmission): Promise<string | null> {
  const client = await params.prisma.client.findFirst({
    where: { id: params.clientId, clientKey: params.clientKey, status: "ACTIVE" },
    select: { status: true },
  });
  if (!client) return "reactive_client_unavailable";
  const transport = await resolveEffectiveWhatsappOutboundTransport({ ...params, clientStatus: client.status });
  if (transport.status !== "ready" || transport.provider !== params.provider) return "reactive_transport_changed";
  if (params.provider === "web_session" && params.expectedWebAccountId &&
    await resolveWebSessionTextAvailability({ ...params, channelAccountId: params.expectedWebAccountId, requireExactAccount: true }) !== "ready") return "reactive_account_changed";
  if (params.provider === "meta" && params.expectedMetaCredentials) {
    const current = await resolveTenantOutboundCredentials(params);
    if (!current || current.phoneNumberId !== params.expectedMetaCredentials.phoneNumberId ||
      current.accessToken !== params.expectedMetaCredentials.accessToken) return "reactive_account_changed";
  }
  const runtime = await params.prisma.conversationRuntimeState.findUnique({
    where: { clientId_waId: { clientId: params.clientId, waId: params.waId } },
    select: { ...runtimeWriteTokenSelect, windowIsOpen: true, windowExpiresAt: true },
  });
  const now = Date.now();
  if (!runtime || runtime.channel !== "whatsapp" || !runtime.windowIsOpen ||
    !runtime.lastInboundAt || runtime.lastInboundAt.getTime() > now ||
    !runtime.windowExpiresAt || runtime.windowExpiresAt.getTime() <= now ||
    runtime.lastInboundAt.getTime() + 24 * 60 * 60 * 1000 <= now) return "window_closed";
  const expected = params.runtimeWriteToken;
  if (expected && Object.keys(runtimeWriteTokenSelect).some(key => {
    const a = runtime[key as keyof RuntimeWriteToken];
    const b = expected[key as keyof RuntimeWriteToken];
    return JSON.stringify(a) !== JSON.stringify(b);
  })) return "late_reply_dropped";
  return null;
}
