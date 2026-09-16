# CRA-PR Readiness Notes

Status: notas de prontidao para avaliacao contratual. Usar junto ao edital,
termo de referencia, matriz contratual canonica e decisoes ja registradas.

Documento canonico de aderencia requisito-a-requisito:

```text
docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md
```

## Auditoria Contratual Consolidada - 2026-09-15

Auditoria somente leitura de producao confirmou:

- tenant `cra-pr` ACTIVE, profile `government`;
- limite contratual configurado: `maxActiveAppUsers=30`;
- usuarios: 18 ativos, 0 inativos; 3 ADMIN, 5 SUPERVISOR, 10 AGENT;
- departamentos/filas: 6 departamentos ativos e 6 filas;
- horarios: 6/6 departamentos com Mon-Fri 09:00-17:00,
  `America/Sao_Paulo`; fins de semana fechados por ausencia de janela;
- active flow: `cmtkhhxtq002p4spns3fp0yux`, active=true, entryPoint=true,
  31 nos, start `consent`, hash
  `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`;
- Flow visibility: CLOSED / CUSTOMER VALIDATED;
- Meta Cloud: operational=true, phoneStatus=CONNECTED, objectAccess=true;
- Web Session: `****5595`, CONNECTED, auth material configured;
- Webchat CRA: nao configurado;
- Instagram/Facebook CRA: contratados, mas ainda sem configuracao/validacao CRA
  registrada;
- Templates/campaigns CRA: nenhum template/campanha configurado no snapshot;
- CSAT e close: evidencias de snapshots e pesquisas respondidas em producao.

Scorecard contratual da matriz:

```text
TOTAL REQUIREMENTS: 52
CLOSED / REAL VALIDATED: 14
CLOSED / CUSTOMER VALIDATED: 1
IMPLEMENTED / NEEDS CRA VALIDATION: 15
CONTRACT ACCEPTANCE OPEN: 2
CONFIG PENDING: 0
CUSTOMER ACTION PENDING: 0
CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING: 4
EXTERNAL META DEPENDENCY: 4
PRODUCT GAP: 1
DOCUMENTATION/EVIDENCE GAP: 9
NOT REQUIRED BY CONTRACT: 2
```

Pendencias criticas para prontidao contratual:

1. Obter copia Utility CRA aprovada e validar campanha controlada.
2. Evidenciar opt-out auditavel e bloqueio em campanha.
3. Gerar pacote de relatorios/exportacoes/billing com dados CRA redigidos.
4. Implementar/validar importacao de campanha como upsert CRM seguro, com
   coluna opcional `Situação no CRM`, sem duplicar contatos e com relatorio
   detalhado, somente depois dos gates Utility/opt-out/report.
5. Implementar/validar visao campanha-contato dentro de Contacts/CRM, sem
   modelo sombra, para rastreabilidade e evidencia de aceite.
6. Fechar pacote documental: SLA/suporte, treinamento, LGPD/seguranca,
   backup/restore e comprovacao Meta oficial.
7. Instagram, Facebook Messenger e Webchat/site seguem contratados, mas estao
   CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING e nao bloqueiam a frente atual.

Nao reabrir:

- CRA active flow visibility: CLOSED / CUSTOMER VALIDATED.
- CRA business hours: CONFIGURED / OPERATIONALLY VALIDATED.
- Outbound return destination aprovado: CLOSED / DEPLOYED / OWNER APPROVED /
  PROD NON-DESTRUCTIVE VALIDATED em
  `452d5826db42cc1b574eeff8fd8e0d038cd3491f`; novas pendencias de importacao
  CRM e Marketing media nao entram nessa entrega.

Follow-up de 2026-09-16:

