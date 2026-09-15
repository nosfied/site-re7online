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
PRODUCT GAP: 2
DOCUMENTATION/EVIDENCE GAP: 9
NOT REQUIRED BY CONTRACT: 1
```

Pendencias criticas para prontidao contratual:

1. Obter copia Utility CRA aprovada e validar campanha controlada.
2. Evidenciar opt-out auditavel e bloqueio em campanha.
3. Gerar pacote de relatorios/exportacoes/billing com dados CRA redigidos.
4. Fechar pacote documental: SLA/suporte, treinamento, LGPD/seguranca,
   backup/restore e comprovacao Meta oficial.
5. Instagram, Facebook Messenger e Webchat/site seguem contratados, mas estao
   CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING e nao bloqueiam a frente atual.

Nao reabrir:

- CRA active flow visibility: CLOSED / CUSTOMER VALIDATED.
- CRA business hours: CONFIGURED / OPERATIONALLY VALIDATED.

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
- Correcao de 2026-09-14: a regra waiting-on-customer 1h como auto-close de
  atendimento humano foi superada e nao e requisito atual. A frente correta e
  abandono de automacao/BOT iniciada pelo cidadao; nao aplicar workaround de
  inatividade generica em HUMAN.
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
