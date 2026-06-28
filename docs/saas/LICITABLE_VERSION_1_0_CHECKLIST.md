# Licitable Version 1.0 Checklist

Status: checklist executivo da Sprint 79A. Documento de consolidacao; nao altera runtime.

## Criterio Geral

A Versao Licitavel 1.0 pode ser declarada quando o Converta tiver:

- produto demonstravel para requisitos recorrentes;
- seguranca e operacao comprovadas;
- documentacao tecnica consolidada;
- pacote comercial/juridico minimo reunido;
- roteiro de PoC reproduzivel;
- matriz de aderencia por edital alvo.

## Produto

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| WhatsApp Oficial | Pronto | `CHANNELS_GOVERNANCE.md`, `bid-package/06-whatsapp-oficial.md` | Manter evidencias Meta por tenant |
| Inbox multicanal | Pronto | `PRODUCT_MAP_CURRENT.md`, `LOAD_TEST_RESULTS.md` | Usar em POC |
| Messenger/Instagram | Pronto com configuracao | `CHANNELS_GOVERNANCE.md` | Validar tokens/app review por proposta |
| Webchat MVP | Pronto | `WEBCHAT_RUNTIME_DESIGN.md`, `B2G_READINESS_AUDIT.md` | Preparar roteiro visual de POC |
| Telegram texto | Pronto com ressalva | `TELEGRAM_DESIGN.md` | Declarar texto-only, sem midia/grupos |
| Public API read-only | Pronto | `public-api/openapi.yaml` | Anexar OpenAPI se edital exigir |
| Webhooks controlados | Pronto com ressalva | `PUBLIC_API_WEBHOOKS_CONTROLLED_DISPATCH_DESIGN.md` | Declarar sem dispatch automatico por eventos reais |
| Scheduling | Parcial | `SCHEDULING_DESIGN.md` | Declarar CRUD/reminders/controlado; automatico se contratado |
| NPS | Parcial | `NPS_SATISFACTION_DESIGN.md` | Documentar limite atual |
| Search | Pronto | `ADVANCED_SEARCH_DESIGN.md`, `LOAD_TEST_RESULTS.md` | Demonstrar `/app/search` |
| Audio transcription | Parcial | `AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md` | Piloto real ainda pendente |
| MFA ADMIN | Pronto com ressalva | `MFA_OTP_DESIGN.md` | Declarar escopo ADMIN; recovery login futuro |

## Seguranca

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| RBAC | Pronto | `PRODUCT_MAP_CURRENT.md`, `LOAD_TEST_RESULTS.md` | Demonstrar AGENT/SUPERVISOR/ADMIN |
| Multi-tenant | Pronto | `GOVERNANCE_CONFIG.md`, `FEATURE_FLAGS_MATRIX.md` | Destacar isolamento por `clientId` |
| MFA/TOTP | Parcial | `MFA_OTP_DESIGN.md` | Definir politica por edital |
| Segredos criptografados | Pronto | Webhooks, Telegram, MFA docs | Documentar rotacao por modulo |
| Logs redigidos | Pronto | `LOGGING_AUDIT_STANDARD.md` | Usar como evidencia LGPD |
| LGPD/retencao | Pronto | `bid-package/04-lgpd.md` | Ajustar prazos por contrato |

## Performance

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Load Lab v1 | Pronto | `LOAD_TEST_RESULTS.md` | Anexar resumo executivo |
| Inbox read vu20 | Pronto | p95 585ms, 0% erro | Usar como prova de hardening |
| Search/Public API | Pronto | `LOAD_TEST_RESULTS.md` | Usar como evidencia de estabilidade |
| 400 usuarios simultaneos | Pendente | `HIGH_AVAILABILITY_SCALE_DESIGN.md` | Exige ambiente dimensionado |

