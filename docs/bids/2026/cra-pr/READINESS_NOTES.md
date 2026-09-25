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
4. Validar com owner a importacao de campanha como upsert CRM seguro, com
   coluna opcional `Situação no CRM`, sem duplicar contatos e com relatorio
   detalhado. Implementacao local, auditoria de principios, testes focados e
   revalidacao do owner passaram; deploy de producao e evidencia CRA/customer
   ainda dependem de gate controlado e dado aprovado.
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

- Campaign/CRM import `Situação no CRM`: IMPLEMENTED / TEST VALIDATED /
  PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION
  NON-DESTRUCTIVE VALIDATED em `cad9489c`. A frente e upsert CRM tenant-scoped, nao apenas
  coluna nova. Contato existente e atualizado, nunca duplicado; nome importado
  valido pode atualizar contato existente; celulas em branco preservam dados
  atuais; status CRM importado valido atualiza `Lead.status`; desconhecidos ou
  ambiguos aparecem no preview/import e nunca criam status silenciosamente;
  duplicados no arquivo nao criam contatos duplicados; relatorio detalhado e
  baixavel pelo operador esta exposto na importacao CSV de campanhas. CRA real
  ainda nao foi importado.
  Historico preservado: implementacao inicial; owner PARTIAL PASS; auditoria de principios bloqueada
  por quatro P1 em 2026-09-17; lote corretivo local passou com identidade
  canonica unica, commit atomico por linha, ordem deterministica de duplicados,
  capability CRM e CSV protegido contra formulas; reauditoria PASS; revalidacao
  do owner PASS; integracao canonica preparada; deploy FF-only e smoke
  nao destrutivo de producao PASS. Nenhum import real ou envio foi executado e
  o aceite CRA continua pendente. A excecao operacional autorizada
  `apps/whatsapp-web-worker/.data/` permaneceu intacta e o worker nao foi
  recarregado. P2 residual:
  resolucao canonica sequencial por linha para posterior hardening de escala.
- Contacts campaign relationship view: CANONICALLY INTEGRATED / TEST VALIDATED /
  OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. Contacts/CRM mostra
  resumo de campanhas por contato na lista e historico recente no detalhe,
  usando `Campaign`, `OutboundMessage` e eventos canonicos ja persistidos.
  Nao cria historico sombra dentro de Contact, nao altera schema/migration,
  nao reescreve campanha/billing/opt-out, consulta same-tenant e evita N+1 por
  linha com projecao agregada por pagina mais detalhe sob demanda. A UX nao
  mostra preco/custo. Validacao local: `crmCapabilityRoutes.test.ts` 19/19
  PASS, backend build PASS, frontend build PASS, diff check PASS. Owner review,
  deploy e aceite CRA ainda pendentes.
- Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
  PASS / NO DEPLOY. Refinamento visual/operacional apenas: linhas
  clicaveis, acoes compactas, telefone completo no CRM autenticado same-tenant,
  remocao de metadados duplicados, switch de bloqueio de envio ativo, campanhas
  relacionadas agrupadas, Delete somente na linha da lista de Contacts sem acao
  de Delete dentro do detalhe, contadores de campanhas em abas, linha de campanha
  abrindo detalhe, acoes a direita, taxonomia unica de contadores e remocao de
  nota tecnica. O detalhe de campanha agora filtra resultados por status,
  Situacao CRM same-tenant e busca nome/telefone, copia filtrados e pode
  iniciar rascunho a partir dos contatos canonicos atuais filtrados; linhas
  historicas sem contato atual reutilizavel sao excluidas com contagem
  explicita. Campanhas agendadas dinamicas por filtro CRM seguem OWNER PASS /
  LOCAL VALIDATED / NOT DEPLOYED em
  `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`: o agendamento salva
	  apenas o filtro de Situacao CRM e a execucao cria snapshot imutavel. Nao
	  altera schema, opt-out, result truth, composer cleanup, Operational Queue,
	  historico, financeiro ou envio real.
