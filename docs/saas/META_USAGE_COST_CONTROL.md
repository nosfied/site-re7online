# Meta Usage Cost Control

Status: guia documental do controle estimativo de uso Meta. Este documento nao altera runtime, politica de consumo ou configuracao de tenant.

## Objetivo

Registrar como o Converta estima, evidencia e reporta uso de mensagens Meta por tenant. O objetivo e apoiar operacao, propostas publicas, controles internos e acompanhamento mensal.

O controle e estimativo e nao substitui demonstrativo oficial da Meta.

## Fontes de uso

O ledger identifica a origem operacional do outbound:

| Source | Uso |
| --- | --- |
| `inbox_text` | texto livre enviado pelo Inbox |
| `inbox_template` | modelo aprovado enviado pelo Inbox |
| `canned_reply` | mensagem pronta enviada como texto operacional |
| `campaign` | campanha enviada por fluxo de rascunho e envio explicito |
| `manual_campaign_send` | envio imediato manual/compatibilidade |
| `bot` | outbound gerado por automacao quando passa pelos helpers locais |

Inbound nao entra como custo estimado de envio ativo.

## Categorias Meta

Categorias consideradas pelo rate card local:

- `service`;
- `utility`;
- `marketing`;
- `authentication`.

Para `service`, o rate card local trata mensagens antes de `2026-10-01` como nao faturaveis estimadas. A partir dessa data, o valor fica a confirmar ate haver regra operacional revisada.

## Sprint 87M.1 - Ledger

A Sprint 87M.1 criou a fundacao do ledger:

- snapshot estimativo em `OutboundMessage`;
- evento `meta.usage.estimated` no registro inicial;
- evento `meta.usage.updated` em atualizacoes de status;
- payload sanitizado com apenas marcadores tecnicos minimos;
- classificacao por source, tipo de mensagem, categoria e regra de cobranca estimada.

O ledger nao armazena conteudo da mensagem nem credenciais.

## Sprint 87M.2 - Resumo e alertas

A Sprint 87M.2 criou resumo mensal por tenant:

- leitura de `TenantOperationalConfig.config.metaUsagePolicy`;
- ausencia de policy ou `enabled=false` sem alerta/bloqueio;
- contagem mensal por mensagem outbound;
- delivered/read como consumo estimado quando aplicavel;
- sent/queued/unknown como pendentes;
- failed sem somar valor estimado;
- agrupamento por categoria e source;
- thresholds 70, 90 e 100;
- eventos `meta.usage.threshold_reached` e `meta.usage.limit_exceeded`;
- helper de bloqueio criado, ainda nao conectado aos envios reais.

## Sprint 87M.3 - Preview

A Sprint 87M.3 adicionou previa de custo:

- endpoint de preview tenant-scoped;
- estimativa em campanhas com audiencia CRM;
- estimativa para envio imediato manual por contagem;
- estimativa para envio de modelo aprovado no Inbox;
- bloqueados fora da estimativa;
- visao financeira agregada para ADMIN/SUPERVISOR quando houver policy/summary;
- AGENT sem exposicao de uso financeiro agregado.

O preview nao cria campanha, nao cria mensagem e nao dispara envio.

## Sprint 87M.4 - Relatorio mensal

A Sprint 87M.4 criou:

- relatorio JSON mensal;
- exportacao CSV mensal;
- resposta agregada e sanitizada;
- acesso ADMIN/SUPERVISOR;
- AGENT com acesso negado;
- filename seguro por tenant e mes;
- disclaimer de estimativa.

O CSV nao contem dados pessoais, conteudo de mensagem ou identificadores externos crus.

## Homologacao real em tenant hibrido

Status: CLOSED / REAL VALIDATED.

Baseline:

- production HEAD: `08598293c1cc15360b5cfe02a21a779c8a040dec`;
- tenant controlado: `demo-converta`;
- modo: `HYBRID`;
- primary override: `AUTO` / null;
- template aprovado: `data_exame`.

Resultado validado:

