import type { Prisma, PrismaClient } from "@prisma/client";
import {
  isWhatsappTemplateCategoryAllowed,
  normalizeWhatsappTemplateCategory,
  resolveWhatsappTemplatePolicySettings,
  type WhatsappTemplateCategory,
} from "../config/tenantOperationalConfig.js";

export const WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED = "template_category_not_allowed";
export const WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED_LABEL = "Categoria não habilitada para este tenant";

type TemplateCategoryPolicyPrisma = PrismaClient | Prisma.TransactionClient;

export type WhatsappTemplateCategoryPolicyDecision =
  | {
      allowed: true;
      category: WhatsappTemplateCategory | null;
      unrestricted: boolean;
      allowedCategories: WhatsappTemplateCategory[] | null;
      source: "db" | "json_fallback";
    }
  | {
      allowed: false;
      category: WhatsappTemplateCategory | null;
      unrestricted: false;
      allowedCategories: WhatsappTemplateCategory[];
      source: "db" | "json_fallback";
      reason: typeof WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED;
      label: typeof WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED_LABEL;
    };

export async function isWhatsappTemplateCategoryAllowedForTenant(params: {
  prisma: TemplateCategoryPolicyPrisma;
  clientId: string;
  effectiveCategory: unknown;
}): Promise<WhatsappTemplateCategoryPolicyDecision> {
  const resolved = await resolveWhatsappTemplatePolicySettings({
    prisma: params.prisma,
    clientId: params.clientId,
  });
  const category = normalizeWhatsappTemplateCategory(params.effectiveCategory);
  const allowedCategories = resolved.settings.allowedCategories;
  if (isWhatsappTemplateCategoryAllowed(resolved.settings, category)) {
    return {
      allowed: true,
      category,
      unrestricted: resolved.unrestricted,
      allowedCategories: Array.isArray(allowedCategories) ? allowedCategories : null,
      source: resolved.source,
    };
  }
  return {
    allowed: false,
    category,
    unrestricted: false,
    allowedCategories: allowedCategories ?? [],
    source: resolved.source,
    reason: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED,
    label: WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED_LABEL,
  };
}

export function getWhatsappTemplateCategoryPolicyBlockLabel() {
  return WHATSAPP_TEMPLATE_CATEGORY_NOT_ALLOWED_LABEL;
}