- Campaign/CRM import `Situação no CRM`: OPEN / NEXT CRA CAMPAIGN IMPORT
  FRONT. A frente e upsert CRM tenant-scoped, nao apenas coluna nova. Contato
  existente deve ser atualizado, nunca duplicado; nome importado valido pode
  atualizar contato existente; celulas em branco preservam dados atuais; status
  CRM importado valido atualiza a referencia canonica; desconhecidos aparecem
  no preview/import e nunca criam status silenciosamente; duplicados no arquivo
  nao podem criar contatos duplicados; relatorio detalhado e baixavel pelo
  operador e obrigatorio.
- Contacts campaign relationship view: OPEN / CRA CAMPAIGN-CRM FOLLOW-UP.
  Contacts/CRM deve mostrar historico/estado de campanhas por contato quando
  aplicavel, incluindo contagem, ultima campanha, ultimo envio, template,
  status entregue/lido/falha, motivo de falha, opt-out, motivo de skip/bloqueio,
  situacao CRM e navegacao para detalhe. Fonte canonica continua sendo
  campaign/outbound/billing/opt-out/eventos ja persistidos; nao criar historico
  sombra dentro de Contact. Consulta deve ser same-tenant e evitar N+1,
  preferindo agregados na lista e detalhe sob demanda.
- Meta Marketing template media support: P2 / PRODUCT + META CAPABILITY.
  Inclui categoria MARKETING, headers IMAGE/VIDEO, exemplos/midia Meta,
  upload/handle, preview, variaveis, botoes suportados, submissao, status,
  motivo de rejeicao, envio aprovado e fonte oficial de preco Marketing. Nao faz
  parte da campanha Utility atual; promover somente se evidencia contratual
  exigir decisao do owner.

Nota Demo Phase C, 2026-09-15: a campanha controlada em `demo-converta`
`d9874c03-10e8-4061-a92e-6caa7b3001c3` encontrou bug generico de
preflight/persistencia apos Meta. `****9614` foi aceito pela Meta e confirmado
recebido pelo owner; webhooks `sent`/`delivered` foram recuperados, mas sem
OutboundMessage/ledger/report local. `****6787` nao foi tentado. A correcao
generica local foi testada, mas nao implantada; nao ha novo envio autorizado
sem novo gate.

## Enquadramento

O Converta deve ser apresentado como SaaS de atendimento omnichannel com foco em WhatsApp Oficial/Meta, Inbox humano, CRM operacional, campanhas controladas, modelos Utility, opt-out, LGPD e relatorios.

O caso CRA-PR e estrategico por exigir combinacao de atendimento receptivo, volume ativo controlado e governanca de custo Meta.

## Premissas conhecidas

- 30 atendentes.
- 1 numero WhatsApp.
- Volume receptivo estimado de 2.000 conversas/mensagens por mes, conforme premissa do processo.
- Volume ativo estimado de 10.000 por mes.
- Uso Utility-only para envios ativos.
- Sem campanha de marketing como posicionamento tecnico.
- Opt-out operacional ja suportado por eventos e bloqueio de envio ativo.
- Contatos anonimizados ficam ocultos no CRM e bloqueados em campanha.

## Aderencia atual

- Inbox humano com claim e controle operacional.
- Templates aprovados para janela fechada e envio ativo.
- Campanhas com previa, rascunho e envio explicito.
- CRM operacional por tenant.
- Mensagens prontas separadas de modelos Meta.
- Relatorio mensal Meta estimativo em JSON/CSV.
- Ledger por outbound e eventos de acompanhamento.
- RBAC e tenant isolation.
- Politica LGPD documentada.

## Estado operacional atual - 2026-09-04

Base de producao documentada nesta consolidacao:

```text
c308198aa97ea6a4233761eac9da9cbc945cbed6
```

### CRA Demo Flow V1

Flow de validacao:

```text
CRA-PR - Atendimento Institucional (Demo)
cmtg2g15t003d4sjghwhina8b
```

Estado persistido observado:

- active: true;
- entryPoint: true;
- nodes: 31;
- start: `consent`.

Validacao real por WhatsApp:

```text
oi
-> consent/LGPD UMA VEZ

consent
-> Menu Principal UMA VEZ

1
-> Registro UMA VEZ

1
-> Pessoa Fisica UMA VEZ
```

Resultado operacional:

- fresh service cycle: PASS;
- stale human state did not block reentry;
- hybrid exactly-once: PASS;
- no duplicate reply;
- active HUMAN control conversation remained HUMAN;
- health: PASS;
- SECULT remained CONNECTED.

Status:

```text
CRA DEMO FLOW:
READY FOR CUSTOMER VALIDATION

FLOW/RUNTIME COHERENCE:
CLOSED / REAL VALIDATED

HYBRID EXACTLY-ONCE:
CLOSED / REAL VALIDATED

CLOSED HUMAN REENTRY:
CLOSED / REAL VALIDATED
```

### CRA real tenant rollout state - 2026-09-04

Estado observado e homologado em producao:

- tenant: `cra-pr`;
- status: ACTIVE;
- departments: 6;
- queues: 6;
- users: 18 active total;
- role split: 3 ADMIN, 5 SUPERVISOR, 10 AGENT;
- active department memberships: 18;
- RBAC and tenant isolation: PASS by provisioning validation.

Flow publicado:

```text
CRA-PR - Atendimento Institucional
cmtkhhxtq002p4spns3fp0yux
```

Estado do flow:

- active: true;
- entryPoint: true;
- nodes: 31;
- start: `consent`;
- destination remap: PASS.

Configuracao operacional:

- CSAT: ENABLED;
- WhatsApp Web feature: ENABLED;
- Browser Push feature: ENABLED;
- Web Session: CONNECTED;
- Meta: READY / Graph validation PASS;
- coexistence: PASS;
- configured mode: HYBRID;
- hybrid exactly-once: PASS;
- invites: 18 sent, 0 final failures;
- first invite batch hit Resend 429 after 17 sends, and the final user was
  retried successfully;
- active accounts: do not assume activation count without current login
  evidence;
- department hours: CONFIGURED / OPERATIONALLY VALIDATED;
- configured schedule: `America/Sao_Paulo`, Monday-Friday 09:00-17:00,
  weekends closed, no exceptions;
- training: Wednesday 2026-09-09.
- Instagram/Facebook/Web: contracted but not activated initially.

Validacao real do tenant CRA-PR:

- approved flow -> consent -> menu -> handoff: PASS;
- human Inbox: PASS;
- human outbound/inbound: PASS;
- normal close: PASS;
- `CompletedServiceSnapshot`: exactly 1;
- CSAT score -> responded: PASS;
- optional comment in the same response: PASS;
- Browser Push background: REAL VALIDATED;
- Web Session CONNECTED after validation;
- Meta READY with Graph validation PASS;
- HYBRID real operational validation: PASS.

Status:

```text
CRA-PR REAL HYBRID OPERATIONAL VALIDATION:
CLOSED / PASS

CRA-PR READY FOR TRAINING 2026-09-09:
YES

CRA-PR DEPARTMENT HOURS:
CONFIGURED / OPERATIONALLY VALIDATED
```

### CRA admin chatbot settings - 2026-09-13

Incidente fechado em producao no commit
`69bedc38396b8f837a236b0af4a5446397919403`.

O tenant `cra-pr` e DB-backed em `Client` e nao possui entrada legada em
`.data/tenants.json`. `/admin/chatbot/settings` agora resolve esse caso por
`Client` + `TenantOperationalConfig` + defaults seguros em memoria, preservando
fallback legado para tenants que ainda dependem de `tenants.json` e sem criar
entrada artificial para CRA.

Smoke de producao:

- `/admin/chatbot/settings?clientKey=cra-pr`: 200;
- resources: 6 departamentos / 6 filas;
- flows: 1;
- health: ok/db ok;
- `.data/tenants.json`: ausente.

Status:

```text
CRA ADMIN CHATBOT SETTINGS:
CLOSED / REAL VALIDATED
```

### CRA active flow visibility - 2026-09-15

