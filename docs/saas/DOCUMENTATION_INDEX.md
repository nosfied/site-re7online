# Documentation Index

Status: indice documental atual do Converta. Este documento nao altera runtime.

## Documentos SaaS Principais

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/saas/CONVERTA_PRODUCT_STATE_2026-08.md` | atual | Fotografia documental do produto, canais, Inbox, Support Hub, CRM, campanhas, templates, relatorios de acesso/sessao, LGPD, uso Meta, limites, padrao administrativo expansivo e regra de desativacao de usuario deployada e validada nao destrutivamente |
| `docs/saas/CONVERTA_OPERATOR_GUIDE.md` | atual | Guia de uso operacional para Inbox, Support Hub, usuarios, Treinamentos, templates, mensagens prontas, campanhas, relatorio Acessos/Sessoes, opt-out, anonimizacao e custos Meta |
| `docs/saas/DEMO_TENANT_READINESS.md` | atual | Readiness do tenant generico `demo-converta`, auditoria de configuracoes e checker somente leitura |
| `docs/saas/DEMO_TENANT_PROVISIONING_CHECKLIST.md` | atual | Checklist manual de provisionamento seguro do tenant de demonstracao |
| `docs/saas/DEMO_TENANT_DATA_POLICY.md` | atual | Politica de dados ficticios, sanitizacao e limites para demonstracoes |
| `docs/saas/DEMO_PRESENTATION_SCRIPT_SECULT_PE.md` | atual | Roteiro tematico SECULT-PE usando tenant generico de demonstracao |
| `docs/saas/secult-pe-demo-2026-08.md` | atual | Roteiro de demonstracao/treinamento SECULT-PE e respostas operacionais as solicitacoes levantadas |
| `docs/saas/SECULT_PE_BACKLOG.md` | backlog | Backlog SECULT-PE: balanceamento de fila, auditoria de sessao, nome social, relatorios, reconnect e retificacao |
| `docs/saas/lgpd-anonymization-policy.md` | atual | Politica operacional LGPD: soft delete, anonimizacao, opt-out, bloqueio de reidratacao e limites |
| `docs/saas/META_USAGE_COST_CONTROL.md` | atual | Controle estimativo de uso Meta: ledger, resumo, preview, relatorio mensal, limites e alertas |
| `docs/saas/PRODUCT_MAP_CURRENT.md` | atual | Fotografia atual do produto e modulos |
| `docs/saas/MARKET_PROFILE_ARCHITECTURE.md` | atual | Arquitetura oficial de Core Platform, Market Profiles, Feature Packs, Tenant Configuration e capabilities |
| `docs/saas/BUSINESS_CAPABILITY_DESIGN.md` | atual | Contrato das capabilities do mercado privado e plano para substituir o ultimo filtro business por capability |
| `docs/saas/FEATURE_FLAGS_MATRIX.md` | atual | Matriz oficial de features por profile |
| `docs/saas/GOVERNANCE_CONFIG.md` | atual | Governanca de configuracao DB vs `tenants.json`, incluindo regra de lifecycle para desativacao de usuario e abandono de automacao BOT |
| `docs/saas/INACTIVITY_AUTOMATION_LIFECYCLE_AUDIT_2026-09-14.md` | E2E local validado | Auditoria e validacao local de abandono de automacao/BOT, estados, timeout, reset, handoff, idempotencia e reuso antes de implementar hardening |
| `docs/saas/CHATBOT_FLOW_ACTIVE_ENTRYPOINT_SEMANTICS_AUDIT_2026-09-15.md` | atual | Auditoria read-only da semantica `isActive` vs `entryPoint`, execucao por entrypoint, execucao explicita por Support Hub, matriz de estados e backlog P2 de UX/domain hardening |
| `docs/saas/CHANNELS_GOVERNANCE.md` | atual | Governanca WhatsApp/Messenger/Instagram |
| `docs/saas/WHATSAPP_USERNAME_BSUID_BACKLOG.md` | backlog | Impacto de WhatsApp usernames/BSUID e plano futuro de compatibilidade |
| `docs/saas/CONFIG_MIGRATION_PLAN.md` | atual | Plano incremental de migracao de configuracao |
| `docs/saas/CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md` | atual | Desenho tecnico para migracao futura de `channelAccounts` para DB |
| `docs/saas/RELEASE_CHECKLIST.md` | atual | Checklist de deploy/release |
| `docs/saas/CHANGE_POLICY.md` | atual | Politica de tipos de mudanca |
| `docs/saas/FEATURE_LIFECYCLE.md` | atual | Ciclo de vida das features |
| `docs/saas/admin-ui.md` | atual | Console interno/admin UI, Users/Departments 2.0, guarda de desativacao de usuario e padrao compartilhado de linhas expansivas |
| `docs/saas/PRIVATE_TENANT_ONBOARDING_PLAYBOOK.md` | atual | Playbook operacional para ativar tenants privados e canais pelo console interno |
| `docs/saas/RE7ONLINE_TENANT_OPERATIONS.md` | atual | Runbook do tenant `re7online` como vitrine privada, Webchat e atendimento inicial |
| `docs/saas/automation-ai-tenant-playbook.md` | parcialmente atual | Playbook de automacao/IA por tenant; revisar sempre que mudar evaluation ou tenant AI config |
| `docs/saas/go-live-checklist.md` | parcialmente atual | Checklist go-live; precisa alinhar com Release Checklist novo |
| `docs/saas/onboarding-form.md` | parcialmente atual | Formulario/processo comercial; depende do fluxo real de onboarding |
| `docs/saas/runbook-re7.md` | parcialmente atual | Runbook especifico Re7; revisar com governanca de configuracao |
| `docs/saas/tenant-contract.md` | parcialmente atual | Contrato atual de `tenants.json`; manter enquanto JSON for fonte ativa |

## Fase IV - Bid Readiness

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/bids/CONVERTA_PUBLIC_BID_EVIDENCE_MATRIX.md` | atual | Matriz reutilizavel de evidencias para editais publicos, propostas, PoCs e diligencias |
| `docs/bids/2026/secult-pe/READINESS_NOTES.md` | atual | Notas de prontidao SECULT-PE com gates, riscos e proximos passos |
| `docs/bids/2026/cra-pr/READINESS_NOTES.md` | atual | Notas de prontidao CRA-PR com volume ativo/receptivo, Utility-only, riscos Meta e proximos passos |
| `docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md` | atual | Matriz canonica requisito-a-requisito do Contrato/TR CRA-PR, separando produto, configuracao CRA, evidencia, lacunas contratuais e proximas acoes |
| `docs/bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md` | atual | Checklist da primeira campanha Utility CRA-PR controlada, com gates de template, destinatarios, custo, opt-out, billing e proibicao de envio real sem aprovacao explicita |
| `docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md` | atual | Plano Phase A-C para validar requisitos CRA genericamente no tenant Demo como mirror multitenant, com Phase C parcial, owner receipt/webhook evidence e fix generico deployado sem novo envio |
| `docs/bids/2026/cra-pr/evidence/demo-contract-validation/README.md` | atual | Indice do pacote de evidencias sanitizadas para validacao contratual Demo; Phase C registrou 1 aceite Meta/owner receipt e falha antes de ledger/report local |
| `docs/bids/2026/cra-pr/evidence/demo-contract-validation/RECIPIENT_A_RECONCILIATION_AUDIT_2026-09-15.md` | reconciliado | Auditoria e reconciliacao owner-approved do Recipient A `****9614`, sem reenvio e com Recipient B nao tentado |
| `docs/bids/2026/cra-pr-90004-2026/*` | historico/base contratual | Pacote licitatorio CRA-PR 90004/2026; usar como fonte do contrato/TR/esclarecimentos e consultar a matriz canonica para status operacional atual |
| `docs/saas/BID_COMPLIANCE_MATRIX.md` | atual | Matriz mestre de aderencia por requisito, reutilizavel em editais, propostas e PoC |
| `docs/saas/LICITABLE_VERSION_1_0_CHECKLIST.md` | atual | Checklist executivo para declarar a Versao Licitavel 1.0 |
| `docs/saas/DOCUMENTATION_INVENTORY.md` | atual | Inventario consolidado dos documentos SaaS e lacunas documentais |
| `docs/saas/BID_READINESS_GAP_ANALYSIS.md` | atual | Separacao entre pendencias de produto, documentais, comerciais, juridicas e operacionais |
| `docs/saas/TECHNICAL_POSITIONING.md` | atual | Narrativa tecnica institucional para comissoes, PoCs e diligencias |
| `docs/saas/LICITABLE_VERSION_ROADMAP.md` | atual | Roadmap executivo para fechar a Versao Licitavel 1.0 |

