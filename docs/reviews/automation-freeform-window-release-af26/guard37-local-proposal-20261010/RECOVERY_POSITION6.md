# Recuperação específica proposed: posição .6 aceita e entregue, sem Outbound

**Continuidade após decisão histórica do owner:** [A/B/C implementados e ensaiados localmente](../position6-recovery-implementation-20261010/README.md); [decisão canônica estritamente .6](../../../saas/POSITION6_HISTORICAL_CRM_DISPOSITION_2026-10-10.md). A proposta histórica abaixo permanece para rastreabilidade. Nenhum apply/ack produtivo foi autorizado ou executado.

**Revisão posterior de162:** [fronteira webhook/CRM corrigida e provas novas](WEBHOOK_CRM_BOUNDARY_20261010.md); [checklist único .6](POSITION6_RECOVERY_CHECKLIST.md). Históricos abaixo preservados; sem apply/ack/deploy.

**Continuidade local sobre85:** [implementação, provas e limites](IMPLEMENTATION_20261010.md). A descrição abaixo preserva a proposta/reprodução histórica. Prevenção agora implementada localmente; verificador/recibo .6 ensaiados, mas nenhum apply/ack/recuperação executado.

**CONTRATO PARA REVISÃO / NÃO É CLI APPLY, ACK OU AUTORIZAÇÃO PRODUTIVA.** Usa somente a captura da auditoria anterior. Uma eventual operação exige dry-run fresco, backup adequado e autorização específica; evidência de 10/10 não é binding atual por si só.

## Vínculos exatos e proveniência

| Vínculo | Valor sanitizado / fonte |
|---|---|
|Tenant|`10a98bf4-1587-43e8-83d4-e3a48c5d79d9` / demo-converta, Client da captura READ ONLY|
|Controller|`b019039e-0a89-4a42-9f33-c214323b888f`|
|Child|`94b5805b-5c6d-4c89-b047-959209261c21`|
|Batch / link|`d473aec1-8ffa-40b9-8bab-e6819153ae4c` / `6c896fcd-d55c-4cf8-9aab-ca976413cc90`, chunk1/11 destinatários|
|Job / run|`1eb96f7f-50ae-4d5e-9124-411923945efb` / `03856c7c-c390-419a-b2f3-758dd669e394`|
|Provider task / parent|`7d9902c0-4946-4250-8205-400e41be0941` / `6d8785c6-f600-4e77-a686-7aa9cda74268`|
|Task hash / guard|`c91588a21bd6fbc8e85598e30b907f193388751dfadea56d9483c0bca9a9b979` / closed37, provider persisting|
|Internal messageId|`campaign.94b5805b-5c6d-4c89-b047-959209261c21.6`|
|Intent / acceptance events|`96f7b2c3-adc2-47f5-ac1c-5d8ba66b3d85` / `a0cdb650-c6f9-4741-85d6-c3b9099e9008`|
|Acceptance requestId|`campaign-message-provider-accepted:94b5805b-5c6d-4c89-b047-959209261c21:6`|
|Stored orphan events|sent `0938c7ee-500b-4877-a0b1-beceec2e5766`; delivered `64cebb0f-4d48-4c6b-9bf2-02e6f2ed69d4`|
|Meta messageId hash|`46979b261213be225ced7ed54a51223e0739b209cd5da761d8787a4478874823`; exact ID and recipient private|
|Immutable child seed event|`7cdbc3c9-3cce-4429-8aa9-1524636a561c`, campaign.seed.saved, 15:40:24.831UTC/12:40:24.831Fortaleza|

Os campos `snapshotEventId` e `snapshotHash` do lote estão **nulos na captura**. Não inventar essa relação. A recuperação deve fixar/hashar o seed efetivo do filho e qualquer snapshot dinâmico encontrado pelos vínculos explícitos antes de usar posição/components. Seeds do controlador não substituem o seed de execução. As linhas preservadas e seus hashes estão em [PRESERVED_OUTBOUNDS.json](PRESERVED_OUTBOUNDS.json); full destination/account/template components remain private. Hashes reflect the captured projection, not an assertion about current rows.

## Frozen preconditions / future dry-run

- Execution exclusive; guard exactly closed37, one provider/persisting task, exact reference/hash/instance/build; no ledger fault/uncertain lock. Verify state read consistently, no lease/current executor claim on this job and no competing campaign task. Process being alive alone neither authorizes ack nor proves network flight.
- Explicit same-tenant Campaign→link→batch→job→parent/run, same template/account identity from stored submission provenance. Do not infer tenant/account from role, suffix, shared phone or template name. MetaID equal across accepted and both orphans; each webhook reason outbound_message_not_found, status/normalizedStatus and raw timestamp valid; no later contradictory status or duplicate submission for .6.
- Exactly five prior Outbounds preserved byte-for-byte except unrelated newer delivery status must be treated as drift, not overwritten. Intent/accepted/Outbound absent for positions7–11; hold that baseline. One .6 intent/acceptance, no local .6 Outbound (or replay-compatible record with matching durable receipt).
- Full recipient and canonical destination/account must match intent/acceptance and frozen execution seed .6; use existing privacy/identity checks. Do not create Contact/Lead from raw numbers. An unsupported international CRM identity is a recovery constraint, not permission to bypass the resolver.
- Derive body/components/returnDestination only from attested original execution material. Current template or current tenant config is not original submission evidence. If exact text/components cannot be proved, record field unknown or block the corresponding materialization, never synthesize a sent body. Validate this handling before implementation.