- Contacts/Campaigns phone/import finishing, 2026-09-19: OWNER PASS / DEPLOYED /
  PRODUCTION NON-DESTRUCTIVE VALIDATED. Delete de Contact com conversa ativa permanece
  bloqueado pela lista com toast fechavel; o detalhe nao repete o bloco de aviso
  de conversa ativa; `Abrir campanha` abre o detalhe exato da campanha. Contact
  CSV preview/confirm agora mostra totais e erros por linha. Invariante
  permanente: NO NEW CONTACT/RECIPIENT PHONE MAY BE PERSISTED WITHOUT CANONICAL
  NORMALIZATION + VALIDATION. Isso fortalece a prontidao de import/result-truth,
  mas nao muda aceite formal CRA sem execucao CRA aprovada. Contacts CSV agora
  suporta `Situação no CRM` localmente, validada contra status CRM existentes no
  mesmo tenant; status invalido bloqueia a linha e valor em branco preserva ou
  aplica default pela semantica canonica. Validacao produtiva usou apenas preview
  e leitura no `demo-converta`, sem send real, provider call, billing ou mutacao
  inesperada de Contact/Lead/Campaign/Outbound.
- Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
  VALIDATED / NOT DEPLOYED. O fluxo de importacao de Contacts segue a linguagem
  visual/operacional de Campaign CSV, mantem telefone completo apenas na evidencia
  autenticada de preview/relatorio, e a validade da previa fica presa ao
  mapeamento exato de `Telefone`, `Nome` e `Situação no CRM`. Se o mapeamento
  muda, a previa antiga permanece visivel como stale, `Confirmar importacao`
  fica bloqueado e o operador precisa executar `Atualizar previa`; nao ha caminho
  de importacao com preview stale.
- Meta Marketing template media support: P2 / PRODUCT + META CAPABILITY.
  Inclui categoria MARKETING, headers IMAGE/VIDEO, exemplos/midia Meta,
  upload/handle, preview, variaveis, botoes suportados, submissao, status,
  motivo de rejeicao, envio aprovado e fonte oficial de preco Marketing. Nao faz
  parte da campanha Utility atual; promover somente se evidencia contratual
  exigir decisao do owner.

Follow-up de 2026-09-18, result truth/identidade de campanha Demo:

- `Campanha teste set.2` terminou com um destinatario entregue (`****6787`) e
  um bloqueado antes do provider (`****9614`); nao houve terceira tentativa.
- `****9614` tinha dois Contacts canonicos same-tenant e um Lead. O resolver
  atual retornou `identity_conflict` de forma fail-closed, sem OutboundMessage
  ou chamada Meta. O segundo Contact veio do bootstrap historico de campanha
  anterior ao Identity P1.
- Classificacao: HISTORICAL DUPLICATE RESIDUE; ACTIVE PRODUCT BUG = NO; NEW
  BYPASS FOUND = NO. Sem reparo, o destinatario continuaria bloqueado hoje.
- Reparacao transacional foi apenas preparada em dry-run e exige autorizacao
  separada do owner; nao inclui reenvio nem reescrita historica.
- Contadores: total 2, entregue 1, bloqueado 1, pendente 0, falhas tecnicas 0;
  campanha apresentada como entrega parcial.
- Evidencia: `docs/saas/DEMO_9614_CAMPAIGN_IDENTITY_CLOSURE_2026-09-18.md`.

Follow-up de 2026-09-18, ciclo de composicao de campanha:

- IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO DEPLOY;
- composicao nao salva e transitoria e volta limpa apos descarte/troca de aba;
- previa CRM/CSV nao cria Campaign nem contato;
- criar rascunho e o commit explicito; importacao CSV confirmada pode persistir
  upsert CRM canonico, que nao e revertido silenciosamente;
- rascunhos intencionais e campanhas agendadas, em envio ou concluidas nao sao
  removidos pela limpeza do compositor;
- sem schema/migration, envio real, provider call ou reparo de `****9614`.
- gate local: contratos do compositor/pagina 18/18 PASS, backend Campaign
  115/115 PASS, importacao/CRM 23/23 PASS, builds e lint focado PASS; smoke
  autenticado confirmou descarte/reentrada limpos, cancelamento CSV sem estado
  residual e preservacao do rascunho salvo. Revisao visual do owner pendente.

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
- Anonimizacao LGPD por titular esta OWNER PASS / CLEAN DELIVERY DEPLOYED /
  PRODUCTION HEALTH VALIDATED: busca Contact canonico ou Lead-only do mesmo tenant no CRM, gera
  previa sem mutacao, exige confirmacao forte e preserva auditoria sanitizada.
  O atalho `Privacidade` em Contacts apenas preseleciona o titular; exclusao
  operacional do CRM nao remove o titular da descoberta de governanca.
  O deploy de producao nao executou anonimização real nem provider call; smoke
  visual autenticado ficou pendente por falta de credencial app valida. Nao
  substitui o pacote contratual CRA de retencao/exportacao/eliminacao ate
  validacao e evidencia especificas.

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
  `status=failed`. A nao foi reenviado; B ainda nao havia sido tentado naquele
  momento e depois foi enviado apenas pela campanha B-only aprovada em
  2026-09-16. O ledger de A esta
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
  e `.csv`. Opt-out E2E foi concluido depois no Demo; preco contratual CRA
  segue NOT PROVEN.
