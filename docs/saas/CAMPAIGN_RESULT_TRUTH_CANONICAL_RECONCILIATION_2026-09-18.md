# Campaign Result Truth - Canonical Reconciliation - 2026-09-18

**Complemento cf55655b — fronteira cancelamento, local validado/NOT DEPLOYED.** [Provas e retorno compatível](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md). Aceitação registrada sem Outbound compatível mantém uncertain em qualquer estado, inclusive jobcancelled, lista/detalhe/lote. Cancelamento do executor não comprova ausência de submissão. Enquanto essa fronteira estiver incompleta, não produzir not_submitted para a execução. A ação histórica exige fonte/ausência de submissão e vínculos conferidos, sem usar estado cancelled isoladamente. Após cancelamento específico comprovado, retorno deve conservar leitores compatíveis com não enviados e negativa resume/claim; API2ed/frontend3227 antigos somente antes dessa ação. Sem SQL/contadores/provider produtivos alterados.


## Complemento local 12/10/2026 — suspensão e cancelamento sem submissão

[Implementação integrada para revisão](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md), NOT DEPLOYED. `executionState` é projeção dos jobs/leases do tenant, não estado persistido novo ou exposição do ledger: processamento exige lease completa e confirmação correspondente do tenant; pausa solicitada/efetiva, suspensão operacional e incerteza são distintos. Aceitação registrada sem Outbound compatível na mesma execução/messageId/MetaID exige revisão, mesmo com job parado. Detalhe, conjunto, lista e polling devem concordar sem inferir atividade apenas de `Campaign.status=sending`.

Cancelamento canônico comprovado e ausência de submissão/resultados explícitos podem produzir **not_submitted / cancelled_before_submission** no read model. Esse estado não é FAILED Meta, cobrança ou novo registro individual. Sem confirmação da saída/cancelamento, permanece pending/revisão; fallback histórico SENT é preservado somente por execução autorizada. `metaSummary.totalNotSubmitted` e `progress.notSubmittedCount` são separados de falhas/bloqueios/pending. Total materializado pode permanecer11 com seis entregas reportadas e cinco não enviadas; exclusões de seleção244 são evidência distinta. Nenhuma concordância de contadores valida a intenção do público.

A API/frontend anteriores são incompatíveis com apresentação após esse cancelamento: implantação conjunta e decisão histórica separada precedem qualquer apply. Rollback posterior exige leitor compatível; não desfazer dados nem fabricar falhas para adaptar o retorno. CRM/status monotônico/aliases/isolamento e obrigação CRM normal permanecem intactos.