Owner report: the active CRA production chatbot flow executes correctly, but
tenant admins do not see it in `/app/chatbot`.

Audit status: `CLOSED / DEPLOYED / CUSTOMER VALIDATED`.

Local code audit shows tenant `/app/chatbot/flows` and internal
`/admin/chatbot/flows?clientKey=cra-pr` both list `ChatbotFlow` by `clientId`;
the tenant app additionally enforces feature `chatbot` and ADMIN/SUPERVISOR
role. Production DB/runtime/admin API evidence on 2026-09-15 proved one active
CRA entrypoint flow `cmtkhhxtq002p4spns3fp0yux`, owned by CRA, with
`features.chatbot=true`, and returned by admin API. Real CRA ADMIN Eduardo then
reproduced the UI absence; nginx shows `/agent-api/app/chatbot/flows` returned
200 for the app session while `/agent-api/app/chatbot/settings` returned 404.
Because the app page loaded flows/settings/resources through one `Promise.all()`,
the settings 404 prevented `hydrateFlows()` and the flow never reached UI state.
Runtime commit `363ce3ab` reuses the admin DB-backed settings fallback for
tenant app settings and hydrates flows/settings/resources independently.
Production delivery on 2026-09-15 used persistent backup
`pre-cra-flow-visibility-20260915-133330.dump`, reloaded only
`re7-admin-front` and `re7-whatsapp-agent`, preserved
`re7-whatsapp-web-worker`, and confirmed CRA settings/flows server-side with the
same active definition hash
`d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`. No flow
recreation, ownership change, definition mutation, entrypoint change or status
change occurred. Eduardo, CRA ADMIN, confirmed after the production fix that the
active flow is visible in tenant `/app/chatbot` and can be opened from
`Fluxos cadastrados`. Validation levels: LOCAL OWNER PASS, SERVER-SIDE
PRODUCTION PASS, CUSTOMER CRA ADMIN PASS.

ADMIN CHATBOT LOADING/BADGE:
CLOSED / REAL VALIDATED

Administradores CRA podem configurar horarios dos departamentos em:

```text
/app/settings/departments
```

Diretriz operacional: `demo-converta` e espelho comportamental para validacao
final antes do onboarding CRA-PR. Isso permite validar capacidades/politicas
genericas primeiro, mas nunca autoriza copiar dados ou ativos operacionais do
Demo para CRA-PR: WABA, phoneNumberId, token, Web Session auth, numero,
PushSubscription, usuarios, conversas, contatos, runtime, mensagens,
protocolos, ledgers e campanhas permanecem tenant-scoped.

### Escala CRA

O fluxo V1 esta pronto para apresentacao funcional ao cliente, mas a prova de
30 atendentes simultaneos ainda nao foi concluida.

```text
CRA 30-AGENT SCALE READINESS:
PARTIAL / OPEN
```

## Custo Meta e risco

O volume ativo mensal exige controle de categoria, aprovacao e acompanhamento de consumo. O Converta possui ledger, preview, resumo e relatorio mensal estimativo.

O custo Meta deve ser tratado como risco operacional/comercial controlado, nao como valor definitivo. A politica de preco depende de categoria, pais, entrega e regra vigente do provedor.

## Utility campaign readiness - 2026-09-15

A frente atual aprovada e preparar a primeira campanha real controlada com
template Utility, sem submissao Meta e sem envio Meta real antes de copia CRA
aprovada e aprovacao explicita do owner.

Snapshot somente leitura de producao em 2026-09-15:

- `cra-pr` ACTIVE, profile `government`;
- `campaigns=true` e `templates=true`;
- Meta/WhatsApp configurado com token presente, phone `****7308`, WABA
  `****4194` e business `****8327`;
- templates CRA: 0;
- pedidos de template CRA: 0;
- copia Utility CRA aprovada encontrada no repositorio/snapshot: nao;
- campanhas CRA: 0;
- eventos CRA de uso Meta campanha/billing/opt-out: 0.

