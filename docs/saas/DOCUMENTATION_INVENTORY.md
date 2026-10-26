# Documentation Inventory

Status: inventario documental da Sprint 79A para Bid Readiness. Este documento nao altera produto, banco, infraestrutura ou runtime.

## Prevalência atual — revisão de 26/10/2026

O inventário abaixo é a fotografia da Fase IV. O estado operacional está em
[CURRENT_STATE.md](CURRENT_STATE.md), a instrução de deploy em
[DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md) e a sequência consolidada em
[mapa atualizado](PRODUCT_MAP_CURRENT_2026-10-19.md). O extenso PRODUCT_MAP_CURRENT.md
é histórico, não o plano atual. Auditorias anteriores à implementação de Webchat,
Telegram/API ou ao deploy CRM não devem ser usadas para reabrir essas entregas.
O guia [CONVERTA_OPERATOR_GUIDE.md](CONVERTA_OPERATOR_GUIDE.md) já existe: a pendência
é revisão/adaptação para treinamento/PoC, não produzir outro manual do zero.

## Objetivo

Organizar a documentacao existente do Converta para uso em licitacoes, propostas tecnicas, diligencias, impugnacoes e Provas de Conceito.

Regra de uso:

1. usar este inventario para localizar evidencias;
2. usar os documentos mestres da Fase IV para respostas executivas;
3. usar documentos tecnicos originais como evidencia de apoio;
4. nao criar documentos paralelos quando um documento existente puder ser atualizado.

## Auditoria Por Categoria