- Opt-out E2E preparation, 2026-09-16: READY FOR OWNER GATE / NO MUTATION / NO
  REAL META SEND. Opt-out canonico atual e event-sourced em `Event`, por
  `contact.opt_out.recorded`/`contact.opt_out.revoked`, escopado por `clientId`
  + `waIdCanonical`; bloqueio de campanha usa
  `campaign.recipient.opt_out_blocked`. Runner bloqueia antes da Meta; envio
  manual ativo/template e resposta pronta tambem bloqueiam opt-out ativo; export
  mostra `opt_out`. Testes focados 130/130 PASS. Novos templates Utility
  `atualizacao_protocolo` e `lembrete_vencimento_anuidade` estao `PENDING` na
  Meta; `data_exame` permanece approved. Recomendado para o futuro E2E:
  B `****6787`. A `****9614` deve ser preservado como evidencia historica de
  reconciliacao. Aprovacao do owner ainda e obrigatoria antes de qualquer
  mutacao de opt-out, campanha bloqueada ou reversao.
- Opt-out E2E execution, 2026-09-16: COMPLETED / DEMO PRODUCT CAPABILITY
  VALIDATED / NOT CRA CUSTOMER SAMPLE. Owner autorizou apenas B `****6787`.
  Evento canonico `contact.opt_out.recorded`
  `88361d0f-89df-41fc-852b-ce84cbb43cc4`; campanha controlada
  `d260bdc6-326f-4487-8d15-21c2a98dd741` bloqueou antes da Meta com
  `campaign.recipient.opt_out_blocked`
  `80d6ca1d-94f2-4465-81b7-74888c1d0edc`; `sentCount=0`,
  `blockedCount=1`, Meta calls=0, mensagens reais=0, OutboundMessage=0,
  billing=0. Reversao canonica `contact.opt_out.revoked`
  `a5b58132-79fe-49dd-8aff-49fb78bf4566` restaurou B elegivel e preservou
  historico. A `****9614` ficou intocado.
- Reports/exports/billing Phase E, 2026-09-16: COMPLETED FOR DEMO PRODUCT
  CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. Sem envio real, sem mutacao de
  opt-out e sem mutacao de ledger. Auditoria confirmou que exportacao pode ser
  CSV/XLSX ou equivalente aberto e que billing ativo e Utility fora de 24h
  efetivamente entregue. Rotas reais auditadas: campanha CSV, reports CSV/PDF
  gerencial, Meta usage CSV, receptive sessions CSV e active-message billing
  CSV. Read-only em producao: A segue `failed`/reconciled com 1 outbound e 1
  `billing.active_message.delivered`; B segue `completed`/delivered com 1
  billing event; opt-out tem `blockedCount=1`, 0 outbound e 0 billing.
  `demo-converta` e `cra-pr` estao ativos com `campaigns` e `reports`.
  Evidencia:
  `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md`
  e `.csv`. XLSX nativo nao e prometido; preco contratual CRA em BRL segue NOT
  PROVEN. Proximo front: CRM import/upsert/report com `Situacao no CRM`.
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

- Canonical Identity P1, 2026-09-17: DEPLOYED / PRODUCTION NON-DESTRUCTIVE
  VALIDATED. Producao avancou por FF-only de `cad9489c` para `ed329ec8`; 119
  testes focados, build backend em producao, reload apenas do agente,
  health/DB e smokes read-only passaram. Sem schema, migration, backfill ou
  mutacao de `****6787`; snapshots pre/pos dos dois Contacts e Leads historicos
  foram identicos. Evento real de identidade pos-deploy ainda nao exercitado.
- Queue operacional: CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.
  Relacao explicita, FK composta, lifecycle atomico e UX apenas por Setor foram
  validados localmente e implantados em producao em 2026-09-18. A auditoria
  completa dos 54 departamentos e as 5 decisoes finais do owner estao documentadas em
  `docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md` e
  `docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`.
  Producao avancou por FF-only para
  `b166bcac8bf443d34ba7f3821016b6bae8069728`, aplicou a migration
  `20260917213000_add_department_operational_queue`, reconciliou 44 mapeamentos
  explicitos, criou/vinculou 2 filas internas aprovadas e terminou com 0
  departamento ativo sem fila operacional. Campaign UX permanece owner PASS; nao
  houve envio real nem mutacao de `****6787`.

