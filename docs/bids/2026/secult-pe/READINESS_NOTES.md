# SECULT-PE Readiness Notes

Status: notas de prontidao para avaliacao de proposta. Usar junto ao edital e anexos oficiais antes de protocolar qualquer documento.

## Enquadramento da solucao

O Converta deve ser apresentado como SaaS de atendimento omnichannel com WhatsApp Oficial/Meta, Inbox humano, chatbot/fluxos, CRM operacional, modelos aprovados, mensagens prontas, relatorios e auditoria por eventos.

Para SECULT-PE, o posicionamento recomendado e operacao predominantemente receptiva, com suporte a fluxos guiados e atendimento humano, preservando controle sobre envios ativos.

## Pontos aderentes conhecidos

- Atendimento receptivo com Inbox.
- Suporte a ate 2 linhas/canais conforme configuracao contratada.
- Operacao com ate 10 atendimentos simultaneos conforme dimensionamento do edital.
- Gestao de ate 18 usuarios conforme pacote contratado.
- Uso de modelos aprovados para comunicacoes ativas quando necessario.
- Treinamento operacional e roteiro de implantacao.
- Controle estimativo de custo Meta por tenant.
- Relatorios e evidencias operacionais.
- RBAC e isolamento por tenant.
- LGPD com anonimizacao operacional e bloqueios de reidratacao.

## Validacao organica de atendimentos concluidos - 2026-09-01

Base de producao validada:

```text
9881521b712173dbe8cb66e0d55a7ae710a0e903
```

`CompletedServiceSnapshot` foi validado com dados organicos da SECULT-PE, sem
fechamento artificial, sem backfill, sem mutation de snapshot e sem mutation de
tenant.

Resumo observado:

- snapshots SECULT: 41;
- primeiro `closedAt`: `2026-09-01T11:04:44.834Z`;
- ultimo `closedAt`: `2026-09-01T20:12:17.209Z`.

Primeiro snapshot organico:

```text
conversationId: 58390734-e9c6-414b-81e9-08ea88a1adc5
cycleId: 5ccf535c-7665-4fa9-a58b-f88a4af88ed5
protocol: CVT-87DEB8652B73
agent: Jéssica Campelo Bernardo
department: Duvidas Gerais - SECULT / PE
queue: Duvidas Gerais - SECULT / PE
closeSource: app_inbox
closeReason: operator_close
closeActor: Jéssica Campelo Bernardo
```

Resultado:

- close event consistency: PASS;
- agent at close: PASS;
- department at close: PASS;
- queue at close: PASS;
- close actor: PASS;
- multitenant isolation: PASS;
- SECULT report: PASS;
- reporting cutoff: PASS;
- count reconciliation: PASS;
- RBAC: PASS;
- PM2: PASS;
- health: PASS;
- SECULT: CONNECTED.

Status:

```text
SECULT COMPLETED SERVICE SNAPSHOT:
CLOSED / REAL ORGANIC VALIDATED

SECULT COMPLETED SERVICE REPORTING:
CLOSED / PRODUCTION VALIDATED
```

## Distribuicao automatica AVAILABLE - 2026-09-10

SECULT-PE passou a operar com `queueAssignmentPolicy.presenceMode=AVAILABLE`
apos validacao controlada previa em Demo. O modo atual preserva `round_robin`,
`scope=tenant`, `maxActivePerAgent=2`, `includeSupervisors=true` e
`notifyAssignedOnly=false`.

Auditoria organica read-only de producao, desde `2026-09-09 11:38:31 -03`,
observou:

- 30 atribuicoes automaticas;
- 11 agentes distintos selecionados;
- Maria Helena recebeu 1 atribuicao automatica depois de estar disponivel e
  abaixo da capacidade;
- nenhum evento `queue.assignment.no_eligible_agent`;
- zero exclusoes por heartbeat stale isolado;
- pool elegivel variando entre 5 e 11 candidatos.

Distribuicao observada:

