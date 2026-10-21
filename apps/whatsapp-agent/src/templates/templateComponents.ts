export const TEMPLATE_HEADER_TYPES = ["NONE", "IMAGE", "VIDEO"] as const;
export type TemplateHeaderType = (typeof TEMPLATE_HEADER_TYPES)[number];

export type TemplateMediaReference = {
  assetId: string;
  kind: "IMAGE" | "VIDEO";
  sha256: string;
};

export type CampaignTemplateComponents = Array<
  | {
      type: "body";
      parameters: Array<{ type: "text"; text: string }>;
    }
  | {
      type: "header";
      parameters: Array<
        | { type: "image"; image: { id?: string; link?: string } }
        | { type: "video"; video: { id?: string; link?: string } }
      >;
    }
>;

export type CanonicalTemplateComponents = {
  version: 1;
  header: { type: TemplateHeaderType; exampleMediaId: string | null };
  body: { text: string };
  providerComponents?: unknown[];
};

export function normalizeTemplateHeaderType(value: unknown): TemplateHeaderType {
  const normalized = String(value ?? "NONE").trim().toUpperCase();
  return normalized === "IMAGE" || normalized === "VIDEO" ? normalized : "NONE";
}

export function buildCanonicalTemplateComponents(params: {
  body: string;
  headerType?: unknown;
  exampleMediaId?: unknown;
  providerComponents?: unknown;
}): CanonicalTemplateComponents {
  const headerType = normalizeTemplateHeaderType(params.headerType);
  const exampleMediaId =
    headerType === "NONE" || typeof params.exampleMediaId !== "string" || !params.exampleMediaId.trim()
      ? null
      : params.exampleMediaId.trim();
  return {
    version: 1,
    header: { type: headerType, exampleMediaId },
    body: { text: String(params.body ?? "").trim() },
    ...(Array.isArray(params.providerComponents)
      ? { providerComponents: params.providerComponents }
      : {}),
  };
}

export function readCanonicalTemplateComponents(
  value: unknown,
  fallback: { body: string; headerType?: unknown; exampleMediaId?: unknown }
): CanonicalTemplateComponents {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildCanonicalTemplateComponents(fallback);
  }
  const raw = value as Record<string, unknown>;
  const header = raw.header && typeof raw.header === "object" && !Array.isArray(raw.header)
    ? (raw.header as Record<string, unknown>)
    : null;
  const body = raw.body && typeof raw.body === "object" && !Array.isArray(raw.body)
    ? (raw.body as Record<string, unknown>)
    : null;
  return buildCanonicalTemplateComponents({
    body: typeof body?.text === "string" ? body.text : fallback.body,
    headerType: header?.type ?? fallback.headerType,
    exampleMediaId: header?.exampleMediaId ?? fallback.exampleMediaId,
    providerComponents: raw.providerComponents,
  });
}

export function mergeProviderTemplateComponents(params: {
  current: unknown;
  fallback: { body: string; headerType?: unknown; exampleMediaId?: unknown };
  providerComponents: unknown;
}) {
  const current = readCanonicalTemplateComponents(params.current, params.fallback);
  if (!Array.isArray(params.providerComponents)) return current;
  const providerHeader = params.providerComponents.find((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) return false;
    return String((component as Record<string, unknown>).type ?? "").toUpperCase() === "HEADER";
  });
  const providerBody = params.providerComponents.find((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) return false;
    return String((component as Record<string, unknown>).type ?? "").toUpperCase() === "BODY";
  });
  const headerType = providerHeader && typeof providerHeader === "object" && !Array.isArray(providerHeader)
    ? normalizeTemplateHeaderType((providerHeader as Record<string, unknown>).format)
    : current.header.type;
  const bodyText = providerBody && typeof providerBody === "object" && !Array.isArray(providerBody)
    ? String((providerBody as Record<string, unknown>).text ?? current.body.text)
    : current.body.text;
  return buildCanonicalTemplateComponents({
    body: bodyText,
    headerType,
    exampleMediaId: current.header.exampleMediaId,
    providerComponents: params.providerComponents,
  });
}

export function withHeaderMediaComponent(
  bodyComponents: CampaignTemplateComponents | undefined,
  media: { kind: "IMAGE" | "VIDEO"; mediaId: string }
): CampaignTemplateComponents {
  const type = media.kind.toLowerCase() as "image" | "video";
  const header = type === "image"
    ? { type: "header" as const, parameters: [{ type: "image" as const, image: { id: media.mediaId } }] }
    : { type: "header" as const, parameters: [{ type: "video" as const, video: { id: media.mediaId } }] };
  return [header, ...(bodyComponents ?? []).filter((component) => component.type !== "header")];
}

export function assertTemplateMediaCompatibility(params: {
  headerType: unknown;
  mediaKind?: unknown;
  mediaAssetId?: unknown;
}) {
  const headerType = normalizeTemplateHeaderType(params.headerType);
  const mediaKind = normalizeTemplateHeaderType(params.mediaKind);
  const mediaAssetId = typeof params.mediaAssetId === "string" ? params.mediaAssetId.trim() : "";
  if (headerType === "NONE" && mediaAssetId) throw new Error("template_media_not_allowed");
  if (headerType !== "NONE" && !mediaAssetId) throw new Error("template_media_required");
  if (headerType !== "NONE" && mediaKind !== headerType) throw new Error("template_media_kind_mismatch");
  return headerType;
}
