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
R$ 0,64`. Este valor nao e fatura CRA nem custo Meta retail. O envio real segue
bloqueado ate aprovacao explicita do owner.

Demo Phase C controlled gate, 2026-09-15: os destinatarios Demo/RE7 finais
`9614` e `6787` foram autorizados para a previsualizacao; ambos estavam fora
de 24h, sem opt-out ativo encontrado, e o envio de 2 mensagens manteria a mesma
referencia de R$ 0,64. REAL SEND = NO ate aprovacao explicita do envio exato e
nova checagem 24h/opt-out imediatamente antes do disparo.

Demo Phase C controlled send, 2026-09-15: o envio real autorizado parou com
evidencia parcial. A Meta aceitou 1 template Utility `data_exame` para
`****9614`, mas nao houve delivery/read observado, OutboundMessage persistido
nem ledger de billing; `****6787` nao foi enviado. Pela regra contratual, o
total evidenciado neste run e R$ 0,00. O custo esperado R$ 0,64 nao foi
atingido porque o run falhou antes de duas mensagens entregues.

## Limites e proximos passos

- Nao ha conciliacao financeira definitiva automatizada.
- O bloqueio por limite ainda nao esta ativado nos fluxos reais.
- Rate card e local e deve ser revisado quando a politica Meta mudar.
- Ativacao de `metaUsagePolicy` por tenant deve ter runbook e autorizacao.
- Dashboards visuais amplos permanecem como evolucao futura.
