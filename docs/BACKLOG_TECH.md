# BACKLOG — RE7ONLINE WHATSAPP AGENT

---

## FASE ATUAL DO PRODUTO

Produto SaaS operacional validado com:

- multi-tenant real em produção
- Postgres como source of truth
- campanhas assíncronas operacionais
- controle de uso por tenant
- UI administrativa funcional
- onboarding via Meta validado (Embedded Signup)
- onboarding interno assistido implementado (Sprint 26)
- observabilidade real da Meta integrada na UI de campanhas (Sprint 28)
- área do cliente operacional com login próprio e auto-scope (Sprint 29)

---

## ESTADO ATUAL

Produto operacional com observabilidade real da Meta e área do cliente funcional.

O onboarding interno foi implementado, porém ainda não validado com novo tenant via UI.

---

## PRIORIDADE ATUAL

Roadmap funcional/produto apos hardening de producao de 08-10/09.

Itens em `WATCH` nao bloqueiam a fila de execucao e nao devem virar frente ativa
sem novo incidente comprovado. Performance residual de Inbox deve ser medida em
janelas representativas futuras, mas nao e a prioridade corrente de
desenvolvimento.

### Auditoria canonica de backlog — 2026-09-13

Fonte de verdade auditada: branch canonico `flow-executor-quote-hardening`,
origin/production HEAD `69bedc38396b8f837a236b0af4a5446397919403`, producao
online, health `ok/db ok`, PM2 online, Prisma migrations up to date e CRA
`/admin/chatbot/settings` validado em runtime DB-backed.

Fechado / validado:

