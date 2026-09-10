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

Fila ativa repriorizada:

1. Waiting-for-customer 60m (P1): desenhar e implementar apenas para estado
   explicito em que a automacao aguarda resposta do cidadao; nunca usar
   inatividade generica de conversa HUMAN.
2. CRA-PR department hours (P1): guiar configuracao do cliente e validar flow
   aware of department hours. No schedule continua significando
   `NO_SCHEDULE`/aberto e nao e falha tecnica.
3. Guided Builder productization (P1): preparar promocao controlada apos smoke
   autenticado PASS nas rotas reais `/app/chatbot` e
   `/admin/tenants/:tenantId/chatbot`, mantendo JSON avancado e sem mudar a
   semantica dos flows.
4. Reporting context enhancements (P2): adicionar contexto de AUTO vs MANUAL,
   politica de atribuicao, `presenceMode` e carga/capacidade atual onde agregar
   verdade operacional sem reabrir bugs ja fechados.
5. Meta Cloud unlink/removal cleanup semantics (P2): consolidar remocao segura
   de configuracao Meta sem apagar historico operacional ou criar fallback
   silencioso.

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
- SECULT Web Session non-content suppression: ORGANIC VALIDATION PENDING para
  confirmar ausencia de novas bolhas `Mensagem nao suportada`.

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
