"use client";

import TemplateMediaRequirements from "@/components/app/TemplateMediaRequirements";
import { TemplateMediaKind } from "@/lib/templateMediaUx";

const DETAILS_ID = "campaign-media-guidance-details";

function GuidanceContent({ kind }: { kind: TemplateMediaKind }) {
  return (
    <div className="grid gap-2">
      <TemplateMediaRequirements kind={kind} />
      <p className="text-xs text-white/70">
        Use mídia coerente com o texto e a categoria do modelo. Uma promoção exige modelo de marketing;
        a aprovação da mídia de exemplo não autoriza conteúdo promocional em um modelo de utilidade.
        Mídia já carregada permanece preservada se a criação for suspensa.
      </p>
    </div>
  );
}

export default function CampaignMediaGuidance({ kind, compact, expanded, onToggle }: {
  kind: TemplateMediaKind;
  compact: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!compact) {
    return (
      <div className="mt-3" data-campaign-media-guidance="primary">
        <GuidanceContent kind={kind} />
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2" data-campaign-media-guidance="compact">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={DETAILS_ID}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-xs text-white/60 hover:text-white/85 focus:outline-none focus:ring-2 focus:ring-re7-sky/70"
      >
        <span>Formatos, tamanho e recomendações</span>
        <span aria-hidden="true" className="shrink-0 text-white/45">{expanded ? "Ocultar" : "Ver"}</span>
      </button>
      {expanded ? (
        <div id={DETAILS_ID} className="mt-2">
          <GuidanceContent kind={kind} />
        </div>
      ) : null}
    </div>
  );
}