- Guided Builder 2.4: CLOSED / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION
  NON-DESTRUCTIVE VALIDATED. Entrega frontend-only em `ca34e123`, 54/54 testes
  PASS, build PASS, sem schema/migration, sem reload de backend/worker, hashes
  de `ChatbotFlow.definition` inalterados no smoke de producao e rotas
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot` saudaveis.
- Syer `****9614`: CLOSED. A correcao generica de handoff foi publicada em
  `597d7030`; o atendimento pre-fix foi reparado uma unica vez apos backup,
  preservando mensagens, protocolo, ciclo, fechamento e responsavel.
- Human handoff / queue contract: CLOSED / REAL VALIDATED. `WAITING` humano
  exige `departmentId` + `queueId` concreto. `queueId=null` nao representa fila
  padrao. O Guided Builder expõe `Setor`; fila unica e resolvida internamente,
  zero fila bloqueia e 2+ filas mostram seletor condicional.
- Canonical mail transport: CLOSED / DEPLOYED / REAL VALIDATED em `fec3a489`.
  Password reset, first access/invitation, Web Session disconnect alerts,
  template review e PostgreSQL backup alerts usam a camada canonica de mail.
  Fallback Resend API e SMTP `2465` centralizado permanecem preservados.
- Hybrid transport / identity / recovery: CLOSED / REAL VALIDATED para routing
  Web Session passivo, fresh-flow E2E, Meta duplicate dedupe, Lead/P2002,
  claim-before-downstream recovery e exactly-once coexistence.
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED por trafego organico. Nao e
  frente ativa; fairness e cursor round-robin permanecem somente WATCH.
- SECULT report truth/current-state, Maria 2/2 capacity diagnosis, Maria apos
  AVAILABLE, stale-heartbeat exclusion, AGENT closed access, CLOSED claim
  invariant, close observability, close terminal lifecycle e presence panel
  wording: CLOSED / VALIDATED ou CLOSED / DEPLOYED conforme historico abaixo.
- Inbox performance: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao REAL
  VALIDATED; `94882d76` foi REVERTED por regressao real; `4bc8befd` esta
  DEPLOYED. `last_message_lookup` permanece KNOWN RESIDUAL HOTSPOT / NO ACTIVE
  PATCH.
- Internal multitenant support access: IMPLEMENTED / P2 WATCH-HARDENING. O
  produto ja possui grant temporario, sessao de suporte, auditoria e banner de
  modo suporte; melhorias futuras devem focar evidencia operacional e least
  privilege, nao recriar o mecanismo.
- Users x Departments M2M: IMPLEMENTED. Existe
  `UserDepartmentMembership`, UI de usuarios com multiplos setores e uso no
  RBAC/assignment. Gap restante e refinamento de relatorios/filtros, nao modelo
  relacional basico.
- CRA admin chatbot settings: CLOSED / REAL VALIDATED em
  `69bedc38396b8f837a236b0af4a5446397919403`. Em 2026-09-13 a
  auditoria do toast inicial em
  `/admin/tenants/cra-pr/chatbot?clientKey=cra-pr` mostrou que CRA existe como
  `Client` DB-backed, mas `/admin/chatbot/settings` retornava
  `tenant_not_found` por exigir entrada legada em `.data/tenants.json`. A rota
  passa a montar tenant efetivo em memoria a partir do `Client` e dos resolvers
  DB-first, preservando fallback legado e sem criar entrada artificial em
  `tenants.json`. Smoke de producao: settings 200, resources 6 departamentos /
  6 filas, flows 1, health ok/db ok, `.data/tenants.json` ausente.
- Admin chatbot loading/badge: CLOSED / REAL VALIDATED em `69bedc38`. A UI
  admin hidrata flows/recursos mesmo se settings falhar parcialmente, o estado
  de loading nao depende mais de `settings != null`, o bug de badge permanente
  "Carregando" foi fechado e erro verdadeiro e exibido quando settings nao
  estiver disponivel.
- Abandoned automation / BOT flow lifecycle: LOCAL E2E VALIDATED / PRODUCT
  DECISION OPEN. Em 2026-09-14, o comportamento existente foi validado em DB
  local seguro, sem runtime change, sem producao e sem deploy. `resetAfterMinutes`
  reinicia menu/submenu/captura no proximo inbound e nao move para HUMAN nem
  CLOSED; `timeoutMinutes/action=HANDOFF` promove uma vez para HUMAN/WAITING
  com department/queue concretos, protocolo e mensagem de posicao quando o
  destino e valido; nova varredura nao duplica handoff. Caveats abertos:
  limpeza de `flowContext` em reset stale, copy/UX de timeout e paridade
  provider-independent do processor. Auto-close generico de atendimento HUMAN
  continua fora do requisito.
- Inbox visibility policy audit: CLOSED / AUDITED / NO CODE CHANGE. A politica
  `shared`/`assignee_only_after_assignment` permanece apenas como regra de
  projecao/visibilidade para lista/detalhe/timeline; nao altera criacao de
  conversa, handoff, fila, capacidade, presenca, claim, transferencia, envio,
  fechamento, atribuicao automatica ou RBAC canonico. A restricao de acesso de
  AGENT a conversas `CLOSED` permanece mais forte e preservada.

ACTIVE P0:

- NONE.

ACTIVE P1:

1. Abandoned automation / BOT flow lifecycle: LOCAL E2E VALIDATED / PRODUCT
   DECISION OPEN. Correcao de 2026-09-14: a interpretacao anterior
   `WAITING_FOR_CUSTOMER 60m` como auto-close de atendimento humano foi
   SUPERSEDED / NOT PRODUCT REQUIREMENT. Conversas HUMAN continuam sob controle
   humano e podem permanecer abertas indefinidamente ate fechamento explicito. A
   frente correta e abandono de automacao iniciada pelo cidadao: menu/pergunta/
   captura fica aguardando resposta, cidadao para de responder, runtime BOT fica
   incompleto. Auditoria e E2E local em
   `docs/saas/INACTIVITY_AUTOMATION_LIFECYCLE_AUDIT_2026-09-14.md` aponta infra
   existente para reuso: `chatbotRuntime.lastInteractionAt`,
   `resetAfterMinutes` no executor, `timeoutMinutes/action=HANDOFF` no
   `chatbotInactivityProcessor`, claim DB-backed e escopo multitenant. O E2E
   confirmou reset no proximo inbound sem HUMAN/CLOSED, handoff unico com
   department/queue concretos, protocolo e posicao na fila, e ausencia de
   duplicidade em nova varredura. Gap restante: limpeza de `flowContext`, copy/
   UX de timeout e paridade provider-independent, sem criar scheduler novo e
   sem auto-close HUMAN.
2. CRA-PR department/flow-aware hours: P1 / CONFIGURATION + VALIDATION OPEN.
   Capability de horarios de departamento existe (`businessHours`,
   `NO_SCHEDULE`, UI em `/app/settings/departments`), mas a configuracao CRA
   segue pendente do cliente e precisa validacao de comportamento fora de
   expediente no fluxo. Sem horario salvo significa `NO_SCHEDULE`/aberto.
3. Demo Meta Cloud restriction: P1 / EXTERNAL META REMEDIATION + CHANNEL
   CONTINUITY OPEN. Auditoria somente leitura de 2026-09-14 confirmou o phone
   number Meta do `demo-converta` com `status=BANNED` e WABA com
   `account_review_status=REJECTED`; o business aparece `not_verified` e 3
   templates retornaram rejeicao `SCAM`. O banco nao mostrou outbound Meta,
   campanha, template ativo ou passive Meta sends nos ultimos 72h, entao volume
   recente da aplicacao nao e causa comprovada. A Web Session do Demo esta
   `QR_REQUIRED` desde 2026-09-13 22:40:23Z e nao deve ser reconectada,
   desconectada ou limpa sem autorizacao explicita do owner.
4. User deactivation active-conversation guard: IMPLEMENTED LOCAL / OWNER
   APPROVED / PRODUCTION DELIVERY PENDING. Um usuario nao pode ser desativado enquanto houver
   conversas HUMAN operacionalmente ativas atribuidas a ele. Predicado canonico
   local: `ConversationRuntimeState.clientId` do tenant, `assignedUserId` do
   usuario, `closedAt=null`, `status IN (WAITING, IN_PROGRESS)` e `mode` ausente
   ou diferente de `BOT`. `WAITING` sem atribuicao, `CLOSED`, outro tenant e BOT
   nao bloqueiam. A desativacao nao fecha, transfere, remove atribuicao, troca
   fila ou altera lifecycle de conversa silenciosamente; retorna
   `user_has_active_conversations` com mensagem acionavel para transferir ou
   encerrar os atendimentos antes de continuar. Backend guard aplicado em
   `/app/users/:id` e `/admin/users/:id`; UI tenant-side mostra a mensagem
   especifica e mantem estado persistido ativo em rejeicao. Backend e
   autoritativo; feedback frontend e apenas UX. Validacao local owner-approved:
   regressao backend focada 1/1 PASS, contrato frontend 7/7 PASS, builds PASS.
   Suite completa `campaignsFeatureRoutes` ficou 109/110 PASS com timeout
   pre-existente e nao relacionado em `meta inbound clears active chatbot
   runtime when persisted flow is inactive`, classificado como WATCH separado.
   No schema/migration; no deploy; producao ainda pendente.

RECENTLY CLOSED:

- Users Management 2.0: CLOSED / DEPLOYED / OWNER APPROVED / PRODUCTION
   NON-DESTRUCTIVE VALIDATED. Inactive user disappearing
   root cause: `GET /app/users` filtrava `User.isActive=true` no backend,
   enquanto a UI ja possuia filtro de status e serializer preservava
   `isActive=false`. Ajuste local inclui inativos no modo Todos, filtros
   `Todos/Ativos/Inativos`, linhas expansivas em `/app/users`, contador
   `activeUsers/maxActiveAppUsers` usando o mesmo resolver/enforcement do
   backend e micro-ajustes finais de owner: filtro com regiao visual distinta,
   botao explicito expandir/recolher, hierarquia tonal header/body e botao
   Salvar preenchido. Contrato de draft: expandir inicializa do estado
   persistido; recolher, trocar linha ou alterar filtros descarta alteracoes
   nao salvas; filtros, contador e disponibilidade de assentos derivam somente
   de `users` persistido, nunca de `userDrafts`. Test gate local: frontend
   focado PASS, backend focado PASS, builds PASS, schema unchanged, migration
   none. Entrega em producao aplicada em 2026-09-14 no commit
   `5ad40c10eda77076bc2a069e432663ac2271f0a8`; smoke pos-deploy confirmou
   health, rotas `/app/users` e `/app/settings/users`, backend online e dados
   reais com usuarios inativos por tenant sem mutacao.
- Departments Management UX 2.0: CLOSED / DEPLOYED / OWNER APPROVED /
   PRODUCTION NON-DESTRUCTIVE VALIDATED.
   Aplicacao local em `/app/settings/departments` reaproveita o padrao visual
   aprovado em Users Management 2.0 e Guided Builder: linhas recolhiveis, botao
   circular explicito expandir/recolher, um setor aberto por vez, header com
   resumo persistido e corpo expandido em tom subordinado para edicao. Contrato
   de draft: expandir inicializa a partir de `departments` persistido; recolher,
   trocar linha ou alterar filtros descarta alteracoes nao salvas; resumo/filtro
   nao deriva de draft local. Sem alteracao de rota, fila, horario, RBAC,
   autoassign, capacidade, presenca, Inbox visibility, schema ou migracao.
   Refinamento aprovado tambem fixa a coluna direita dos controles expansivos
   em Users Management 2.0 e Departments Management UX 2.0 com
   `grid-cols-[minmax(0,1fr)_auto]`, impedindo que conteudo quebrado empurre o
   botao circular para uma segunda linha. Entrega em producao aplicada em
   2026-09-14 no commit `5c051f83df6bc99aa998985ba93301e601e502df`; smoke
   pos-deploy confirmou health, `/app/users`, `/app/settings/departments`,
   estrutura right-anchor em producao e tenants demo-converta, cra-pr,
   secult-pe e syer-rodrigues ACTIVE sem mutacao.

ACTIVE P2:

1. Question conditional branching: PRODUCT GAP / OPEN. Runtime atual suporta
   captura sequencial (`capture.next`) e o Guided limita ate 3 perguntas
   consecutivas; nao ha predicados por valor capturado, sim/nao ou fallback por
   resposta livre. Nao e bug do Guided Builder.
2. Reporting context enhancements: ENHANCEMENT / OPEN. Adicionar contexto AUTO
   vs MANUAL, policy, `presenceMode`, carga/capacidade atual e filtros
   ativo/inativo onde fizer sentido, sem reabrir bugs de verdade de relatorio ja
   fechados.
3. Guided Builder final review summary: UX BACKLOG / OPEN. A etapa "Revisar
   antes de aplicar" hoje mostra resumo parcial orientado ao caminho humano mais
   relevante quando existe handoff. O backlog e evoluir para resumo completo por
   opcao/submenu/caminho, sem alterar runtime ou `ChatbotFlow.definition` ate
   haver contrato de UX aprovado.
4. Meta Cloud unlink/removal cleanup semantics: PRODUCT/OPS GAP / OPEN.
   Consolidar semantica de disconnect/unlink, limpeza de token, associacoes
   phone/WABA, estado de coexistencia, remocao de canal por tenant e fallback
   seguro.
5. Internal support access hardening: P2 / WATCH-HARDENING. Mecanismo existe;
   manter evolucao em auditoria, expiracao, evidencias e menor privilegio.

P3:

- polish de nome social/display name;
- acao rapida de retificacao;
- melhorias menores de UX/filtros que nao bloqueiam contrato.

WATCH only:

- Inbox performance residual e CPU;
- `last_message_lookup` residual;
- SECULT fairness e round-robin cursor;
- SECULT Web Session non-content suppression organic validation;
- scale/load validation em janelas representativas;
- Syer Dashboard transient error / refresh loop: BUG NOT PROVEN / WATCH. Owner
  observou `/app/dashboard` lento, toast vermelho breve e recuperacao posterior
  em tenant com pouco dado; auditoria anterior nao provou endpoint falho, refresh
  loop, relacao com `/app/conversations` ou regressao de CPU. So promover a frente
  com reproducao ou evidencia nova.
- billing/ledger Meta como conciliacao futura.

Proximas cinco frentes:

1. P1 Abandoned automation / BOT flow lifecycle. Why now: cidadao pode iniciar
   menu/pergunta/captura e abandonar antes de concluir. Valor: endurece reset,
   expiracao e UX de automacao incompleta sem afetar HUMAN. Dependencia:
   validar comportamento atual de `resetAfterMinutes` e
   `timeoutMinutes/action=HANDOFF` em E2E local. Demo validavel: sim. Code
   esperado: talvez, reaproveitando executor/processador existente. Config
   esperado: flow-level primeiro. Risco: medio por lifecycle. Done: abandono de
   menu/captura/submenu, inbound tardio, restart e tenant isolation testados.
2. P1 CRA hours flow-aware validation. Why now: cliente real com configuracao
   pendente. Valor: evita handoff humano fora do expediente sem bloquear
   autoatendimento. Dependencia: cliente configurar horarios. Demo validavel:
   sim. Code esperado: talvez. Config esperado: sim. Risco: baixo/medio. Done:
   horario CRA salvo e fluxo validado dentro/fora do expediente.
3. P1 User deactivation active-conversation guard production delivery. Why now: administracao de
   usuario pode impactar atendimento humano em curso. Valor: evita atendimento
   ativo sem responsavel valido e sem mutacao silenciosa de ciclo. Dependencia:
   owner approval local ja obtido; falta entrega em producao. Demo validavel:
   sim. Code esperado: implementado localmente. Config esperado: nao. Risco:
   medio por lifecycle/RBAC. Done: backend bloqueia pelo predicado canonico, UI
   explica, e desativacao so passa apos transferir/fechar.
4. P2 Question conditional branching. Why now: lacuna descoberta durante 2.4 e
   valor direto para fluxos institucionais. Valor: respostas sim/nao e caminhos
   por resposta. Dependencia: desenho de runtime/predicados. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio/alto. Done:
   predicates testados sem quebrar fluxos existentes.
5. P2 Reporting context enhancements. Why now: transforma validacoes de fila em
   evidencia operacional sem mexer no core de atribuicao. Valor: auditoria para
   supervisao/contratos. Dependencia: definir campos e filtros. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio. Done:
   relatorios mostram contexto sem distorcer historico.

---

## RISCOS E PENDÊNCIAS ATUAIS — 2026-05-03

### Atualizacao operacional consolidada — 2026-09-01

Estado fechado/validado:

- hybrid exactly-once: CLOSED / REAL VALIDATED;
- Meta template routing in configured modes: CLOSED / REAL VALIDATED;
- HYBRID template outbound: CLOSED / REAL VALIDATED;
- Meta-to-Web echo safety: CLOSED / REAL VALIDATED;
- HYBRID inbound dedupe after Meta template reply: CLOSED / REAL VALIDATED;
- HYBRID claim-before-downstream recovery: HARDENED / REAL VALIDATED;
- HYBRID full fresh-flow E2E: CLOSED / REAL VALIDATED;
- exactly-once coexistence path exercised: CLOSED / REAL VALIDATED;
- post-reply freeform routing in HYBRID/AUTO: CLOSED / REAL VALIDATED;
- multichannel Lead identity reconciliation / P2002: CLOSED / REAL VALIDATED;
- Meta usage accounting for template vs Web Session freeform: CLOSED / REAL VALIDATED;
- flow/runtime coherence: CLOSED / REAL VALIDATED;
- closed HUMAN reentry: CLOSED / REAL VALIDATED;
- SECULT CompletedServiceSnapshot: CLOSED / REAL ORGANIC VALIDATED;
- SECULT current-state report truth: CLOSED / REAL VALIDATED;
- Maria capacity diagnosis: CLOSED / CORRECT PRODUCT BEHAVIOR;
- SECULT completed-service reporting: CLOSED / PRODUCTION VALIDATED;
- Inbox Timeline Phase 1: CLOSED / PRODUCTION VALIDATED;
- Inbox Phase 2 WebSocket-driven invalidation: CLOSED / PRODUCTION VALIDATED;
- multichannel reconciliation migration: CLOSED / PRODUCTION VALIDATED;
- Web Session wrapped media normalization: CLOSED / SAFE NORMALIZATION PATCH;
- SECULT Web Session non-content control event suppression: DEPLOYED / TESTED in
  `c308198a`; organic validation pending;
- SECULT auto-assignment incident 2026-08-31: AUDITED / BUG NOT CONFIRMED; UX clarification deployed in `c91671e9`;
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED on 2026-09-10; after
  activation on 2026-09-09 11:38:31 -03, 30 organic auto-assignments selected
  11 distinct agents, Maria Helena received one automatic assignment after
  becoming available below capacity, `no_eligible=0`, and stale heartbeat alone
  produced zero exclusions. Fairness and round-robin cursor remain WATCH, not
  proven algorithm defects.
- SECULT Inbox/CPU correlation: CLOSED FOR PHASE 2 DECISION / CPU IMPROVED /
  WATCH;
- Backend CPU residual load watch after hybrid claim recovery deploy: IMPROVED /
  WATCH.
  Samples on 2026-09-10 held near 67-69% and later near 60-61% CPU with health
  PASS, memory stable around 230-278 MB, DB pressure NORMAL, SECULT real traffic
  active, `runtime_state_fallback=0`, `multichannel.dual_read=0`, and no
  retry/reconnect/error loop evidence. Current residual hotspot remains
  `/app/conversations` list reads: 21 req/min produced 246
  `inbox.list.query_count`/min, approximately 11.7 queries/request.
- `/app/conversations` fixed-cost lookup optimization: REAL VALIDATED. The
  route is already mostly batched and did not show
  current runtime-state N+1 in production (`runtime_state_fallback=0`). A small
  backend patch now reuses the `Client.features/profile` already loaded by
  request auth, removing one duplicate `client.findUnique(features/profile)` DB
  read per app Inbox list request. Comparable 2026-09-10 measurement after
  `1aae26b5` showed ~10.7 queries/request under real SECULT Inbox polling, with
  `tenant_features` effectively zero-cost in the app list path. No global cache,
  current-state cache or response cache was introduced.
- `/app/conversations` channel state batch hotspot: REAL VALIDATED / IMPROVED.
  Production audit on 2026-09-10 showed no external
  provider call and no per-row query fan-out in `channel_state_batch`, but
  SECULT's 251 Web Session identities caused the switch-warning lookup to
  materialize about 10.3k historical outbound rows per refresh. The selected
  patch keeps the same tenant-scoped provider truth and query count, but fetches
  only the latest outbound row per identity with bounded SQL result sets.
  Comparable post-deploy measurement showed SECULT `channel_state_batch`
  interval avg ~189ms and cumulative p95 ~692ms, down from the previous
  ~445-615ms avg / ~782-1411ms p95 observed baselines. No global cache, stale
  channel-state cache, schema change or migration was added.
- `/app/conversations` bounded outbound preview lookup experiment: REVERTED /
  REAL PERFORMANCE REGRESSION. The `94882d76` patch was semantically correct, but production
  evidence on 2026-09-10 showed a PostgreSQL plan regression for SECULT:
  `JOIN LATERAL` executed a per-identity plan with sequential scans and estimated
  cost around 150k versus around 1.6k for the previous broad outbound lookup.
  Comparable 5-minute window showed `last_message_lookup` around 5.9s average
  and `/app/conversations` around 5.8s average, while the pre-change comparable
  baseline was about 275ms for `last_message_lookup`. Runtime was rolled back by
  `4bc8befd`; keep the semantic oracle and plan evidence for a future design.
- Browser Push / PWA notifications: CLOSED / REAL VALIDATED;
- true foreground Web Push detection: CLOSED / REAL VALIDATED in `670f392d`;
- hidden desktop local sound: CLOSED / REAL VALIDATED in `c50fb73c`;
- supervisor team presence panel: DEPLOYED / VISUAL SMOKE PENDING;
- deploy impact matrix hardening: CLOSED / SCRIPT + DEPLOY INTEGRATION + RUNBOOK;
- closed-conversation access hardening: CLOSED / PRODUCTION VALIDATED in
  `93cd0e06`;
- CLOSED claim invariant: CLOSED / PRODUCTION VALIDATED;
- Inbox close action observability: IMPLEMENTED / VALIDATED FOR ROOT-CAUSE
  FORENSICS;
- Inbox close terminal lifecycle: FIXED / DEPLOYED in `f62f1288`;
- Web Session operational disconnect alert delivery: FIXED / DEPLOYED in
  `b31fd976`; SMTP port `2465` now uses TLS, retryable transport failures have
  bounded retry, and delivered alerts still dedupe by incident fingerprint;
- Canonical mail transport cleanup: CLOSED / IMPLEMENTED. Password reset,
  first-access invitations, Web Session disconnect alerts, template-review
  alerts and PostgreSQL backup alerts now share one canonical mail provider and
  config resolver. Business callers still own recipients, content, dedupe and
  retry policy.
- CRA Demo V1: READY FOR CUSTOMER VALIDATION.
- CRA-PR real HYBRID operational validation: CLOSED / PASS;
- CRA-PR approved flow -> consent -> menu -> handoff: CLOSED / PASS;
- CRA-PR human Inbox + human outbound/inbound + normal close: CLOSED / PASS;
- CRA-PR `CompletedServiceSnapshot`: CLOSED / exactly 1 snapshot in validation;
- CRA-PR CSAT score/responded and optional comment in same response: CLOSED / PASS;
- CRA-PR Browser Push background: CLOSED / REAL VALIDATED;
- CRA-PR ready for training 2026-09-09: YES.
- Guided Builder 2.1 business-first: DEPLOYED / LOCAL + PRODUCTION READ-ONLY
  VALIDATED;
- Guided Builder second-flow stale JSON incident: CLOSED / REAL VALIDATED;
- Guided Builder new-flow entrypoint safety: FIXED. Creating a new chatbot
  flow must not replace the tenant entrypoint unless the operator explicitly
  marks it as the main entry flow.

Fila ativa historica substituida pela "Auditoria canonica de backlog —
2026-09-13" acima. Nao usar listas antigas como fila corrente quando houver
conflito.

WATCH only:

- Inbox performance residual: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao
  REAL VALIDATED; `94882d76` foi REVERTED por regressao real de plano e
  `4bc8befd` esta DEPLOYED. Proxima acao e apenas medicao em futura janela
  SECULT representativa, nao novo patch.
- CPU residual: WATCH. Nao ha evidencia atual de dual-read, runtime fallback,
  reconnect loop, retry hibrido ou pressao de DB.
- `last_message_lookup`: KNOWN RESIDUAL HOTSPOT / NO ACTIVE PATCH. Nao retornar
  ao desenho lateral per-identity sem indice/plano comprovado.
- SECULT fairness/round-robin cursor: WATCH. `presenceMode=AVAILABLE` ja tem
  comportamento funcional validado.
- SECULT Web Session non-content suppression: DEPLOYED / TESTED / WATCH.
  Validacao organica permanece observacao passiva; nao reabrir frente ativa sem
  nova evidencia representativa de bolhas `Mensagem nao suportada`.

Dividas tecnicas abertas:

- `multichannel.shadow_write.failed` / `missing_channel_account_id`: preexistente, non-strict, sem retry loop, associado a projection/data-quality gap de Web Session, non-blocking;
- drift historico global Prisma schema/migrations: separado da migration de reconciliacao multichannel ja validada;
- SECULT Web Session `UNKNOWN` media historical rows: no backfill; exact original subtype is
  not recoverable from the sanitized persisted payload;
- SECULT closed-conversation RBAC incident 2026-09-09: fixed generically. AGENT
  users no longer list or directly access `CLOSED` conversations; SUPERVISOR and
  ADMIN historical access is preserved. Claim/assume against `CLOSED`
  conversations is rejected with `conversation_closed` before assignment capacity
  checks.
- SECULT Inbox close terminal telemetry incident 2026-09-09: fixed generically.
  `close.requested` is followed by an awaited terminal client event,
  `close.succeeded` or `close.failed`, before post-close UI reconciliation can
  clear selection or remove the row. Backend close semantics, CSAT, protocol
  closure and snapshots remain unchanged.
- Demo Web Session recovery: CLOSED / REAL VALIDATED after controlled reconnect.
  Inbound, outbound, close, CSAT and post-send stability passed without
  401/conflict recurrence.
- baselines CRA versionados nesta consolidacao como evidencia de validacao, nao como dump operacional:
  - `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md`;
  - `docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`.
- CRA department hours remain PENDING CUSTOMER CONFIGURATION. Under the current
  domain rule, no schedule means `NO_SCHEDULE` / open and must not be classified
  as a technical failure;
- billing measurement items ainda abertos: ciclo receptivo logico, template Utility fora de 24h entregue, ledger Meta apos 2026-10-01 e relatorio contratual mensal.
- alteracoes externas de `.env`/segredos continuam como procedimento
  operacional separado; a matriz de deploy cobre impacto derivado de diff Git.

### Guided Builder — reconciliacao do patch local

Em 2026-09-10 o patch local antigo/quarentenado de Guided Builder foi portado
limpamente para worktree isolado baseado no HEAD canonico `fec3a489`, sem tocar
o worktree principal e sem misturar com o hardening de producao:

- `src/components/app/ChatbotFlowBuilder.tsx`;
- `src/components/app/ChatbotFlowBuilder.test.ts`;
- `src/app/app/chatbot/page.tsx`;
- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`.