- template enviado pelo Inbox usou Meta Cloud;
- envio do template gerou exatamente uma trilha logica de uso Meta;
- status Meta do template chegou a `read`;
- resposta do destinatario foi recebida por Meta Cloud e Web Session, mas gerou uma unica mensagem inbound canonica;
- freeform posterior pelo Inbox usou Web Session;
- freeform por Web Session nao gerou ledger Meta;
- nao houve duplicidade de outbound, timeline ou flow/bot causada por coexistencia Meta + Web Session;
- clientId, conversation e eventos permaneceram no tenant correto.

Matriz de uso homologada:

```text
HYBRID + template
-> META_CLOUD
-> Meta usage logical count = 1

HYBRID + post-reply freeform
-> WEB_SESSION
-> Meta usage logical count = 0
```

Essa homologacao confirma que billing evidence acompanha o provider efetivo do envio ativo. Echoes, receipts, dedupe events e inbound deliveries nao devem criar custo Meta adicional.

## Uso em editais e contratos

Em propostas como SECULT-PE e CRA-PR, o controle deve ser descrito como:

- estimativa operacional de consumo Meta;
- apoio para acompanhamento mensal;
- subsidio para limites, alertas e revisao de volume;
- evidencia tecnica de governanca de custo;
- nao substituto do demonstrativo oficial da Meta.

Quando o edital exigir volume ativo alto, registrar risco de categoria, entrega, pais e politica vigente.

### CRA-PR controlled Utility campaign

Status em 2026-09-15: readiness audit fechado; aceite contratual aberto, sem
envio real.

O snapshot somente leitura de producao confirmou `cra-pr` com Meta/WhatsApp
configurado e features `campaigns`/`templates` habilitadas, mas com 0 templates,
0 pedidos de template, 0 campanhas, 0 eventos CRA de billing ativo e 0 eventos
CRA de opt-out de campanha. Nenhuma copia Utility CRA aprovada foi encontrada
no repositorio/snapshot.

Para aceite contratual, o primeiro envio real deve ser pequeno e controlado,
com copia CRA aprovada, template Utility aprovado pela Meta e aprovacao
explicita do owner cobrindo template, destinatarios, janela de envio, custo
esperado, nome da campanha e quantidade de mensagens. O billing contratual deve
usar delivered/read de template Utility fora da janela de 24h como evidencia
conservadora, sem cobrar accepted/sent sem entrega, failed/rejected/cancelled,
read replay ou mensagens de servico dentro da janela.

Pre-checagens obrigatorias antes do envio controlado:

- opt-out ativo deve ser verificado no preview/import da campanha;
- destinatario usado para evidencia de billing deve ter `lastInboundAt` nulo ou
  anterior a 24h no momento do envio;
- preview de custo deve registrar categoria, elegiveis, bloqueados, janela 24h
  e premissas do rate card local, sem inventar taxa Meta oficial;
- relatorio final deve capturar campaign id, template, destinatario mascarado,
  Meta message id, status accepted/delivered/read/failed, decisao billable e
  referencia do evento `billing.active_message.delivered` quando aplicavel.

Demo mirror Phase A, 2026-09-15: `demo-converta` tem Meta Cloud configurada e 1
template Utility aprovado, mas 0 campanhas e 0 eventos de billing/opt-out de
campanha no snapshot. Ele pode ser usado para provar a mecanica generica de
mensagem ativa Utility, 24h, delivery/read idempotente e relatorio, desde que o
owner aprove template, destinatarios, contagem, janela e custo esperado antes
de qualquer envio real. Isso nao prova fatura CRA.

Demo Phase B owner gate, 2026-09-15: para o primeiro envio controlado proposto
com 2 mensagens, usar a premissa comercial central documentada para CRA
(`R$ 3.200,00`/mes para `10.000` mensagens ativas) como referencia contratual
de planejamento: `R$ 0,32` por mensagem ativa billable; `2 x R$ 0,32 =
R$ 0,64`. Em auditoria posterior, este valor foi reclassificado como referencia
central de planejamento, nao como unidade contratual final CRA provada, nao como
config de tenant e nao como custo Meta retail. O envio real segue bloqueado ate
aprovacao explicita do owner e reconciliacao da unidade de billing.