Contrato operacional:

- primeiro passo: obter texto/copia Utility final aprovado por CRA/owner;
- segundo passo: criar/submeter/aprovar um template Utility CRA;
- terceiro passo: validar importacao/lista pequena, dedupe, variaveis e opt-out;
- quarto passo: criar rascunho e somente depois obter aprovacao para envio
  real controlado;
- nenhum envio real pode ocorrer sem aprovacao cobrindo template, destinatarios,
  janela, custo esperado, nome da campanha e quantidade de mensagens.

Checklist canonico:

```text
docs/bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md
```

Status:

```text
CRA-PR UTILITY CAMPAIGN:
LOCAL / CONTRACT ACCEPTANCE OPEN

UTILITY READINESS AUDIT:
CLOSED

REAL SEND:
NOT EXECUTED

OWNER APPROVAL FOR REAL SEND:
REQUIRED

CRA APPROVED COPY:
NOT FOUND / CUSTOMER INPUT REQUIRED
```

Gate local de 2026-09-15:

- banco local seguro: `re7_cra_contract_test2` em `127.0.0.1:5432`, usuario
  `re7test`, sem uso de producao;
- migrations Prisma oficiais aplicadas: 58/58;
- regressao DB-backed focada de campanha/import/runner: 5/5 PASS;
- billing/preview/lifecycle unitario: 5/5 PASS;
- suite ampla `campaignsFeatureRoutes.test.ts`: 111/112 PASS, com timeout no
  teste de runtime de chatbot inativo, fora da frente Utility/campaign.

## Demo contract validation mirror - 2026-09-15

`demo-converta` foi classificado como tenant de homologacao comportamental
multitenant, nao como copia CRA. A Fase A ficou documentada em:

```text
docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md
```

Snapshot Demo somente leitura:

- ACTIVE, profile `business`;
- campanhas, templates, CRM, Inbox, chatbot, reports, training, dashboard e
  satisfaction habilitados;
- Meta Cloud configurada com token presente;
- 1 template Utility aprovado;
- 0 campanhas;
- 0 eventos de billing/opt-out de campanha;
- 15 departamentos, 19 filas, 4 fluxos e 50 linhas de horario.

Resultado da Fase A:

- 36/52 requisitos podem ser validados no Demo como mecanica generica de
  produto;
- 19 ja possuem validacao de produto aproveitavel;
- 8 capacidades de ambiente/Demo foram validadas por leitura nesta rodada;
- 12 exigem evidencia especifica CRA;
- 4 canais seguem customer-deferred;
- 1 permanece como product gap/decisao de dominio;
- nenhum dado CRA foi usado no Demo;
- nenhuma submissao Meta e nenhum envio real foram executados.

## Gates recomendados antes de assinatura

1. Confirmar conteudo do primeiro modelo Utility CRA.
2. Submeter/obter aprovacao Meta do modelo Utility.
3. Definir lista pequena, quantidade de mensagens e janela de envio.
4. Validar importacao, variaveis, dedupe e opt-out antes de envio.
5. Obter aprovacao explicita do owner para template, destinatarios, janela,
   custo esperado, nome da campanha e quantidade.
6. Validar relatorio mensal com amostra controlada.
7. Formalizar treinamento e matriz de usuarios.
8. Preparar roteiro de smoke sem envio em massa.

## Limites e proximos passos

- Bloqueio automatico por limite ainda nao deve ser ativado sem runbook.
- Relatorio Meta e estimativo e nao substitui demonstrativo oficial do provedor.
- A modelagem dedicada de opt-out pode ser evolucao futura se o contrato avancar.
- Evidencias visuais devem ser capturadas em ambiente sanitizado.
- Regras de retencao e privacidade devem constar no onboarding operacional.
- Correcao reafirmada em 2026-09-15: a regra waiting-on-customer 1h como
  auto-close de atendimento humano foi superada e nao e requisito atual. HUMAN
  pode permanecer aberto indefinidamente sob controle do atendente. A frente
  correta e BOT/FLOW lifecycle: `resetAfterMinutes`, stale pending question reset e
  inactivity handoff ja validados; cross-provider hardening e exposicao de
  lifecycle policy no Guided seguem P2.

