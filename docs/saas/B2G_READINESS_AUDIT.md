# B2G Readiness Audit

Status: auditoria de aderencia para editais publicos baseada no codigo atual. Este documento nao altera runtime.

Data: 2026-06-17.

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

Pontuacao usada na matriz percentual:

- ATENDE = 100
- ATENDE PARCIALMENTE = 50
- NAO ATENDE = 0

## Resumo Executivo

O Converta esta forte para editais cujo nucleo seja WhatsApp Oficial, atendimento humano multiatendente, filas/setores, chatbot configuravel, IA supervisionada, relatorios, SLA, dashboard operacional, LGPD/retencao e POC controlada.

O produto ainda nao atende de forma plena editais que exijam canais adicionais fora da Meta ou recursos tipicos de plataforma municipal mais ampla, como Telegram, webchat publico, NPS, agendamento e API publica documentada para integracoes externas.

O projeto ja possui uma base importante para B2G:

- `Client.profile` com perfis `business` e `government`;
- feature flags por tenant em `Client.features`;
- defaults B2G com dashboard, departamentos, usuarios, SLA, relatorios e chatbot ativos;
- console interno para criar/editar tenant como "Governo / edital";
- POC controlada `demo-prefeitura`;
- relatorios, dashboard, SLA, departamentos, auditoria de eventos e retencao LGPD.

Leitura final:

