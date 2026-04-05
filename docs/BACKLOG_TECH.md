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
