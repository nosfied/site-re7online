"use client";

import { TemplateMediaKind } from "@/lib/templateMediaUx";

export default function TemplateMessageMediaHeader({ kind, url, loading = false, error = null }: {
  kind: TemplateMediaKind;
  url: string | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="mb-2 flex min-h-24 items-center justify-center overflow-hidden rounded-lg bg-slate-200/70" aria-label="Cabeçalho de mídia da mensagem">
      {loading ? <p className="px-3 text-xs text-slate-600" role="status">Carregando cabeçalho…</p> : null}
      {!loading && error ? <p className="px-3 text-xs text-rose-700" role="alert">Cabeçalho indisponível.</p> : null}
      {!loading && !error && !url ? <p className="px-3 text-xs text-slate-500">Cabeçalho ainda não disponível.</p> : null}
      {!loading && !error && url && kind === "IMAGE" ? (
        // Blob URLs are authenticated and ephemeral; do not send them to the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Cabeçalho de imagem da mensagem" className="max-h-44 w-full object-contain" />
      ) : null}
      {!loading && !error && url && kind === "VIDEO" ? (
        <video src={url} controls preload="metadata" className="max-h-44 w-full object-contain" aria-label="Cabeçalho de vídeo da mensagem" />
      ) : null}
    </div>
  );
}