| Dimensao | Aderencia |
| --- | ---: |
| Grupo A medio, WhatsApp-first | 78% |
| Grupo A com multicanal Meta e POC | 72% |
| Sao Jose do Rio Preto como edital-guia avancado | 55% |
| Aderencia consolidada ponderada | 68% |

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
- public API;
- NPS;
- agendamento;
- webchat;
- Telegram;
- multiagentes IA;
- base de conhecimento.

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
| Base de conhecimento | ATENDE PARCIALMENTE | 35% | `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, feature `knowledgeBase`, CRUD `/app/knowledge-base` tenant-scoped; Sprint 69D desenha consumo runtime | Falta lookup/shadow no runtime, consumo por IA/chatbot, busca semantica e importacao documental | Medio/alto | Medio | Sprint 69E/69F |
| Campanhas/templates | ATENDE PARCIALMENTE | 50% | `Campaign`, `Template`, Meta templates | Government default desliga campaigns/templates; edital pode exigir comunicados oficiais | Medio | Baixo/medio | Sprint 69/70 |
| Relatorios | ATENDE | 100% | `/app/reports`, export, `ConversationMetrics` | Criar relatorio licitatorio fechado por periodo/orgaos/canais se exigido | Baixo | Medio | Sprint 69 |
| Dashboard | ATENDE PARCIALMENTE | 50% | `/app/dashboard`, KPIs operacionais, profile government | Dashboard e beta e operacional, nao BI completo | Medio | Medio | Sprint 70 |
| SLA | ATENDE | 100% | `SLAConfig`, `ConversationMetrics`, reports/dashboard | Configurar metas por edital | Baixo | Baixo | Configuracao |
| Exportacao Excel/CSV | ATENDE PARCIALMENTE | 50% | Exportacao CSV/text em relatorios | Excel/XLSX nativo nao evidenciado | Medio | Baixo | Sprint 69 |
| LGPD/retencao | ATENDE | 100% | `RetentionConfig`, privacy settings, delete/anonymize | Documentar politica por contrato publico | Baixo | Baixo | Sprint 69 |
| Auditoria/logs | ATENDE PARCIALMENTE | 50% | `Event`, logs estruturados, eventos de feature denied/conversa | Falta tela/relatorio de auditoria formal para cliente | Medio | Medio | Sprint 70 |
| API para integracao externa | ATENDE PARCIALMENTE | 65% | `/public-api/v1` com API keys tenant-scoped, scopes, rate limit, auditoria, health autenticado, OpenAPI inicial e leitura de contatos | Falta conversas, mensagens, webhooks outbound e escrita controlada | Alto | Medio/alto | Sprint 70E |
| Agendamento | ATENDE PARCIALMENTE | 35% | `SchedulingService`, `SchedulingResource`, `SchedulingAvailability`, `Appointment`, `AppointmentReminder`, feature `scheduling`, CRUD `/app/scheduling` tenant-scoped | Ainda nao ha consumo por chatbot/IA, lembretes automaticos, Google Calendar, API publica ou regras avancadas de conflito de agenda | Alto | Medio/alto | Sprint 71D/72 |
| NPS/pesquisa satisfacao | NAO ATENDE | 0% | Nao ha model/rotas/tela NPS | Criar pesquisa pos-atendimento e relatorio | Alto | Medio | Sprint 72 |
| Webchat | NAO ATENDE | 0% | Nao ha canal/widget webchat | Criar widget publico, identidade, persistencia e inbox | Alto | Alto | Sprint 75 |
| Telegram | NAO ATENDE | 0% | Nao ha adapter/rotas Telegram | Criar canal, token, webhook, outbound, tenant resolution | Alto | Alto | Sprint 76 |
| Multiagentes IA | ATENDE PARCIALMENTE | 50% | AI profile/config por tenant; POC tem agentes humanos por area | Nao ha 3 agentes IA independentes/especializados com roteamento formal | Alto | Medio/alto | Sprint 71 |
| POC/demo | ATENDE | 100% | `docs/DEMO_SCRIPT.md`, `seed-demo.mjs`, `demo-prefeitura` | Atualizar POC para requisitos Grupo A e labels municipais | Baixo | Baixo | Sprint 69 |

Pontuacao simples: 67%.

## Aderencia Por Edital

Sem os TRs completos versionados, a estimativa abaixo considera padroes recorrentes do Grupo A e o edital-guia avancado como mais exigente.

| Edital | Perfil provavel | Aderencia atual | Leitura |
| --- | --- | ---: | --- |
| Pinheiros/ES | WhatsApp-first, atendimento municipal, relatorios | 78% | Bom encaixe se nao exigir Telegram/webchat/NPS. |
| Cabreuva/SP | WhatsApp, setores, dashboard/SLA | 75% | Forte em operacao; revisar API publica e exportacao exigida. |
| Aripuana/MT | Atendimento digital municipal com POC | 76% | POC demo ajuda; ajustar labels e seed para municipio. |
| Conselheiro Lafaiete/MG | Atendimento multissetorial e governanca | 72% | Precisa reforcar auditoria formal e relatorios licitatorios. |
| Quatro Barras/PR | Atendimento e relatorios | 76% | Aderente para WhatsApp/SLA/filas; gaps em canais extras. |
| Sao Jose do Rio Preto/SP | Edital-guia avancado, multicanal e recursos amplos | 55% | Exigencias como Telegram, webchat, NPS, OTP/API formal reduzem aderencia. |

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
| Auditoria formal consultavel por tela/relatorio | Medio/alto | Medio | Medio | P1 |
| NPS/pesquisa de satisfacao | Alto em editais avancados | Medio | Medio | P1 |
| Multiagentes IA / base de conhecimento | Alto em editais com IA | Alto | Medio/alto | P1 |
| API publica versionada | Alto se exigido | Alto | Alto | P2 |
| Webchat | Alto se exigido | Alto | Alto | P2 |
| Telegram | Alto se exigido | Alto | Alto | P2 |
| Agendamento | Medio/alto | Alto | Alto | P2 |
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
| POC | flag frontend reservada; demo por script | Nao e modulo exposto como feature final. |

## Roadmap Sem Retrabalho

### Sprint 69 - B2G Proposal Package + POC Municipal

Objetivo: preparar entrega comercial/licitatoria sem criar modulo novo.

Entregas:

- `B2G_PROPOSAL_PACKAGE.md`;
- `B2G_POC_RUNBOOK.md`;
- atualizar `DEMO_SCRIPT.md` para labels municipais atuais;
- criar matriz editavel por edital;
- seed POC com nomes genericos de orgaos e servicos publicos;
- revisar copy B2G no dashboard/reports se necessario.

Risco: baixo.

### Sprint 70 - B2G Reports/Audit Hardening

Objetivo: aumentar aderencia em relatorios, SLA, auditoria e exportacao.

Entregas:

- relatorio consolidado por periodo, setor, canal, status e SLA;
- exportacao CSV revisada e opcional XLSX;
- relatorio/auditoria de eventos por conversa/usuario;
- documentacao de trilha de auditoria.

Risco: medio.

### Sprint 71 - AI B2G Package

Objetivo: formalizar IA para edital.

Entregas:

- perfis de IA por area/servico;
- roteamento entre agentes/temas;
- limites de resposta e handoff;
- matriz de seguranca;
- regressao via evaluation.

Risco: medio/alto.

### Sprint 72 - NPS + Knowledge Base Design/Implementation

Objetivo: cobrir dois gaps comuns de edital avancado.

Entregas:

- pesquisa pos-atendimento;
- relatorio NPS/satisfacao;
- desenho ou primeira versao de base de conhecimento por tenant.

Risco: medio/alto.

### Sprint 73+ - API Publica, Webchat, Telegram, Agendamento

Objetivo: cobrir requisitos de editais avancados.

Recomendacao: nao implementar todos juntos. Cada um e modulo/canal novo com seguranca, tenant resolution, logs, LGPD e testes especificos.

## Recomendacao Final

Nao iniciar Telegram/Webchat/API publica antes de fechar o pacote B2G documental e o hardening dos relatorios/auditoria.

Ordem recomendada:

1. Sprint 69: pacote B2G + POC municipal + matriz por edital.
2. Sprint 70: relatorios/auditoria/exportacao para licitacao.
3. Sprint 71: multiagentes IA/base inicial de conhecimento, se o edital exigir IA forte.
4. Sprint 72: NPS.
5. Sprint 73+: canais e integracoes novas somente se o edital-alvo exigir expressamente.

Veredito: o Converta esta pronto para disputar editais WhatsApp-first com atendimento humano, chatbot, IA supervisionada, SLA, relatorios e POC. Para editais do Grupo A mais avancados, especialmente Sao Jose do Rio Preto/SP como guia, ainda precisa fechar NPS, webchat, Telegram, API publica formal, agendamento e multiagentes IA antes de afirmar aderencia plena.
