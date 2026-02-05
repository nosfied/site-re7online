export type TemplateConfig = {
  key: string;
  name: string;
  language: string;
};

const TEMPLATE_MAP: Record<string, TemplateConfig> = {
  pricing: { key: "pricing", name: "re7_pricing_v1", language: "pt_BR" },
  followup: { key: "followup", name: "re7_followup_v1", language: "pt_BR" },
};

export function resolveTemplateKey(key: string | undefined): TemplateConfig | null {
  if (!key) {
    return null;
  }
  return TEMPLATE_MAP[key.toLowerCase()] ?? null;
}

export type TemplateCommand = {
  templateKey: string;
  targetWaId?: string;
};

export function parseTemplateCommand(input: string | null): TemplateCommand | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith("#template")) {
    return null;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { templateKey: "" };
  }
  const templateKey = parts[1];
  const targetWaId = parts[2];
  return { templateKey, targetWaId };
}