Estado reconciliado:

- STRATEGY: clean isolated worktree from current canonical HEAD + explicit port
  of only Guided Builder files.
- SOURCE OF TRUTH: same `ChatbotFlow.definition`; Guided and Advanced modes
  mutate/read the same draft JSON through `onDefinitionTextChange`.
- SHADOW MODEL: no wizard/planning schema persisted in the flow definition.
- SUPPORTED OBJECTIVES: direct human handoff, menu, consent, capture, text and
  custom/advanced.
- NEXT TASK: detects missing start, missing menu option, missing option
  destination, missing handoff destination, invalid queue/department pairing,
  consent destination, capture field/next, broken references and orphan nodes.
- TRANSFORMATIONS: deterministic node creation for menu/text/capture/consent/
  handoff; existing orphan content is preserved for review instead of silently
  deleted.
- EXISTING FLOWS: Syer-style direct handoff and CRA-style complex consent/menu
  flows load without objective reset and preserve advanced metadata.
- VALIDATION: `ChatbotFlowBuilder.test.ts` 22/22 PASS; frontend build PASS;
  `git diff --check` PASS.

Smoke local de 2026-09-10:

- temporary non-versioned harness rendered the real `ChatbotFlowBuilder`
  component in desktop, tablet and mobile;
- new flow entry experience, supported objective cards, next-task panel,
  journey preview and checklist rendered coherently;