## Documentos Meta

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/meta/01-app-review-package.md` | atual | Pacote/roteiro de App Review Meta |
| `docs/meta/02-instagram-readiness.md` | atual | Estado e prontidao Instagram Business Login |

## Runbooks Operacionais

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/RUNBOOK_WHATSAPP_AGENT.md` | atual | Deploy, migration, retencao e operacao principal |
| `docs/DEPLOY_TOPOLOGY_RE7.md` | parcialmente atual | Topologia de deploy; validar sempre que PM2/VPS/Vercel mudarem |
| `docs/DEPLOY_LOG.md` | atual como historico | Registro historico, nao fonte primaria de arquitetura |
| `docs/onboarding.md` | atual | Onboarding Meta/WhatsApp, readiness, partial bind e recuperacao operacional |
| `docs/smoke-template-fallback.md` | parcialmente atual | Smoke especifico de template fallback |

## Arquitetura E Historico

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/ADR-004-separacao-admin-app.md` | atual | Decisao admin/app |
| `docs/ARCHITECTURE_MULTI_MODE.md` | parcialmente atual | Arquitetura multi-mode; revisar com product map atual |
| `docs/ARCHITECTURE_POSTGRES_RUNTIME_STATE.md` | parcialmente atual | Historico da migracao de runtime state |
| `docs/BACKLOG_TECH.md` | atual | Backlog canonico sincronizado; preserva historico fechado e separa P1/P2/WATCH |
| `docs/DEMO_SCRIPT.md` | parcialmente atual | Script de demo; pode divergir do produto atual |

## Serie whatsapp-agent

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/whatsapp-agent/00-visao-produto.md` | parcialmente atual | Visao inicial |
| `docs/whatsapp-agent/01-compliance-e-janelas.md` | parcialmente atual | Politicas/janelas; revisar contra Meta atual antes de decisoes |
| `docs/whatsapp-agent/02-arquitetura-mvp-meta-cloud.md` | parcialmente atual | Arquitetura MVP WhatsApp |
| `docs/whatsapp-agent/03-backlog-mvp.md` | obsoleto como roadmap | Historico |
| `docs/whatsapp-agent/04-phase-2-echo.md` | obsoleto como estado atual | Historico de fase |
| `docs/whatsapp-agent/05-env-and-smoke-test.md` | parcialmente atual | Env/smoke antigos |
| `docs/whatsapp-agent/06-realtime-inbox-websocket.md` | parcialmente atual | Realtime; revisar se alterar websocket |
| `docs/whatsapp-agent/07-app-data-surfaces-retention.md` | parcialmente atual | Superficies app/retencao |
| `docs/whatsapp-agent/08-multichannel-persistence-schema-proposal.md` | obsoleto como plano ativo | Proposta historica |
| `docs/whatsapp-agent/09-multichannel-db-migration-review.md` | obsoleto como plano ativo | Review historico de migration |
| `docs/whatsapp-agent/10-multichannel-staging-migration-runbook.md` | parcialmente atual | Staging/backfill multicanal, nao migracao de tenant config |
| `docs/whatsapp-agent/11-staging-database-provisioning-runbook.md` | parcialmente atual | Provisionamento staging |
| `docs/whatsapp-agent/12-staging-shadow-write-rollout-runbook.md` | parcialmente atual | Shadow rollout historico |
| `docs/whatsapp-agent/13-production-shadow-rollout-checklist.md` | parcialmente atual | Checklist rollout historico |
| `docs/whatsapp-agent/14-pwa-push-notifications-plan.md` | parcialmente atual | Plano push; comparar com implementacao atual antes de usar |

