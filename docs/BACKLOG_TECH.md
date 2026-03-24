## FASE ATUAL DO PRODUTO

Validação real multi-tenant com onboarding oficial da Meta habilitado.

O sistema já possui:
- multi-tenant real no runtime
- Postgres como source of truth
- campanhas operacionais com execução assíncrona
- controle de uso por tenant
- UI administrativa funcional
- onboarding oficial via Embedded Signup liberado pela Meta
- Sprint 14 concluída (shadow completo validado)
- Sprint 15 concluída (leitura híbrida validada com divergência detectada)
- Sprint 16 concluída (consistência total validada)
- Sprint 17 concluída (Postgres como source of truth)
- Sprint 18 concluída (controle de uso e monetização)
- Sprint 19 concluída (campanhas v1)
- Sprint 20 concluída (campanhas assíncronas)
- Sprint 21 concluída (operação de campanhas)
- Sprint 22 concluída (operação assistida)
- Auditoria do frontend concluída
- Sprint 23 concluída (UI operacional de campanhas)
- Sprint 13.1 em standby (Meta)

---

## PRIORIDADE ATUAL

Executar onboarding real de cliente (JUSTA) e validar operação completa multi-tenant.

---

## PRÓXIMAS ETAPAS (ORDEM ESTRATÉGICA)

1. Onboarding real + validação multi-tenant (Sprint 25)
   - Embedded Signup
   - conexão de número real
   - execução de campanhas
   - validação de isolamento entre tenants

2. Uso real com cliente
   - operação assistida
   - coleta de feedback
   - identificação de fricções

3. Ajustes baseados em uso
   - melhorias de UX
   - pequenos ajustes operacionais
   - correções pontuais

---

## DIRETRIZ IMPORTANTE

Priorizar:
- uso real do produto
- validação com cliente
- estabilidade operacional

ANTES de:
- novas features
- refatorações
- otimizações de escala

---

# CONTEXTO ATUAL DO PRODUTO

- Produto validado em produção (cliente Justa)
- Integração WhatsApp funcional (Cloud API)
- Envio e recebimento de mensagens OK
- Motor do agente em produção (quote → demo → lead → policy)
- E2E validado (50/50)
- Onboarding funcional via CLI / Embedded Signup
- Webhook ativo e estável
- App Review Meta pendente
- Sistema já operando com cliente real

---

# BACKLOG ESTRATÉGICO (SaaS)

## Sprint 13 — COMPLETED (TECHNICAL)

### Objetivo da sprint
- preparar a transição JSON -> Postgres com segurança, sem trocar a fonte de verdade atual
- reduzir inconsistências de tenancy na persistência e no runtime
- fechar a base técnica para validação multi-tenant honesta

### Entregas realizadas
- `Event` ajustado para tenant-scoped uniqueness
- `STORAGE_MODE=json|hybrid|postgres` introduzido com default seguro
- `runtimeStorage` centralizado e pontos críticos desacoplados de `jsonFileStorage`
- scripts E2E tornados tenant-aware por config real do tenant

### Validação técnica
- tenant principal `re7online` validado integralmente em VPS
- tenant `justa-advocacia` validado tecnicamente em config/admin/mapping/helper/logs/bootstrap
- modo de storage resolvido em produção sem regressão funcional

### Riscos eliminados
- colisão cross-tenant indevida em `Event`
- seleção implícita/ambígua do modo de storage
- acoplamento direto dos pontos críticos ao `jsonFileStorage`
- montagem de payload E2E com config global do tenant principal

### Marco formal
- Sprint 13 concluída tecnicamente
- base pronta para preparar a próxima etapa da migração JSON -> Postgres
- tenant principal validado e segundo tenant preparado tecnicamente

### Pending external operational validation — Justa
- onboarding técnico preparado
- tenant configurado e reconhecido
- helper/config/mapping prontos
- execução fim a fim depende do avanço do App Review / Access Verification da Meta

## Sprint 12 — COMPLETED

### Objetivo da sprint
- concluir o backend multi-tenant real com isolamento seguro no runtime
- endurecer a resolução de tenant no webhook
- segmentar o storage JSON por tenant
- eliminar escrita indevida em `.data/default`

### Entregas realizadas
- resolução de tenant segura, sem fallback automático para `default`
- storage JSON segmentado por tenant em `.data/{clientKey}/`
- correção do vazamento residual para `.data/default`
- propagação consistente de `clientKey` no runtime do webhook

### Validação em produção
- deploy realizado e validado na VPS
- `validate-agent.sh` verde para o tenant `re7online`
- `re7online` operando corretamente em ambiente real