## Operacao

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Release checklist | Pronto | `RELEASE_CHECKLIST.md` | Usar em implantacao |
| Health/metrics/alerts | Pronto | `RUNTIME_METRICS_FOUNDATION.md`, `ALERT_RUNTIME_FOUNDATION.md` | Demonstrar `/admin/ops` |
| Dashboard operacional | Pronto | `OPERATIONAL_DASHBOARD.md` | Demonstrar acesso admin |
| Backup/restore | Parcial | `BACKUP_RESTORE_VALIDATION.md` | Ativar cron/offsite se contrato exigir |
| Runbook de operacao | Parcial | `RUNBOOK_WHATSAPP_AGENT.md`, `runbook-re7.md` | Consolidar guia B2G |

## Infraestrutura

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Baseline VPS | Pronto | `OPERATIONAL_BASELINE.md` | Atualizar a cada mudanca |
| Swap/build sequencial | Pronto | `OPERATIONAL_BASELINE.md` | Manter regra operacional |
| HA/failover | Pendente | `HIGH_AVAILABILITY_SCALE_DESIGN.md` | Propor como opcional/contrato maior |
| Storage grande | Pendente | `BID_READINESS_GAP_ANALYSIS.md` | Precificar por edital |

## Documentacao

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Matriz compliance | Pronto 79A | `BID_COMPLIANCE_MATRIX.md` | Atualizar por edital real |
| Inventario documental | Pronto 79A | `DOCUMENTATION_INVENTORY.md` | Manter fonte unica |
| Narrativa tecnica | Pronto 79A | `TECHNICAL_POSITIONING.md` | Usar em proposta tecnica |
| Manual admin | Pendente | n/a | Criar antes da primeira disputa grande |
| Manual operador | Pendente | n/a | Criar antes de PoC/treinamento |
| Guia implantacao B2G | Pendente | n/a | Consolidar runbooks existentes |

## Comercial

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Catalogo tecnico | Parcial | `bid-package/01-catalogo-tecnico.md` | Atualizar com Webchat/Telegram/Search/MFA/Ops |
| Proposta tecnica modelo | Pendente | n/a | Criar template |
| Deck institucional | Parcial | `executive-deck/converta-executive-deck.md` | Atualizar pos-Fase III |
| Plano de treinamento | Pendente | n/a | Criar anexo |
| SLA comercial | Pendente | n/a | Definir niveis e precos |

## Juridico

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Contrato social/certidoes | Fora do repositorio | n/a | Reunir por disputa |
| Balanco/indices | Fora do repositorio | n/a | Validar com contador |
| Atestados tecnicos | Fora do repositorio | n/a | Coletar e classificar |
| Declaracoes LC 123/ME/EPP | Fora do repositorio | n/a | Preparar se aplicavel |
| Declaracao API oficial Meta | Parcial | `bid-package/06-whatsapp-oficial.md` | Criar anexo formal assinado |

## Implantacao E PoC

| Item | Estado | Evidencia | Acao |
| --- | --- | --- | --- |
| Tenant demo | Pronto | `demo-prefeitura`, docs de POC | Atualizar roteiro |
| Tenant loadtest | Pronto para benchmark | `LOAD_TEST_TENANT_DESIGN.md` | Nao usar em demo |
| Roteiro PoC municipal | Parcial | `DEMO_SCRIPT.md` | Criar `B2G_POC_RUNBOOK.md` |
| Checklist smoke | Pronto | `RELEASE_CHECKLIST.md` | Adaptar por edital |

## Decisao

Estado atual: **tecnicamente apto para Bid Readiness**, ainda nao declarado como Versao Licitavel 1.0 formal porque faltam ativos documentais/comerciais/juridicos externos ao produto.

Condicao para declarar Versao Licitavel 1.0:

1. matriz por edital alvo preenchida;
2. manual admin e operador criados;
3. proposta tecnica modelo criada;
4. kit POC municipal criado;
5. atestados/certidoes reunidos fora do repositorio;
6. limites de infraestrutura e storage explicitados na proposta.