## Ops

| Documento | Status | Uso |
| --- | --- | --- |
| `docs/whatsapp-agent/ops/CLOUDFLARE_DNS.md` | parcialmente atual | DNS |
| `docs/whatsapp-agent/ops/DEPLOY_GITHUB_SSH_KEY.md` | parcialmente atual | Chave deploy |
| `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md` | parcialmente atual | PM2/VPS |
| `docs/whatsapp-agent/ops/MEDIA_RETENTION.md` | parcialmente atual | Retencao de midia |
| `docs/whatsapp-agent/ops/NGINX_API_RE7ONLINE.md` | parcialmente atual | Nginx/API |
| `docs/whatsapp-agent/ops/OUTBOUND_POLICYC_PROD_CHECK.md` | parcialmente atual | Smoke Policy C |
| `docs/whatsapp-agent/ops/SSL_CERTBOT.md` | parcialmente atual | SSL |

## Auditoria Documental

### Obsoletos Ou Historicos

Nao remover automaticamente. Marcar como historico/arquivo antes de arquivar fisicamente.

- `docs/whatsapp-agent/03-backlog-mvp.md`
- `docs/whatsapp-agent/04-phase-2-echo.md`
- `docs/whatsapp-agent/08-multichannel-persistence-schema-proposal.md`
- `docs/whatsapp-agent/09-multichannel-db-migration-review.md`

