"use client";

import { takeTemplateMediaFileAndReset, TemplateMediaKind } from "@/lib/templateMediaUx";

export default function TemplateMediaFileInput({ kind, fileName, disabled = false, onSelect }: {
  kind: TemplateMediaKind;
  fileName?: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}) {
  return (
    <label className={`grid gap-2 rounded-lg border border-white/15 bg-re7-navy p-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-re7-sky/45"}`}>
      <input
        type="file"
        accept={kind === "IMAGE" ? "image/jpeg,image/png" : "video/mp4,video/3gpp"}
        onChange={(event) => onSelect(takeTemplateMediaFileAndReset(event.currentTarget))}
        disabled={disabled}
        className="sr-only"
      />
      <span className="inline-flex w-fit rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85">
        Selecionar arquivo
      </span>
      <span className="break-all text-xs text-white/60">{fileName || "Nenhum arquivo selecionado"}</span>
    </label>
  );
}