## Campaign UX / result truth integration - 2026-09-18

Status: INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY.

The owner-approved Campaign UX/result-truth delta was recovered and reapplied on
the canonical Operational Queue baseline. Campaign return destination remains
Department-only in the customer UI, while the backend resolves and persists the
exact internal operational queue through `Department.operationalQueueId`. The
customer Campaigns and Inbox template shortcut no longer show price, cost,
tariff, Meta rate or estimated financial totals. Campaign list/detail now uses
persisted lifecycle/result truth: `Enviando`, `Agendadas`, `Concluídas`,
closeable progress/detail modal, recipient-level blocked/skipped/pending/opt-out
states and business-readable reasons.

Validation completed locally: `campaignsPageContract.test.ts` 6/6 PASS,
`campaignsFeatureRoutes.test.ts` 114/114 PASS on safe local DB
`re7_queue_rollout_validate_20260918`, backend build PASS, frontend build PASS
and `git diff --check` PASS. No production deploy, no real Meta send, no
schema/migration and no Demo `****6787` repair/mutation occurred.

## Campaign Result Truth canonical 12/13 corrective - 2026-09-18

Status: P1 VALIDATED LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY.

The initial synthetic fixture passed but did not reproduce the real production
shape. Demo seed `****6787` used 13 digits and its delivered historical outbound
used 12 digits, so literal reconciliation created an incorrect fallback row.
The hard gate stopped validation. The corrective reuses
`buildCrmWhatsappIdentityCandidates`, preserves every historical attempt and
does not add schema or migration. A read-only replay against the actual campaign
records now yields 2 visible rows, delivered 1, blocked 1, pending 0, technical
failures 0 and `Entrega parcial`. No CRA send, provider call, identity repair,
production mutation or deploy occurred. Validation: 118/118 + 56/56 + 72/72
PASS.

## Campaign flow integrity review - 2026-09-21

Status: IMPLEMENTED LOCAL / VALIDATED / NO DEPLOY.

The campaign creation flow now uses a clearer and auditable CSV mapping model:
`Contato` plus `Campo 1`, `Campo 2` and `Campo 3`. Template variables may only
use those generic fields. Generic fields are campaign-only and do not change CRM
name or CRM situation. Authenticated preview/report shows full normalized
WhatsApp identifiers and combines ready, blocked and error rows in the same
table, with copy/export evidence. Campaign name uniqueness is enforced inside
the same tenant with trim/case/whitespace normalization.

Persisted campaign seed is the truth for draft reopen, explicit send,
scheduling and runner execution. Test-send for variable templates requires
explicit variable values when the test number is not a saved recipient and
stops before provider call or aggregate mutation when incomplete. CRM campaign
history remains actual-send-only: drafts, imports, test sends and scheduled
campaigns not yet run are not shown as contact campaign history. This improves
CRA operator evidence and traceability, but is not a real send and not formal
CRA acceptance.

## Campaign flow follow-up CSV readiness - 2026-09-22

Status: LOCAL FIX PREPARED / NOT DEPLOYED.

Owner production validation found the Campaign CSV composer still confusing and
one persisted static CSV seed shape blocked send/schedule incorrectly. The
local correction keeps `Contato` as the required recipient column and expands
generic campaign-only value fields to `Campo 1` through `Campo 10`. Unmapped
generic fields no longer appear as template-variable sources. The UI separates
CSV column mapping from message-variable mapping, adds copyable preview
errors/blocks and keeps authenticated draft/detail recipient identifiers
unmasked for operational evidence.

The readiness correction is code-based, not a DB repair: static CSV campaign
seeds with complete per-recipient `componentsByWaId` and empty
`templateVariableMappings` are now valid for send/schedule, including the
observed Demo `Campanha teste set.9`
(`a1e01fb2-09f2-4be1-a180-3679a3ba008f`) shape. Dynamic CRM-filter campaigns
still require canonical template-variable mappings. No production DB mutation,
provider call, real send, schema change, migration, commit, push or deploy was
performed in this local pass.

## Campaign execution truth + CRM UX follow-up - 2026-09-22

Status: LOCAL FIX PREPARED / NOT DEPLOYED.

