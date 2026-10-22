"use client";

import { TemplateMediaKind, TemplateMediaMetadata, formatTemplateMediaBytes } from "@/lib/templateMediaUx";

export default function TemplateMediaInspectionPanel({ kind, url, metadata, loading = false, error = null, className = "" }: {
  kind: TemplateMediaKind;
  url: string | null;
  metadata?: TemplateMediaMetadata | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={`grid gap-2 rounded-lg bg-slate-900 p-2 text-white ${className}`} aria-label="Prévia da mídia">
      <p className="text-xs font-semibold text-white/80">Arquivo completo — sem corte</p>
      <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 p-2">
        {loading ? <p className="text-xs text-white/60" role="status">Carregando prévia autenticada…</p> : null}
        {!loading && error ? <p className="text-xs text-rose-200" role="alert">{error}</p> : null}
        {!loading && !error && !url ? <p className="text-xs text-white/50">Mídia indisponível para prévia.</p> : null}
        {!loading && !error && url && kind === "IMAGE" ? (
          // Blob URLs are authenticated and ephemeral; do not send them to the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Arquivo completo selecionado para o cabeçalho" className="max-h-72 max-w-full object-contain" />
        ) : null}
        {!loading && !error && url && kind === "VIDEO" ? (
          <video src={url} controls preload="metadata" className="max-h-72 max-w-full object-contain" aria-label="Arquivo completo de vídeo selecionado para o cabeçalho" />
        ) : null}
      </div>
      {metadata ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/65 sm:grid-cols-3">
          {metadata.fileName ? <div><dt className="font-semibold text-white/80">Arquivo</dt><dd className="break-all">{metadata.fileName}</dd></div> : null}
          {metadata.mimeType ? <div><dt className="font-semibold text-white/80">Tipo</dt><dd>{metadata.mimeType}</dd></div> : null}
          {metadata.sizeBytes !== null ? <div><dt className="font-semibold text-white/80">Tamanho</dt><dd>{formatTemplateMediaBytes(metadata.sizeBytes)}</dd></div> : null}
          <div><dt className="font-semibold text-white/80">Dimensões</dt><dd>{metadata.width} × {metadata.height} px</dd></div>
          <div><dt className="font-semibold text-white/80">Proporção</dt><dd>{metadata.ratio ? `${metadata.ratio.toFixed(2)}:1` : "Indisponível"}</dd></div>
          {metadata.durationSeconds !== null ? <div><dt className="font-semibold text-white/80">Duração</dt><dd>{metadata.durationSeconds.toFixed(1)} s</dd></div> : null}
        </dl>
      ) : null}
      {metadata?.ratioWarning ? <p className="text-xs text-amber-200">A proporção está distante da recomendação de 1,91:1. O arquivo é aceito, mas pode sofrer maior adaptação visual.</p> : null}
    </div>
  );
}
