# B2G Readiness Audit

Status: auditoria de aderencia para editais publicos baseada no codigo atual. Este documento nao altera runtime.

Data: 2026-06-17. Atualizacao de aderencia: 2026-06-23, apos Telegram MVP operacional.

## Escopo

Esta auditoria avalia o Converta para licitacoes publicas de atendimento digital, WhatsApp, IA e SaaS, usando como grupo-alvo:

- Pinheiros/ES
- Cabreuva/SP
- Aripuana/MT
- Conselheiro Lafaiete/MG
- Quatro Barras/PR
- Sao Jose do Rio Preto/SP como edital-guia avancado

Como os TRs completos nao estao versionados no repositorio, a classificacao abaixo usa os requisitos recorrentes informados para o Grupo A e o estado real do codigo.

Classificacao:

- ATENDE: funcionalidade operacional no produto atual.
- ATENDE PARCIALMENTE: existe base funcional, mas faltam amplitude, formalizacao, configuracao ou modulo exigivel em edital.
- NAO ATENDE: nao ha implementacao operacional encontrada no codigo atual.

Pontuacao usada na leitura percentual consolidada:

- ATENDE = 100
- ATENDE PARCIALMENTE = percentual graduado conforme maturidade real, evidencias e risco de demonstracao
- NAO ATENDE = 0

## Resumo Executivo

O Converta esta forte para editais cujo nucleo seja WhatsApp Oficial, atendimento humano multiatendente, filas/setores, chatbot configuravel, IA supervisionada, relatorios, SLA, dashboard operacional, LGPD/retencao, Public API read-only, Webchat MVP, Telegram texto humano e POC controlada.

O produto ainda nao atende de forma plena editais que exijam canais adicionais avancados fora da Meta ou recursos tipicos de plataforma municipal mais ampla, como Telegram com midia/grupos/automacao, Webchat avancado com roteamento/identificacao/realtime, NPS com disparo automatico/relatorios consolidados, agendamento integrado ao chatbot, OTP, transcricao de audio em escala, busca avancada operacional e API publica com escrita/webhooks automaticos.

O projeto ja possui uma base importante para B2G:

- `Client.profile` com perfis `business` e `government`;
- feature flags por tenant em `Client.features`;
- defaults B2G com dashboard, departamentos, usuarios, SLA, relatorios e chatbot ativos;
- console interno para criar/editar tenant como "Governo / edital";
- POC controlada `demo-prefeitura`;
- relatorios, dashboard, SLA, departamentos, auditoria de eventos e retencao LGPD;
- Knowledge Base, Public API, Scheduling, Satisfaction/NPS e Webchat ja possuem fundacao formal em producao, com rollout controlado por feature.

Leitura final:

| Dimensao | Aderencia |
| --- | ---: |
| Grupo A medio, WhatsApp-first | 89% |
| Grupo A com multicanal Meta, Webchat, Telegram e POC | 85% |
| Sao Jose do Rio Preto como edital-guia avancado | 82% |
| Aderencia consolidada ponderada | 86% |

## Perfis B2B x B2G

### Onde o perfil e definido

O perfil do tenant fica em `Client.profile`, normalizado como:

- `business`
- `government`

Evidencias:

- Backend: `apps/whatsapp-agent/src/features/clientFeatures.ts`
- Frontend: `src/lib/appFeatures.ts`
- Schema: `apps/whatsapp-agent/prisma/schema.prisma`, model `Client.profile`
- Console interno: `src/app/admin/tenants/page.tsx` e `src/app/admin/tenants/[tenantId]/page.tsx`

### Como o app muda por profile

O profile hoje muda principalmente:

- defaults de feature;
- labels do dashboard;
- experiencia inicial no `/app`.

No dashboard, por exemplo, `government` troca termos comerciais por linguagem institucional:

- `Clientes` -> `Cidadaos`
- `Relatorios` -> `Indicadores`
- `Fila operacional` -> `Demandas`

Evidencia: `src/app/app/dashboard/page.tsx`.

### Console interno

O console interno permite:

