# CRA-PR Readiness Notes

Status: notas de prontidao para avaliacao contratual. Usar junto ao edital, termo de referencia e decisoes ja registradas.

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
- department hours: CONFIGURED / PRODUCTION VALIDATED / NOT RUNTIME P1;
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
P1 / PENDING CUSTOMER CONFIGURATION + FLOW-AWARE VALIDATION
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

### CRA active flow visibility - 2026-09-15

Owner report: the active CRA production chatbot flow executes correctly, but
tenant admins do not see it in `/app/chatbot`.

Audit status: `AUDIT BLOCKED / ROOT CAUSE NOT PROVEN`.

Local code audit shows tenant `/app/chatbot/flows` and internal
`/admin/chatbot/flows?clientKey=cra-pr` both list `ChatbotFlow` by `clientId`;
the tenant app additionally enforces feature `chatbot` and ADMIN/SUPERVISOR
role. No flow recreation, ownership change, definition mutation, entrypoint
change, status change or deploy is allowed before production API/DB evidence
proves the exact exclusion path.

ADMIN CHATBOT LOADING/BADGE:
CLOSED / REAL VALIDATED
```

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

## Gates recomendados antes de assinatura

1. Confirmar modelos Utility necessarios.
2. Confirmar se todos os modelos estao aprovados e ativos localmente.
3. Definir limite operacional mensal e alerta por tenant.
4. Validar relatorio mensal com amostra controlada.
5. Formalizar treinamento e matriz de usuarios.
6. Validar fluxo de opt-out e exportacao de campanhas.
7. Preparar roteiro de smoke sem envio em massa.

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
