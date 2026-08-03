import type { PrismaClient } from "@prisma/client";
import {
  buildWaIdLookup,
  canonicalizeBrazilWaId,
  compareConversationLookupPriority,
  normalizeWaIdDigits,
} from "../utils/waid.js";

export type CampaignRecipientConversationMatch =
  | "exact_conversation_waid"
  | "exact_conversation_canonical"
  | "brazil_ninth_digit_safe"
  | "none";

export type CampaignRecipientConversationTarget = {
  resolved: boolean;
  reason: "resolved" | "not_found" | "ambiguous";
  inputWaId: string;
  inputWaIdCanonical: string;
  winningWaId: string;
  winningWaIdCanonical: string;
  conversationId?: string;
  contactId?: string;
  matchedBy: CampaignRecipientConversationMatch;
};

type ConversationCandidate = {
  id: string;
  waId: string;
  waIdCanonical: string | null;
  updatedAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
};

function isBrazilianWaId(value: string) {
  return value.startsWith("55") && (value.length === 12 || value.length === 13);
}

function getBrazilianNinthDigitKey(value: string) {
  const digits = normalizeWaIdDigits(value);
  if (!isBrazilianWaId(digits)) return null;
  const ddd = digits.slice(2, 4);
  const local = digits.slice(4);
  if (!/^\d{2}$/.test(ddd)) return null;
  if (local.length === 8) {
    return { country: "55", ddd, subscriber: local, hasNinth: false };
  }
  if (local.length === 9 && local.startsWith("9")) {
    return { country: "55", ddd, subscriber: local.slice(1), hasNinth: true };
  }
  return null;
}

function hasSafeBrazilianNinthDigitMatch(input: string, candidate: string) {
  const inputKey = getBrazilianNinthDigitKey(input);
  const candidateKey = getBrazilianNinthDigitKey(candidate);
  if (!inputKey || !candidateKey) return false;
  return (
    inputKey.country === candidateKey.country &&
    inputKey.ddd === candidateKey.ddd &&
    inputKey.subscriber === candidateKey.subscriber &&
    inputKey.hasNinth !== candidateKey.hasNinth
  );
}

function emptyTarget(inputWaId: string, inputWaIdCanonical: string, reason: "not_found" | "ambiguous") {
  return {
    resolved: false,
    reason,
    inputWaId,
    inputWaIdCanonical,
    winningWaId: inputWaId,
    winningWaIdCanonical: inputWaIdCanonical,
    matchedBy: "none" as const,
  };
}

function toResolvedTarget(
  inputWaId: string,
  inputWaIdCanonical: string,
  candidate: ConversationCandidate,
  matchedBy: Exclude<CampaignRecipientConversationMatch, "none">,
  contactId?: string | null
): CampaignRecipientConversationTarget {
  return {
    resolved: true,
    reason: "resolved",
    inputWaId,
    inputWaIdCanonical,
    winningWaId: candidate.waId,
    winningWaIdCanonical: candidate.waIdCanonical ?? canonicalizeBrazilWaId(candidate.waId),
    conversationId: candidate.id,
    contactId: contactId ?? undefined,
    matchedBy,
  };
}

function pickSingleCandidate(candidates: ConversationCandidate[]) {
  const sorted = candidates.sort(compareConversationLookupPriority);
  return sorted.length === 1 ? sorted[0] : null;
}

export async function resolveCampaignRecipientConversationTarget(
  prisma: Pick<PrismaClient, "conversation" | "contact">,
  params: {
    clientId: string;
    inputWaId: string;
  }
): Promise<CampaignRecipientConversationTarget> {
  const inputWaId = normalizeWaIdDigits(params.inputWaId);
  const lookup = buildWaIdLookup(inputWaId);
  const variants = Array.from(new Set([lookup.raw, lookup.canonical].filter(Boolean)));
  if (!inputWaId) {
    return emptyTarget(inputWaId, lookup.canonical, "not_found");
  }

  const exactMatches = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      anonymizedAt: null,
      OR: [{ waId: { in: variants } }, { waIdCanonical: { in: variants } }],
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });
  const exactCandidate = pickSingleCandidate(exactMatches);
  if (exactCandidate) {
    const matchedBy = variants.includes(exactCandidate.waId)
      ? "exact_conversation_waid"
      : "exact_conversation_canonical";
    const contact = await prisma.contact.findFirst({
      where: {
        clientId: params.clientId,
        OR: [{ waId: exactCandidate.waId }, { waId: exactCandidate.waIdCanonical ?? exactCandidate.waId }],
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    return toResolvedTarget(inputWaId, lookup.canonical, exactCandidate, matchedBy, contact?.id);
  }
  if (exactMatches.length > 1) {
    return emptyTarget(inputWaId, lookup.canonical, "ambiguous");
  }

  const brazilInputKey = getBrazilianNinthDigitKey(inputWaId);
  if (!brazilInputKey) {
    return emptyTarget(inputWaId, lookup.canonical, "not_found");
  }

  const possibleLengths = brazilInputKey.hasNinth ? [12] : [13];
  const suffix = brazilInputKey.subscriber;
  const candidates = await prisma.conversation.findMany({
    where: {
      clientId: params.clientId,
      deletedAt: null,
      anonymizedAt: null,
      OR: [{ waId: { endsWith: suffix } }, { waIdCanonical: { endsWith: suffix } }],
    },
    select: {
      id: true,
      waId: true,
      waIdCanonical: true,
      updatedAt: true,
      lastInboundAt: true,
      lastOutboundAt: true,
    },
  });
  const safeMatches = candidates.filter((candidate) => {
    const candidateValues = Array.from(
      new Set([candidate.waId, candidate.waIdCanonical ?? canonicalizeBrazilWaId(candidate.waId)])
    );
    return candidateValues.some(
      (value) =>
        possibleLengths.includes(normalizeWaIdDigits(value).length) &&
        hasSafeBrazilianNinthDigitMatch(inputWaId, value)
    );
  });
  const safeCandidate = pickSingleCandidate(safeMatches);
  if (!safeCandidate) {
    return emptyTarget(inputWaId, lookup.canonical, safeMatches.length > 1 ? "ambiguous" : "not_found");
  }
  const contact = await prisma.contact.findFirst({
    where: {
      clientId: params.clientId,
      OR: [{ waId: safeCandidate.waId }, { waId: safeCandidate.waIdCanonical ?? safeCandidate.waId }],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return toResolvedTarget(inputWaId, lookup.canonical, safeCandidate, "brazil_ninth_digit_safe", contact?.id);
}

export function summarizeCampaignRecipientResolution(target: CampaignRecipientConversationTarget) {
  return {
    resolved: target.resolved,
    reason: target.reason,
    matchedBy: target.matchedBy,
    conversationId: target.conversationId ?? null,
    contactId: target.contactId ?? null,
    inputLast4: target.inputWaId.slice(-4),
    inputLength: target.inputWaId.length,
    winningLast4: target.winningWaId.slice(-4),
    winningLength: target.winningWaId.length,
  };
}
