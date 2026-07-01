# Bid Compliance Matrix

Status: matriz mestre da Sprint 79B. Documento de Gate Review da Versao Licitavel 1.0. Nao altera runtime.

## Escopo

Esta matriz consolida requisitos recorrentes dos editais usados como casos de teste:

- Camara de Conselheiro Lafaiete/MG;
- Prefeitura de Cabreuva/SP;
- Camara de Quatro Barras/PR;
- Prefeitura de Aripuana/MT;
- RIOPRETOPREV / Sao Jose do Rio Preto/SP.

Organizacao: por requisito, nao por edital. Os editais sao casos de teste para validar se o Converta consegue comprovar aderencia de forma auditavel.

## Fontes Oficiais

- `BID_COMPLIANCE_MATRIX.md`;
- `GOVERNMENT_READY_REVIEW.md`;
- `B2G_READINESS_AUDIT.md`;
- `BID_READINESS_MATRIX.md`;
- `PRODUCT_MAP_CURRENT.md`;
- `DOCUMENTATION_INDEX.md`;
- `bid-package/*`.

## Taxonomia Oficial

- **Atendido**: demonstravel hoje com funcionalidade, sprint/evolucao, documento, evidencia, PoC e justificativa tecnica.
- **Atendido com ressalva**: existe base funcional ou operacional, mas depende de configuracao, evidencia externa, documento, piloto, escala, infraestrutura contratada ou refinamento.
- **Pendente**: exige implementacao, fornecedor, infraestrutura, ativo comercial/juridico ou evidencia inexistente hoje.
- **Nao aplicavel**: requisito nao recorrente ou depende de edital especifico.

## Risco Licitatorio

- **Nenhum**: produto atende, documentacao/evidencia estao prontas e PoC e direta.
- **Baixo**: atende, mas requer ajuste documental secundario, parametrizacao ou evidencia simples.
- **Medio**: produto atende ou atende com ressalva, mas depende de atestado, PoC, documentacao, infraestrutura contratada ou diligencia provavel.
- **Alto**: requisito funcional, juridico, comercial ou operacional pode gerar desclassificacao, inabilitacao ou reprova de PoC.

## Regra De Governanca

Toda decisao deve ser auditavel. Nenhuma decisao executiva pode existir sem requisito, status, evidencia, sprint/evolucao, documento, endpoint/tela quando aplicavel, PoC, justificativa e risco licitatorio.

Um requisito so pode ser marcado como **Atendido** quando houver, ao mesmo tempo:

- funcionalidade;
- sprint/evolucao identificavel;
- documento;
- evidencia objetiva;
- forma de demonstrar na PoC;
- justificativa tecnica.

Se qualquer elemento faltar, o requisito deve permanecer como **Atendido com ressalva** ou **Pendente**.

## Matriz Mestre Auditada