- Syer-style direct handoff fixture loaded without reset/destructive rewrite;
- CRA-style consent/menu/handoff fixture loaded without corruption and kept
  Advanced mode as the escape hatch for complex structures;
- responsive layout did not show horizontal overflow or clipped controls in the
  captured viewports;
- authenticated route smoke was completed in an isolated local worktree with an
  ephemeral Postgres database, 58 migrations applied, supported `demo:seed`, a
  real `/auth/login` app session and the local admin token;
- `/app/chatbot` loaded inside the real App shell with tenant context, existing
  flow list, create-flow entry and no alert/loading gate;
- `/admin/tenants/demo-prefeitura/chatbot` loaded inside the real Admin shell
  with tenant context, save controls and no login gate;
- existing flow expand/edit exercised Guided and Advanced modes against the same
  draft JSON;
- Advanced -> Guided reflected a JSON text edit immediately in the guided
  summary, fields and preview;
- Guided -> Advanced reflected a guided destination change in the advanced JSON;
- explicit save persisted to the local ephemeral database and survived route
  reload;
- desktop, tablet, mobile, dark/light theme and keyboard focus smoke passed
  without horizontal overflow.

Status: REAL VALIDATED in local authenticated route smoke and deployed by the
frontend-only production rollout ending at `9b5bdb34`. No production tenant flow
mutation was performed by this validation.

