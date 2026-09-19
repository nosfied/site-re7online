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

Vercel public-site lineage, 2026-09-19: AUDITED / CORRECTION PENDING. The
public `re7online.com` production deployment is currently
`dpl_F3CjH6eJRLsnriBVhP77o1ZXxz5R` at
`bf8ca4ddb05b4a22c09c3eaabfcb31e44de8acc9` from branch
`ops-demo-9614-repair-readiness-20260918`, `source=redeploy`. Public-site tree
comparison found output difference `NONE` against recent production/preview
candidates, but the lineage is operationally unsuitable. Production Branch was
not exposed by available read-only tooling and remains UNKNOWN. IgnoreCommand
is ISSUE because recent branches do not contain `vercel.json` or
`scripts/vercel-ignore-build.sh`; the hygiene candidate is
`origin/vercel-deployment-hygiene-20260918` at
`1af24b54ee9261f75a8c9e69e9d87c20f33fd2db`. No Vercel production mutation,
VPS change, DB change or PM2 change occurred in this audit. Next action:
prove Production Branch in Vercel settings and run a separate owner-approved
Vercel-only correction gate.

---

## PRIORIDADE ATUAL

Eficiência operacional interna + uso real do produto.

---

## RISCOS E PENDÊNCIAS ATUAIS — 2026-05-03

### Atualizacao operacional consolidada — 2026-09-01

Estado fechado/validado:

- hybrid exactly-once: CLOSED / REAL VALIDATED;
- Meta template routing in configured modes: CLOSED / REAL VALIDATED;
- HYBRID template outbound: CLOSED / REAL VALIDATED;
- Meta-to-Web echo safety: CLOSED / REAL VALIDATED;
- HYBRID inbound dedupe after Meta template reply: CLOSED / REAL VALIDATED;
- post-reply freeform routing in HYBRID/AUTO: CLOSED / REAL VALIDATED;
- Meta usage accounting for template vs Web Session freeform: CLOSED / REAL VALIDATED;
- flow/runtime coherence: CLOSED / REAL VALIDATED;
- closed HUMAN reentry: CLOSED / REAL VALIDATED;
- SECULT CompletedServiceSnapshot: CLOSED / REAL ORGANIC VALIDATED;
- SECULT completed-service reporting: CLOSED / PRODUCTION VALIDATED;
- Inbox Timeline Phase 1: CLOSED / PRODUCTION VALIDATED;
- Inbox Phase 2 WebSocket-driven invalidation: CLOSED / PRODUCTION VALIDATED;
- multichannel reconciliation migration: CLOSED / PRODUCTION VALIDATED;
- Web Session wrapped media normalization: CLOSED / SAFE NORMALIZATION PATCH;
- SECULT Web Session non-content control event suppression: DEPLOYED / TESTED in
  `c308198a`; organic validation pending;
- SECULT auto-assignment incident 2026-08-31: AUDITED / BUG NOT CONFIRMED; UX clarification deployed in `c91671e9`;
- SECULT report current-state truth bug: FIXED / DEPLOYED in
  `f84258d7e8dab157fec0cb9dad5d46245d9dd111`; Maria Helena current active
  conversations now appear as `Em atendimento agora = 2`; human visual
  validation PASS. Status: REAL VALIDATED / CLOSED.
- SECULT Maria Helena capacity incident: CLOSED AS PRODUCT BEHAVIOR / NO BUG
  CONFIRMED. Maria had two legitimate active HUMAN / IN_PROGRESS services
  (`****6185`, `****8282`), so capacity 2/2 and assignment exclusion were
  correct. Demo validated `409 max_active_reached` and the specific UX.
- SECULT Maria Helena close failure: OPEN / CLIENT TERMINAL/LIFECYCLE HANDLING
  BUG CONFIRMED. Latest trace `inbox-close-0698...` proved attempt/requested,
  backend close success, protocol closed, snapshot present, `closeSource=app_inbox`,
  `closedBy=Maria`, runtime `CLOSED`, handoff `NONE`, assignee cleared, and close
  message + CSAT sent. Backend close bug: NO. RBAC bug: NO. Residual: frontend
  terminal `close.succeeded` / `close.failed` event absent after successful
  backend close.
- presence eligibility modes: IMPLEMENTED / TESTED / REAL VALIDATED ON DEMO in
  `3c68593637c9f8e9c97401457ceacaefa76a3699`.
- SECULT presence mode: APPLIED. Current policy remains `round_robin`,
  `scope=tenant`, `presenceMode=AVAILABLE`, `maxActivePerAgent=2`; organic
  distribution validation pending.