Motivo:

- representam fases anteriores ou propostas ja superadas por implementacoes posteriores.

### Parcialmente Atuais

Devem ser revisados antes de uso operacional:

- runbooks de staging/shadow rollout
- docs antigas de MVP WhatsApp
- docs de PWA push
- `tenant-contract.md`, porque ainda e correto para `tenants.json`, mas nao deve virar destino futuro sem revisar `GOVERNANCE_CONFIG.md`

### Duplicados Ou Sobrepostos

- `RUNBOOK_WHATSAPP_AGENT.md` e `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md` se sobrepoem em deploy/PM2.
- `go-live-checklist.md` e `RELEASE_CHECKLIST.md` se sobrepoem em validacao, mas objetivos sao diferentes: go-live de tenant vs release de plataforma.
- `onboarding.md`, `onboarding-form.md` e `runbook-re7.md` se sobrepoem em onboarding; manter ate uma consolidacao posterior.
- documentos multichannel `08`, `09`, `10`, `11`, `12`, `13` formam trilha historica; nao usar isoladamente como plano atual.

### Faltantes

- Guia de rollback por tipo de release.
- Guia de incident response.
- Guia de token rotation Meta por canal.
- Guia de onboarding de desenvolvedor novo.
- Matriz de ownership por modulo.
- Registro formal de decisoes de configuracao DB-first vs JSON fallback.

## Regra De Uso

Para estado atual do produto, usar primeiro:

1. `PRODUCT_MAP_CURRENT.md`
2. `MARKET_PROFILE_ARCHITECTURE.md` quando o assunto for profiles, packs, tenant capabilities ou evolucao por segmento
3. `BUSINESS_CAPABILITY_DESIGN.md` quando o assunto for CRM, catalogo, funil, campanhas ou capabilities privadas
4. `GOVERNANCE_CONFIG.md`
5. `CHANNELS_GOVERNANCE.md`
6. `CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md` quando o assunto for migracao de canais
7. `FEATURE_FLAGS_MATRIX.md`
8. `FEATURE_LIFECYCLE.md`

Para deploy, usar:

1. `CHANGE_POLICY.md`
2. `RELEASE_CHECKLIST.md`
3. `RUNBOOK_WHATSAPP_AGENT.md` quando houver migration ou producao sensivel

Para licitacoes, propostas tecnicas, PoCs e diligencias, usar primeiro:

1. `BID_COMPLIANCE_MATRIX.md`
2. `LICITABLE_VERSION_1_0_CHECKLIST.md`
3. `DOCUMENTATION_INVENTORY.md`
4. `BID_READINESS_GAP_ANALYSIS.md`
5. `TECHNICAL_POSITIONING.md`
6. `LICITABLE_VERSION_ROADMAP.md`
7. `bid-package/*` como material modular reutilizavel