Campaign CSV preview, draft creation, scheduling and discard now persist only
campaign-owned private seed/components; they do not create Contact, Lead,
ContactChannelIdentity or CRM situation changes. Contact/Lead/CCI bootstrap is
deferred until an eligible campaign recipient reaches effective execution after
send preflight and provider attempt. Blocked-before-send, discarded and
never-sent campaigns therefore do not create CRM contacts or appear as contact
campaign history.

CRM-filter preview now shows only eligible recipients, removes the
operator-facing "Envio ativo" selector, hides blocked recipients from
count/table, and displays full authenticated identifiers. Result filters and
CSV mapping selects were corrected for dark theme readability. Campaign reuse
restores available modality, destination and variable mappings; CSV reuse still
requires reloading the source file. Contacts CSV preview header alignment was
corrected. No production DB mutation, schema change, migration, provider call,
real send, commit, push or deploy was performed in this local pass.

Local follow-up, 2026-09-24: campaign reuse preview hydration must preserve the
historical selected `leadIds` while refreshing current same-tenant CRM status
and eligibility for those contacts. Historical static filters are not claimed
when absent from `draftSeed`; dynamic CRM status is restorable only when
persisted as `dynamicFilter.crmBusinessStatusId`. Status: LOCAL FIX PREPARED /
NOT DEPLOYED.

Local validation complement, 2026-09-24: later opt-out/active-send blocking was
validated for reuse preview, post-preview send, scheduled execution and mixed
audiences with simulated providers. Blocked recipients produce zero new
provider call, OutboundMessage, Conversation or RuntimeState for the reused
campaign and do not gain new contact campaign-history participation, while the
original campaign history remains intact. Mixed audiences still send eligible
recipients; all-blocked audiences keep the zero-eligible contract. CRM
Situation is descriptive and not treated as an active-send block. Static
filters not stored in `draftSeed` remain unrecoverable; the current UI
hydration uses exact CRM detail reads per persisted `leadId`.

Review follow-up for `be4f2d51`, 2026-09-24: reuse preview hydration now opens
the composer immediately with an explicit loading state, limits concurrent CRM
detail reads and prevents incomplete previews from being used. Missing contact,
permission/session and network/query failures remain ineligible with distinct
labels; "Sem situacao" is reserved for successful CRM detail reads without a
stored CRM Situation. Stale responses after cancel/reset/another reuse cannot
change the composer, modal, preview or toast. Status remains LOCAL FIX PREPARED
/ NOT DEPLOYED / OWNER UI PENDING.
Local behavioral tests passed: `campaignReusePreview.test.ts` 6/6,
`campaignsPageContract.test.ts` 25/25 and frontend build PASS. No production
access, provider call, real send, schema change or migration was performed.

Production deploy on 2026-09-24 advanced the functional head from
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294` to
`1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` after persistent PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-reuse-preview-1ea1fef-20260924T200821Z/20260924-200822.dump`
(`sha256=3d87e903c379e63e7ccd60ea3c0f583fd7ac3929a4f6f0d8e8965f1148f5124c`,
581 objects). Frontend build passed and only `re7-admin-front` was reloaded;
`re7-whatsapp-agent` and `re7-whatsapp-web-worker` were preserved. Health and
basic `/app/campaigns`, `/app/crm`, `/app/inbox` route checks passed.
Authenticated owner reuse validation remains pending; no draft, schedule, send,
provider call, schema change or migration was performed by the deploy smoke.
Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.