- criar tenant como `Empresa privada` ou `Governo / edital`;
- editar o profile do tenant depois;
- controlar features do tenant;
- configurar canais, flags tecnicas, onboarding e auditoria de canais.

Evidencias:

- `src/app/admin/tenants/page.tsx`
- `src/app/admin/tenants/[tenantId]/page.tsx`
- `src/app/admin/tenants/[tenantId]/channels/page.tsx`
- `docs/saas/admin-ui.md`

### Observacao importante

O proprio texto do console informa que o profile "define apenas a experiencia visual inicial do /app". Portanto, para licitacoes, o profile B2G e uma base real, mas ainda nao equivale a um pacote B2G completo com todos os modulos publicos exigiveis.

## Feature Flags Existentes

### Flags backend ativas

Fonte: `apps/whatsapp-agent/src/features/clientFeatures.ts`.

| Flag | Modulo | Business default | Government default | Utilidade B2G |
| --- | --- | ---: | ---: | --- |
| `dashboard` | Dashboard | off | on | Alta |
| `departments` | Setores/filas | on | on | Alta |
| `users` | Usuarios/RBAC | on | on | Alta |
| `templates` | Templates Meta | on | off | Media; depende do edital |
| `sla` | SLA | on | on | Alta |
| `reports` | Relatorios | on | on | Alta |
| `campaigns` | Campanhas | on | off | Media/baixa para B2G |
| `chatbot` | Chatbot | on | on | Alta |
| `knowledgeBase` | Base de conhecimento | off | off | Alta, rollout controlado |
| `scheduling` | Agendamento | off | off | Alta, rollout controlado |
| `schedulingReminders` | Lembretes de agendamento | off | off | Media/alta, sem envio automatico pleno |
| `schedulingRemindersSend` | Envio controlado de lembretes | off | off | Media/alta, piloto manual sem cron |
| `schedulingConfirmation` | Confirmacao de agendamento | off | off | Media, reservado |
| `satisfaction` | NPS/Satisfacao | off | off | Alta, rollout controlado |
| `audioTranscription` | Transcricao de audio | off | off | Media/alta, rollout controlado |
| `audioTranscriptionRuntime` | Runtime de transcricao | off | off | Alta sensibilidade; manter desligado por padrao |
| `advancedSearch` | Busca avancada | off | off | Media/alta, rollout controlado |
| `advancedSearchRuntime` | Runtime de busca | off | off | Alta sensibilidade; manter desligado por padrao |
| `webchat` | Webchat | off | off | Alta quando edital exigir canal web |
| `webchatOutbound` | Resposta humana Webchat | off | off | Alta quando Webchat estiver habilitado |
| `telegram` | Telegram | off | off | Alta quando edital exigir canal adicional |
| `telegramInbound` | Inbound Telegram | off | off | Alta para atendimento Telegram texto |
| `telegramOutbound` | Resposta humana Telegram | off | off | Alta para atendimento Telegram texto |
| `webhooks` | Webhooks Public API | off | off | Media/alta para integracoes externas |
| `webhookDispatch` | Dispatch manual Webhooks | off | off | Media/alta, piloto controlado |
| `webhookDispatchExecute` | Execucao real Webhooks | off | off | Alta sensibilidade; manter desligado por padrao |

### Flags frontend futuras/reservadas

Fonte: `src/lib/appFeatures.ts`.

| Flag | Status | Observacao |
| --- | --- | --- |
| `governmentReports` | futuro/reservado | Nao ha backend enforcement operacional. |
| `poc` | futuro/reservado | Existe POC por scripts, mas nao como modulo feature-gated. |
| `salesPipeline` | futuro/reservado | Mais B2B que B2G. |
| `instagramIntegration` | futuro/reservado | Instagram ja existe operacionalmente por canal/config, mas a flag frontend e reservada. |

### Gaps de feature flag para editais

Ainda nao existem flags oficiais para:

- inbox;
- CRM;
- auditoria;
- LGPD/retencao;
- multiagentes IA;
- OTP;
- transcricao de audio;
- busca avancada operacional.

