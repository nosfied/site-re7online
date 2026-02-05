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
  const match = /^#template\s+([A-Za-z0-9_-]+)(?:\s+([0-9]+))?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const templateKey = match[1].toLowerCase();
  const targetWaId = match[2];
  if (targetWaId && targetWaId.length < 10) {
    return null;
  }
  return { templateKey, targetWaId };
}