Local product refinement, 2026-09-25: campaign detail/reuse UX received a
non-deployed local correction. The detail view removes redundant status and
mapping visuals, groups operational actions apart from test-send, shows result
message status only when real data exists, and keeps draft recipients in a
bounded scroll table with only data actually exposed by the API. Test-send in
the UI now asks only for the destination number; backend behavior remains the
source of truth for variable resolution and still blocks insufficient external
tests. Reuse now fetches the full campaign detail before deciding the composer
mode when the list item is incomplete, avoiding an incorrect manual fallback.
Static filters absent from historical seeds remain a known limitation. Local
validation: campaign page/reuse contracts 32/32 PASS, backend focused campaign
routes 2/2 PASS, frontend/backend builds PASS. Authenticated local browser
smoke on 2026-09-25 covered desktop and narrow viewport with local tenant
`campaign-refinement-local`, simulated providers and evidence in
`.codex/evidence/campaign-refinement-2026-09-25/`. No production access,
provider call, real send, schema or migration. Status: LOCAL FIX PREPARED / NOT
DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Review follow-up `efbcc62`, 2026-09-25: the local reuse correction now guards
stale responses before the initial detail fetch, neutralizes draft readiness
language and replaces text-matching of missing individual history with the
structured `missing_individual_history` marker. Genuine failed/blocked
historical evidence remains visible; completed rows with missing individual
history appear as historical inconsistency rather than proven provider failure;
and `pricingBillable` only counts when the API returns a boolean. Validation in
this complement: campaign page/reuse
contracts 32/32 PASS and focused backend campaign routes 3/3 PASS against the
local dedicated DB; frontend/backend builds PASS; authenticated local smoke on
frontend `3068` / backend `3067` PASS for neutral draft copy, hidden
draft/seed-only placeholder section, reuse without silent manual fallback and
bounded draft table. Evidence: `.codex/evidence/campaign-review-efbcc62-2026-09-25/`. Status:
LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Production deployment on 2026-09-25 advanced the campaign refinement functional
head from `1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` to
`d172b0e65a5237d835acd6ef5ece7ee50af5d241` after persistent backup snapshot
`/opt/re7online/backups/converta-persistent/snapshots/20260925T102510Z`
(`database.dump` sha256
`33003b892ae5b4f8d0228177017aa7c3c68707b910c36b7da6eb39affc070c13`,
22,330,663 bytes, 581 objects, checksum verified). Backend and frontend builds
passed; `re7-whatsapp-agent` and `re7-admin-front` were reloaded, and the web
worker was preserved after confirming the changed route/test files are not in
its compile graph. Health/db and basic `/app/campaigns`, `/app/crm`,
`/app/inbox` route checks passed. The deploy smoke did not create drafts,
schedule, test-send, send campaigns, change opt-out, call providers, change
schema or run migrations. Authenticated CRA/owner UI validation remains pending;
this is production health validation, not CRA formal acceptance.

Owner feedback after this deployment: visual campaign refinements passed. The
remaining local follow-up is campaign test-send with automatic campaign sample
data. The authorized contract is tenant-scoped and non-mutating for campaign
participation: use the typed destination only, reuse existing seed/component
resolution, choose the first eligible complete campaign recipient as sample for
external destinations, block before provider if no complete sample exists, and
revalidate destination opt-out/exclusion including aliases. The same local lot
removes the duplicated draft-detail summary block and its technical reason
chips while preserving campaign counters, recipient review and eligibility
truth. Status: LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING; not CRA
formal acceptance.

Follow-up on 2026-09-25: the campaign test-send sample resolver was corrected
locally to prioritize the typed destination after CRM mapping readiness is
rebuilt. A destination that belongs to the campaign audience, including 12/13
digit aliases, uses its own current recipient values; an incomplete known
recipient blocks before provider rather than using another recipient's data.
External test numbers still use the first eligible complete sample and may skip
incomplete candidates. Focused local coverage passed for static CRM audience,
dynamic CRM filter, alias matching, exact destination, zero provider call on
incomplete known recipient, and unchanged draft campaign status. Status: LOCAL
VALIDATED / NOT DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Production deploy on 2026-09-25: the test-send sample + draft-detail cleanup
lot was deployed to functional head
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` from
`d172b0e65a5237d835acd6ef5ece7ee50af5d241` after persistent backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T130420Z`
(`database.dump`, 22,377,789 bytes, SHA256
`1ed097a1ded0c14c0e75dc97ba6af1ba3ccadf985080bc612ff3cd4db0df3bb5`,
581 manifest objects). Backend/frontend builds passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, and the worker was
preserved. Health/db and basic campaigns/CRM/Inbox/Login routes passed. The
deploy smoke did not click test-send, create drafts, schedule, send campaigns,
change opt-out or call providers. Authenticated draft-detail UI inspection was
NOT EXERCISED from the deploy shell; OWNER UI PENDING. Status:
DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING; not CRA formal
acceptance.

Owner validation on 2026-09-25 confirmed PASS for the deployed test-send sample
and draft-detail cleanup lot at `aba600989eda77f6cb1258256f5aa0ba2f40ba03`;
this records product owner acceptance, not CRA formal acceptance.

