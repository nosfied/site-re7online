import { TEMPLATE_IMAGE_MAX_BYTES, TEMPLATE_VIDEO_MAX_BYTES, TemplateMediaKind, formatTemplateMediaBytes } from "@/lib/templateMediaUx";

export default function TemplateMediaRequirements({ kind }: { kind: TemplateMediaKind }) {
  return (
    <div className="rounded-lg border border-sky-300/20 bg-sky-950/25 p-3 text-xs text-white/70" aria-label="Requisitos da mídia">
      <p className="font-semibold text-white/85">Requisitos obrigatórios</p>
      {kind === "IMAGE" ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>JPEG ou PNG, até {formatTemplateMediaBytes(TEMPLATE_IMAGE_MAX_BYTES)}.</li>
          <li>Imagem em 8 bits, nos modos RGB ou RGBA.</li>
        </ul>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>MP4 ou 3GPP, até {formatTemplateMediaBytes(TEMPLATE_VIDEO_MAX_BYTES)}.</li>
          <li>Vídeo H.264; áudio AAC com no máximo uma faixa, ou sem áudio.</li>
        </ul>
      )}
      <p className="mt-3 font-semibold text-white/85">Recomendação visual</p>
      <p className="mt-1">Prefira formato horizontal próximo de 1,91:1, por exemplo 1200 × 628 px. Mantenha texto, logotipos e elementos importantes afastados das bordas.</p>
      <p className="mt-2 text-amber-100/85">O WhatsApp pode adaptar ou recortar a apresentação conforme o dispositivo. A compatibilidade de cor, codecs e faixas é confirmada definitivamente pela Meta.</p>
    </div>
  );
}