## Result persistence proposed, separate from operational materialization

One bounded SERIALIZABLE SQL transaction, timeout/lock_timeout and existing lock order client→batch→job, no provider and no ledger lock spanning SQL/network. Re-read/hash the plan under locks; mismatch aborts. Do not call webhook controller to replay side effects.

1. Create **only** missing Outbound .6 under unique `(clientId,messageId)`, exact same MetaID/account/recipient; TEMPLATE / Meta / SENT as provider acceptance, not READ or human receipt. Represent delivered through existing `rawPayload.metaStatus`, using stored status monotonicity rules. Preserve original orphan events; do not relabel or delete them.
2. `createdAt` explicitly anchored to original `provider_accepted.createdAt` **15:40:35.501UTC /12:40:35.501Fortaleza** e registrar também `payload.acceptedAt` original **15:40:35.500UTC /12:40:35.500Fortaleza**; record the time semantics as reconstructed acceptance, **not submit_started or missing original Outbound.createdAt**. Preserve submit_started **15:40:34.964UTC /12:40:34.964Fortaleza** separately in provenance.
3. `metaStatus.lastStatusAt` from stored provider timestamp `1791646843` = **15:40:43UTC /12:40:43Fortaleza**. Sent and delivered report the same provider second; use status rank/monotonic helper, not event arrival alone. Retain processing times15:40:44.443/44.528UTC as distinct evidence. No claim of owner receipt.
4. Record new reconciliation/result events with **current** createdAt plus original timestamps/provenance in payload. Never backdate a recovery audit as though it existed at send time. Event names/requestIds for accepted-delivered recovery must be distinct from FAILED131026.
5. Durable Event receipt (existing schema) keyed uniquely by tenant+acceptedEventId, e.g. `campaign.accepted_delivery.reconciled` / `accepted-delivery:<acceptedEventId>`: protocol version, planHash/evidenceHash, taskHash/reference, exact reconciledOutboundId+messageId+MetaID hash, source event IDs+hashes, original times, status, resultHash, five prior row hashes, pending positions7–11, actor and recovery timestamp. Full MetaID/recipient private, no credential. Unknown/ambiguous source denies.
6. Re-read totals via real child/controller/batch read models: **6 submitted, delivered reported for6, 0 new failed/blocked, 5 pending**; 244 audience exclusions remain separate. Set legacy submitted counter from rows where contract requires it, not `+=1`; no duplicate controller/child counts. Keep statuses **sending/running/queued**, attempt1, no lease. Do not invent completed/failed status or mark pending recipients skipped.

On replay: matching receipt+Outbound returns alreadyApplied with zero new writes/count increments. Same unique message key but different MetaID/tenant/reference/receipt/result denies; P2002 alone is not successful reconciliation. A transaction failure rolls back new SQL; original evidence remains, no automatic retry/submission.

**Not proposed:** create/update Conversation/runtime/Contact/Lead, apply destination/CRM changes from a synthetic inbound, fabricate a 24h window or rerun delivered webhook. That would require international-identity decision plus human/runtime fence review. The receipt must explicitly scope the recovered result, not claim full CRM/delivery side-effect completion.

## Ack and queued job — unresolved approval boundary

Current `acknowledgeAcceptedFailure` verifier requires .2/FAILED131026/terminal campaign+job/batch; **it cannot consume this receipt**. Generic ledger ack requires exact persisting task/ref/hash but its audit reason is hardcoded `durable_failed_result_no_retry`. Success recovery needs a reviewed result-specific verifier and truthful receipt/ack reason before any eventual ack; do not call the failure wrapper or fabricate its required state.

Whether a receipt recovering only transport result may resolve the provider task while CRM materialization remains pending is an **explicit contract decision**, not assumed here. Conservative default: retain task and guard until the verifier proves all scoped required persistences and the policy for unresolved CRM is approved. If approved and later authorized, ack archives the complete task/history and leaves guard closed; it neither grants worker/job execution nor resumes campaigns.

The job remains queued with operational_suspension, batch running, remaining five pending. Result recovery **does not authorize** running it, opening the global guard, terminalizing campaign or mutating the frozen snapshot. A later reopening decision requires fresh global inventory and an explicitly reviewed disposition of this job; simply acking then opening would let the runner advance to7–11. No lease/task expiration or marker removal.

## Material gaps before an executable plan

1. Domain decision: stored international identity versus CRM/import restriction; no global support expansion yet.
2. Freeze actual execution seed/content/account provenance and source hashes; batch snapshot fields null. Existing evidence is sufficient for acceptance+delivered, not a blanket certificate for original rendering or destination side effects.
3. Implement/test result-specific receipt/idempotence/read-model verification and eventual ack semantics; none executed in this stage.
4. Fresh authorized READ ONLY dry-run and backup/fences before any separately authorized SQL/ack; present evidence is historical. Decide remaining job explicitly before any global opening.

No receipt created, no apply/ack code invoked, no SQL recovery supplied as executable instructions. FAILED131026 procedure remains reference-only; five existing Outbounds and five non-submitted recipients untouched.
