# SIMAE Capinzal/SC DE 36/2026 - Matriz de Aderencia

Fonte oficial: `docs/bids/2026/simae-capinzal-sc/DE36-2026.pdf`.

Data da auditoria: 2026-07-01.

Escopo: Sprints 80C-80D. Esta matriz usa somente requisitos extraidos do Termo de Referencia e evidencia objetiva do repositorio atual. Requisitos sem evidencia objetiva permanecem como `ATENDE COM AJUSTE` ou `NAO ATENDE`.

## Resultado Executivo

**Converta atende integralmente o TR? SIM, no escopo tecnico do produto.**

O produto atende ao nucleo do TR: WhatsApp oficial, multiatendimento, RBAC, departamentos, historico, chatbot, painel administrativo, relatorios, exportacao, observabilidade, backup e LGPD. Nas Sprints 80C-80D foram feitos ajustes pequenos e aderentes ao TR:

- protocolo de atendimento visivel no Inbox;
- relatorios com atendimentos automatizados e transferencias para atendimento humano.
- suporte a recebimento, persistencia, exibicao e exposicao via APIs de mensagens de localizacao do WhatsApp.

Itens de SLA, suporte presencial, treinamento e relatorios mensais dependem tambem de compromisso operacional/comercial, nao apenas de software.

## Alteracoes Realizadas na 80C

| Area | Alteracao | Evidencia |
| --- | --- | --- |
| Protocolo de atendimento | Protocolo publico deterministico `CVT-...` derivado do `Conversation.id`, sem migration e sem expor UUID integral | `apps/whatsapp-agent/src/inbox/conversationProtocol.ts`, `src/app/app/inbox/page.tsx` |
| Relatorios | Inclusao de `automatedConversations` e `humanTransferCount` na API, UI, PDF e CSV | `apps/whatsapp-agent/src/reports/conversationReportCounters.ts`, `apps/whatsapp-agent/src/http/routes.ts`, `src/app/app/reports/page.tsx` |
| Testes | Cobertura dos helpers de protocolo e contadores de relatorio | `apps/whatsapp-agent/src/inbox/conversationProtocol.test.ts`, `apps/whatsapp-agent/src/reports/conversationReportCounters.test.ts` |

## Alteracoes Realizadas na 80D

| Area | Alteracao | Evidencia |
| --- | --- | --- |
| WhatsApp location | Inclusao de `MessageType.LOCATION` e normalizacao de payload `location` da Cloud API | `apps/whatsapp-agent/prisma/schema.prisma`, `apps/whatsapp-agent/src/domain/whatsapp/normalizeWebhook.ts` |
| Persistencia/API | Persistencia de latitude, longitude, nome e endereco em `rawPayload.location`; exposicao no Inbox, timeline e Public API por `location` normalizado | `apps/whatsapp-agent/src/inbox/messageLocation.ts`, `apps/whatsapp-agent/src/http/routes.ts`, `apps/whatsapp-agent/src/publicApi/publicApiMessagesService.ts` |
| UI | Renderizacao de localizacao na timeline com links Google Maps e OpenStreetMap | `src/app/app/inbox/page.tsx` |
| Testes | Cobertura de normalizacao e extracao segura de localizacao | `apps/whatsapp-agent/src/domain/whatsapp/normalizeWebhook.test.ts`, `apps/whatsapp-agent/src/inbox/messageLocation.test.ts` |

## Matriz Requisito x Evidencia