| Requisito | Status | Risco | Justificativa do risco | Sprint/evolucao | Documento | Endpoint/Tela | Evidencia objetiva | Demonstracao PoC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WhatsApp oficial / Meta Cloud API | Atendido | Baixo | Funcionalidade central existe; risco residual e documental/Meta por tenant | Fase I; canais hardening | `CHANNELS_GOVERNANCE.md`, `bid-package/06-whatsapp-oficial.md` | Webhook WhatsApp, `/app/inbox`, `/app/settings/channels` | WABA, `TenantMetaConfig`, templates, mensagens inbound/outbound | Enviar e receber atendimento WhatsApp oficial sem QR Code |
| Inbox multiatendente | Atendido | Nenhum | Funcionalidade, performance e RBAC foram validados | Fase I, 78N.6, 78O.1-78O.3 | `PRODUCT_MAP_CURRENT.md`, `INBOX_QUERY_PATH_AUDIT.md`, `LOAD_TEST_RESULTS.md` | `/app/inbox` | Timeline, atribuicao, filtros, p95 inbox-read vu20 585ms, 0% erro | Listar, abrir detalhe, responder e demonstrar timeline |
| Departamentos/filas | Atendido | Baixo | Produto atende; exige parametrizar setores do orgao | Fase I, 78N.6 | `PRODUCT_MAP_CURRENT.md`, `LOAD_TEST_FIXTURES.md` | `/app/departments`, `/app/inbox` | `Department`, `Queue`, 403 correto fora do departamento | Demonstrar usuario restrito ao departamento |
| Historico e CRM/timeline | Atendido | Baixo | Produto atende; nomenclatura CRM pode exigir ajuste em proposta B2G | Fase I | `bid-package/10-crm-timeline.md`, `PRODUCT_MAP_CURRENT.md` | `/app/crm`, `/app/inbox` | `Conversation`, `InboundMessage`, `OutboundMessage`, `Lead`, timeline | Abrir historico completo do cidadao |
| Chatbot e automacao | Atendido | Baixo | Fluxos existem; risco e criar modelos de fluxo por servico publico | Fase I | `PRODUCT_MAP_CURRENT.md`, `automation-ai-tenant-playbook.md` | `/app/chatbot` | `ChatbotFlow`, handoff humano, tenant locks | Simular triagem e transferencia para atendente |
| IA supervisionada | Atendido com ressalva | Medio | IA existe, mas multiagentes formais e KB runtime integral ainda nao estao comprovados | Fase I/II | `bid-package/07-ia.md`, `PRODUCT_MAP_CURRENT.md` | Runtime/admin IA | Configuracao por tenant, evaluation replay | Demonstrar resposta assistida com supervisao humana |
| Knowledge Base | Atendido com ressalva | Medio | CRUD/schema existem; consumo runtime por IA/chatbot ainda e limitado/desenhado | 69D+ | `KNOWLEDGE_BASE_AUDIT.md`, `KNOWLEDGE_BASE_MVP_DESIGN.md`, `KNOWLEDGE_BASE_RUNTIME_INTEGRATION_DESIGN.md` | `/app/knowledge-base` | Colecoes/artigos tenant-scoped | Mostrar gestao de artigos institucionais |
| Public API read-only | Atendido | Baixo | API read-only esta documentada; risco residual e escopo se edital exigir escrita | 70A-70F | `PUBLIC_API_AUDIT.md`, `PUBLIC_API_DESIGN.md`, `public-api/openapi.yaml` | `/public-api/v1/*` | API keys, OpenAPI, contatos/conversas/mensagens | Chamada autenticada em PoC com API key |
| Webhooks | Atendido com ressalva | Medio | Cadastro, HMAC e dispatch manual existem; eventos automaticos ainda nao | 70G-70K | `PUBLIC_API_WEBHOOKS_DESIGN.md`, `PUBLIC_API_WEBHOOKS_CONTROLLED_DISPATCH_DESIGN.md` | `/app/webhooks`, CLI dispatch | Endpoint, secret criptografado, delivery/attempt, HMAC | Dispatch manual para endpoint piloto |
| Scheduling | Atendido com ressalva | Medio | CRUD e envio controlado existem; scheduler automatico/cron pleno ainda nao | 71A-71H | `SCHEDULING_DESIGN.md`, `SCHEDULING_REMINDERS_CONFIRMATION_DESIGN.md`, `SCHEDULING_REMINDER_CONTROLLED_SEND_DESIGN.md` | `/app/scheduling`, CLI reminders | Appointment, Reminder, shadow e envio controlado | Criar agendamento e demonstrar lembrete controlado |
| NPS/satisfacao | Atendido com ressalva | Medio | Schema/CRUD existem; disparo publico, link e relatorio NPS/CSAT ainda nao | 72A-72C | `NPS_SATISFACTION_AUDIT.md`, `NPS_SATISFACTION_DESIGN.md` | `/app/satisfaction` | Perguntas, pesquisas e respostas estruturais | Mostrar configuracao de pesquisa |
| Webchat | Atendido | Baixo | MVP E2E demonstravel; risco residual e UX/roteamento avancado se edital exigir | 73C-73J | `WEBCHAT_AUDIT.md`, `WEBCHAT_DESIGN.md`, `WEBCHAT_RUNTIME_DESIGN.md` | `/app/webchat`, `/webchat/widget.js`, `/webchat/v1/*` | Sessao, inbound, outbound humano, polling, widget minimo | Enviar pelo widget, responder no Inbox e consultar resposta |
| Telegram | Atendido com ressalva | Medio | Canal texto humano funciona; midia, grupos e automacao estao fora do MVP | 74A-74F | `TELEGRAM_AUDIT.md`, `TELEGRAM_DESIGN.md` | `/app/telegram`, webhook Telegram, `/app/inbox` | Token criptografado, inbound/outbound texto, Bot API sendMessage | Mensagem texto inbound/outbound em bot piloto |
| Audio transcription | Atendido com ressalva | Medio | Runtime controlado existe, mas piloto real de audio ainda nao foi validado | 75E-75J | `AUDIO_TRANSCRIPTION_DESIGN.md`, `AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`, `AUDIO_TRANSCRIPTION_REAL_MEDIA_PILOT_DESIGN.md` | `/app/audio-transcriptions`, CLI process | AudioTranscription/Job, shadow, STT controlado, cleanup temporario | Demonstrar fluxo controlado ou declarar piloto pendente |
| Advanced Search | Atendido | Baixo | Busca textual operacional e load test estavel; sem semantica/IA | 76A-76E | `ADVANCED_SEARCH_DESIGN.md`, `LOAD_TEST_RESULTS.md` | `/app/search`, CLI index | `SearchIndex`, runtime textual, indexacao de audio completed | Buscar termo por fonte/canal |
| MFA/TOTP | Atendido com ressalva | Medio | Enforcement ADMIN existe; recovery login, SUPERVISOR/AGENT e OTP cidadao nao | 77A-77I | `MFA_OTP_DESIGN.md`, `B2G_READINESS_AUDIT.md` | `/app/settings/security`, `/auth/mfa/verify` | `MfaChallenge`, TOTP antes de JWT para ADMIN, recovery hash-only | Demonstrar login ADMIN com challenge em tenant piloto |
| Logging/redaction | Atendido | Baixo | Padrao interno existe; risco residual e gerar anexos/prints para diligencia | 78B | `LOGGING_AUDIT_STANDARD.md` | Logs backend | Envelope padronizado, request/correlation/tenant, redaction | Apresentar log redigido sem PII |
| Metrics/dashboard/alerts | Atendido | Baixo | Stack interna existe; notificacoes externas ainda nao sao requisito core | 78C-78H | `METRICS_FOUNDATION.md`, `RUNTIME_METRICS_FOUNDATION.md`, `OPERATIONAL_DASHBOARD.md`, `ALERT_RUNTIME_FOUNDATION.md` | `/admin/ops`, `/admin/ops/metrics`, `/admin/ops/alerts` | Counters, timings, p95, AlertManager, ACK/resolve | Abrir painel operacional e alertas |
| Backup/restore | Atendido com ressalva | Medio | Restore e backup verificavel existem; offsite/cron recorrente precisam evidencia contratual | 78J-78L | `BACKUP_RESTORE_HARDENING_DESIGN.md`, `BACKUP_RESTORE_VALIDATION.md` | Scripts backup/restore | Restore isolado validado, checksum/manifest | Apresentar runbook e evidencia de restore |
| Load test/performance | Atendido | Nenhum | Laboratorio v1 e gargalo Inbox foram medidos e corrigidos | 78M-78O.3 | `LOAD_TEST_DESIGN.md`, `LOAD_TEST_RESULTS.md`, `INBOX_QUERY_PATH_AUDIT.md` | k6, `/admin/ops/metrics` | inbox-read vu20 p95 585ms, 0% erro | Apresentar relatorio e criterios de parada |
| Multi-tenant | Atendido | Baixo | Isolamento existe; risco e configurar corretamente tenant do orgao | Fase I-III | `GOVERNANCE_CONFIG.md`, `FEATURE_FLAGS_MATRIX.md`, `bid-package/05-multi-tenant.md` | Admin tenant, app routes | `clientId`, flags, RBAC, tenant-scoped routes | Demonstrar tenants isolados |
| LGPD/retencao | Atendido | Baixo | Politicas e redaction existem; prazos devem ser ajustados por contrato | Fase I-III | `bid-package/04-lgpd.md`, `LOGGING_AUDIT_STANDARD.md` | `/app/settings/privacy`, retention jobs | `RetentionConfig`, anonimizacao, logs redigidos | Apresentar politica e tela de privacidade |
| Relatorios/SLA | Atendido | Baixo | Reports/SLA existem; pode exigir relatorio editalicio customizado | Fase I | `bid-package/08-sla.md`, `bid-package/09-relatorios.md` | `/app/reports`, dashboard | `ConversationMetrics`, `SLAConfig`, exports | Gerar relatorio por periodo/canal |
| Escala/HA | Atendido com ressalva | Medio | Baseline/swap/design existem; HA runtime, replica e failover nao | 78I, 78O | `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `OPERATIONAL_BASELINE.md` | N/A operacional | VPS 2vCPU/1.9GiB/2GiB swap, PM2 online, design HA | Apresentar baseline e proposta de infra por porte |
| Storage 600GB/midia | Pendente | Alto | Nao ha storage contratado/evidenciado de 600GB no estado atual | Fase IV | `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `B2G_READINESS_AUDIT.md` | N/A | Plano/custo pendente | Nao prometer sem proposta de infraestrutura |
| App mobile nativo | Atendido com ressalva | Medio | Web/PWA responsivo existe; app nativo loja nao esta comprovado | Historico PWA | `PRODUCT_MAP_CURRENT.md`, `B2G_READINESS_AUDIT.md` | Web/PWA | Experiencia mobile web | Demonstrar responsivo/PWA se edital aceitar |
| Treinamento/EAD | Atendido com ressalva | Medio | Treinamento pode ser prestado; LMS/EAD proprio nao existe | Fase IV | `DEMO_SCRIPT.md`, `go-live-checklist.md` | N/A | Roteiro demo/onboarding | Apresentar plano presencial/remoto; nao declarar LMS |
| Habilitacao juridica/fiscal | Pendente | Alto | Fora do repositorio; sem certidoes/balanco nao ha prova de habilitacao | Fase IV | `BID_READINESS_GAP_ANALYSIS.md` | N/A | Certidoes, contrato social, balanco pendentes | Anexar pacote juridico/fiscal por certame |
| Atestado tecnico | Pendente | Alto | Sem atestado compativel nao ha prova de capacidade tecnica | Fase IV | `BID_READINESS_GAP_ANALYSIS.md` | N/A | Atestados assinados pendentes | Anexar atestados compativeis |