### Riscos eliminados
- mistura silenciosa de tenants por fallback inseguro
- compartilhamento físico do runtime JSON entre tenants
- escrita indevida no namespace `default` para tenant resolvido

### Marco formal
- Sprint 12 concluída
- backend oficialmente multi-tenant
- storage runtime isolado por tenant
- base pronta para expansão SaaS incremental

## Fase atual
SaaS multi-tenant validado tecnicamente (Sprint 13)

## Prioridades (ordem obrigatória)

### 1. Persistência
- migrar JSON → Postgres (Prisma)
- definir fonte única de verdade
- eliminar duplicidade entre JSON e banco

### 2. Observabilidade
- logs estruturados
- tracing por conversa
- auditoria por cliente
- métricas operacionais

### 3. Produto (UX)
- inbox profissional
- painel do cliente
- visualização de conversas
- status de mensagens

## Pós-Sprint 12 — Backlog Prioritário

### 1. Retomar onboarding e E2E completo da Justa após avanço Meta
- concluir validação fim a fim assim que App Review / Access Verification liberar o fluxo externo
- confirmar operação ponta a ponta do segundo tenant em ambiente real

### 2. Padronização de naming
- alinhar `tenantId` vs `clientId` em `Lead` / `LeadNote`

### 3. Planejar próxima etapa de migração JSON → Postgres
- definir a sequência segura de transição da fonte de verdade
- consolidar contratos de storage e shadow state

### 4. Higiene operacional
- revisar tenant `cliente-demo`
- avaliar limpeza de `.data/default`

## Decisões arquiteturais

- Remover whatsapp_business_manage_events do escopo atual
- Motivo: não é necessário para runtime do agente
- Status: adiado para fase futura de growth (ads / tracking)

---

# BACKLOG TÉCNICO (LEGADO / AJUSTES)

# BACKLOG TÉCNICO — WhatsApp Agent

## Sprint 1

### Endpoint de health
Confirmar se runbook deve usar:
/admin/health
ou
/health

Status por evidencia atual: **/health como endpoint operacional principal**.
- `deploy-vps.sh` usa `/health` para readiness.
- `smoke-admin.sh`, `prod-status.sh`, `deploy-check.sh` usam `/health`.
- `/admin/health` existe e e util para check autenticado/DB, mas nao e o readiness principal no fluxo de deploy.

### Nome do processo PM2
Confirmar nome do processo PM2 em producao.

Status por evidencia atual: **padrao operacional sustentado = `pm2 reload 0 --update-env`** no script oficial `deploy-vps.sh` (via `PM2_ID=0`).

Ambiguidade residual documentada:
- docs antigos ainda mostram `pm2 reload re7-whatsapp-agent --update-env` e `pm2 restart re7-whatsapp-agent`.
- manter alinhamento em um unico padrao operacional no proximo ajuste de docs.

### Storage inconsistente
Possivel coexistencia de:
- .data JSON storage
- Prisma
- Postgres

Confirmar fonte de verdade.

Status por evidencia atual:
- Conversas/estado operacional passam por storage com uso de `.data` (json storage + scripts de backup/status).
- Mensagens/metricas/admin usam Prisma/Postgres.
- Ha dualidade de persistencia (estado conversacional vs dados operacionais) que deve ser consolidada/documentada como decisao arquitetural.

## Sprint 5

### lastMessage nulo em parte da Inbox
A estrategia atual de derivacao de ultima mensagem nao cobre todos os casos historicos.

### leadName nao normalizado
Hoje o lead pode persistir com prefixos como "Nome:".

### Ambiguidade entre rotas de conversa
Documentar diferenca entre:
- /admin/conversations/:waId
- /admin/conversation/:waId

## Sprint 6

### Janela curta de indisponibilidade pós-reload
Backend e frontend podem falhar na primeira checagem imediatamente após restart.

### Erros antigos de Server Action no front
Observar e limpar logs do re7-admin-front para reduzir ruído operacional.

### Qualidade dos dados da Inbox
leadName ainda não normalizado
lastMessage pode vir nulo em alguns casos

## Sprint 7

### Normalização do nome do lead
Remover prefixos duplicados como "Nome:".

### Melhor captura de cidade
Parser atual nem sempre extrai cidade corretamente.

### Limpeza de logs do admin-front
Erros de Server Action continuam aparecendo em logs.

## Sprint 10

### Autenticação por usuário individual
Hoje a UI envia `userId`; ainda não existe login/sessão por usuário.

### Claim concorrente
Claim de conversa ainda é `last-write-wins`.

### CRUD de usuários incompleto
Existe criação e listagem, mas não edição/inativação/remoção.

### Auditoria de usuário
Ainda não há trilha de eventos detalhada por usuário.