**Result Truth — complemento local do fallback histórico (11/10), REVIEW READY / NOT DEPLOYED.** [Relatório e provas](../reviews/automation-freeform-window-release-af26/campaign-list-result-truth-20261011/README.md#complemento--fallback-histórico-por-execução-base99ad6b6b). Conjunto soma projeções canônicas por execução, sem reprojetar o resumo global:6 envios históricos sem resultados individuais +1delivered =7enviados, apenas1entrega reportada. Contador defasado de cada execução continua subordinado aos seus próprios resultados explícitos. Duas ordens dos filhos e falha/bloqueio PASS;10 provas de leitores PostgreSQL e4 cenários browser/polling PASS, Node20.20.0. Sem rebuild frontend, mudança worker ou consulta produtiva. Aceites e históricos anteriores preservados; produção aguarda revisão/decisão de implantação.


**Complemento local — 11/10/2026, listagem.** [Correção/provas para revisão](../reviews/automation-freeform-window-release-af26/campaign-list-result-truth-20261011/README.md). `buildCampaignListPayload` e detalhe compartilham fontes e projeção: vínculos explícitos por tenant, cada execução uma vez, sem depender de FAILED131026 ou recibo delivered. `sentCount` deriva dos sucessos do leitor canônico; `metaSummary` conserva resultados individuais e pending. Público previsto (`plannedRecipientCount`) e materializado (`materializedRecipientCount`) são distintos; lote total0 conserva `recipientCount` previsto, sem fabricar status Meta. Bloqueios de execução permanecem em `blockedCount`; exclusões do conjunto em `audienceBlockedCount`/metadados do batch, sem apagar ou reescrever contadores históricos. Detalhe retorna os mesmos contadores de primeiro nível, pois atualiza a linha da lista durante polling. Leituras em grupos100/páginas1000, sem detalhe por linha, paginação/RBAC/tenant preservados.10 provas PostgreSQL e4 cenários de navegador PASS; **delta API local, NOT DEPLOYED**. Não constitui novo aceite produtivo ou envio.

**Checkpoint produtivo — 11/10/2026.** [API preventiva implantada e aceite discriminado](../reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/API_ACCEPTANCE_2026-10-11.md): detalhes filho/controlador e conjunto mostram6delivered+5pending sem duplicar; lista conserva contadores próprios do controlador e não agrega o recibo de entrega. Aceite Result Truth integral da LISTA segue limitado por essa divergência P2, sem mudança de estado/dado nesta auditoria. Status e notas locais anteriores abaixo são históricos; aceitação não equivale a entrega reportada nem confirmação humana.

**Complemento local para revisão — 10/10/2026, recuperação .6.** [Implementação/provas](../reviews/automation-freeform-window-release-af26/position6-recovery-implementation-20261010/README.md). O leitor compartilhado preserva fatos explícitos do provider e, em `sending/scheduled`, representa posições do público conhecido ainda sem submissão/histórico como `pending/awaiting_processing`. Ausência não vira FAILED antes do término; posições explicitamente bloqueadas/falhadas e o fallback terminal mantêm seu contrato. Conjunto agrega filhos por vínculo explícito uma vez; não soma controller+filho. A disposição CRM histórica é restrita à [decisão exata .6](POSITION6_HISTORICAL_CRM_DISPOSITION_2026-10-10.md), sem alterar a obrigação CRM normal. Delta local, não implantado.

Status: P1 CORRECTIVE VALIDATED LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY.

## Chronology

The initial Campaign Result Truth implementation passed its synthetic regression
but production validation of Demo campaign
`0fb54d61-9f71-42ab-b89d-78ddb23bb694` exposed an uncovered persisted shape.
The intended `****6787` recipient was stored with 13 digits in the campaign seed
and its delivered `OutboundMessage` used the historical 12-digit form. Literal
projection identity did not converge them and added a false missing-history
failure. The production hard gate stopped further delivery validation.

The corrective remains a read-model change. It reuses
`buildCrmWhatsappIdentityCandidates`, the canonical identity primitive already
used by Contact resolution, CRM upsert and Identity P1. Campaign seed recipients,
real outbound attempts and blocked-result evidence are associated by candidate
intersection, scoped to the campaign tenant. No campaign-specific phone rule,
historical rewrite, schema change or migration was added.

## Projection Contract

Conjuntos agregam as projeções canônicas individuais por vínculo explícito e tenant, uma vez por execução. A autorização de fallback histórico é avaliada por execução: resultados explícitos de outro filho não a revogam. Resultados explícitos prevalecem sobre contadores defasados da própria execução. `metaSummary` conserva apenas os estados individuais; fallback de `sentCount` não cria Outbound, DELIVERED/READ ou confirmação humana. Público previsto e materializado e exclusões de seleção mantêm os contratos acima.


- one current summary row is rendered per canonical campaign recipient;
- real attempts remain persisted and inspectable; multiple attempts are not
  deleted or rewritten;
- the best current outcome is selected only after attempts are associated with
  the canonical recipient;
- a missing-history fallback is created only when no canonically matching real
  attempt or result evidence exists;
- blocked-before-provider remains `blocked`, not technical `failed`;
- authorized same-tenant Campaign Detail keeps full-phone visibility; logs,
  docs and evidence stay masked.

## Real Production Shape Replay

A read-only replay used the actual persisted seed, outbound and import-blocked
records. It made no provider call and no database write:

- seed recipients: 2;
- real outbound attempts: 1;
- import-blocked events: 1;
- `****6787`: seed 13 digits, outbound 12 digits, canonical match, delivered;
- `****9614`: blocked by `identity_conflict`, zero provider attempts;
- visible rows: 2;
- total 2, delivered 1, blocked 1, pending 0, technical failures 0;
- business label: `Entrega parcial`.

The exact sanitized 13-to-12 shape, reverse 12-to-13 shape, same-tenant and
cross-tenant boundaries, multiple real attempts and genuine missing-history
fallback are regression-covered.

## Validation

- campaign backend integration: 118/118 PASS;
- frontend/import/identity/Operational Queue matrix: 56/56 PASS;
- Contacts x Campaigns/channel/billing matrix: 72/72 PASS;
- corrected projection against actual production records, read-only: 2 rows,
  PASS;
- authenticated local owner-review fixture: 2 visible rows, full authorized
  numbers, delivered 1, blocked 1, pending 0, technical failures 0 and `Entrega
  parcial`, PASS;
- focused frontend lint: PASS; whole backend-file lint remains blocked only by
  two pre-existing baseline findings outside the changed projection
  (`routes.ts:6776` and `routes.ts:26307`); backend TypeScript build PASS;
- schema unchanged; migration none;
- real send none; `****6787` repair none; `****9614` repair none;
- Campaign Composer Cleanup preserved and remains deployed with production
  validation pending.

Production still runs HEAD
`6f63133d7c3bb09097a11c0b49eefa7b9f8383c3`; this P1 corrective is not deployed
until the owner delivery gate is approved.


## Local status/CRM durability boundary — 2026-10-10 (not deployed)

[Reviewed implementation and tests](../reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/WEBHOOK_CRM_BOUNDARY_20261010.md): a known campaign provider status must be persisted monotonically to the matching tenant/account/MetaID Outbound before fallible CRM/Conversation materialization. CRM failure is a separate durable pending event, never delivered-status loss, materialization success, invented inbound/window, task cleanup or execution permission. Late enrichment must not overwrite a newer status. This does not expand international identity or make CRM optional; usage/result completion and success-specific acknowledgement remain separately required. Existing Result Truth, Brazilian aliases, human fences and blocked-before-provider distinctions are unchanged. No production apply, replay or acknowledgement in this review.