## Casos De Teste Por Edital

Percentual calculado como aderencia auditada ponderada, considerando produto, evidencia, risco de PoC, risco documental/comercial/juridico e requisitos especificos conhecidos das fontes oficiais.

| Edital referencia | Aderencia auditada | Risco consolidado | Decisao executiva |
| --- | ---: | --- | --- |
| Conselheiro Lafaiete/MG | 90% | Medio | Participar com ressalvas |
| Cabreuva/SP | 92% | Baixo | Participar com ressalvas |
| Quatro Barras/PR | 91% | Baixo | Participar com ressalvas |
| Aripuana/MT | 84% | Alto | Participar somente apos ajustes |
| RIOPRETOPREV / Sao Jose do Rio Preto/SP | 86% | Medio | Participar com ressalvas |

### Conselheiro Lafaiete/MG

Decisao: **Participar com ressalvas**.

- Por que participar: core WhatsApp oficial, Inbox, chatbot, IA supervisionada, relatorios, SLA, departamentos e historico estao fortes.
- O que falta: dossie juridico/fiscal, atestado tecnico, plano de treinamento, NPS operacional completo, agendamento automatico pleno, transcricao/audio piloto e busca demonstravel se esses itens forem cobrados literalmente.
- Impeditivo: nao por produto central; pode virar impeditivo por atestado/certidoes ou se o edital exigir transcricao/agendamento automatico como item eliminatorio imediato.
- Pendencia tecnica: NPS automatico, transcricao real e agendamento automatico pleno.
- Pendencia documental: plano de treinamento, dossie Meta/API oficial, matriz edital-item.
- Pendencia comercial: SLA e suporte formal.
- Pendencia juridica: certidoes, balanco e atestado.
- Pendencia operacional: evidencias de backup/restore e PoC empacotada.
- Risco de inabilitacao: Medio, por atestado/certidoes.
- Risco de reprova na PoC: Medio-baixo, se roteiro limitar o que esta operacional.
- Risco juridico: Medio, por documentos externos ao produto.
- Risco comercial: Medio, por suporte/treinamento/preco.