- SECULT Inbox/CPU correlation: CLOSED FOR PHASE 2 DECISION / POS-PHASE 2 LOAD VALIDATION PARTIAL;
- Browser Push / PWA notifications: CLOSED / REAL VALIDATED;
- true foreground Web Push detection: CLOSED / REAL VALIDATED in `670f392d`;
- hidden desktop local sound: CLOSED / REAL VALIDATED in `c50fb73c`;
- supervisor team presence panel: DEPLOYED / VISUAL SMOKE PENDING;
- deploy impact matrix hardening: CLOSED / SCRIPT + DEPLOY INTEGRATION + RUNBOOK;
- CRA Demo V1: READY FOR CUSTOMER VALIDATION.
- CRA-PR real HYBRID operational validation: CLOSED / PASS;
- CRA-PR approved flow -> consent -> menu -> handoff: CLOSED / PASS;
- CRA-PR human Inbox + human outbound/inbound + normal close: CLOSED / PASS;
- CRA-PR `CompletedServiceSnapshot`: CLOSED / exactly 1 snapshot in validation;
- CRA-PR CSAT score/responded and optional comment in same response: CLOSED / PASS;
- CRA-PR Browser Push background: CLOSED / REAL VALIDATED;
- CRA-PR ready for training 2026-09-09: YES.
- Demo HYBRID full fresh-flow validation after `5f07d7ad`: CLOSED / REAL
  VALIDATED. The same controlled cycle `CVT-F8E9904B8352` advanced from
  `registro_pf_menu` through back navigation, handoff, Inbox claim, human
  freeform, close and CSAT. All passive/reactive outbound messages used
  `WEB_SESSION`; passive Meta outbound count was `0`; Hybrid logical dedupe
  remained exactly-once; the earlier P2002 did not recur.

Pendencias proximas:

1. executar bateria CPU/Inbox em 2026-09-08 com START, MID, EXTRA e END;
2. validar escala 10/30/50 sessoes antes de declarar capacidade CRA 30 agentes;
3. validar ativacao/primeiro login dos usuarios CRA-PR, especialmente 3 admins de TI;
4. guiar configuracao de horarios dos departamentos CRA-PR;
5. acompanhar a validacao organica SECULT para confirmar que novos eventos
   `protocolMessage`, `reactionMessage`, `messageContextInfo` e grouping-only
   `albumMessage` nao aparecem como `Mensagem nao suportada`;
6. desenhar `WAITING_FOR_CUSTOMER` 60 minutos como regra funcional separada,
   restrita a conversas explicitamente aguardando o cidadao/cliente.
7. acompanhar distribuicao organica SECULT apos `presenceMode=AVAILABLE`, sem
   alterar cursor round-robin antes de evidencia material.

Dividas tecnicas abertas:

- `multichannel.shadow_write.failed` / `missing_channel_account_id`: preexistente, non-strict, sem retry loop, associado a projection/data-quality gap de Web Session, non-blocking;
- drift historico global Prisma schema/migrations: separado da migration de reconciliacao multichannel ja validada;
- SECULT Web Session `UNKNOWN` media historical rows: no backfill; exact original subtype is
  not recoverable from the sanitized persisted payload;
- baselines CRA versionados nesta consolidacao como evidencia de validacao, nao como dump operacional:
  - `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md`;
  - `docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`.
- CRA department hours remain PENDING CUSTOMER CONFIGURATION. Under the current
  domain rule, no schedule means `NO_SCHEDULE` / open and must not be classified
  as a technical failure;
- billing measurement items ainda abertos: ciclo receptivo logico, template Utility fora de 24h entregue, ledger Meta apos 2026-10-01 e relatorio contratual mensal.
- alteracoes externas de `.env`/segredos continuam como procedimento
  operacional separado; a matriz de deploy cobre impacto derivado de diff Git.
- close observability: IMPLEMENTED / PARTIALLY VALIDATED in
  `a026b176e6a3f7b010ba247fe6b851b9c375ca70`. It successfully proved request
  emission and backend completion for Maria's close action. Residual open bug:
  terminal client outcome is missing after successful backend close.
- `****6194`: OPEN / TARGETED CYCLE-AWARE AUDIT. Ha snapshot antigo com CSAT
  respondido e atividade/runtime atual; nao classificar como residuo de
  capacidade sem analise por ciclo.
- Demo Web Session reconnect/revalidation: CLOSED / REAL VALIDATED on
  2026-09-10. The prior `disconnected` / `QR_REQUIRED` state was recovered by
  normal QR pairing; inbound, human outbound, close notice and CSAT remained
  stable with no new `401`, conflict, `QR_REQUIRED` or `auth_clear`.
- Demo operational alert email: OPEN / ROOT CAUSE NOT YET PROVEN. A queda da
  conexao Demo nao gerou email observado; auditar destinatarios tenant-scoped,
  configuracao CRA-only vs suporte interno global, e se a transicao qualificava
  para alerta.
- claim-before-downstream hardening: OPEN / ARCHITECTURAL HARDENING. The
  `5f07d7ad` fix closed the proven provider Lead identity collision, but a
  winning Hybrid provider can still claim a logical inbound before all
  downstream processing finishes. Generic replay/recovery guarantees remain a
  separate design item.

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

- produção em `STORAGE_MODE=hybrid`
- leitura operacional em `CONV_STATE_READ_SOURCE=postgres`
- JSON permanece como fallback/compatibilidade

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