## Demo Phase B owner gate - 2026-09-15

Sem envio real.

- Template Demo aprovado: `data_exame`, Utility, `pt_BR`, variavel `{{1}}`
  Data, Meta id mascarado.
- Suitability: adequado para homologacao Demo com dados de teste; nao e copia
  CRA nem deve ser usado como copy CRA.
- Testes locais de precheck: 13/13 PASS para import CSV, dedupe,
  missing-variable safe failure, opt-out antes de outbound, lifecycle e billing
  idempotente.
- Scheduling: implementado, precisa validacao Demo controlada.
- Pause: implementado para `sending -> paused`, precisa validacao Demo
  controlada; `scheduled -> paused` nao e transicao valida, usar cancelamento
  antes do inicio.
- Cancel: implementado para draft/scheduled/sending/paused, precisa evidencia
  Demo controlada.
- Custo de gate: PAUSED FOR BILLING UNIT RECONCILIATION. A referencia anterior
  R$ 0,32 por mensagem veio da premissa central interna R$ 3.200,00/mes para
  10.000 mensagens ativas; nao e preco Meta e nao foi provada como unidade
  contratual final CRA no pacote atual.
- Phase C gate em 2026-09-15: owner autorizou os destinatarios Demo/RE7 por
  finais `9614` e `6787`; preflight PASS; template `data_exame` segue
  approved; ambos fora de 24h; nenhum opt-out ativo encontrado; `6787` possui
  historico duplicado de provider mas dedupe reduz a um alvo final; final unique
  targets = 2; custo referencial anterior R$ 0,64 agora fica suspenso ate
  reconciliacao da unidade de billing. REAL SEND = NO ate aprovacao explicita
  deste envio exato apos preview final e unidade de billing validada.
- Phase C send autorizado em 2026-09-15: execucao real parou com ISSUE. Meta
  aceitou 1 Utility `data_exame` para `****9614`, mas o runner falhou com
  `default_operational_department_missing` antes de persistir OutboundMessage,
  ledger e relatorio; `****6787` nao foi enviado. Campanha Demo
  `d9874c03-10e8-4061-a92e-6caa7b3001c3` ficou `failed`. Evidencia real:
  accepted=1, delivered webhook recuperado=1, read=0 observado, ledger local
  billable=0, total local R$ 0,00. Auditoria de Recipient A em 2026-09-15
  documentou reparo restrito possivel e o owner aprovou a reconciliacao em
  producao: foi criado um OutboundMessage local para A com o Meta id recuperado,
  aplicado billing delivered idempotente, ajustado `sentCount=1` e preservado
  `status=failed`. A nao foi reenviado; B segue nao tentado. O ledger de A esta
  correto como elegibilidade/contagem delivered Utility fora de 24h, mas o
  valor R$ 0,32 e classificado como referencia central de planejamento ainda nao
  provada como unidade final CRA.
- Meta pricing narrow gate, 2026-09-15: fonte oficial WhatsApp Business
  Platform Pricing / Meta Developers prova Brazil Utility BRL R$ 0,0350 por
  mensagem entregue, efetivo em 2026-07-01, tier 0-250.000. O preflight
  historico de B em 2026-09-15 parou antes da Meta porque o Demo ainda nao tinha
  destino humano generico ativo; esse bloqueio foi superado por configuracao de
  destino explicito aprovada pelo owner e pelo envio controlado B concluido em
  2026-09-16. Unidade contratual CRA permanece separada e NOT PROVEN; FinOps
  generico fica P2.