### Guided Builder 2.1 — business-first flow creator

Em 2026-09-11 o redesign local do Guided Builder foi reorientado para o modelo
aprovado pelo owner: em vez de mostrar um painel tecnico com passos detectados,
o editor novo comeca perguntando qual fluxo de negocio sera criado, faz poucas
perguntas por vez, gera uma definicao real de `ChatbotFlow.definition`, mostra
preview/checklist e aplica o resultado ao rascunho somente por acao explicita.

Estado atual:

- STATUS: GUIDED BUILDER 2.1 / LOCAL IMPLEMENTED / HUMAN VALIDATION ROUND 2.
- WORKTREE: isolado em `/tmp/re7-guided-wizard`, baseado no HEAD canonico
  `06256cc2`.
- SCOPE: frontend/editor somente.
- SOURCE OF TRUTH: preservado em `ChatbotFlow.definition`.
- SEMANTICA: sem alteracao de runtime, parsing, transitions, handoff, save
  payload, schema ou migration.
- UX: novo fluxo abre em modelos de negocio: atendimento institucional com
  menu, encaminhamento direto, coleta antes do atendimento, mensagem
  informativa ou modo avancado.
- WIZARD: cada modelo usa perguntas curtas sobre mensagem inicial,
  consentimento, opcoes, destinos, validacao de entrada, horario futuro,
  mensagem de handoff e preview.
- SUBMENUS: o modelo institucional agora representa um subconjunto CRA-like com
  menus aninhados gerados como nodes reais `type=menu`, sem node type novo.
- NAVIGATION: submenus podem expor `9 - Voltar ao Menu Anterior` e
  `0 - Voltar ao Menu Principal`, seguindo a convencao ja observada nos fluxos
  CRA. O menu principal nao recebe retorno redundante.
- HOURS: o wizard explica que o autoatendimento pode continuar funcionando e
  que horario humano pertence ao cadastro de departamentos; sem horario salvo,
  a regra de dominio atual permanece `NO_SCHEDULE`/aberto.
- APPLY DRAFT: "Aplicar ao rascunho" atualiza apenas o JSON local e mostra
  feedback explicito de sucesso, erro ou "nenhuma alteracao"; salvar continua
  sendo acao separada da pagina.
- EXISTING FLOW EDIT: fluxos existentes exibem landing separada com Revisar
  jornada, Editar etapas simples e Abrir modo avancado. A edicao simples mostra
  hierarquia de menus/submenus, permitindo abrir opcoes como Registro sem
  expor a arvore inteira ou misturar com criacao.
- MODE STATE: Assistente guiado e Modo avancado agora comunicam estado exclusivo
  e finalidade; "Abrir modo avancado" deixou de parecer selecionado dentro da
  landing de fluxo existente.
- RESET: apos criacao bem-sucedida de novo fluxo em `/app` ou `/admin`, o
  rascunho transiente volta ao estado inicial.
- OUTPUT: os geradores criam nodes reais (`menu`, `text`, `capture`,
  `consent`, `handoff`) sem persistir metadata de wizard ou shadow model.
- EXISTING FLOWS: abrir fluxo existente mostra resumo seguro e acoes explicitas
  de revisar jornada, editar informacoes simples ou abrir modo avancado; nao
  executa reset, reclassificacao destrutiva ou mutation automatica.