### Cabreuva/SP

Decisao: **Participar com ressalvas**.

- Por que participar: perfil WhatsApp-first, setores, dashboard, SLA, relatorios, Public API, Search, Webchat e Telegram texto encaixam bem.
- O que falta: manuais, proposta tecnica modelo, plano de PoC e atestados/certidoes.
- Impeditivo: nao identificado no produto, salvo requisito especifico de NPS completo, XLSX nativo ou auditoria cliente formal.
- Pendencia tecnica: baixa; NPS/export/auditoria podem exigir refinamento.
- Pendencia documental: alta prioridade para manual operador/admin e matriz edital-item.
- Pendencia comercial: proposta tecnica e SLA comercial.
- Pendencia juridica: documentos de habilitacao.
- Pendencia operacional: evidencias operacionais anexaveis.
- Risco de inabilitacao: Medio, por documentos externos.
- Risco de reprova na PoC: Baixo.
- Risco juridico: Medio-baixo.
- Risco comercial: Medio-baixo.

### Quatro Barras/PR

Decisao: **Participar com ressalvas**.

- Por que participar: atendimento humano, WhatsApp, filas, historico, relatorios, SLA, POC, Public API, Webchat e Telegram texto sao demonstraveis.
- O que falta: materiais de PoC, plano de treinamento e documentos de habilitacao.
- Impeditivo: nao identificado no core; risco sobe se NPS completo, transcricao ou busca avancada forem eliminatorios.
- Pendencia tecnica: baixa/media, condicionada a NPS/transcricao.
- Pendencia documental: manual operador/admin e roteiro PoC.
- Pendencia comercial: proposta e SLA.
- Pendencia juridica: certidoes/atestados.
- Pendencia operacional: anexos de backup/restore e performance.
- Risco de inabilitacao: Medio.
- Risco de reprova na PoC: Baixo.
- Risco juridico: Medio-baixo.
- Risco comercial: Medio-baixo.