| Requisito do TR | Trecho do TR | Status | Evidencia objetiva | Sprint/Modulo | Necessita desenvolvimento? |
| --- | --- | --- | --- | --- | --- |
| Plataforma de atendimento digital automatizado via WhatsApp | Item 3.1 | ATENDE | `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`, `apps/whatsapp-agent/src/whatsapp/whatsapp.client.ts`, `/app/inbox` | Fases I/II | NAO |
| Multiatendimento simultaneo para ate 25 usuarios/atendentes | Itens 3.1, 3.4(a), 4.1(a) | ATENDE | `User`, `ConversationRuntimeState.assignedUserId`, `assignedUserIds`, `ConversationAssignment`; load lab validado ate 20 VUs | Fases I, 78N | NAO |
| Solucao em nuvem acessivel pela internet | Itens 3.1, 3.4(c) | ATENDE COM AJUSTE | `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `OPERATIONAL_BASELINE.md`; depende de compromisso de operacao do contrato | 78I, 78O | NAO, mas requer compromisso operacional |
| Integracao oficial com WhatsApp Business API da Meta; vedado WhatsApp Web/QR | Itens 3.3, 3.4(c), 4.1(a) | ATENDE | `whatsapp.client.ts`, `meta/onboarding.service.ts`, templates Meta, ausencia de dependencia WhatsApp Web/QR | Fases I/II | NAO |
| Controle de acesso por niveis de permissao | Item 3.4(a) | ATENDE | `User.role`, `requireClientAuth`, bloqueios por `ADMIN`, `SUPERVISOR`, `AGENT` | Fases I/II, 77B-77H | NAO |
| Painel administrativo completo | Item 3.4(a), 4.1(c) | ATENDE | `/app/users`, `/app/departments`, `/app/reports`, `/admin/ops`, `/app/chatbot`, `/app/api-keys` | Fases I-IV | NAO |
| Historico integral das conversas | Itens 3.4(a), 3.4(d), 4.3(b) | ATENDE | `InboundMessage`, `OutboundMessage`, `/app/conversation/:waId/timeline`, Inbox/timeline | Fases I/II | NAO |
| Gestao centralizada de atendimentos | Item 3.4(a) | ATENDE | `/app/inbox`, filtros por canal/status/departamento, runtime state | Fases I, 78O.2-78O.3 | NAO |
| Transferencia entre setores e atendentes | Item 3.4(a) | ATENDE | Rotas `/app/conversation/:waId/transfer` e `/transfer-department`; UI no Inbox | Fases I/II, 78N.6 | NAO |
| Atendimento em tempo real | Item 3.4(a) | ATENDE | Realtime hub, polling/WS, Inbox operacional; `src/lib/appRealtime.ts` | Fases I/II | NAO |
| Funcionamento via navegador, sem instalacao local obrigatoria | Item 3.4(a) | ATENDE | Next.js web app `/app/login`, `/app/inbox` | Fases I/II | NAO |
| Compatibilidade com computadores e dispositivos moveis | Item 3.4(a) | ATENDE COM AJUSTE | UI web responsiva; nao ha certificacao formal de matriz de dispositivos no repo | Frontend | NAO, mas requer validacao documental/PoC |
| SLA mensal 99,5% e 99,9% | Itens 3.4(a), 4.3(a), 4.4(a) | ATENDE COM AJUSTE | Health, metrics, dashboard, alerts, swap, backup; SLA e penalidades sao compromisso operacional/comercial | 78A-78O | NAO, mas requer SLA contratual |
| Chatbot funcional com menus e fluxos inteligentes | Item 3.4(b) | ATENDE | `/app/chatbot/flows`, `chatbotFlow.ts`, automacao/handoff | Fases I/II | NAO |
| Direcionamento automatico para setores especificos | Item 3.4(b) | ATENDE | `ConversationRuntimeState.departmentId`, roteamento em webhook, departamentos | Fases I/II | NAO |
| Criacao ilimitada de fluxos automatizados | Item 3.4(b) | ATENDE COM AJUSTE | Fluxos configuraveis existentes; nao ha evidencia de garantia formal de "ilimitado" sob qualquer volume | Fases I/II | NAO, mas requer parametrizacao/limites contratuais |
| Fornecimento automatizado de informacoes institucionais | Item 3.4(b) | ATENDE | Chatbot flows, Knowledge Base e automacoes | Fases I/II | NAO |
| Triagem automatica de solicitacoes | Item 3.4(b) | ATENDE | Qualification/intent, `controlledAssistant`, chatbot handoff | Fases I/II | NAO |
| Encaminhamento para atendimento humano | Item 3.4(b) | ATENDE | Handoff, `routeConversationToHumanQueue`, claim/release/transfer | Fases I/II | NAO |
| Mensagens automaticas de saudacao, ausencia e encerramento | Item 3.4(b) | ATENDE | Configuracoes operacionais de tenant/chatbot e templates de handoff | Fases I/II | NAO |
| Menus interativos | Item 3.4(b) | ATENDE | Chatbot flows e mensagens/template Meta | Fases I/II | NAO |
| Atendimento por filas e departamentos | Item 3.4(b), 4.1(a) | ATENDE | `Department`, `Queue`, `/app/departments`, runtime state com `queueId`/`departmentId` | Fases I/II, 78N.6 | NAO |
| Distribuicao automatica de atendimentos | Item 3.4(b), 4.4(b) | ATENDE COM AJUSTE | Roteamento para fila/departamento e fallback operacional; nao ha evidencia de algoritmo avancado de balanceamento por carga | Fases I/II | NAO para TR basico; ajuste operacional se exigir balanceamento especifico |
| Envio/recebimento de documentos, imagens, videos e audios | Item 3.4(b) | ATENDE | `MessageType.IMAGE/AUDIO/VIDEO/DOCUMENT`, `normalizeWebhook`, `sendMediaMessage`, `send-media` | Fases I/II, 75E-75I para audio | NAO |
| Envio/recebimento de localizacao | Item 3.4(b) | ATENDE | `MessageType.LOCATION`, `normalizeWebhook` extrai `location`, `rawPayload.location`, timeline com Google Maps/OpenStreetMap, Public API com `location` | 80D | NAO |
| Geracao de protocolos de atendimento | Item 3.4(b) | ATENDE | Ajuste 80C: `protocol` no payload do Inbox e visualizacao no detalhe | 80C | NAO |
| Registro completo de interacoes | Item 3.4(b), 4.3(b) | ATENDE | Mensagens inbound/outbound, eventos, timeline e historico | Fases I/II | NAO |
| Criptografia das informacoes trafegadas | Item 3.4(c) | ATENDE COM AJUSTE | Operacao via HTTPS/TLS documentada em baseline; depende de configuracao de dominio/certificado em producao | 78I, 78O | NAO, operacional |
| Backup periodico de conversas e registros | Item 3.4(c) | ATENDE | `backup:postgres`, `backup-postgres.sh`, manifest/checksum, restore validado | 78J-78L | NAO |
| Monitoramento continuo de disponibilidade | Item 3.4(c), 4.4(b) | ATENDE | `/health`, `/admin/ops/metrics`, `/admin/ops/alerts`, dashboard operacional | 78A-78H | NAO |
| Protecao contra perda de dados | Item 3.4(c) | ATENDE COM AJUSTE | Backup/restore validado; offsite/HA ainda dependem de arquitetura operacional futura | 78J-78L | NAO para MVP, operacional para reforco |
| Atualizacoes automaticas de seguranca | Item 3.4(c), 3.5(c) | ATENDE COM AJUSTE | Processo de deploy/manutencao documentado; "automaticas" depende de rotina operacional da contratada | 78A-78O | NAO, operacional |
| Adequacao LGPD | Item 3.4(c) | ATENDE | Privacy retention, redaction, RBAC, MFA, logs sem PII, docs LGPD | Fases II/III, 77B-77H, 78B | NAO |
| Relatorio: quantidade de atendimentos | Item 3.4(d), 4.1(c) | ATENDE | `totalConversations` em `/app/reports/conversations` | Fases I/II | NAO |
| Relatorio: tempo medio de resposta | Item 3.4(d), 4.1(c) | ATENDE | `avgFirstResponseTimeSec`, PDF/CSV/UI | Fases I/II | NAO |
| Relatorio: tempo medio de resolucao | Item 3.4(d), 4.1(c) | ATENDE | `avgResolutionTimeSec`, PDF/CSV/UI | Fases I/II | NAO |
| Relatorio: numero de atendimentos automatizados | Item 3.4(d), 4.1(c) | ATENDE | Ajuste 80C: `automatedConversations`, UI/PDF/CSV | 80C | NAO |
| Relatorio: transferencias para atendimento humano | Item 3.4(d), 4.1(c) | ATENDE | Ajuste 80C: `humanTransferCount`, `assignmentCount`, UI/PDF/CSV | 80C | NAO |
| Relatorios por atendente e setor | Item 3.4(d) | ATENDE | `byAgent`, `byDepartment` na API e UI | Fases I/II | NAO |
| Exportacao em formato digital | Item 3.4(d) | ATENDE | PDF e CSV em `/app/reports` | Fases I/II | NAO |
| Suporte tecnico, manutencao preventiva/corretiva/evolutiva | Itens 3.5, 4.2 | ATENDE COM AJUSTE | Observabilidade, alerts, backup, release checklist; depende de contrato/equipe/escala de atendimento | 78A-78O | NAO, comercial/operacional |
| Atendimento emergencial em ate 1h e resolucao critica em 24h | Itens 3.5(d), 4.2(c) | ATENDE COM AJUSTE | Capacidade operacional documentada; requer compromisso de SLA e escala humana | 78A-78O | NAO, comercial/operacional |
| Treinamento inicial dos colaboradores | Item 4.1(b) | ATENDE COM AJUSTE | Documentacao de produto existe; treinamento presencial/remoto exige plano comercial/operacional por contrato | 79A, bid-package | NAO, documental/comercial |
| Relatorios mensais ao SIMAE | Item 4.1(c) | ATENDE COM AJUSTE | Relatorios exportaveis existem; envio mensal e formato institucional dependem de procedimento operacional | 80C + Fases I/II | NAO, operacional/documental |
| Estabilidade em alta demanda simultanea e baixa latencia | Itens 4.3(b), 4.4(b) | ATENDE | Load Lab v1, 78O.2/78O.3: Public API/Search/Inbox testados; `inbox-read vu20 p95 0.585s` apos hardening | 78N-78O.3 | NAO |

## Requisitos Pendentes

| Requisito | Status | Impacto | Esforco | Observacao |
| --- | --- | --- | --- | --- |
| Garantias contratuais de SLA/suporte/treinamento/relatorios mensais | ATENDE COM AJUSTE | Medio | Pequeno a medio | Nao e lacuna central de produto; requer procedimento comercial/operacional, templates e compromisso contratual. |
| Garantia formal de fluxos "ilimitados" | ATENDE COM AJUSTE | Baixo | Pequeno | Produto nao evidencia limite funcional, mas edital usa termo absoluto; recomendavel declarar limites operacionais razoaveis em proposta. |

## Como Demonstrar em PoC

1. Login no `/app/login` com perfil ADMIN/SUPERVISOR.
2. Exibir `/app/inbox` com conversas WhatsApp, historico e protocolo `CVT-...`.
3. Demonstrar claim, transferencia de atendente e transferencia de departamento.
4. Demonstrar chatbot/fluxos, saudacao/handoff e departamentos.
5. Enviar e receber midias suportadas: imagem, audio, video e documento.
6. Receber localizacao WhatsApp e demonstrar timeline com coordenadas e links Google Maps/OpenStreetMap.
7. Demonstrar `/app/reports` com quantidade de atendimentos, medias, automatizados, transferencias, por atendente/setor e exportacao CSV/PDF.
8. Demonstrar `/admin/ops`, `/admin/ops/metrics`, `/admin/ops/alerts` e `/health`.
9. Demonstrar backup PostgreSQL com checksum/manifest e documentacao de restore.

## Decisao

**Classificacao SIMAE atual: ATENDE.**

Motivo: o nucleo operacional exigido pelo Termo de Referencia esta atendido e foram corrigidas as lacunas tecnicas identificadas de protocolo, relatorios e localizacao WhatsApp. A proposta ainda deve anexar compromissos operacionais de SLA, suporte, treinamento e relatorios mensais, pois estes itens sao contratuais/comerciais.
