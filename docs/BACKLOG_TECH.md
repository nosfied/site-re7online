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
- HYBRID claim-before-downstream recovery: HARDENED / REAL VALIDATED;
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
- SECULT Inbox/CPU correlation: CLOSED FOR PHASE 2 DECISION / POS-PHASE 2 LOAD VALIDATION PARTIAL;
- Browser Push / PWA notifications: CLOSED / REAL VALIDATED;
- true foreground Web Push detection: CLOSED / REAL VALIDATED in `670f392d`;
- hidden desktop local sound: CLOSED / REAL VALIDATED in `c50fb73c`;
- supervisor team presence panel: DEPLOYED / VISUAL SMOKE PENDING;
- deploy impact matrix hardening: CLOSED / SCRIPT + DEPLOY INTEGRATION + RUNBOOK;
- closed-conversation access hardening: CLOSED / PRODUCTION VALIDATED in
  `93cd0e06`;
- Inbox close terminal lifecycle: FIXED / DEPLOYED in `f62f1288`;
- Web Session operational disconnect alert delivery: FIXED / DEPLOYED in
  `b31fd976`; SMTP port `2465` now uses TLS, retryable transport failures have
  bounded retry, and delivered alerts still dedupe by incident fingerprint;
- CRA Demo V1: READY FOR CUSTOMER VALIDATION.
- CRA-PR real HYBRID operational validation: CLOSED / PASS;
- CRA-PR approved flow -> consent -> menu -> handoff: CLOSED / PASS;
- CRA-PR human Inbox + human outbound/inbound + normal close: CLOSED / PASS;
- CRA-PR `CompletedServiceSnapshot`: CLOSED / exactly 1 snapshot in validation;
- CRA-PR CSAT score/responded and optional comment in same response: CLOSED / PASS;
- CRA-PR Browser Push background: CLOSED / REAL VALIDATED;
- CRA-PR ready for training 2026-09-09: YES.

Pendencias proximas:

1. executar bateria CPU/Inbox em 2026-09-08 com START, MID, EXTRA e END;
2. validar escala 10/30/50 sessoes antes de declarar capacidade CRA 30 agentes;
3. validar ativacao/primeiro login dos usuarios CRA-PR, especialmente 3 admins de TI;
4. guiar configuracao de horarios dos departamentos CRA-PR;
5. acompanhar a validacao organica SECULT para confirmar que novos eventos
   `protocolMessage`, `reactionMessage`, `messageContextInfo` e grouping-only
   `albumMessage` nao aparecem como `Mensagem nao suportada`;
6. desenhar waiting-on-customer 1h como regra funcional separada.

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
- Demo Web Session QR_REQUIRED remains OPEN as a channel recovery task; alert
  delivery hardening does not reconnect or close the underlying disconnect
  incident.
- baselines CRA versionados nesta consolidacao como evidencia de validacao, nao como dump operacional:
  - `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md`;
  - `docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`.
- CRA department hours remain PENDING CUSTOMER CONFIGURATION. Under the current
  domain rule, no schedule means `NO_SCHEDULE` / open and must not be classified
  as a technical failure;
- billing measurement items ainda abertos: ciclo receptivo logico, template Utility fora de 24h entregue, ledger Meta apos 2026-10-01 e relatorio contratual mensal.
- alteracoes externas de `.env`/segredos continuam como procedimento
  operacional separado; a matriz de deploy cobre impacto derivado de diff Git.

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