| Categoria | Documentos principais | Estado | Reutilizacao |
| --- | --- | --- | --- |
| Arquitetura | `PRODUCT_MAP_CURRENT.md`, `GOVERNANCE_CONFIG.md`, `CHANNELS_GOVERNANCE.md`, `CONFIG_MIGRATION_PLAN.md`, `CHANNEL_ACCOUNTS_MIGRATION_DESIGN.md`, `HIGH_AVAILABILITY_SCALE_DESIGN.md` | Atual com pontos historicos | Base para proposta tecnica, arquitetura logica e justificativas multi-tenant |
| Seguranca | `CHANGE_POLICY.md`, `FEATURE_LIFECYCLE.md`, `MFA_OTP_DESIGN.md`, `LOGGING_AUDIT_STANDARD.md`, `CHANNELS_GOVERNANCE.md`, `bid-package/03-seguranca.md` | Atual | Base para controle de acesso, MFA, segredos, auditoria e governanca |
| Infraestrutura | `OPERATIONAL_BASELINE.md`, `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `RUNBOOK_WHATSAPP_AGENT.md`, `DEPLOY_TOPOLOGY_RE7.md`, `RELEASE_CHECKLIST.md` | Atual com alguns runbooks parcialmente historicos | Base para descrever VPS, PM2, Postgres, health, deploy e limites |
| Observabilidade | `OBSERVABILITY_OPERATIONS_AUDIT.md`, `RUNTIME_OBSERVABILITY_DESIGN.md`, `RUNTIME_METRICS_FOUNDATION.md`, `METRICS_FOUNDATION.md`, `OPERATIONAL_DASHBOARD.md`, `ALERT_RUNTIME_FOUNDATION.md`, `ALERTING_NOTIFICATIONS_DESIGN.md` | Atual | Evidencia de logs, metricas, dashboard, alertas e maturidade operacional |
| Operacao | `RELEASE_CHECKLIST.md`, `CHANGE_POLICY.md`, `go-live-checklist.md`, `runbook-re7.md`, `RUNBOOK_WHATSAPP_AGENT.md` | Atual/parcial | Base para release, go-live, rollback operacional e smokes |
| Performance | `LOAD_TEST_DESIGN.md`, `LOAD_TEST_RESULTS.md`, `LOAD_TEST_FIXTURES.md`, `LOAD_TEST_TENANT_DESIGN.md`, `LOAD_TEST_TENANT_BOOTSTRAP.md`, `INBOX_QUERY_PATH_AUDIT.md` | Atual | Evidencia de laboratorio de carga, baseline, resultado inbox-read e hardening |
| Backup | `BACKUP_RESTORE_HARDENING_DESIGN.md`, `BACKUP_RESTORE_VALIDATION.md`, `OPERATIONAL_BASELINE.md`, `RELEASE_CHECKLIST.md` | Atual | Evidencia de restore validado, hardening de backup e pontos pendentes |
| LGPD | `bid-package/04-lgpd.md`, `PRODUCT_MAP_CURRENT.md`, `LOGGING_AUDIT_STANDARD.md`, `OBSERVABILITY_OPERATIONS_AUDIT.md` | Atual | Base para retencao, redaction, isolamento e tratamento de dados |
| API | `PUBLIC_API_AUDIT.md`, `PUBLIC_API_DESIGN.md`, `PUBLIC_API_WEBHOOKS_DESIGN.md`, `PUBLIC_API_WEBHOOKS_CONTROLLED_DISPATCH_DESIGN.md`, `public-api/openapi.yaml`, `bid-package/12-integracoes.md` | Atual | Evidencia de API keys, OpenAPI, leitura, webhooks e dispatch controlado |
| Search | `ADVANCED_SEARCH_DESIGN.md`, `LOAD_TEST_RESULTS.md`, `B2G_READINESS_AUDIT.md` | Atual | Evidencia de busca textual MVP, SearchIndex e integracao com audio |
| MFA | `MFA_OTP_DESIGN.md`, `B2G_READINESS_AUDIT.md`, `GOVERNMENT_READY_REVIEW.md` | Atual | Evidencia de TOTP, enrollment, shadow, enforcement ADMIN e recovery codes |
| IA | `automation-ai-tenant-playbook.md`, `KNOWLEDGE_BASE_RUNTIME_INTEGRATION_DESIGN.md`, `bid-package/07-ia.md`, `PRODUCT_MAP_CURRENT.md` | Parcial/atual | Base para IA supervisionada, limites e configuracao por tenant |
| Inbox | `INBOX_QUERY_PATH_AUDIT.md`, `LOAD_TEST_RESULTS.md`, `PRODUCT_MAP_CURRENT.md`, `bid-package/10-crm-timeline.md` | Atual | Evidencia de Inbox multicanal, timeline, performance e RBAC |
| Webchat | `WEBCHAT_AUDIT.md`, `WEBCHAT_DESIGN.md`, `WEBCHAT_RUNTIME_DESIGN.md`, `B2G_READINESS_AUDIT.md` | Atual | Evidencia de Webchat MVP E2E, widget minimo, polling e Inbox |
| Telegram | `TELEGRAM_AUDIT.md`, `TELEGRAM_DESIGN.md`, `B2G_READINESS_AUDIT.md` | Atual | Evidencia de configuracao, token criptografado, inbound/outbound texto |
| Deployment | `RELEASE_CHECKLIST.md`, `RUNBOOK_WHATSAPP_AGENT.md`, `DEPLOY_TOPOLOGY_RE7.md`, `DEPLOY_LOG.md`, `docs/whatsapp-agent/ops/*` | Atual/parcial | Base de deploy e operacao; `DEPLOY_LOG.md` e historico |
| Licitacoes | `BID_READINESS_MATRIX.md`, `GOVERNMENT_READY_REVIEW.md`, `B2G_READINESS_AUDIT.md`, `bid-package/*` | Parcialmente defasado antes da 79A | Fonte historica e evidencia; os documentos 79A viram camada mestre |

## Documentos Mestre Da Fase IV

| Documento | Papel |
| --- | --- |
| `BID_COMPLIANCE_MATRIX.md` | Matriz consolidada por requisito, nao por edital |
| `LICITABLE_VERSION_1_0_CHECKLIST.md` | Checklist executivo para declarar Versao Licitavel 1.0 |
| `DOCUMENTATION_INVENTORY.md` | Inventario de evidencias e lacunas documentais |
| `BID_READINESS_GAP_ANALYSIS.md` | Separacao entre pendencias de produto, documentacao, comercial, juridico e operacao |
| `TECHNICAL_POSITIONING.md` | Narrativa tecnica para comissoes de contratacao |
| `LICITABLE_VERSION_ROADMAP.md` | Roadmap final com prioridades Obrigatorio/Importante/Desejavel |

## Redundancias E Consolidacao

| Area | Redundancia | Decisao |
| --- | --- | --- |
| Go-live/release | `go-live-checklist.md` e `RELEASE_CHECKLIST.md` | manter ambos; `RELEASE_CHECKLIST.md` e release de plataforma, `go-live-checklist.md` e ativacao de tenant |
| Runbooks VPS | `RUNBOOK_WHATSAPP_AGENT.md`, `DEPLOY_TOPOLOGY_RE7.md`, `docs/whatsapp-agent/ops/*` | usar `DEPLOY_RUNBOOK.md` para deploy; `CURRENT_STATE.md` para estado e `OPERATIONAL_BASELINE.md` para infraestrutura; runbook extenso preserva históricos |
| Bid readiness | `BID_READINESS_MATRIX.md`, `GOVERNMENT_READY_REVIEW.md`, `B2G_READINESS_AUDIT.md` | manter como historico/evidencia; `BID_COMPLIANCE_MATRIX.md` vira matriz mestre |
| Observabilidade | varios designs e fundamentos 78A-78H | manter granularidade; usar `OBSERVABILITY_OPERATIONS_AUDIT.md` como sintese |
| Load test | design, fixtures, tenant e results | manter todos; usar `LOAD_TEST_RESULTS.md` como resultado oficial |
| Docs whatsapp-agent antigas | serie `docs/whatsapp-agent/03`, `04`, `08`, `09` | historicas; nao usar como estado atual |

## Lacunas Documentais

| Lacuna | Categoria | Prioridade |
| --- | --- | --- |
| Manual do Administrador | Documentacao | Obrigatorio para pacote licitavel |
| Guia do Operador existente: revisão/adaptação | Documentacao | Atualizar material de treinamento/POC sem duplicação |
| Guia de Implantacao B2G | Implantacao | Obrigatorio |
| Plano de Treinamento | Comercial/operacao | Obrigatorio quando edital exigir treinamento |
| Modelo de Proposta Tecnica | Comercial | Obrigatorio |
| Matriz edital-item por certame real | Licitacoes | Obrigatorio por disputa |
| Kit de evidencias POC | Licitacoes | Obrigatorio para banca |
| Dossie juridico/fiscal | Juridico | Fora do repositorio, obrigatorio por disputa |
| Atestados de capacidade tecnica | Comercial/juridico | Fora do repositorio, obrigatorio por disputa |
| Backup offsite e restore drill recorrente | Operacao | Importante para editais grandes |
| SLA comercial assinado | Comercial/juridico | Importante |

## Conclusao

A documentacao tecnica e operacional e ampla e atual o suficiente para sustentar a Fase IV. A lacuna principal nao e falta de engenharia: e transformar a evidencia existente em materiais consumiveis por comissao de licitacao, proposta tecnica, PoC e diligencia.