```text
Allana: 7/30
Anna: 6/30
Gabriela: 3/30
Jessica: 3/30
Maria Clara: 3/30
Cecilia: 2/30
Joao: 2/30
Maria Helena: 1/30
Maria Julia: 1/30
Maristella: 1/30
Mirella: 1/30
```

Classificacao: `presenceMode=AVAILABLE` esta parcialmente validado por trafego
real. A concentracao historica em Allana melhorou em termos de diversidade do
pool, mas permanece em observacao; nao ha evidencia material de bug residual no
algoritmo ou no cursor de round-robin.

## Backend CPU watch - 2026-09-10

Janela curta apos deploy de hardening hibrido:

```text
14:49:13Z 68.5%
14:49:43Z 68.4%
14:50:13Z 67.7%
14:50:43Z 67.8%
14:51:13Z 67.2%
```

Memoria permaneceu entre aproximadamente 253 MB e 273 MB. Health continuou
PASS, PM2 sem restart novo, e nao houve evidencias de loop de reconnect, retry
ou `failed_retryable`. Na mesma janela, a SECULT concentrou a atividade
observada, com 26 pares `claimed/completed` em 10 minutos.

Classificacao: CPU em WATCH por carga sustentada moderada, sem bug comprovado.

## Web Session unsupported-message incident - 2026-09-04

Chamados organicos da SECULT-PE indicaram bolhas `Mensagem nao suportada` em
atendimento humano normal, incluindo um caso em que uma imagem valida foi
recebida/renderizada no mesmo minuto. A auditoria classificou esses casos como
compativeis com eventos Web Session de controle/contexto persistidos como
`UNKNOWN`, nao como perda comprovada de midia.

Fix em producao:

```text
c308198aa97ea6a4233761eac9da9cbc945cbed6
fix(whatsapp): suppress non-content web session events
```

Resultado:

- control-only `protocolMessage`: suppressed;
- standalone `reactionMessage`: suppressed;
- standalone `messageContextInfo`: suppressed;
- grouping-only `albumMessage`: suppressed;
- standalone real content: preserved;
- valid media: preserved;
- view-once behavior: preserved;
- Hybrid exactly-once: preserved;
- schema/migration/frontend: unchanged;
- backend + worker builds: PASS;
- historical `UNKNOWN`: unchanged;
- status: DEPLOYED / TESTED / ORGANIC VALIDATION PENDING.

## Pontos de atencao

- Confirmar canais exigidos no edital e disponibilidade real no tenant antes da proposta final.
- Confirmar volume esperado de mensagens ativas e receptivas.
- Confirmar se ha exigencia de treinamento presencial, remoto ou hibrido.
- Confirmar prazo de implantacao e agenda de homologacao.
- Validar se modelos Meta necessarios ja existem ou precisarao ser solicitados.
- Registrar que custos Meta sao estimados e dependem de categoria, pais, entrega e politica vigente.

## Gates recomendados

1. Revisar edital e termo de referencia.
2. Mapear requisitos contra a matriz de evidencias.
3. Definir canais e usuarios contratados.
4. Validar modelos Meta minimos.
5. Preparar roteiro de demonstracao sanitizado.
6. Revisar plano de suporte, SLA e treinamento.
7. Confirmar premissas comerciais antes de envio da proposta.

## Riscos

- Aprovacao Meta de novos modelos pode nao acompanhar prazo curto.
- Mudanca de politica Meta pode afetar estimativa de custo.
- Requisitos de integracao nao descritos no edital podem exigir aditivo tecnico.
- Evidencias visuais devem ser capturadas em ambiente controlado antes de diligencia.

## Proximos passos se avancar

- Criar tenant ou revisar tenant existente para PoC.
- Configurar canais autorizados.
- Preparar modelos aprovados essenciais.
- Realizar treinamento inicial.
- Rodar smoke operacional sem envio em massa.
- Entregar relatorio de prontidao pos-implantacao.
- Medir CPU/Inbox durante expediente em janelas START, MID e END para confirmar ou rejeitar a hipotese de correlacao entre uso ativo da Inbox e CPU do backend.