Parte desses modulos existe sem flag dedicada; outros nao existem.

## Matriz Consolidada Por Requisito

| Requisito | Status | Aderencia | Evidencia atual | Gap real | Risco | Esforco | Sprint sugerida |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| WhatsApp Oficial | ATENDE | 100% | `WaPhoneNumber`, `TenantMetaConfig`, webhook/runtime WhatsApp, Meta Cloud API | Configurar numero oficial por tenant | Baixo | Baixo | Go-live por tenant |
| Inbox multiatendente | ATENDE | 100% | `/app/inbox`, `ConversationRuntimeState`, usuarios, atribuicoes | Refinar provas de carga/UX para edital | Baixo | Baixo | Sprint 69 |
| Handoff humano | ATENDE | 100% | handoff, status operacional, eventos de atendimento | Documentar fluxo B2G | Baixo | Baixo | Sprint 69 |
| Filas/setores | ATENDE | 100% | `Department`, `Queue`, filtros e atribuicao | Parametrizar setores por edital | Baixo | Baixo | Configuracao |
| Usuarios/permissoes | ATENDE PARCIALMENTE | 50% | `User`, roles ADMIN/SUPERVISOR/AGENT, sessoes | Permissoes granulares/relatorio por perfil podem ser exigidos | Medio | Medio | Sprint 70 |
| Historico integral | ATENDE | 100% | `Conversation`, `Message`, `InboundMessage`, `OutboundMessage`, timeline | Politica de retencao deve ser parametrizada por contrato | Baixo | Baixo | Configuracao |
| CRM/timeline | ATENDE | 100% | `Lead`, `LeadNote`, timeline no inbox | Ajustar nomenclatura B2G se edital evitar "CRM" | Baixo | Baixo | Sprint 69 |
| Chatbot | ATENDE | 100% | `ChatbotFlow`, `/app/chatbot`, flags `chatbot` | Templates de fluxo por servico publico | Medio | Medio | Sprint 70 |
| IA | ATENDE PARCIALMENTE | 50% | IA supervisionada, `aiAssistantConfig`, `aiIntentQualification` DB-first | Falta pacote formal de base de conhecimento/multiagentes | Medio | Medio/alto | Sprint 71 |
| Base de conhecimento | ATENDE PARCIALMENTE | 55% | `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, feature `knowledgeBase`, CRUD `/app/knowledge-base` tenant-scoped; Sprint 69D desenha consumo runtime | Falta lookup/shadow no runtime, consumo por IA/chatbot, busca semantica e importacao documental | Medio/alto | Medio | Sprint 69E/69F |
| Campanhas/templates | ATENDE PARCIALMENTE | 50% | `Campaign`, `Template`, Meta templates | Government default desliga campaigns/templates; edital pode exigir comunicados oficiais | Medio | Baixo/medio | Sprint 69/70 |
| Relatorios | ATENDE | 100% | `/app/reports`, export, `ConversationMetrics` | Criar relatorio licitatorio fechado por periodo/orgaos/canais se exigido | Baixo | Medio | Sprint 69 |
| Dashboard | ATENDE PARCIALMENTE | 50% | `/app/dashboard`, KPIs operacionais, profile government | Dashboard e beta e operacional, nao BI completo | Medio | Medio | Sprint 70 |
| SLA | ATENDE | 100% | `SLAConfig`, `ConversationMetrics`, reports/dashboard | Configurar metas por edital | Baixo | Baixo | Configuracao |
| Exportacao Excel/CSV | ATENDE PARCIALMENTE | 50% | Exportacao CSV/text em relatorios | Excel/XLSX nativo nao evidenciado | Medio | Baixo | Sprint 69 |
| LGPD/retencao | ATENDE | 100% | `RetentionConfig`, privacy settings, delete/anonymize | Documentar politica por contrato publico | Baixo | Baixo | Sprint 69 |
| Auditoria/logs | ATENDE PARCIALMENTE | 50% | `Event`, logs estruturados, eventos de feature denied/conversa | Falta tela/relatorio de auditoria formal para cliente | Medio | Medio | Sprint 70 |
| API para integracao externa | ATENDE PARCIALMENTE | 85% | `/public-api/v1` com API keys tenant-scoped, scopes, rate limit, auditoria, health autenticado, OpenAPI, contatos, conversas e mensagens read-only; webhooks com cadastro, segredo criptografado, rotacao, shadow e dispatch controlado | Falta acoplar webhooks automaticamente a eventos reais, escrita controlada e envio por API | Alto | Medio/alto | Sprint 70L+ |
| Agendamento | ATENDE PARCIALMENTE | 68% | `SchedulingService`, `SchedulingResource`, `SchedulingAvailability`, `Appointment`, `AppointmentReminder`, feature `scheduling`, CRUD `/app/scheduling`, flags `schedulingReminders`/`schedulingRemindersShadow`/`schedulingRemindersSend`/`schedulingConfirmation`, CRUD manual de lembretes, elegibilidade shadow tenant-scoped e envio controlado WhatsApp por CLI | Ainda nao ha scheduler automatico, consumo por chatbot/IA, Google Calendar, API publica ou regras avancadas de conflito de agenda | Alto | Medio/alto | Sprint 71I/71J |
| NPS/pesquisa satisfacao | ATENDE PARCIALMENTE | 55% | `SatisfactionQuestion`, `SatisfactionSurvey`, `SatisfactionResponse`, feature `satisfaction`, CRUD `/app/satisfaction` tenant-scoped | Ainda nao ha disparo automatico pos-atendimento, link publico, chatbot/IA, relatorio NPS/CSAT ou dashboard | Alto | Medio | Sprint 72D/72E |
| Webchat | ATENDE PARCIALMENTE | 85% | Schema/settings MVP, feature `webchat`, CRUD `/app/webchat`, dominios permitidos, bootstrap de sessao publica, inbound texto persistido no Inbox, outbound humano controlado persistido, polling publico seguro e widget JS minimo embutivel | Refinar widget, roteamento, identificacao, acessibilidade avancada e empacotamento de implantacao por edital | Alto | Medio/alto | Sprint 73K+ |
| Telegram | ATENDE PARCIALMENTE | 70% | Audit/design prontos; schema/settings, token criptografado, `/app/telegram`, webhook shadow, inbound texto no Inbox/timeline e outbound humano texto-only via Bot API | Registrar/testar webhook operacional, validar smoke com Bot real e adicionar midia/grupos somente se exigido | Alto | Medio/alto | Sprint 74G+ |
| Multiagentes IA | ATENDE PARCIALMENTE | 50% | AI profile/config por tenant; POC tem agentes humanos por area | Nao ha 3 agentes IA independentes/especializados com roteamento formal | Alto | Medio/alto | Sprint 71 |
| POC/demo | ATENDE | 100% | `docs/DEMO_SCRIPT.md`, `seed-demo.mjs`, `demo-prefeitura` | Atualizar POC para requisitos Grupo A e labels municipais | Baixo | Baixo | Sprint 69 |

Pontuacao simples atualizada: 82%.

## Aderencia Por Edital

Sem os TRs completos versionados, a estimativa abaixo considera padroes recorrentes do Grupo A e o edital-guia avancado como mais exigente.

| Edital | Perfil provavel | Aderencia atual | Leitura |
| --- | --- | ---: | --- |
| Pinheiros/ES | WhatsApp-first, atendimento municipal, relatorios | 88% | Bom encaixe; Webchat MVP e API read-only fortalecem POC se exigidos. |
| Cabreuva/SP | WhatsApp, setores, dashboard/SLA | 89% | Forte em operacao; API publica, Webchat MVP e Telegram texto ja sao demonstraveis. |
| Aripuana/MT | Atendimento digital municipal com POC | 79% | POC demo ajuda; escala, storage, mobile nativo e HA continuam sensiveis. |
| Conselheiro Lafaiete/MG | Atendimento multissetorial e governanca | 84% | Precisa reforcar NPS funcional, transcricao/busca e documentos. |
| Quatro Barras/PR | Atendimento e relatorios | 88% | Aderente para WhatsApp/SLA/filas; Webchat e Telegram reduzem risco multicanal. |
| Sao Jose do Rio Preto/SP | Edital-guia avancado, multicanal e recursos amplos | 82% | Webchat, API, Telegram texto humano e modulos estruturais melhoraram; OTP, NPS automatico e busca/transcricao ainda reduzem aderencia. |

## Documentacao Existente Reaproveitavel

| Documento | Uso em licitacao |
| --- | --- |
| `docs/saas/PRODUCT_MAP_CURRENT.md` | Base de apresentacao do produto atual. |
| `docs/saas/FEATURE_FLAGS_MATRIX.md` | Demonstrar controle por perfil/feature. |
| `docs/saas/GOVERNANCE_CONFIG.md` | Evidenciar governanca de configuracao multi-tenant. |
| `docs/saas/CHANNELS_GOVERNANCE.md` | Evidenciar WhatsApp/Messenger/Instagram e seguranca de tokens. |
| `docs/saas/RELEASE_CHECKLIST.md` | Evidenciar processo de release. |
| `docs/saas/CHANGE_POLICY.md` | Evidenciar governanca de mudancas. |
| `docs/saas/FEATURE_LIFECYCLE.md` | Evidenciar maturidade por modulo. |
| `docs/DEMO_SCRIPT.md` | Base para POC controlada em banca. |
| `docs/meta/01-app-review-package.md` | Evidencia de governanca Meta, se edital exigir canais Meta. |
| `docs/meta/02-instagram-readiness.md` | Evidencia Instagram, se edital exigir omnichannel social. |

## Documentacao Obsoleta Ou Nao Usar Como Fonte Primaria

Conforme `DOCUMENTATION_INDEX.md`, estes documentos sao historicos ou parcialmente atuais:

- `docs/whatsapp-agent/03-backlog-mvp.md`
- `docs/whatsapp-agent/04-phase-2-echo.md`
- `docs/whatsapp-agent/08-multichannel-persistence-schema-proposal.md`
- `docs/whatsapp-agent/09-multichannel-db-migration-review.md`
- runbooks antigos de staging/shadow devem ser consultados apenas como historico.

## Documentacao Faltante Para B2G

| Documento faltante | Prioridade | Motivo |
| --- | --- | --- |
| `docs/saas/B2G_PROPOSAL_PACKAGE.md` | Alta | Pacote de resposta para edital com modulos, limites e excecoes. |
| `docs/saas/B2G_POC_RUNBOOK.md` | Alta | Roteiro especifico para banca municipal, derivado do `DEMO_SCRIPT.md`. |
| `docs/saas/B2G_REQUIREMENTS_TRACEABILITY.md` | Alta | Matriz TR item a item por edital. |
| `docs/saas/API_PUBLIC_CONTRACT.md` | Media/alta | Se o edital exigir integracao externa formal. |
| `docs/saas/AUDIT_LOGS_GOVERNANCE.md` | Media | Formalizar trilha de auditoria, eventos, retencao e acesso. |
| `docs/saas/NPS_MODULE_SPEC.md` | Media | Especificacao antes de implementar pesquisa de satisfacao. |
| `docs/saas/WEBCHAT_TELEGRAM_GAP_ANALYSIS.md` | Media | Decidir se deve desenvolver ou declarar nao incluso. |

## Gaps Priorizados

| Gap | Impacto em edital | Risco | Esforco | Prioridade |
| --- | --- | --- | --- | --- |
| Pacote documental B2G e POC municipal | Alto | Baixo | Baixo | P0 |
| Relatorio licitatorio consolidado + PDF/CSV/XLSX | Alto | Medio | Medio | P0 |
| NPS/pesquisa de satisfacao funcional | Alto em editais avancados | Medio | Medio | P0 |
| Agendamento com envio real de lembretes | Alto quando exigido | Medio | Medio | P0 |
| Auditoria formal consultavel por tela/relatorio | Medio/alto | Medio | Medio | P1 |
| Public API webhooks outbound | Alto se exigido | Medio/alto | Medio | P1 |
| Webchat refinado para edital/POC | Alto se exigido | Medio | Medio | P1 |
| Multiagentes IA / base de conhecimento runtime | Alto em editais com IA | Alto | Medio/alto | P1 |
| Transcricao de audio | Medio/alto se exigida | Alto | Medio/alto | P1, shadow pipeline criado; falta runtime/STT/busca |
| Busca avancada | Medio/alto para auditoria/ouvidoria | Medio/alto | Medio | P1, schema/settings criado; falta shadow/indexacao/runtime |
| Telegram avancado | Medio/alto se exigido | Alto | Medio/alto | P2, texto humano controlado; midia/grupos se exigidos |
| OTP/MFA | Medio | Medio | Medio | P2 |

## O Que Ja Existe Mas Pode Estar Escondido Por Profile/Feature

| Modulo | Como aparece | Observacao |
| --- | --- | --- |
| Dashboard | `dashboard`; default on para government | Pode estar off em business. |
| Reports | `reports`; default on para government/business | Requer dados operacionais. |
| SLA | `sla`; default on | Requer `SLAConfig` e metricas. |
| Departments | `departments`; default on | Base para orgaos/setores municipais. |
| Users | `users`; default on | RBAC basico. |
| Templates | off por default em government | Pode ser habilitado se edital permitir comunicados/template Meta. |
| Campaigns | off por default em government | Deve ser habilitado com cuidado por LGPD/comunicacao oficial. |
| Chatbot | default on | Requer configuracao de fluxos por servico. |
| Knowledge Base | `knowledgeBase`; default off | Estrutural em producao, habilitar por tenant quando houver curadoria. |
| Scheduling | `scheduling`; default off | Estrutural em producao, habilitar por tenant piloto. |
| Satisfaction/NPS | `satisfaction`; default off | Estrutural em producao, falta disparo/link/relatorio. |
| Webchat | `webchat` e `webchatOutbound`; default off | MVP operacional, habilitar por tenant/site/dominio. |
| Telegram | `telegram`, `telegramInbound` e `telegramOutbound`; default off | MVP operacional texto-only, habilitar por tenant/bot. |
| Public API Webhooks | `webhooks`, `webhookDispatch`, `webhookDispatchExecute`; default off | Dispatch real apenas manual/piloto. |
| POC | flag frontend reservada; demo por script | Nao e modulo exposto como feature final. |

## Roadmap Sem Retrabalho

### P0 - B2G Proposal Package + POC Municipal

Objetivo: preparar entrega comercial/licitatoria sem criar modulo novo.

Entregas:

- `B2G_PROPOSAL_PACKAGE.md`;
- `B2G_POC_RUNBOOK.md`;
- atualizar `DEMO_SCRIPT.md` para labels municipais atuais;
- criar matriz editavel por edital;
- seed POC com nomes genericos de orgaos e servicos publicos;
- revisar copy B2G no dashboard/reports se necessario.

Risco: baixo.

### P0 - NPS/Satisfacao Funcional

Objetivo: transformar o modulo estrutural em fluxo operacional de pesquisa pos-atendimento.

Entregas:

- disparo manual ou por encerramento;
- link publico de resposta;
- relatorio NPS/CSAT por periodo, canal e setor;
- exportacao.

Risco: medio.

### P0 - Scheduling Controlled Send

Objetivo: transformar lembretes manuais/shadow em envio real controlado.

Entregas:

- envio por tenant piloto;
- template obrigatorio quando fora da janela Meta;
- limites e rollback por flag;
- eventos de auditoria.

Risco: medio.

### P1 - B2G Reports/Audit Hardening

Objetivo: aumentar aderencia em relatorios, SLA, auditoria e exportacao.

Entregas:

- relatorio consolidado por periodo, setor, canal, status e SLA;
- exportacao CSV revisada e opcional XLSX;
- relatorio/auditoria de eventos por conversa/usuario;
- documentacao de trilha de auditoria.

Risco: medio.

### P1 - Public API Webhooks Outbound

Objetivo: cobrir editais que exigem integracao ativa por eventos.

Entregas:

- cadastro de endpoint por tenant;
- eventos de conversa/mensagem;
- assinatura/retry;
- logs redigidos.

Risco: medio/alto.

### P1 - Webchat Refinement

Objetivo: transformar o Webchat MVP em experiencia mais vendavel para POC.

Entregas:

- identificacao mais clara do visitante;
- roteamento por departamento;
- acessibilidade/copy visual;
- pacote de embed por edital.

Risco: medio.

### P1 - AI B2G Package

Objetivo: formalizar IA para edital.

Entregas:

- perfis de IA por area/servico;
- roteamento entre agentes/temas;
- limites de resposta e handoff;
- matriz de seguranca;
- regressao via evaluation.

Risco: medio/alto.

### P1 - Audio Transcription

Status pos-Sprint 75F:

- design tecnico criado em `docs/saas/AUDIO_TRANSCRIPTION_DESIGN.md`;
- fundacao criada com `AudioTranscription`, `AudioTranscriptionJob`, feature `audioTranscription=false`, feature `audioTranscriptionRuntime=false` e tela `/app/audio-transcriptions`;
- shadow pipeline criado com `npm run audio-transcriptions:shadow`, dry-run default e `--record` opcional para registros `shadow/skipped`;
- runtime controlado desenhado em `docs/saas/AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`;
- provider MVP recomendado: OpenAI Speech-to-Text, condicionado a pre-release de custo/LGPD e chave segura;
- runtime controlado implementado com `npm run audio-transcriptions:process`, `--dry-run` default e `--execute` explicito;
- download temporario WhatsApp e cleanup obrigatorio implementados para modo manual/piloto;
- transcript real pode ser persistido em `AudioTranscription` quando `audioTranscriptionRuntime=true` e `OPENAI_API_KEY` estiver configurada;
- piloto com midia real desenhado em `docs/saas/AUDIO_TRANSCRIPTION_REAL_MEDIA_PILOT_DESIGN.md`;
- proximo passo recomendado: executar apenas 1 a 3 audios reais controlados, com consentimento, custo monitorado e runtime desligado ao final;
- reaproveitamento identificado: `MessageType.AUDIO`, `InboundMessage`, `OutboundMessage`, timeline do Inbox, endpoint de media e CRM timeline;
- MVP recomendado: WhatsApp inbound audio apenas;
- flags atuais: `audioTranscription`, `audioTranscriptionRuntime`, ambas `false` por padrao;
- flags futuras propostas: `audioTranscriptionShadow`, `audioTranscriptionSearch`, ambas `false` por padrao quando implementadas;
- roadmap definido: piloto real 75K, busca 75L e consumo IA 75M.

Transcricao passa a **ATENDE COM AJUSTE** como fundacao demonstravel e governada, mas continua **NAO ATENDE** quando o TR exigir transcricao automatica em escala, exibicao no Inbox e busca avancada. O design, o schema, o shadow, o runtime controlado e o plano de piloto real reduzem risco de retrabalho e preparam a integracao futura com busca avancada, IA e auditoria.

Risco: medio/alto por LGPD, custo de provider, retencao e possivel exposicao de dados sensiveis.

### P1 - Advanced Search

Status pos-Sprint 76B:

- design tecnico criado em `docs/saas/ADVANCED_SEARCH_DESIGN.md`;
- fundacao criada com `SearchIndex`, migration `20260624110000_add_advanced_search`, feature `advancedSearch=false`, feature `advancedSearchRuntime=false`, API diagnostica `GET /app/search` e tela `/app/search`;
- fontes auditadas: `Contact`, `Lead`, `Conversation`, `InboundMessage`, `OutboundMessage`, `Event`, Knowledge Base, Campaign, Scheduling, AudioTranscription e Public API;
- busca atual e fragmentada: filtros do Inbox, busca local da Knowledge Base, filtros de reports e endpoints read-only da Public API;
- arquitetura recomendada: PostgreSQL full text com tabela dedicada de indice tenant-scoped;
- `pg_trgm` e OpenSearch ficam como evolucoes futuras, nao como dependencia inicial;
- MVP definido: busca textual simples, filtros por canal/periodo/departamento/atendente/status/sourceType e paginacao por cursor;
- busca semantica, embeddings, IA e indexacao de transcricao ficam fora do MVP inicial;
- proximo passo recomendado: Sprint 76C, com shadow/backfill de indice e feature desligada por padrao.

Busca avancada passa de gap sem desenho para **ATENDE COM AJUSTE como fundacao governada**. Continua nao atendendo editais que exijam busca operacional demonstravel, mas o schema, as flags e a tela diagnostica reduzem risco de retrabalho e preparam a indexacao shadow.

Risco: medio/alto por isolamento multi-tenant, volume de mensagens, LGPD, retencao e necessidade de nao indexar `rawPayload` ou dados sensiveis indevidos.

### P2 - Telegram

Status pos-Sprint 74F:

- design tecnico criado em `docs/saas/TELEGRAM_DESIGN.md`;
- canal alvo definido como `channel=telegram` e `provider=telegram`;
- MVP definido como atendimento humano 1:1, texto apenas;
- `ChannelAccount`, `ChannelAccountAlias` e `ChannelAccountSecret` serao reaproveitados;
- bot token usa `ChannelAccountSecret.secretKind=telegramBotToken`;
- flags `telegram`, `telegramInbound`, `telegramOutbound`, todas `false` por padrao;
- `/app/telegram` permite cadastro, ativacao/desativacao, rotacao de token e diagnostico placeholder;
- `POST /telegram/webhook/:tenantOrAlias` valida payload em shadow e, com `telegram=true` + `telegramInbound=true`, persiste texto inbound em `Contact`, `ContactChannelIdentity`, `Lead`, `Conversation`, `ConversationRuntimeState` e `InboundMessage`;
- Inbox reconhece `channel=telegram` com filtro/label/icone;
- com `telegramOutbound=true`, operador responde texto pelo Inbox via Bot API `sendMessage`;
- `OutboundMessage channel=telegram provider=telegram` registra status `sent`/`failed`, `message_id` e erro redigido;
- midia, audio, anexos, grupos, IA/chatbot e automacao continuam fora do escopo.

Telegram passa a **ATENDE PARCIALMENTE** como canal texto humano controlado. Ainda nao atende plenamente editais que exijam midia, grupos, registro operacional completo de webhook ou bot com automacao.

Objetivo: cobrir canal adicional quando edital exigir expressamente.

Entregas:

- design;
- schema/config;
- inbound;
- outbound humano;
- Inbox/timeline;
- rollout controlado.

Risco: alto.

## Recomendacao Final

O Converta ja pode ser tratado como competitivo para editais WhatsApp-first e defensavel para editais com API read-only, POC e Webchat basico. A proxima fase deve transformar modulos estruturais em fluxos operacionais completos, antes de abrir novos canais pesados.

Ordem recomendada:

1. completar NPS com envio/link/relatorio;
2. completar Scheduling com envio controlado de lembretes;
3. criar POC/runbook B2G pos-Webchat MVP;
4. adicionar Public API webhooks outbound se o edital exigir eventos externos;
5. refinar Webchat para identificacao/roteamento/acessibilidade;
6. completar hardening Telegram apenas se o edital-alvo exigir expressamente.

Veredito: o Converta esta pronto para disputar editais WhatsApp-first com atendimento humano, chatbot, IA supervisionada, SLA, relatorios, Public API read-only, Webchat MVP, Telegram texto humano controlado e POC. Para editais do Grupo A mais avancados, especialmente Sao Jose do Rio Preto/SP como guia, ainda precisa completar NPS funcional, agendamento com envio real, Telegram avancado se exigido, OTP, transcricao operacional, busca avancada operacional, webhooks Public API automaticos e multiagentes IA antes de afirmar aderencia plena.
