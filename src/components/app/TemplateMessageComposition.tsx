"use client";

import TemplateMessageMediaHeader from "@/components/app/TemplateMessageMediaHeader";
import { TemplateMediaKind } from "@/lib/templateMediaUx";

export default function TemplateMessageComposition({ body, headerType = "NONE", mediaUrl = null, mediaLoading = false, mediaError = null, emptyText }: {
  body: string;
  headerType?: "NONE" | TemplateMediaKind;
  mediaUrl?: string | null;
  mediaLoading?: boolean;
  mediaError?: string | null;
  emptyText: string;
}) {
  return (
    <>
      <div className="rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm leading-relaxed text-slate-950 shadow">
        {headerType !== "NONE" ? <TemplateMessageMediaHeader kind={headerType} url={mediaUrl} loading={mediaLoading} error={mediaError} /> : null}
        {body ? <p className="whitespace-pre-wrap">{body}</p> : <p className="text-slate-600">{emptyText}</p>}
      </div>
      {headerType !== "NONE" ? <p className="mt-2 text-xs text-white/45">A apresentação pode variar conforme o dispositivo e o cliente do WhatsApp.</p> : null}
    </>
  );
}