Demo Phase C controlled gate, 2026-09-15: os destinatarios Demo/RE7 finais
`9614` e `6787` foram autorizados para a previsualizacao; ambos estavam fora
de 24h, sem opt-out ativo encontrado, e o envio de 2 mensagens manteria a mesma
referencia central anterior de R$ 0,64. REAL SEND = NO ate aprovacao explicita
do envio exato, nova checagem 24h/opt-out e reconciliacao da unidade de billing
imediatamente antes do disparo.

Demo Phase C controlled send, 2026-09-15: o envio real autorizado parou com
evidencia parcial. A Meta aceitou 1 template Utility `data_exame` para
`****9614`, o owner confirmou recebimento real, e depois foram recuperados
webhooks Meta `sent` e `delivered` para o Meta message id do envio. Mesmo assim,
nao houve OutboundMessage persistido nem ledger de billing porque o runner
falhou com `default_operational_department_missing` antes da persistencia local;
os webhooks chegaram como status sem OutboundMessage correlacionavel. Nao criar
evento entregue sintetico nem billing retroativo sem reconciliacao aprovada.
`****6787` nao foi enviado. O custo BRL final nao foi fechado porque o run
falhou antes de duas mensagens entregues/persistidas pelo pipeline local e a
unidade R$ 0,32 foi depois reclassificada como premissa central nao provada como
unidade final CRA.

Recipient A reconciliation, 2026-09-15: read-only production evidence was
sufficient for a constrained repair for `****9614` only, and the owner approved
the production repair. The delivered webhook is billable Utility/PMP, the send
occurred outside 24h, no active opt-out was found, and no existing local
outbound or `billing.active_message.delivered` duplicate existed. Billing was
created through the existing idempotent active-message delivery rule, producing
exactly one `billing.active_message.delivered` event for Recipient A.

Billing unit reconciliation, 2026-09-15: the `billing.active_message.delivered`
event is a canonical eligibility/count event and does not persist a BRL amount.
The local Meta usage payload for A records planning Meta estimate
`estimatedMetaUnitCostUsd=0.008`, `estimatedMetaCostUsd=0.008`,
`rateCardVersion=meta-br-planning-2026-08`; this is not a provider invoice.
The `R$ 0,32` value previously used in docs comes from the internal central
commercial premise `R$ 3.200,00 / 10.000 mensagens ativas`, not from Meta and
not from a tenant override. Production read-only config showed no
`activeMessageBilling`, `billing` or `metaUsagePolicy` unit-price override for
`demo-converta`, `cra-pr`, `secult-pe` or `syer-rodrigues`. Therefore A's ledger
is correct as delivered Utility eligibility/count, but the BRL unit for CRA
remains NOT PROVEN as final contractual unit. Official Meta Brazil Utility cost
for the remaining tiny Demo test was proven from the WhatsApp Business Platform
Pricing endpoint on 2026-09-15: BRL 0.0350/message, effective 2026-07-01, tier
0-250,000 monthly Brazil Utility messages. Recipient B remains NOT ATTEMPTED:
owner approved the provider-cost gate, but the immediate send preflight stopped
before Meta because Demo lacks an active default operational department/queue
pair.

## Limites e proximos passos

- Source of truth update, 2026-09-15: Meta cost must come from official current
  WhatsApp Business Platform pricing by market/category/effective date. The
  narrow Brazil Utility rate required for Recipient B owner gate is proven:
  BRL 0.0350/message. Broader source-of-truth automation remains P2 FinOps
  hardening. Internal values such as `meta-br-planning-2026-08`, USD 0.008 or
  R$ 0,32 must not be labeled official Meta cost. Contract/client price remains
  a separate resolver from provider cost and FX.
- Nao ha conciliacao financeira definitiva automatizada.
- O bloqueio por limite ainda nao esta ativado nos fluxos reais.
- Rate card e local e deve ser revisado quando a politica Meta mudar.
- Ativacao de `metaUsagePolicy` por tenant deve ter runbook e autorizacao.
- Dashboards visuais amplos permanecem como evolucao futura.