Local follow-up on 2026-09-25: test-send now accepts valid Brazilian national
numbers with DDD and no `55` through the existing canonical CRM WhatsApp
normalizer, preserving full international numbers, 12/13 aliases and
destination block checks. Invalid or ambiguous national input blocks before
provider with a specific PT-BR message. CRM settings were reorganized into the
same expandable-row pattern used by Departments, with `Situação no CRM`
clearly separated from active-send blocking. Campaign light-theme select/options
and manual-send label contrast were corrected. Focused local tests/builds
passed. Follow-up smoke diagnosed the CRM load error as local environment
configuration: `/app/crm/settings` needed the legacy `.data/tenants.json` entry
for the test tenant. A minimal ignored local entry restored endpoint 200 with
DB-backed CRM statuses, and browser smoke validated mouse/keyboard
expand/collapse, save persistence, abandoning unsaved edits, desktop/narrow and
light/dark. Backend coverage includes BR national input without `55`, full `55`,
international preservation, incomplete rejection and alias opt-out blocking with
provider mocked. Status: LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING; not
CRA formal acceptance.

Pre-deploy review correction on 2026-09-25: DDD `55` national input is now
distinguished from Brazilian country code `55` by the canonical CRM WhatsApp
identity parser. National `55 99140-0002` and full `55 55 99140-0002` converge
to the same destination, selected-recipient data remains correct, and
opt-out/alias blocking is enforced for both forms before provider. Focused
normalizer and campaign route tests plus backend build passed. Status:
LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Focused local audit on 2026-09-25 covered ordinary campaign sends in addition
to test-send. CSV/import, CRM static/dynamic selections, reused recipients and
scheduled execution normalize Brazilian DDD `55` and full `55` forms before
opt-out and provider dispatch, preserve other Brazilian DDDs, avoid duplicate
destinations and block alias opt-out/exclusion before provider. CSV/import
continues to reject unsupported international input with controlled validation
and zero provider calls; CRM/Inbox template sends are identity/conversation
backed and not free-form phone entry points. Provider calls were simulated only.
Status: LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Review follow-up on 2026-09-25: the ordinary campaign runner now preserves
recipient-specific variables while normalizing DDD `55` inputs. A seed keyed by
`55991400002` sends to `5555991400002` with that recipient's own variables;
national/full duplicate forms produce one send and no variable mixing. Focused
runner and route tests plus backend build passed with provider mocked. Status:
LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Production deploy on 2026-09-25: the normalization/settings/contrast lot was
deployed to functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e` from
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` after persistent backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T161546Z`
(`database/database.dump`, 22,438,545 bytes, SHA256
`a7812cccd56a5f398ee7664aea44591b933997d74fc8199bc1a9ea6c2a5a2860`, 581
manifest objects). Backend/frontend production builds passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, preserving
`re7-whatsapp-web-worker` and `.data/`. Health/db and unauthenticated route
reachability for campaigns, CRM, Inbox, CRM settings and login passed.
Authenticated owner UI smoke was NOT EXERCISED due no legitimate shell session,
so OWNER UI remains pending. No test-send, draft creation, schedule, send, CRM
settings save, provider call, schema change or migration was executed. The
known backup retention cleanup permission issue remains separate from the valid
new backup. Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING;
not CRA formal acceptance.

Owner validation on 2026-09-25: owner confirmed PASS for the deployed
normalization/settings/contrast lot. Status is now DEPLOYED / OWNER VALIDATED /
CLOSED at functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`; this is
product-owner validation, not CRA formal contractual acceptance. The
old-snapshot backup-retention permission issue remains a separate operational
follow-up, and the transient Prisma reload error recovered with health/db OK.

Audience >1,000 audit on 2026-09-25: if a CRM filter finds 3,000 contacts, the
static-audience path does not silently select all 3,000. The UI preview is
paginated (`limit=25`) and the static draft stores only the eligible Lead IDs in
the current preview response; backend creation rejects more than 1,000 explicit
selected Lead IDs. Dynamic CRM-filter campaigns keep the filter until
execution; if current matches exceed 1,000, the runner fails with
`dynamic_match_limit_exceeded` before provider calls instead of truncating or
batching. Readiness gap: add explicit operator-facing preflight/UX copy for the
1,000-recipient limit and dynamic overflow before treating large-audience
campaigns as fully transparent to operators.

## CRM origin + Contacts CSV + campaign block guards - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING /
NOT CRA FORMAL ACCEPTANCE.

