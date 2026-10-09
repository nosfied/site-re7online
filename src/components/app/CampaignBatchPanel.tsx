"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { CampaignItem } from "@/lib/whatsappAdminApi";
import { formatDateTime } from "@/lib/whatsappAdminApi";
import { getCampaignUserFacingError } from "@/lib/campaignDrafts";

type Props = {
  campaign: CampaignItem;
  controllerId: string | null;
  readDetail: (id: string, signal: AbortSignal) => Promise<CampaignItem>;
  peekDetail: (id: string) => CampaignItem | null;
  detailVersion: (id: string) => string | null;
  openById: (id: string) => void;
  onUnauthorized: () => void;
  renderResults: (items: NonNullable<CampaignItem["messagesMetaStatus"]>) => ReactNode;
  renderActions: () => ReactNode;
  statusLabel: (status: string) => string;
  queueLabel: (status: string | null, position: number | null) => string;
  sourceLabel: (source: string) => string;
};

// Only fields visible in the existing authorized detail are compared.
function differences(common: CampaignItem, lot: CampaignItem) {
  const fields: Array<[string, unknown, unknown]> = [
    ["Modelo", common.templateName, lot.templateName],
    ["Destino do retorno", common.draftSeed?.returnDestination, lot.draftSeed?.returnDestination],
    ["Variáveis", common.draftSeed?.templateVariableMappings, lot.draftSeed?.templateVariableMappings],
    ["Parâmetros", common.draftSeed?.templateParams, lot.draftSeed?.templateParams],
  ];
  return fields.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
}

