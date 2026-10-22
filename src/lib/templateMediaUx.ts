export const TEMPLATE_IMAGE_MAX_BYTES = 5_000_000;
export const TEMPLATE_VIDEO_MAX_BYTES = 16_000_000;
export const TEMPLATE_MEDIA_RECOMMENDED_RATIO = 1.91;

export type TemplateMediaKind = "IMAGE" | "VIDEO";

export type TemplateMediaMetadata = {
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
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

export function buildTemplateMediaMetadata(file: Pick<Blob, "type" | "size"> & { name?: string | null }, width: number, height: number, durationSeconds: number | null): TemplateMediaMetadata {
  const ratio = width > 0 && height > 0 ? width / height : 0;
  return {
    fileName: file.name ? sanitizeTemplateMediaFileName(file.name) : null,
    mimeType: file.type || null,
    sizeBytes: Number.isFinite(file.size) ? file.size : null,
    width,
    height,
    durationSeconds,
    ratio,
    ratioWarning: ratio > 0 && Math.abs(ratio - TEMPLATE_MEDIA_RECOMMENDED_RATIO) / TEMPLATE_MEDIA_RECOMMENDED_RATIO > 0.18,
  };
}

type InspectionElement = {
  src: string;
  onload?: ((this: GlobalEventHandlers, event: Event) => unknown) | null;
  onerror: ((this: GlobalEventHandlers, event: Event) => unknown) | null;
  onloadedmetadata?: ((this: GlobalEventHandlers, event: Event) => unknown) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
  duration?: number;
  preload?: string;
  pause?: () => void;
  removeAttribute?: (name: string) => void;
  load?: () => void;
};

export type TemplateMediaInspectionSurface = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createImage: () => InspectionElement;
  createVideo: () => InspectionElement;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

const browserInspectionSurface = (): TemplateMediaInspectionSurface => ({
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createImage: () => new Image(),
  createVideo: () => document.createElement("video"),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
});

export class TemplateMediaInspectionCoordinator {
  private controller: AbortController | null = null;
  private generation = 0;

  begin() {
    this.cancel();
    this.controller = new AbortController();
    const generation = ++this.generation;
    return { signal: this.controller.signal, generation };
  }

  isCurrent(generation: number) {
    return generation === this.generation && !this.controller?.signal.aborted;
  }

  finish(generation: number) {
    if (generation === this.generation) this.controller = null;
  }

  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.generation += 1;
  }
}

export function takeTemplateMediaFileAndReset(input: Pick<HTMLInputElement, "files" | "value">) {
  const selected = input.files?.[0] ?? null;
  input.value = "";
  return selected;
}

export function inspectTemplateMediaBlob(
  blob: Blob,
  kind: TemplateMediaKind,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    fileName?: string | null;
    surface?: TemplateMediaInspectionSurface;
  } = {}
): Promise<TemplateMediaMetadata> {
  const surface = options.surface ?? browserInspectionSurface();
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (options.signal?.aborted) return Promise.reject(new DOMException("Inspeção cancelada.", "AbortError"));
  const objectUrl = surface.createObjectURL(blob);
  const source = { type: blob.type, size: blob.size, name: options.fileName ?? null };
  return new Promise((resolve, reject) => {
    const element = kind === "IMAGE" ? surface.createImage() : surface.createVideo();
    let settled = false;
    const cleanup = () => {
      element.onload = null;
      element.onerror = null;
      element.onloadedmetadata = null;
      element.pause?.();
      element.removeAttribute?.("src");
      element.src = "";
      element.load?.();
      options.signal?.removeEventListener("abort", onAbort);
      surface.clearTimeout(timeout);
      surface.revokeObjectURL(objectUrl);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => settle(() => reject(new DOMException("Inspeção cancelada.", "AbortError")));
    const timeout = surface.setTimeout(
      () => settle(() => reject(new Error("A inspeção da mídia excedeu o tempo limite."))),
      timeoutMs
    );
    options.signal?.addEventListener("abort", onAbort, { once: true });
    element.onerror = () => settle(() => reject(new Error(kind === "IMAGE" ? "Não foi possível ler os metadados da imagem." : "Não foi possível ler os metadados do vídeo.")));
    if (kind === "IMAGE") {
      element.onload = () => {
        const metadata = buildTemplateMediaMetadata(source, element.naturalWidth ?? 0, element.naturalHeight ?? 0, null);
        settle(() => resolve(metadata));
      };
    } else {
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        const metadata = buildTemplateMediaMetadata(source, element.videoWidth ?? 0, element.videoHeight ?? 0, Number.isFinite(element.duration) ? element.duration ?? null : null);
        settle(() => resolve(metadata));
      };
    }
    element.src = objectUrl;
  });
}

export function inspectTemplateMediaFile(file: File, kind: TemplateMediaKind, options: { signal?: AbortSignal; timeoutMs?: number; surface?: TemplateMediaInspectionSurface } = {}): Promise<TemplateMediaMetadata> {
  const error = validateTemplateMediaFile(file, kind);
  if (error) return Promise.reject(new Error(error));
  return inspectTemplateMediaBlob(file, kind, { ...options, fileName: file.name });
}