### Aripuana/MT

Decisao: **Participar somente apos ajustes**.

- Por que participar: produto cobre WhatsApp oficial, web SaaS, multiatendimento, Instagram, Webchat, Telegram texto, relatorios, dashboard, campanhas/templates e Public API.
- O que falta: prova/plano de 400 usuarios, 30 canais WhatsApp, 5 Instagram, storage 600GB, mobile nativo se exigido, EAD, implantacao presencial e atestados equivalentes.
- Impeditivo: sim, se 600GB, app nativo, 400 usuarios e quantitativos forem exigidos como capacidade ja comprovada.
- Pendencia tecnica: app nativo, escala quantitativa e storage contratado.
- Pendencia documental: proposta de infraestrutura, plano de implantacao, treinamento presencial/EAD.
- Pendencia comercial: precificacao de storage, templates, canais e suporte.
- Pendencia juridica: certidoes, indices contabeis, atestados.
- Pendencia operacional: backup offsite/HA e prova de carga maior.
- Risco de inabilitacao: Alto, por atestados/indices/quantitativos.
- Risco de reprova na PoC: Medio, se PoC exigir escala ou app nativo.
- Risco juridico: Alto.
- Risco comercial: Alto, por custo e garantias.

### RIOPRETOPREV / Sao Jose do Rio Preto/SP

Decisao: **Participar com ressalvas**.

