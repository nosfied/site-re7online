# Dynamic CRM-filter Campaign Scheduling

## Continuidade revisada em 26/10/2026

A entrega integrada foi implantada em 12/10 e out.15 encerrada canonicamente depois,
conforme [registro](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/out15-closure-20261012/RESULT_2026-10-12.md).
A guarda 38/suspensão e rótulos NOT DEPLOYED abaixo são históricos. Último estado
relatado: API/frontend a959, guarda aberta na geração 41, IMAGE/VIDEO manuais PASS.
Isso não comprova aceite atual de agendamento dinâmico ou de todo conjunto/multilote.
A sequência é [agendamento estático → audiência dinâmica/conjunto controlado](PRODUCT_MAP_CURRENT_2026-10-19.md).
Não executar preparações antigas ou refazer cancelamento de out.15; limites exatos
devem ser lidos no runtime atual, não escolhidos entre os snapshots 1000/5000 abaixo.

## Histórico da preparação e contrato

**Complemento local12/10 — audiência/suspensão, para revisão, NOT DEPLOYED.** [Entrega integrada](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md). Prévia e materialização reutilizam elegibilidade lifecycle operacional; PROVISIONAL não é consentimento ACTIVE. Mudança de filtro/modalidade invalida a geração da prévia sem cap artificial. Expansão dinâmica depende do filtro efetivamente salvo, não da intenção histórica não registrada. A suspensão é projetada por job/lease tenant-scoped e não altera scheduler/status. Cancelar envios restantes usa ação canônica e classifica ausência comprovada como não enviada, sem fabricar falha Meta. Produção out.15 permanece suspensa/guarda38 fechada; implantação e cancelamento produtivo exigem decisões próprias.


## Current production clarification — 12/10/2026

Dynamic scheduling is deployed; the earlier local-only checkpoint below is historical. Individual controlled acceptance does not accept every later dynamic audience. [out.13→out.15 audit](../reviews/automation-freeform-window-release-af26/dynamic-audience-continuity-20261011/README.md) establishes NEW persisted in out.15, seven PROVISIONAL identities incorrectly admitted by the campaign gate, and no historical UI estimate. The local correction is reviewed separately and NOT DEPLOYED.

The canonical operational predicate permits a legacy Lead without Contact, but a matching Contact must be ACTIVE (`isOperationalContactLifecycle`). Campaign preview, selection/materialization and final provider eligibility must share that condition, together with same-tenant identity, anonymity, exclusion and opt-out. A saved CRM status matches a population; it is not proof of owner authorization for every contact. Snapshot remains immutable: new rejection must not rewrite historical results or resume a suspended execution. International identity support is separate and is not widened here.

Current grouped implementation has a 5000 matched-Lead guardrail and chunks of1000. The legacy standalone implementation still has1000; both fail overflow explicitly. Preview counts after operational filtering differ from raw matched-Lead count; zero eligible estimate can legitimately precede a dynamic scheduled execution. Changing the user filter/mode invalidates its transient preview and old response generation; a new estimate must correspond to the saved filter.

Status: OWNER PASS / LOCAL VALIDATED / NOT DEPLOYED.

This note records the local implementation of the dynamic CRM-filter scheduling
front. It has received owner pass in local validation, has not been deployed
and has no production validation claim.

Core invariant:

- before execution: the audience remains a dynamic CRM filter;
- at execution: one recipient snapshot is created from current same-tenant CRM
  data;
- after snapshot: the recipient population is immutable for that execution.

## Current Architecture

- `Campaign.scheduledAt` stores a scheduled campaign time.
- Static campaign drafts/scheduled campaigns continue to persist recipient
  selection before dispatch.
- Dynamic scheduled campaigns persist only a filter definition before execution.
- Existing campaign execution continues to use canonical contact identity,
  current opt-out checks, template validation, return destination validation and
  idempotent provider dispatch.
- CRM business statuses come from same-tenant operational configuration,
  primarily `TenantOperationalConfig.config.crmBusinessStatuses`, with the
  existing JSON fallback.

## Implemented Semantics

- Recipient selection is explicit:
  `STATIC_RECIPIENTS` or `DYNAMIC_CRM_FILTER`.
- Backward compatibility: campaigns without a mode are treated as
  `STATIC_RECIPIENTS`.
- Initial dynamic filter is `crmBusinessStatusId`, using the stable same-tenant
  CRM Situation id, never the display label.
- Schedule-time dynamic seed stores no final recipient population and creates no
  `OutboundMessage`, billing ledger, provider call or recipient snapshot.
- At scheduled execution claim, the scheduler resolves current same-tenant CRM
  status configuration, queries current Leads by status, deduplicates by
  canonical WhatsApp identity, builds per-recipient template components from
  current Lead fields when mappings exist, and persists one
  `campaign.dynamic_snapshot.created` event.
- If a snapshot event already exists, restart/retry reuses it and does not
  re-evaluate the CRM filter.
- After snapshot creation, the population is immutable for that execution.
- Current opt-out, operational exclusion, return destination revalidation,
  template/category validation, idempotent outbound `messageId`s, billing and
  result truth remain in the existing campaign runner path.
- Empty match is allowed: snapshot has zero recipients and the campaign can
  complete with provider calls = 0 and billing = 0.
- Guardrail: dynamic execution is bounded at 1000 matched CRM leads; overflow
  fails explicitly with `dynamic_match_limit_exceeded` instead of silently
  truncating recipients.

## UX

- The Campaigns creation area offers recipient mode:
  `Destinatários fixos` or `Filtro dinâmico do CRM`.
- Dynamic mode requires a CRM Situation and future date/time.
- The preview button becomes an estimate: `Correspondências neste momento`.
- The action creates and schedules a dynamic campaign without freezing preview
  recipients.
- Campaign detail displays mode, CRM filter, schedule time and snapshot state.

## Guardrails

- No cross-tenant CRM status or contact resolution.
- No unsafe fuzzy status matching.
- No silent recipient omission; exclusions need explicit counts/reasons.
- No shadow campaign-history model inside Contact.
- No schema or migration.
- No real send, provider call or deploy occurred during local validation.