- MARKET PATTERN: alinhado ao padrao observado em builders atuais de mercado:
  selecao de template/use case, perguntas progressivas, preview antes de
  publicar, fallback para editor visual/avancado e protecao contra alterar
  automacoes existentes sem confirmacao.
- VALIDACAO TECNICA LOCAL: `ChatbotFlowBuilder.test.ts` 32/32 PASS; frontend
  build PASS; `git diff --check` PASS.
- STATUS: DEPLOYED / PRODUCTION READ-ONLY VALIDATED. Criacoes reais de teste
  no tenant Syer foram usadas apenas para validar a sequencia de criacao; o
  fluxo ativo real foi preservado.

### Guided Builder 2.1 — segundo fluxo com JSON invalido

Em 2026-09-11 foi auditado o incidente P1 em que a criacao de um segundo fluxo
guiado para o tenant real Syer Rodrigues terminava com a mensagem
`JSON invalido` antes de chegar ao backend.

Conclusao:

- ROOT CAUSE: estado transiente do builder de novo fluxo permanecia montado apos
  uma criacao bem-sucedida; o parent limpava o texto do novo fluxo, mas a
  sessao interna do wizard podia carregar dados mutaveis da criacao anterior.
- ESCOPO: bug de estado client-side no editor guiado; nao houve evidencia de
  problema de backend, schema, migration ou configuracao especifica da Syer.
- SYER REAL: auditado em read-only. O fluxo real existente permaneceu
  inalterado.
- FIX: o wizard passou a criar defaults frescos por sessao e o builder de novo
  fluxo em `/app` e `/admin` e remontado apos criacao bem-sucedida.
- VALIDACAO LOCAL: fixture Syer-like comprovou primeira, segunda e terceira
  criacoes sequenciais com JSON serializavel/parseavel e destinos validos.

Validacao real: em 2026-09-11, na producao `96220ea4`, a UI admin do tenant
`syer-rodrigues` criou dois fluxos guiados de teste inativos em sequencia, sem
`JSON invalido` e sem estado stale. A abertura de um terceiro novo fluxo
iniciou limpa, sem salvar. O fluxo ativo real manteve o mesmo hash de
definition.

Status: REAL VALIDATED / CLOSED.

### Guided Builder 2.1 — seguranca de entrada principal em novos fluxos

Em 2026-09-11 foi auditado um incidente P1 durante a validacao real da Syer:
um fluxo novo podia herdar `entryPoint=true` no formulario de criacao e
substituir temporariamente o fluxo principal do tenant.

Conclusao:

- ROOT CAUSE: default client-side inseguro nos formularios de novo fluxo de
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot`. O backend estava
  correto ao tratar `entryPoint=true` como acao explicita de troca.
- ESCOPO: bug generico de UX/seguranca de criacao; sem tenant hardcode, sem
  schema, sem migration e sem alteracao de runtime.
- FIX: novo fluxo passa a iniciar com `entryPoint=false` por default
  compartilhado; apos `create` bem-sucedido, o rascunho tambem reseta para
  `false`.
- CONTRATO: criar fluxo novo nunca troca a entrada principal silenciosamente.
  A troca continua permitida somente por acao explicita do operador/admin.
- VALIDACAO: teste backend cobre create sem `entryPoint`, create com
  `entryPoint=false` e troca explicita posterior por `PUT entryPoint=true`.

Status: FIXED / DEPLOY TARGET. Validacao pos-deploy deve confirmar que o fluxo
principal ativo da Syer permanece preservado.

### Guided Builder 2.2 — baseline recovery apos selecao local divergente

Em 2026-09-11 o resultado local inicial do Guided Builder 2.2 foi invalidado
para validacao de produto. O HEAD de producao estava atual; o problema foi a
selecao local de worktree/bundle/servidor, contaminada por uma linha antiga e
divergente do Guided Builder ja aprovado e publicado. O owner abriu o ambiente
local e viu uma UI anterior, sem os refinamentos aprovados de producao, provando
que aquele ambiente nao era baseline confiavel.

Impacto:

- PRODUCAO: nao afetada; nao houve commit, push ou deploy do resultado
  invalido.
- RESULTADO 2.2 ANTERIOR: INVALID FOR HUMAN PRODUCT VALIDATION.
- CAUSA OPERACIONAL: desenvolvimento/servidor local misturou worktrees e portas;
  `3010`/backend antigo apontavam para `/tmp/re7-guided-wizard`, enquanto uma
  tentativa posterior servia outro bundle em porta diferente.
- REGRA DE PROCESSO: qualquer trabalho de UX deve reproduzir localmente o
  baseline de producao aprovado antes de aplicar novos deltas.

Reconstrucao correta:

- BASE: worktree limpa `/tmp/re7-guided-22-current` criada a partir do HEAD
  canonico de producao `bf5f1d76`.
- BASELINE LOCAL: backend local isolado e frontend em `3022`, `demo:seed` e
  login real `admin@demo-prefeitura.local`; `/app/chatbot` respondeu no bundle
  da base aprovada. Para evitar CORS em desenvolvimento, o frontend deve usar
  `/agent-api` relativo via rewrite local.
- PORT 2.2: aplicado cirurgicamente sobre a base atual, sem copiar arquivos
  inteiros da linha divergente.
- DELTAS PORTADOS: cancelar/excluir opcao do wizard, excluir submenu simples ja
  criado, cancelar submenu em criacao, confirmacao destrutiva antes de remover
  caminhos com filhos, protecao de estruturas compartilhadas/avancadas pelo
  modo avancado, limpeza de submenu aninhado ao trocar destino, botao inferior
  "Voltar ao nivel anterior", tons por nivel de menu, texto unificado
  "Encaminhar para atendimento humano", fluxo Setor -> Fila condicional,
  explicacoes para "Mostrar outra mensagem" e "Fazer uma pergunta", e suporte a
  texto livre/emoji digitado pelo usuario no wizard, preview e JSON gerado.
- VALIDACAO TECNICA: `ChatbotFlowBuilder.test.ts` 37/37 PASS; frontend build
  PASS; `git diff --check` PASS.
- STATUS: GUIDED BUILDER 2.2 / DEPLOYED / PRODUCT OWNER REAL VALIDATION. A
  entrega frontend-only foi publicada em producao no commit `db34d83c`, sem
  alteracao de backend, worker, schema ou migration. O proximo marco e o owner
  concluir os testes reais em producao.

### Guided Builder 2.3 — refinamento de criacao e edicao por opcoes

Em 2026-09-11 o owner aprovou a base 2.2 e registrou feedback de uso real para
reduzir atrito do criador guiado antes de nova publicacao.

Escopo 2.3 aprovado:

- remover as decisoes "Ativo" e "Entrada principal" do cadastro de novo fluxo;
  novos fluxos continuam com `entryPoint=false` e ativacao como acao operacional
  separada;
- no modelo "Atendimento institucional com menu", iniciar pelo consentimento e
  depois seguir para mensagem/opcoes do menu principal;
- substituir copy especifica por texto neutro: "Quais opcoes estarao
  disponiveis no menu?";
- editar opcoes e destinos ja na primeira tela do menu principal, em linhas
  expansivas, uma opcao aberta por vez, com submenu, exclusao e pendencias
  dentro do proprio bloco;
- aplicar o mesmo padrao recursivo para submenus e preservar tons/bordas por
  nivel hierarquico;
- padronizar resultados de acao em toast global visivel independentemente do
  scroll, mantendo validacao de campo inline;
- restaurar foco/scroll para a secao ativa apos voltar nivel, cancelar submenu,
  remover opcao ou aplicar rascunho.

Status:

- GUIDED BUILDER 2.3 / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION REAL VALIDATION.
- Sem schema, migration, backend, worker ou semantica runtime.
- Owner aprovou a UX final local; validacao real em producao permanece aberta
  ate exercicio humano em tenant real apos deploy.

Nota de recuperacao 2026-09-12:

- A worktree temporaria usada durante a validacao local foi perdida apos reboot
  da maquina; isso confirmou que `/tmp` nao e suficiente como preservacao de
  trabalho do owner.
- A primeira reaplicacao pos-reboot recuperou uma versao antiga e foi descartada
  como referencia funcional.
- Producao nao foi mutada, nao houve commit, push ou deploy da 2.3 durante a
  recuperacao.
- A versao local atual foi reconstruida a partir dos patches da sessao Codex e
  confrontada contra o HEAD canonico de producao/origin antes da continuidade.
- A aprovacao local final do owner foi aplicada sobre worktree limpa baseada no
  HEAD canonico atual antes de commit/push/deploy; qualquer revisao futura deve
  manter backup de diff fora de `/tmp`.
- Ajuste final do owner: ao excluir opcao, submenu/linha aninhada ou registro
  editavel, a UI nao deve abrir automaticamente o proximo irmao. O item e
  removido, irmaos permanecem colapsados, e o foco volta ao contexto pai ou a
  secao atual.
- Entrega final 2.3 e frontend-only: sem mudanca de `ChatbotFlow.definition`,
  sem tenant hardcode, sem migration e sem reload de backend/worker.

### Contact Timeline / Histórico do contato

Status:

- implementado como view derivada, sem tabela nova
- endpoint `/app/conversation/:waId/timeline` em produção
- acesso pelo inbox na coluna CRM

Riscos conhecidos:

- cursor atual usa apenas `createdAt`; em volume alto com muitos registros no mesmo milissegundo, pode haver borda rara de paginação. Evoluir para cursor composto `createdAt + id`.
- timeline agrega `InboundMessage`, `OutboundMessage`, `Event` e `LeadNote` em memória por lote. Está limitado, mas deve ser revisado se tenants tiverem alto volume histórico.
- eventos são exibidos sem `payloadJson` bruto por segurança; caso a operação peça detalhes ricos, criar normalizador por tipo de evento, não expor payload integral.
- `Contact` existe, mas o CRM operacional ainda usa `Lead`. Evitar criar nova entidade ou duplicar histórico até consolidar o modelo pessoa/contato.
- `Contact` não possui `waIdCanonical`; se ele virar entidade principal, avaliar migration específica.
- LGPD: timeline respeita `deletedAt`/`historyVisibleAfter`; manter testes sempre que alterar anonimização, retenção ou reentrada.

Pendências recomendadas:

- adicionar cursor composto `createdAt + id` na timeline.
- criar testes de endpoint para: mensagens, eventos, notas, paginação, escopo por setor e corte LGPD.
- avaliar se histórico deve ter busca por termo em fase futura.
- avaliar tela dedicada de contato apenas após uso real validar necessidade.

### Runtime / Operação

Status:

- producao atual em `STORAGE_MODE=postgres`
- leitura operacional estrita a Postgres para runtime state
- JSON permanece apenas como compatibilidade historica/local quando configurado

Riscos conhecidos:

- manter rotina `state:validate` documentada após alterações em handoff, claim, transfer, release, retenção e reentrada.
- qualquer novo write operacional precisa atualizar Postgres e manter compatibilidade com o fallback JSON enquanto a transição não for encerrada.

Pendências recomendadas:

- definir critério para encerrar escrita JSON ou mantê-la como fallback permanente.
- incluir validação de runtime no checklist de deploy quando houver mudança operacional.

---

## SPRINT 26 — ONBOARDING INTERNO ASSISTIDO

Status:

- implementado (backend + UI)
- não validado com novo tenant real

Classificação:

- item latente (não bloqueante)

Diretriz:

- NÃO priorizar validação neste momento
- retomar apenas quando houver novo cliente real

---

## SPRINT 28 — OBSERVABILIDADE META (COMPLETED)

- status real da Meta integrado na UI de campanhas
- delivered / read / failed visíveis
- billing visível por mensagem
- correção de regressão de status (prioridade)
- consistência UI = banco validada

Impacto:

- elimina ambiguidade operacional
- aumenta confiança do operador
- permite operação profissional com cliente real

---

## SPRINT 29 — ÁREA DO CLIENTE (COMPLETED)

- login por usuário implementado
- auto-scope via token (`clientId`)
- rotas `/app/*` criadas
- inbox operacional com claim/release, status e notas
- campanhas completas com criação, cancelamento e replay
- criação de usuário via UI implementada
- reset de senha via API implementado
- onboarding interno consolidado
- fluxo completo sem script validado
- login e acesso do cliente funcional
- isolamento total por tenant
- isolamento por tenant validado
- uso independente sem admin validado

Impacto:

- sistema passou a ser utilizável pelo cliente final
- elimina dependência do `/admin`
- transforma a plataforma em SaaS real
- elimina dependência técnica no onboarding
- permite criação de clientes em minutos
- habilita operação com múltiplos tenants
- sistema passa a ser operacional em escala inicial

---

## PRÓXIMAS ETAPAS (ORDEM ESTRATÉGICA)

---

### 1. Uso real com clientes

- execução de campanhas
- operação assistida
- coleta de feedback real

---

### 2. Ajustes baseados em uso

- melhorias de UX
- redução de fricção operacional
- correções pontuais

---

### 3. Evolução incremental do produto

- filtros avançados
- melhorias de interface
- ajustes de fluxo

---

## FUTURO (NÃO PRIORITÁRIO)

- onboarding self-service para cliente
- fila persistente (Redis/Bull)
- retry automático
- scheduler de campanhas
- segmentação avançada

---

## DIRETRIZ IMPORTANTE

Priorizar:

- uso real
- operação com cliente
- estabilidade

ANTES de:

- novas features
- refatorações grandes
- otimizações prematuras

---

# HISTÓRICO DE SPRINTS (MARCOS)

- Sprint 14 -> shadow write completo
- Sprint 15 -> leitura híbrida
- Sprint 16 -> consistência validada
- Sprint 17 -> Postgres como source of truth
- Sprint 18 -> controle de uso
- Sprint 19 -> campanhas base
- Sprint 20 -> execução assíncrona
- Sprint 21 -> API operacional
- Sprint 22 -> operação assistida
- Sprint 23 -> UI de campanhas
- Sprint 24 -> refinamento de UX
- Sprint 25 -> onboarding real validado (JUSTA)
- Sprint 26 -> onboarding interno assistido
- Sprint 28 -> observabilidade Meta
- Sprint 29 -> área do cliente

## Incidente P1 — handoff humano com setor sem fila concreta

Em 2026-09-12 foi auditado em producao o tenant `syer-rodrigues`, contato
`****9614`: o inbound chegou, o bot respondeu, o handoff foi ativado e o runtime
ficou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`,
`departmentId=Campanha 2026`, `queueId=null`, sem responsavel e sem fechamento.
A conversa nao projetou para a Inbox humana porque o invariant operacional da
Inbox exige destino humano completo: setor + fila.

Conclusao de dominio: `queueId=null` nao e um destino operacional humano valido
para atendimento aguardando atribuicao. O caminho correto e resolver uma fila
concreta antes de criar/projetar atendimento humano; nao afrouxar a visibilidade
da Inbox para aceitar aguardando sem fila.

Auditoria read-only em producao: 10 fluxos ativos; 7 handoffs ativos com
`departmentId` e sem `queueId`, distribuidos em 2 tenants
(`syer-rodrigues`: 6; `lab-websession`: 1). Os setores afetados tinham
exatamente uma fila existente (`Fila Geral`), permitindo resolucao deterministica
sem hardcode de tenant.

Fix local: `departmentAwareHandoff` resolve automaticamente a unica fila
existente do setor quando o fluxo legado/guiado traz apenas `departmentId`; se o
setor nao tem fila ou tem multiplas filas sem escolha explicita, bloqueia o
handoff em vez de criar `WAITING` invisivel. O Guided Builder passa a exigir fila
concreta, auto-selecionando a unica fila do setor e exibindo erro acionavel
quando nao ha fila cadastrada.

Contrato preservado: Inbox, SLA, relatórios, posicao de fila, claim,
transferencia, notificacoes e atribuicao automatica continuam operando sobre
destino humano completo (`departmentId` + `queueId`).

Fechamento operacional em 2026-09-12: apos backup fresco de pre-reparo, o atendimento ja existente
`****9614` foi reparado com uma unica mutacao de campo em
`ConversationRuntimeState.queueId`, de `null` para a fila existente
`cmtoekafy00014s4lg41vs5i0` (`Fila Geral`). Nenhuma mensagem, historico,
protocolo, ciclo, fechamento ou atribuicao foi alterado. A prova pos-reparo
mostrou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`, setor
`Campanha 2026`, fila `Fila Geral`, sem responsavel, conversa aberta,
projecao canonica na Inbox humana exatamente uma vez e posicao de fila `1`.
Incidente fechado.

Guided Builder 2.4 local: consolidar UX sem alterar runtime ou schema. Navegacao
do wizard (selecionar modelo, Continuar, Voltar) preserva a posicao atual de
scroll e usa foco com `preventScroll`; expansao de linha editavel ancora o
cabecalho da propria linha; exclusao/cancelamento/retorno recupera o contexto
pai sem abrir o proximo irmao. Cancelar submenu em criacao remove apenas o
estado transiente, mantem o pai expandido e devolve foco ao cabecalho do pai.
Destino "Fazer uma pergunta" exige pergunta, tipo de resposta e proximo
comportamento definido; permite no maximo 3 perguntas consecutivas antes de
outro destino. Auditoria de runtime classificou branching por resposta
capturada como PRODUCT GAP: o runtime atual tem captura sequencial por
`capture.next`, mas nao possui predicados por valor capturado, igualdade,
sim/nao ou fallback branch para resposta livre.

Handoff humano no Guided segue o contrato canonico: `WAITING` humano precisa de
`departmentId` + `queueId` concreto. Auditoria local de cardinalidade encontrou
24 setores ativos sem fila, 56 com uma fila e 5 com duas ou mais filas. Os 5
casos multi-fila foram classificados como `default` = INTERNAL DEFAULT/Re7 Demo
e `campaigns-feature-*` = AUTOMATED TEST ARTIFACT por metadados reais
(`phoneNumbers=0`, `channelAccounts=0`, fixture em
`campaignsFeatureRoutes.test.ts`); nenhum fluxo ativo ou runtime usa multiplas
filas dentro do mesmo setor. UX final: fila unica e resolvida internamente sem
label/seletor/texto de fila; setor sem fila bloqueia com "Este setor ainda nao
esta preparado para receber atendimentos."; somente setor com 2+ filas exibe
seletor "Fila" como excecao. Fluxos existentes com `departmentId` e
`queueId=null` exibem aviso e nao sao reescritos automaticamente ao abrir.

Backlog 2.4: GUIDED BUILDER 2.4 = APPROVED FOR FRONTEND-ONLY DELIVERY /
PRODUCTION VALIDATION; HANDOFF QUEUE UX = SIMPLIFIED / CONDITIONAL EXCEPTION;
QUESTION CONDITIONAL BRANCHING = PRODUCT GAP.

Micro-ajuste final de UX 2.4: o owner apontou redundancia no bloco visual
"Escolha o setor que recebera o atendimento." apos selecionar "Encaminhar para
atendimento humano". O bloco/cartao instrucional foi removido; o editor agora
mostra diretamente `Setor`/selector, mantendo fila unica interna, bloqueio de
setor sem fila, seletor excepcional para 2+ filas, preview e JSON gerado sem
alteracao. Status historico local antes da entrega: GUIDED BUILDER 2.4 =
OWNER APPROVED LOCAL.

Entrega aprovada do Guided Builder 2.4: delta validado aplicado sobre o HEAD
canonico e publicado em `ca34e123c72de2e96f0dcff27b4e17f29e5b630b`, sem
migracao, sem hardcode de tenant, sem reload de backend/worker e preservando
`ChatbotFlow.definition`. Status: GUIDED BUILDER 2.4 = CLOSED / DEPLOYED /
OWNER APPROVED LOCAL / PRODUCTION NON-DESTRUCTIVE VALIDATED; HANDOFF QUEUE
CONTRACT = CLOSED / REAL VALIDATED; QUESTION CONDITIONAL BRANCHING = PRODUCT
GAP / OPEN; SYER ****9614 = CLOSED.

---

# BACKLOG LATENTE (RETOMAR QUANDO NECESSÁRIO)

- validação onboarding assistido
- validação real do onboarding (novo cliente)
- relatorios por atendente com historico persistido em Postgres para producao em `STORAGE_MODE=json`
- padronização tenantId vs clientId
- limpeza de `.data/default`
- revisão do tenant `cliente-demo`

---

# BACKLOG LEGADO (BAIXA PRIORIDADE)

- normalização de leadName
- lastMessage nulo
- limpeza de logs antigos
- ajustes de parsing
- melhorias menores de inbox

---

# DECISÕES ARQUITETURAIS

- NÃO implementar recursos não oficiais de WhatsApp
- manter foco 100% na API oficial da Meta
- manter arquitetura simples e evolutiva
- Sprint 42.1: separar superfícies /admin (plataforma) vs /app (cliente), migrando users, departments e reports para /app com requireClientAuth e auditoria por userId real