- Por que participar: multicanal MVP, Public API, Webhooks controlados, Search, MFA ADMIN, observabilidade, dashboard e governanca estao maduros.
- O que falta: NPS operacional completo, multiagentes IA formais, API escrita/webhooks automaticos se exigidos, transcricao real, OTP cidadao, HA/failover e materiais comerciais/juridicos.
- Impeditivo: nao para PoC multicanal basica; pode ser impeditivo se o edital exigir HA, OTP cidadao, automacao integral ou transcricao em escala como requisito eliminatorio.
- Pendencia tecnica: NPS runtime, OTP cidadao, automacao de webhooks/API escrita, transcricao real e HA.
- Pendencia documental: matriz edital-item e dossie tecnico de arquitetura/seguranca.
- Pendencia comercial: SLA, suporte, treinamento e proposta de infraestrutura.
- Pendencia juridica: atestados/certidoes.
- Pendencia operacional: HA/offsite/restore recorrente.
- Risco de inabilitacao: Medio.
- Risco de reprova na PoC: Medio.
- Risco juridico: Medio.
- Risco comercial: Medio.

## Pendencias Por Categoria

| Categoria | Pendencias principais | Risco |
| --- | --- | --- |
| Engenharia | NPS automatico, transcricao real em piloto, OTP cidadao, app nativo, HA/failover, webhooks automaticos/API escrita, Scheduler automatico pleno | Medio/Alto conforme edital |
| Documentacao | Manual admin, manual operador, guia implantacao B2G, roteiro PoC, matriz edital-item, anexos backup/performance/Meta | Alto para disputa imediata |
| Comercial | Proposta tecnica modelo, SLA comercial, treinamento, precificacao storage/HA/canais/templates, deck atualizado | Alto |
| Juridica | Certidoes, contrato social, balanco/indices, declaracoes, atestados tecnicos | Alto |
| Operacional | Backup offsite, cron/restore drill recorrente, HA, readiness/liveness, historico persistente de metricas, notificacoes externas | Medio |

## Executive Readiness Score

| Area | Peso | Nota | Justificativa |
| --- | ---: | ---: | --- |
| Produto | 25 | 22 | Core multicanal, Inbox, Search, Public API, Webchat, Telegram e MFA ADMIN estao fortes; NPS, audio real, OTP cidadao e HA ainda limitam editais avancados |
| Seguranca | 15 | 14 | RBAC, multi-tenant, redaction, segredos e MFA ADMIN existem; recovery login e OTP cidadao ainda nao |
| Performance | 10 | 10 | Load Lab v1 e inbox-read vu20 p95 585ms com 0% erro sustentam a evidencia |
| Observabilidade | 10 | 9 | Logs, metricas, dashboard e AlertManager existem; historico/alertas externos ainda nao |
| Operacao | 10 | 8 | Baseline, swap, backup/restore e release checklist existem; offsite/HA/drill recorrente ainda pendentes |
| Documentacao | 10 | 7 | Master Pack 79A existe; faltam manuais, guia B2G e roteiro PoC formal |
| Comercial | 10 | 6 | Bid-package existe; faltam proposta modelo, SLA comercial, treinamento e precificacao de infra |
| Juridico | 10 | 5 | Itens juridicos e atestados estao fora do repositorio e nao foram comprovados |
| **Total** | **100** | **81** | **Disputar seletivamente** |

Interpretacao:

- 95-100: pronto para disputar praticamente qualquer edital do perfil analisado.
- 90-94: pronto para disputar com poucas ressalvas.
- 80-89: disputar seletivamente.
- <80: priorizar fechamento das lacunas.

## Conclusao Do Gate Review

Se qualquer um dos cinco editais fosse republicado amanha, a RE7Online deveria participar seletivamente:

- **Cabreuva/SP** e **Quatro Barras/PR** sao os melhores alvos imediatos, com decisao de participar com ressalvas predominantemente documentais/comerciais/juridicas.
- **Conselheiro Lafaiete/MG** e competitivo, mas precisa tratar com cuidado agendamento automatico, NPS, transcricao/busca e habilitacao documental.
- **RIOPRETOPREV/Sao Jose do Rio Preto/SP** e defensavel como edital avancado, mas ainda exige ressalvas tecnicas e operacionais.
- **Aripuana/MT** exige ajustes antes da participacao, principalmente por escala, storage, mobile, quantitativos, EAD e habilitacao.

A conclusao de auditoria e que as pendencias restantes deixaram de ser majoritariamente de engenharia do core do produto. O risco principal da Versao Licitavel 1.0 esta em comprovacao documental, comercial, juridica e infraestrutura contratual para editais maiores.