export default function CampaignBatchPanel(props: Props) {
  const { campaign, readDetail, peekDetail, onUnauthorized } = props;
  const batch = campaign.executionBatch!;
  const isChild = batch.chunks.some(chunk => chunk.campaignId === campaign.id);
  const [aggregateOpen, setAggregateOpen] = useState(!isChild);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; version: string; reader: Props["readDetail"]; detail?: CampaignItem; error?: string } | null>(null);
  const cache = useRef(new Map<string, { version: string; reader: Props["readDetail"]; detail: CampaignItem }>());
  // Includes chunk/status/queue and provider result changes, even without updatedAt.
  const version = JSON.stringify([campaign.id, campaign.clientId, campaign.updatedAt, batch, campaign.templateName, campaign.draftSeed, expanded ? props.detailVersion(expanded) : null]);
  const current = loaded?.id === expanded && loaded.version === version && loaded.reader === readDetail ? loaded : null;

  useEffect(() => {
    if (!expanded || !batch.chunks.some(chunk => chunk.campaignId === expanded)) return;
    const controller = new AbortController();

    const chunk = batch.chunks.find(item => item.campaignId === expanded)!;
    const valid = (detail: CampaignItem) => detail.id === expanded && detail.clientId === campaign.clientId &&
      detail.executionBatch?.id === batch.id && detail.executionBatch.chunks.some(item => item.campaignId === expanded);
    const apply = (detail: CampaignItem) => {
      if (controller.signal.aborted) return;
      if (!valid(detail)) throw new Error("O vínculo do lote com o conjunto não foi confirmado.");
      cache.current.set(expanded, { version, reader: readDetail, detail });
      setLoaded({ id: expanded, version, reader: readDetail, detail });
    };
    const cached = cache.current.get(expanded);
    const fromCache = cached?.version === version && cached.reader === readDetail ? cached.detail : null;
    // The current selected child is already an authorized, fresh detail.
    const remembered = expanded === campaign.id ? campaign : peekDetail(expanded);
    const reusable = fromCache ?? (remembered?.status === chunk.status && JSON.stringify(remembered.executionBatch) === JSON.stringify(batch) &&
      remembered.sentCount === chunk.sentCount && remembered.blockedCount === chunk.blockedCount &&
      remembered.totalRecipients === chunk.totalRecipients && valid(remembered) ? remembered : null);
    void (reusable ? Promise.resolve(reusable) : readDetail(expanded, controller.signal)).then(apply).catch(error => {
      if (controller.signal.aborted) return;
      if ((error as { status?: number }).status === 401) onUnauthorized();
      setLoaded({ id: expanded, version, reader: readDetail,
        error: getCampaignUserFacingError(error, "Não foi possível carregar este lote.") });
    });
    return () => controller.abort();
  }, [expanded, version, readDetail, peekDetail, retry, onUnauthorized, campaign, batch]);

  const total = batch.progress.totalRecipients;
  // Preserve the existing operational progress contract, distinct from delivery.
  const processed = batch.progress.sentCount + batch.progress.blockedCount;
  const pct = total ? Math.min(100, Math.round(processed / total * 100)) : 0;
  return (
    <section className="min-w-0 rounded-md border border-cyan-300/25 bg-cyan-950/20 p-3" aria-label="Conjunto e lotes">
      {isChild ? (
        <nav aria-label="Contexto do lote" className="mb-3 flex flex-wrap gap-3 text-sm">
          {props.controllerId ? <button type="button" className="text-sky-200 underline" onClick={() => props.openById(props.controllerId!)}>Abrir conjunto por ID</button> : null}
          <a className="text-sky-200 underline" href={`#batch-summary-${batch.id}`} onClick={() => setAggregateOpen(true)}>Ver resumo do conjunto</a>
          <span className="text-white/65">Detalhe próprio do lote selecionado</span>
        </nav>
      ) : null}
      <details open={aggregateOpen} onToggle={event => setAggregateOpen(event.currentTarget.open)} id={`batch-summary-${batch.id}`}>
        <summary className="cursor-pointer rounded px-1 py-2 font-semibold text-cyan-100 focus:outline-none focus:ring-2 focus:ring-re7-sky/70">Conjunto de campanhas — {batch.name}</summary>
        <div className="grid min-w-0 gap-3 pt-2">
          <p className="text-xs text-cyan-100/75">{props.sourceLabel(batch.sourceMode)} · {batch.chunkCount} lote(s) · {props.statusLabel(batch.status)}</p>
          {isChild ? <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Totais do conjunto">
            <div><dt>Destinatários</dt><dd>{total}</dd></div><div><dt>Processados</dt><dd>{batch.progress.sentCount}</dd></div>
            <div><dt>Bloqueados</dt><dd>{batch.progress.blockedCount}</dd></div><div><dt>Pendentes</dt><dd>{batch.progress.pendingCount}</dd></div>
          </dl> : null}
          {props.renderActions()}
          <p className="text-xs text-white/70">Lotes concluídos: {batch.progress.completedChunks}/{batch.chunkCount} · Progresso: {pct}%</p>
          <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-300 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
          {batch.failureReason ? <p className="rounded bg-amber-900/20 p-2 text-amber-100">{batch.failureReason}</p> : null}
          <div className="overflow-x-auto rounded border border-white/10">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-white/10 text-left text-xs uppercase text-white/65"><tr><th className="p-2">Lote</th><th className="p-2">Estado / fila</th><th className="p-2">Resultados</th><th className="p-2">Acesso</th></tr></thead>
              <tbody>{batch.chunks.map(chunk => <Fragment key={chunk.campaignId}>
                <tr className="border-t border-white/10">
                  <td className="p-2"><button type="button" className="rounded text-left text-sky-200 focus:outline-none focus:ring-2 focus:ring-re7-sky/70" aria-expanded={expanded === chunk.campaignId} aria-controls={`lot-${chunk.campaignId}`} onClick={() => setExpanded(id => id === chunk.campaignId ? null : chunk.campaignId)}>
                    {expanded === chunk.campaignId ? "▾" : "▸"} {chunk.chunkIndex}/{batch.chunkCount} — {chunk.name}
                  </button></td>
                  <td className="p-2">{props.statusLabel(chunk.status)}<br /><span className="text-xs text-white/65">{props.queueLabel(chunk.queueStatus, chunk.queuePosition)}</span></td>
                  <td className="p-2">{chunk.totalRecipients} destinatário(s) · {chunk.sentCount} processado(s) · {chunk.blockedCount} bloqueado(s)</td>
                  <td className="p-2"><button type="button" className="text-sky-200 underline" aria-label={`Abrir lote por ID ${chunk.chunkIndex}: ${chunk.name}`} onClick={() => props.openById(chunk.campaignId)}>Abrir lote por ID</button></td>
                </tr>
                {expanded === chunk.campaignId ? <tr id={`lot-${chunk.campaignId}`}><td colSpan={4} className="bg-black/15 p-3">
                  <div aria-label={`Dados exclusivos do lote ${chunk.chunkIndex}`} className="grid min-w-0 gap-3">
                    <p className="text-xs text-white/70">Início: {chunk.startedAt ? formatDateTime(chunk.startedAt) : "Aguardando"} · Fim: {chunk.finishedAt ? formatDateTime(chunk.finishedAt) : "Não concluído"}</p>
                    {chunk.failureReason ? <p className="text-amber-100">{chunk.failureReason}</p> : null}
                    {!current ? <p role="status">Carregando lote...</p> : current.error ? <div role="alert"><p>{current.error}</p><button type="button" className="mt-2 text-sky-200 underline" onClick={() => { cache.current.delete(expanded!); setLoaded(null); setRetry(n => n + 1); }}>Tentar leitura novamente</button></div> : current.detail ? <>
                      {differences(campaign, current.detail).map(([label, , value]) => <div key={label}><p className="text-xs font-semibold text-white/70">{label} diferente do contexto comum</p><pre className="whitespace-pre-wrap break-all text-xs">{typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)}</pre></div>)}
                      {current.detail.executionQueue ? <p className="text-xs text-white/70">Solicitado: {formatDateTime(current.detail.executionQueue.requestedAt)} · Elegível: {formatDateTime(current.detail.executionQueue.eligibleAt)}</p> : null}
                      {props.renderResults(current.detail.messagesMetaStatus ?? [])}
                    </> : null}
                    <p className="text-xs text-white/65">Ações individuais disponíveis em “Abrir lote por ID”. As ações do conjunto permanecem no resumo.</p>
                  </div>
                </td></tr> : null}
              </Fragment>)}</tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