- Recipient B-only explicit human return gate, 2026-09-16: READ-ONLY PRE-SEND
  GATE / SUPERSEDED BY FINAL DESTINATION CONFIGURATION / NO REAL SEND. Nova validacao
  confirmou `demo-converta` ativo, template `data_exame` Utility `pt_BR`
  approved, B `****6787` autorizado e normalizado para um unico alvo, sem
  opt-out ativo, fora de 24h por 5d23h e sem outbound `data_exame` previo para
  B. A inventory de destino humano encontrou multiplos departamentos/fila
  ativos do mesmo tenant e nenhum destino generico inequívoco com fila:
  `Setor Teste` esta ativo mas tem zero filas; `Atendimento Geral` tem filas,
  mas esta inativo; os demais candidatos ativos sao setores tematicos. Per
  regra do owner, nao houve escolha por nome, fallback escondido, campanha nova
  ou chamada Meta nessa passagem read-only. Esse bloqueio foi superado depois em
  2026-09-16 quando o owner selecionou explicitamente o destino Demo existente
  por IDs.
- Recipient B-only destination configured, 2026-09-16: FINAL SEND GATE
  PREPARED / NO REAL SEND. Owner selecionou explicitamente para esta campanha o
  destino generico Demo existente `Atendimento Geral`
  (`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
  (`cmsiyb2k200n94sdpu5khkee0`). O roteamento fica persistido por IDs do mesmo
  tenant; nao ha regra de produto por nome. Read-back confirmou departamento
  ativo, fila vinculada, sem fluxos ativos referenciando esses IDs, sem
  conversas abertas no setor, 3 memberships, B `****6787` fora de 24h, sem
  opt-out e sem outbound `data_exame` anterior. Backup persistente:
  `/opt/re7online/backups/demo-b-destination-gate-20260916/pre-demo-b-destination-gate-20260916T130703Z.dump`,
  20M, 593 objetos, SHA256
  `0b4a2d4006ccfa1c9a589a5926f277edae64d8fa5924985045708d5b8102f50d`.
  Campanha draft `bb1d30e2-3a98-471a-9531-1f5e5d76a214` criada B-only com
  destino humano explicito, `sentCount=0` e zero chamada Meta. Esse estado
  preparado foi superado pelo envio controlado B aprovado pelo owner abaixo.
- Recipient B controlled Utility send, 2026-09-16: COMPLETED / DEMO PRODUCT
  CAPABILITY VALIDATION / NOT CRA REAL CAMPAIGN. Owner autorizou exatamente uma
  chamada Meta para B `****6787`. Resultado: Meta accepted, webhook sent=1,
  delivered=1, read=0, failed=0; OutboundMessage local
  `076910ef-ce6f-43d6-bfc2-2f30c4b41930`; campaign
  `bb1d30e2-3a98-471a-9531-1f5e5d76a214` completed com `sentCount=1`;
  `billing.active_message.delivered` count=1; duplicate billing=NO; A external
  sends neste run=0. Evidencia sanitizada criada em
  `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md`
  e `.csv`. Proximo gate: opt-out E2E; preco contratual CRA segue NOT PROVEN.
- Pendencias imediatas pre-treinamento: acompanhar primeiro login/ativacao de
  usuarios, especialmente 3 admins TI. Horarios dos departamentos CRA foram
  configurados e validados em producao em 2026-09-15.
- Horarios CRA nao permanecem P1 de runtime apos auditoria canonical de
  2026-09-14. A capability tecnica existe e foi comparada com SECULT sem
  mudanca de codigo; em 2026-09-15 a configuracao operacional foi aplicada:
  `America/Sao_Paulo`, Mon-Fri 09:00-17:00, fim de semana fechado,
  `QUEUE_FOR_NEXT_OPEN` preservado e resolver validado dentro/fora do
  expediente.
- Pendencias contratuais/produto separadas: ciclo receptivo logico para
  mensuracao, template Utility fora de 24h entregue, ledger Meta apos
  2026-10-01, relatorio mensal contratual e alinhamento formal para
  Instagram/Facebook/site contratados mas nao ativados inicialmente.
