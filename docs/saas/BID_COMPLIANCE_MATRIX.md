# Bid Compliance Matrix

Status: matriz mestre da Sprint 79A. Documento de consolidacao para Bid Readiness. Nao altera runtime.

## Escopo

Esta matriz consolida requisitos recorrentes dos editais usados como referencia:

- Camara de Conselheiro Lafaiete/MG;
- Prefeitura de Cabreuva/SP;
- Camara de Quatro Barras/PR;
- Prefeitura de Aripuana/MT;
- RIOPRETOPREV / Sao Jose do Rio Preto/SP.

Organizacao: por requisito, nao por edital.

Status:

- **Atendido**: demonstravel hoje sem nova implementacao central.
- **Atendido com ressalva**: existe base funcional, mas exige configuracao, evidencia, documento, escala, piloto ou refinamento.
- **Pendente**: exige implementacao, fornecedor, infraestrutura ou ativo externo ainda inexistente.
- **Nao aplicavel**: requisito nao recorrente ou depende do edital especifico.

## Matriz Mestre

| Requisito | Objetivo do orgao | Problema que resolve | Como o Converta atende | Sprints/evolucao | Documentacao existente | Evidencias | Demonstracao PoC | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WhatsApp oficial / Meta Cloud API | Atender cidadao em canal oficial, sem QR Code informal | Risco de bloqueio, instabilidade e nao conformidade | Usa API oficial Meta/WhatsApp, templates e governanca de canais | Base Fase I; hardening canais | `CHANNELS_GOVERNANCE.md`, `bid-package/06-whatsapp-oficial.md` | Tenant Meta config, WABA, templates | Enviar/receber atendimento WhatsApp controlado | Atendido |
| Inbox multiatendente | Permitir operacao por varios atendentes e setores | Centralizar demandas e evitar perda de historico | `/app/inbox`, timeline, atribuicao, RBAC e departamentos | Fase I, 78N.6, 78O.1-78O.3 | `PRODUCT_MAP_CURRENT.md`, `INBOX_QUERY_PATH_AUDIT.md`, `LOAD_TEST_RESULTS.md` | Conversas, timeline, performance p95 585ms em vu20 | Listar conversa, abrir detalhe, responder | Atendido |
| Departamentos/filas | Roteamento por secretaria/setor | Separar responsabilidades e preservar sigilo | `Department`, `Queue`, filtros, ownership e regras de departamento | Fase I, 78N.6 | `PRODUCT_MAP_CURRENT.md`, `LOAD_TEST_FIXTURES.md` | 403 correto para conversa fora do departamento | Demonstrar usuario por departamento | Atendido |
| Historico e CRM/timeline | Rastrear protocolo e interacoes | Auditoria e continuidade de atendimento | `Conversation`, `InboundMessage`, `OutboundMessage`, `Lead`, timeline | Fase I | `bid-package/10-crm-timeline.md`, `PRODUCT_MAP_CURRENT.md` | Timeline inbound/outbound multicanal | Abrir timeline de cidadao | Atendido |
| Chatbot e automacao | Triagem inicial e reducao de atendimento manual | Padronizar respostas e captar dados | Fluxos por tenant, handoff humano, configuracao governada | Fase I | `PRODUCT_MAP_CURRENT.md`, `automation-ai-tenant-playbook.md` | Fluxo chatbot e handoff | Simular triagem e transferencia | Atendido |
| IA supervisionada | Apoiar atendimento sem perder controle humano | Melhorar qualidade e velocidade de resposta | IA tenant-scoped, configuravel e supervisionada | Fase I/II | `bid-package/07-ia.md`, `PRODUCT_MAP_CURRENT.md` | Configuracao por tenant, evaluation replay | Demonstrar resposta assistida se habilitada | Atendido com ressalva |
| Knowledge Base | Base institucional de respostas e artigos | Padronizar informacao e reduzir erro humano | Schema/CRUD e design de integracao runtime | Sprints 69D+ | `KNOWLEDGE_BASE_AUDIT.md`, `KNOWLEDGE_BASE_MVP_DESIGN.md`, `KNOWLEDGE_BASE_RUNTIME_INTEGRATION_DESIGN.md` | Colecoes/artigos por tenant | Mostrar gestao de artigos | Atendido com ressalva |
| Public API read-only | Integrar sistemas externos e fiscalizar dados | Evitar lock-in e permitir auditoria | API keys, OpenAPI, contatos, conversas e mensagens read-only | 70A-70F | `PUBLIC_API_AUDIT.md`, `PUBLIC_API_DESIGN.md`, `public-api/openapi.yaml` | OpenAPI, endpoints versionados | Chamada autenticada em POC | Atendido |
| Webhooks | Integracao outbound com sistemas terceiros | Notificar eventos externos | Endpoint CRUD, segredo criptografado, shadow e dispatch manual controlado | 70G-70K | `PUBLIC_API_WEBHOOKS_DESIGN.md`, `PUBLIC_API_WEBHOOKS_CONTROLLED_DISPATCH_DESIGN.md` | HMAC, delivery/attempt, dispatch manual | Demonstrar dispatch controlado para endpoint piloto | Atendido com ressalva |
| Scheduling | Agendar atendimentos e servicos publicos | Organizar agenda e reduzir faltas | CRUD, availability, appointments, reminders, shadow e envio controlado | 71A-71H | `SCHEDULING_DESIGN.md`, `SCHEDULING_REMINDERS_CONFIRMATION_DESIGN.md`, `SCHEDULING_REMINDER_CONTROLLED_SEND_DESIGN.md` | Appointment/Reminder, CLI send controlado | Criar agendamento e lembrete manual | Atendido com ressalva |
| NPS/satisfacao | Medir qualidade percebida pelo cidadao | Gerar indicador de satisfacao e melhoria | Schema/CRUD de satisfaction/NPS | 72A-72C | `NPS_SATISFACTION_AUDIT.md`, `NPS_SATISFACTION_DESIGN.md` | Perguntas/pesquisas/respostas estruturais | Mostrar configuracao de pesquisa | Atendido com ressalva |
| Webchat | Canal web incorporavel ao portal | Atender cidadao sem WhatsApp | Settings, dominios, sessao, inbound, Inbox, outbound humano, polling e widget minimo | 73C-73J | `WEBCHAT_AUDIT.md`, `WEBCHAT_DESIGN.md`, `WEBCHAT_RUNTIME_DESIGN.md` | Widget minimo, Conversation channel webchat | Enviar mensagem via widget e responder pelo Inbox | Atendido |
| Telegram | Canal adicional de atendimento humano | Cobrir editais multicanal | Bot configuravel, token criptografado, webhook shadow, inbound/outbound texto | 74A-74F | `TELEGRAM_AUDIT.md`, `TELEGRAM_DESIGN.md` | Conversation channel telegram, Bot API sendMessage controlado | Mensagem texto inbound/outbound em bot piloto | Atendido com ressalva |
| Audio transcription | Registrar conteudo de audio | Acessibilidade, auditoria e busca | Schema, shadow, runtime controlado manual com STT e design de piloto real | 75E-75J | `AUDIO_TRANSCRIPTION_DESIGN.md`, `AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`, `AUDIO_TRANSCRIPTION_REAL_MEDIA_PILOT_DESIGN.md` | AudioTranscription/Job, CLI process controlado | Pendente de piloto com audio real | Atendido com ressalva |
| Advanced Search | Localizar conversas, mensagens e transcricoes | Auditoria, ouvidoria e produtividade | SearchIndex, indexador shadow, runtime textual e indexacao de transcricao | 76A-76E | `ADVANCED_SEARCH_DESIGN.md`, `LOAD_TEST_RESULTS.md` | `/app/search`, CLI index, SearchIndex | Buscar termo e filtrar por fonte/canal | Atendido |
| MFA/TOTP | Reforcar acesso administrativo | Reduzir risco de conta comprometida | Enrollment, shadow, runtime shadow, recovery codes e enforcement ADMIN | 77A-77I | `MFA_OTP_DESIGN.md`, `B2G_READINESS_AUDIT.md` | MfaChallenge, TOTP antes de JWT para ADMIN | Demonstrar login ADMIN com challenge em tenant piloto | Atendido com ressalva |
| Logging/redaction | Registrar operacao sem vazar PII | Auditoria e LGPD | Logger central, envelope padronizado, redaction | 78B | `LOGGING_AUDIT_STANDARD.md` | Logs estruturados com request/correlation/tenant | Apresentar log redigido | Atendido |
| Metrics/dashboard/alerts | Monitorar saude e operacao | Detectar falhas e acompanhar SLA tecnico | Metricas internas, dashboard `/admin/ops`, AlertManager | 78C-78H | `METRICS_FOUNDATION.md`, `RUNTIME_METRICS_FOUNDATION.md`, `OPERATIONAL_DASHBOARD.md`, `ALERT_RUNTIME_FOUNDATION.md` | `/admin/ops/metrics`, `/admin/ops/alerts` | Abrir painel operacional | Atendido |
| Backup/restore | Recuperar operacao apos falha | Continuidade e resiliencia | Restore validado, hardening de backup PostgreSQL documentado | 78J-78L | `BACKUP_RESTORE_HARDENING_DESIGN.md`, `BACKUP_RESTORE_VALIDATION.md` | Restore isolado validado, manifest/checksum design | Apresentar runbook e evidencia | Atendido com ressalva |
| Load test/performance | Provar comportamento sob carga | Reduzir risco em POC e contrato | Load Lab v1, fixtures autenticadas, inbox-read otimizado | 78M-78O.3 | `LOAD_TEST_DESIGN.md`, `LOAD_TEST_RESULTS.md`, `INBOX_QUERY_PATH_AUDIT.md` | p95 inbox-read vu20 585ms, 0% erro | Exibir resultados e criterios | Atendido |
| Multi-tenant | Isolar clientes, dados e features | Segurança, governanca e oferta SaaS | `clientId`, flags por tenant, RBAC, configs governadas | Fase I-III | `GOVERNANCE_CONFIG.md`, `FEATURE_FLAGS_MATRIX.md`, `bid-package/05-multi-tenant.md` | Rotas tenant-scoped, feature flags | Demonstrar tenant demo isolado | Atendido |
| LGPD/retencao | Proteger dados pessoais | Conformidade legal | Retencao, anonimização, redaction e politicas | Fase I-III | `bid-package/04-lgpd.md`, `LOGGING_AUDIT_STANDARD.md` | RetentionConfig, logs redigidos | Apresentar politica e telas | Atendido |
| Relatorios/SLA | Medir atendimento e produtividade | Fiscalizacao contratual | Reports, dashboard, ConversationMetrics, SLAConfig | Fase I | `bid-package/08-sla.md`, `bid-package/09-relatorios.md` | `/app/reports`, SLA metrics | Gerar relatorio por periodo | Atendido |
| Escala/HA | Sustentar contratos maiores | Disponibilidade e crescimento | Baseline, swap, design HA/scale; HA runtime nao implementado | 78I, 78O | `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `OPERATIONAL_BASELINE.md` | VPS 2vCPU/1.9GiB/2GiB swap, PM2 online | Evidencia operacional atual | Atendido com ressalva |
| Storage 600GB/midia | Guardar grande volume de midias | Requisitos de editais grandes | Existe governanca de retencao; storage contratado deve ser proposto por edital | Fase IV | `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `B2G_READINESS_AUDIT.md` | Plano/custo pendente | Nao demonstrar sem proposta de infra | Pendente |
| App mobile nativo | Acesso mobile via loja | Operacao em campo | Produto web/PWA; app nativo depende do edital | Historico PWA | `PRODUCT_MAP_CURRENT.md`, `B2G_READINESS_AUDIT.md` | PWA/mobile web | Demonstrar responsivo/PWA se aceito | Atendido com ressalva |
| Treinamento/EAD | Capacitar usuarios do orgao | Adoção e suporte | Materiais ainda dispersos; LMS/EAD nao existe | Fase IV | `DEMO_SCRIPT.md`, `go-live-checklist.md` | Roteiro de POC e onboarding | Treinamento presencial/remoto proposto | Atendido com ressalva |
| Habilitacao juridica/fiscal | Cumprir fase documental | Evitar inabilitacao | Fora do codigo; exige documentos da empresa | Fase IV | `BID_READINESS_GAP_ANALYSIS.md` | Certidoes, contrato social, balanco | Nao se demonstra no produto | Pendente |
| Atestado tecnico | Provar capacidade anterior | Habilitacao tecnica | Fora do repositorio; precisa coletar atestados | Fase IV | `BID_READINESS_GAP_ANALYSIS.md` | Atestados assinados | Anexo documental | Pendente |

## Leitura Por Edital

| Edital referencia | Classificacao atual | Condicao de competitividade |
| --- | --- | --- |
| Conselheiro Lafaiete/MG | Atende com ajustes | Forte em WhatsApp, Inbox, chatbot, relatorios, scheduling estrutural; reforcar NPS, transcricao/busca e dossie documental |
| Cabreuva/SP | Atende com ajustes | Forte para WhatsApp-first, setores, SLA, reports, Search e POC |
| Quatro Barras/PR | Atende com ajustes | Forte para atendimento, indicadores e POC; ajustar documentos e NPS se exigido |
| Aripuana/MT | Atende com ajustes sensiveis | Exige proposta de escala/storage/mobile/HA mais conservadora |
| RIOPRETOPREV/Sao Jose do Rio Preto/SP | Atende com ajustes | Bom encaixe multicanal e seguranca; validar escopo de MFA/OTP, busca, transcricao e HA |

## Conclusao

O Converta esta tecnicamente pronto para disputar editais semelhantes, desde que cada proposta explicite:

- o que esta operacional e demonstravel;
- o que e atendido por configuracao/documentacao;
- o que depende de infraestrutura contratada;
- o que depende de ativo comercial/juridico externo ao produto.