The product follow-up records inbound-created contacts/leads as
`Atendimento / conversa` through existing CRM provenance events, while keeping
manual, CSV, campaign/audience, system and unknown legacy origins separate.
Contacts CSV now supports all editable CRM import fields: phone required;
name, CRM situation, company, city, email and service/interest optional. Blank
or unmapped optional cells preserve existing data, and preview lists which
fields will change. CRM `NEW` is mandatory and active, but does not create
campaign ineligibility by itself. Campaign manual/CSV block guards and Inbox
template active-send guard continue before provider calls; the customer UI no
longer shows billing notices in Campaigns/Inbox. Production deploy reached
`2a652e693a4bce5cfaa7e0a1fa5ef667537f154a` with backend/frontend builds and
health PASS, no schema/migration, no smoke provider call and no real campaign
send. Authenticated owner UI, real post-deploy CSV import and real CRA campaign
evidence remain not exercised. This improves CRA readiness for import/upsert,
opt-out and operator traceability, but does not replace the controlled CRA run.

## P1 campaign delivery truth + alias-safe blocking - 2026-09-23

Local-only corrective gate completed for campaign delivery truth and send
blocking. Campaign CSV import now supports arbitrary phone headers through
explicit operator mapping when no safe alias is detected, without unsafe
first-column guessing. Opt-out/active-send blocking is evaluated across
Brazilian 12/13 digit identity aliases with latest event wins. Provider
accepted/submitted is submission evidence only; delivered/read callback evidence
is required before Inbox Conversation/Runtime materialization and before
classifying a recipient as delivered/read in customer UX. Meta reaction-only
webhooks are suppressed as non-content events. `Campaign.sentCount` remains
legacy submitted/accepted count, not delivered/read/final success evidence.
Real `****6683` controlled repair was executed in production on 2026-09-24 for
campaign `ad354ce4-35dc-4fca-85e5-3108cc9a2332`: only false operational
projection rows were deleted (`ConversationRuntimeState
38012577-8dbb-43d5-8bdd-2ef8ba541038` and `Conversation
9a07b043-6657-4dc3-9e7f-2b904caf939c`). Campaign, Outbound, Event,
billing/meta usage, Contact, Lead and CCI were preserved, including failed Meta
evidence `131026`.

Campaign RBAC/active-send authorization update on 2026-09-24 is DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER VALIDATED / CLOSED at functional production
head `b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`. The
audit found Campaign navigation had the `campaigns` feature flag but lacked an
explicit `minRole`; the local patch adds SUPERVISOR/ADMIN gating in navigation,
direct page hydration and backend app campaign routes. AGENT has no Campaign
navigation or app campaign API access, direct Campaign URL is denied without
protected data loading, and SUPERVISOR/ADMIN remain authorized through the
existing tenant, session, feature and capability layers. Opt-out/revoke routes
were audited and preserved for CRM consumers. Local validation: backend campaign
feature suite 121/121 PASS on the dedicated local DB; frontend campaign
contract 24/24 PASS; isolated local browser smoke on ports `3039`/`3000`
confirmed AGENT restricted UX/no protected campaign hydration and
SUPERVISOR/ADMIN campaign loading; backend/frontend builds PASS. Required
regression evidence remains green through `campaignRunner.test.ts` 7/7,
`campaignRecipientImport.test.ts` 7/7 and `tenantConfig.test.ts` 3/3. This
was complemented locally on 2026-09-24 with valid SUPERVISOR/ADMIN fixtures for
CSV preview/draft, CRM draft, manual immediate create, send, schedule, resume
and test-send using simulated provider calls; AGENT negative coverage still
proves no mutation and no provider call. This
strengthens CRA campaign operator-readiness evidence but does not claim OWNER UI
VALIDATED or a new CRA formal acceptance run. Production deploy was FF-only
from `957f19caced77693188a387bb7f7840a24092c67` after PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-rbac-b1a528a-20260924T143728Z/20260924-143729.dump`
(sha256 `215049ecb9aafdb6bd1e209b5a2f414b0ef8b0247447ec5719207de039a9ef58`,
581 objects), backend/frontend builds passed, only agent/admin-front were
reloaded, worker was preserved, and no POST mutation, real send or provider
call was executed. Role-specific production smoke remains NOT EXERCISED due to
absence of legitimate role sessions during automated smoke. Owner later
declared "validação passou"; that owner statement closes the RBAC front without
inventing additional technical evidence.

Next P2 for product hardening is Guided Builder BOT inactivity policy UX:
runtime already supports `resetAfterMinutes` and
`timeoutMinutes/action=HANDOFF`, but the Guided UI must show current values,
let the operator choose/clear them consciously and summarize practical behavior
in review. This should be implemented over existing fields only, with no
schema/runtime/provider change, no HUMAN auto-close and no reopening of CRA
business hours, which remain CONFIGURED / OPERATIONALLY VALIDATED.
