export const TEMPLATE_IMAGE_MAX_BYTES = 5_000_000;
export const TEMPLATE_VIDEO_MAX_BYTES = 16_000_000;
export const TEMPLATE_MEDIA_RECOMMENDED_RATIO = 1.91;

export type TemplateMediaKind = "IMAGE" | "VIDEO";

export type TemplateMediaMetadata = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number | null;
  ratio: number;
  ratioWarning: boolean;
};

const allowed = {
  IMAGE: { mime: ["image/jpeg", "image/png"], extensions: ["jpg", "jpeg", "png"], limit: TEMPLATE_IMAGE_MAX_BYTES },
  VIDEO: { mime: ["video/mp4", "video/3gpp"], extensions: ["mp4", "3gp", "3gpp"], limit: TEMPLATE_VIDEO_MAX_BYTES },
} as const;

export function sanitizeTemplateMediaFileName(value: string) {
  const leaf = value.split(/[\\/]/).pop() ?? "arquivo";
  return leaf.replace(/[\u0000-\u001f\u007f]+/g, "").replace(/[^\p{L}\p{N} ._()-]+/gu, "_").slice(0, 140) || "arquivo";
}

export function formatTemplateMediaBytes(value: number) {
  if (value < 1_000) return `${value} bytes`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  return `${(value / 1_000_000).toFixed(2)} MB`;
}

export function validateTemplateMediaFile(file: Pick<File, "name" | "type" | "size">, kind: TemplateMediaKind) {
  const rules = allowed[kind];
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > rules.limit) return `O arquivo excede o limite de ${formatTemplateMediaBytes(rules.limit)}.`;
  const mime = file.type.trim().toLowerCase();
  if (!(rules.mime as readonly string[]).includes(mime)) {
    return kind === "IMAGE" ? "Selecione uma imagem JPEG ou PNG." : "Selecione um vídeo MP4 ou 3GPP.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(rules.extensions as readonly string[]).includes(extension)) {
    return kind === "IMAGE" ? "A extensão deve ser .jpg, .jpeg ou .png." : "A extensão deve ser .mp4, .3gp ou .3gpp.";
  }
  const matchingExtension = mime === "image/jpeg"
    ? ["jpg", "jpeg"].includes(extension)
    : mime === "image/png"
      ? extension === "png"
      : mime === "video/mp4"
        ? extension === "mp4"
        : ["3gp", "3gpp"].includes(extension);
  return matchingExtension ? null : "O tipo informado pelo navegador não corresponde à extensão do arquivo.";
}

export function buildTemplateMediaMetadata(file: File, width: number, height: number, durationSeconds: number | null): TemplateMediaMetadata {
  const ratio = width > 0 && height > 0 ? width / height : 0;
  return {
    fileName: sanitizeTemplateMediaFileName(file.name),
    mimeType: file.type,
    sizeBytes: file.size,
    width,
    height,
    durationSeconds,
    ratio,
    ratioWarning: ratio > 0 && Math.abs(ratio - TEMPLATE_MEDIA_RECOMMENDED_RATIO) / TEMPLATE_MEDIA_RECOMMENDED_RATIO > 0.18,
  };
}

export function inspectTemplateMediaFile(file: File, kind: TemplateMediaKind): Promise<TemplateMediaMetadata> {
  const error = validateTemplateMediaFile(file, kind);
  if (error) return Promise.reject(new Error(error));
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    if (kind === "IMAGE") {
      const image = new Image();
      image.onload = () => { const result = buildTemplateMediaMetadata(file, image.naturalWidth, image.naturalHeight, null); cleanup(); resolve(result); };
      image.onerror = () => { cleanup(); reject(new Error("Não foi possível ler os metadados da imagem.")); };
      image.src = objectUrl;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { const result = buildTemplateMediaMetadata(file, video.videoWidth, video.videoHeight, Number.isFinite(video.duration) ? video.duration : null); cleanup(); resolve(result); };
    video.onerror = () => { cleanup(); reject(new Error("Não foi possível ler os metadados do vídeo.")); };
    video.src = objectUrl;
  });
}
