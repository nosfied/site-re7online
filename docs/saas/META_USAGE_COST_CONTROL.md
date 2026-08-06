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

## Uso em editais e contratos

Em propostas como SECULT-PE e CRA-PR, o controle deve ser descrito como:

- estimativa operacional de consumo Meta;
- apoio para acompanhamento mensal;
- subsidio para limites, alertas e revisao de volume;
- evidencia tecnica de governanca de custo;
- nao substituto do demonstrativo oficial da Meta.

Quando o edital exigir volume ativo alto, registrar risco de categoria, entrega, pais e politica vigente.

## Limites e proximos passos

- Nao ha conciliacao financeira definitiva automatizada.
- O bloqueio por limite ainda nao esta ativado nos fluxos reais.
- Rate card e local e deve ser revisado quando a politica Meta mudar.
- Ativacao de `metaUsagePolicy` por tenant deve ter runbook e autorizacao.
- Dashboards visuais amplos permanecem como evolucao futura.
