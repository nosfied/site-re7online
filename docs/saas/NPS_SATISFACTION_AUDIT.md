# Sprint 72A - NPS / Satisfaction Audit

Data: 2026-06-21

Escopo: auditoria documental e tecnica do estado atual do Converta para NPS, CSAT, pesquisa de satisfacao e qualidade de atendimento.

Nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA ou frontend operacional.

## Resumo Executivo

O Converta **nao possui modulo formal de NPS/CSAT/satisfacao** hoje.

Nao foram encontrados:

- model dedicado para pesquisa ou resposta de satisfacao;
- rota dedicada;
- tela em `/app`;
- feature flag `nps`, `satisfaction` ou `survey`;
- relatorio especifico de satisfacao;
- disparo pos-atendimento;
- consolidacao de NPS/CSAT em dashboard.

Existe, porem, uma base operacional boa para reaproveitamento:

- ciclo de encerramento de conversa;
- `Conversation.closedAt`;
- `ConversationMetrics` com tempo de resposta, resolucao e SLA;
- eventos persistidos em `Event`;
- templates/campaigns para envio futuro de pesquisa;
- reports/dashboard como destino para indicadores;
- CRM/timeline para contexto do atendimento.

Classificacao atual: **NAO ATENDE**.

Aderencia atual estimada: **0% como NPS formal**, **30% como infraestrutura reaproveitavel**.

## Evidencias No Backend

| Area | Evidencia | Status | Leitura |
| --- | --- | --- | --- |
| Models NPS/CSAT | Nenhum model `NpsSurvey`, `SatisfactionSurvey`, `Rating`, `SurveyResponse` ou equivalente em `apps/whatsapp-agent/prisma/schema.prisma` | NAO ATENDE | Nao existe entidade formal de pesquisa |
| Conversa | `Conversation.closedAt`, status operacional e indices por `closedAt` em `apps/whatsapp-agent/prisma/schema.prisma` | PARCIAL | Bom gatilho para pesquisa pos-atendimento |
| Metricas | `ConversationMetrics` com `firstResponseTimeSec`, `avgResponseTimeSec`, `resolutionTimeSec`, `closedAt`, `totalMessages` | PARCIAL | Serve para correlacionar satisfacao com SLA/tempo de atendimento |
| Fechamento | `recordConversationClosedMetrics` em `apps/whatsapp-agent/src/metrics/conversationMetrics.ts` | PARCIAL | Momento natural para criar survey futura |
| Eventos | Model `Event` e uso de `persistEvent` em rotas/runtime | PARCIAL | Pode auditar convite/resposta de pesquisa |
| Reports | `/app/reports/conversations` usa `ConversationMetrics`, SLA e agregacao por canal | PARCIAL | Pode receber indicadores NPS/CSAT futuramente |
| Templates | `Template` e `Campaign` existem no schema e runtime | PARCIAL | Podem enviar pergunta de satisfacao por template quando janela Meta exigir |
| CRM/timeline | `Lead`, `LeadNote`, conversas e mensagens persistidas | PARCIAL | Pode exibir resposta de pesquisa no contexto do atendimento |
| Feature flag | Nao ha `nps`, `satisfaction` ou `survey` em `Client.features` | NAO ATENDE | Precisa nascer desligado por padrao |

## Evidencias No Frontend

| Area | Evidencia | Status | Leitura |
| --- | --- | --- | --- |
| Inbox | `src/app/app/inbox/page.tsx` possui acao de finalizar atendimento e atualiza `closedAt/status` | PARCIAL | UI ja possui momento operacional para disparo futuro |
| Reports | `src/app/app/reports/page.tsx` mostra conversas, primeira resposta media, resolucao media, fora do SLA e canal | PARCIAL | Pode incluir satisfacao/NPS sem criar novo produto de BI |
| Dashboard | `/app/dashboard` existe por profile/feature | PARCIAL | Pode receber card resumido em fase futura |
| CRM Timeline | Inbox mostra historico, notas e contexto do contato | PARCIAL | Pode registrar resposta/nota de satisfacao |
| Tela NPS | Nenhuma tela `/app/nps`, `/app/satisfaction` ou similar encontrada | NAO ATENDE | Precisa criar modulo proprio |
| Formulario publico | Nenhum formulario publico de avaliacao encontrado | NAO ATENDE | Necessario para link de pesquisa ou resposta via canal |

## Reaproveitamento Por Modulo

| Modulo | Reaproveitamento | Observacao |
| --- | --- | --- |
| Conversation | Alto | `closedAt`, status e identidade da conversa sao base do disparo pos-atendimento |
| ConversationMetrics | Alto | Permite cruzar satisfacao com SLA, resolucao e quantidade de mensagens |
| Reports | Medio/alto | Ja tem periodo, canal, CSV/PDF e filtros operacionais |
| Dashboard | Medio | Pode ganhar cards de satisfacao, resposta e detratores |
| Events | Medio/alto | Bom para auditoria redigida de convite, resposta e erro |
| Templates | Medio | Necessarios para convites fora da janela WhatsApp/Meta |
| Campaigns | Baixo/medio | Nao deve ser motor principal de NPS, mas pode reaproveitar infra de envio/template |
| CRM Timeline | Medio | Pode exibir resposta da pesquisa no historico |
| Knowledge Base | Baixo | Pode documentar scripts/perguntas e tratamento de baixa nota, nao medir NPS |
| Public API | Medio futuro | Pode expor respostas agregadas ou webhooks depois do MVP |
| Scheduling | Baixo futuro | Pode medir satisfacao por compromisso em fase posterior |

## Classificacao De Aderencia

| Requisito | Classificacao | Justificativa |
| --- | --- | --- |
| NPS formal | NAO ATENDE | Nao ha model, rota, tela ou relatorio |
| CSAT 1-5 | NAO ATENDE | Nao ha coleta de nota ou comentario |
| Pesquisa pos-atendimento | NAO ATENDE | Fechamento existe, mas nao dispara pesquisa |
| Comentario opcional | NAO ATENDE | Nao ha entidade/resposta de survey |
| Dashboard de satisfacao | NAO ATENDE | Dashboard atual nao inclui satisfacao |
| Relatorio de satisfacao | NAO ATENDE | Reports nao possuem NPS/CSAT |
| Auditoria de atendimento | PARCIAL | `Event`, logs e metricas existem, mas sem evento especifico de pesquisa |
| Correlacao com SLA | PARCIAL | `ConversationMetrics` permite cruzamento futuro |
| Envio por template Meta | PARCIAL | Templates existem, mas fluxo de pesquisa nao |
| Multi-tenant | PARCIAL | Base do produto e tenant-scoped; modulo NPS precisa seguir esse padrao |

## O Que Ja Existe

- Encerramento/finalizacao de atendimento no inbox.
- Persistencia de `closedAt`.
- `ConversationMetrics` para tempo de primeira resposta, resolucao e SLA.
- `Event` para auditoria.
- Reports por periodo/canal e exportacao.
- Templates Meta e campanhas.
- CRM/timeline e notas.
- Feature flag framework em `Client.features`.

## O Que E Legado Ou Indireto

- Ocorrencias de `feedbackText` no chatbot/flow referem-se a mensagens de handoff, nao a feedback do cliente.
- Ocorrencias de `score` no chatbot/IA/evaluation referem-se a classificacao, confianca, handoff ou replay, nao NPS/CSAT.
- Docs anteriores citam NPS como gap, principalmente `GAP_REUSE_AUDIT.md`, `B2G_READINESS_AUDIT.md` e `BID_READINESS_MATRIX.md`.

## O Que Precisa Nascer

### Banco

Entidades provaveis para design futuro:

- `SatisfactionSurvey`;
- `SatisfactionResponse`;
- opcionalmente `SatisfactionRule` ou config em `TenantOperationalConfig`.

Campos minimos futuros:

- `clientId`;
- `conversationId`;
- `contactId`/`leadId` quando aplicavel;
- `channel`;
- `type`: `csat` ou `nps`;
- `score`: 1-5 para CSAT ou 0-10 para NPS;
- `comment`;
- `status`: `pending`, `sent`, `answered`, `expired`, `cancelled`;
- `sentAt`, `answeredAt`, `expiresAt`;
- `requestId`;
- timestamps;
- indices por tenant, periodo, conversa, canal e status.

### Backend

- Service tenant-scoped.
- Rotas `/app/satisfaction` ou `/app/nps`.
- Endpoint seguro para resposta publica ou resposta via canal.
- Opcao de disparo manual/automatico apos `ConversationOperationalStatus.CLOSED`.
- Auditoria: `satisfaction.survey.sent`, `satisfaction.response.received`, `satisfaction.survey.expired`.

### Frontend

- Tela simples em `/app/satisfaction` ou `/app/nps`.
- Lista de pesquisas/respostas.
- Cards: taxa de resposta, media CSAT, NPS, promotores/neutros/detratores.
- Filtros por periodo, canal, setor e atendente.

### Configuracao

- Feature flag `satisfaction` ou `nps`, desligada por padrao.
- Config por tenant:
  - habilitado/desabilitado;
  - tipo da pesquisa: CSAT, NPS ou ambos;
  - texto da pergunta;
  - comentario opcional;
  - expiracao;
  - template Meta quando necessario;
  - canais permitidos.

## MVP Recomendado

### Sprint 72B - NPS/Satisfaction Design

Somente desenho. Definir:

- modelo de dados;
- feature flag;
- RBAC;
- fluxo de disparo;
- DTOs;
- eventos;
- reports;
- politica Meta para janela aberta/fechada;
- rollback.

### Sprint 72C - Satisfaction Schema + App CRUD MVP

Implementar estrutura sem disparo automatico:

- models aditivos;
- migration;
- feature flag `satisfaction=false`;
- CRUD/config em `/app/satisfaction`;
- listagem de respostas;
- sem envio automatico por canal.

### Sprint 72D - Manual Survey Send + Response Capture

Implementar fluxo controlado:

- disparo manual a partir de conversa finalizada;
- resposta por link/token seguro ou resposta direta no canal, conforme design;
- auditoria;
- sem automacao ampla.

### Sprint 72E - Post-Close Automation + Reports

Depois de validar:

- disparo automatico apos encerramento;
- template Meta quando janela fechada;
- report agregado;
- cards de dashboard.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Envio proativo fora da politica Meta | Alto | usar janela aberta ou template aprovado |
| Viés por multiplas respostas | Medio | 1 resposta valida por survey/conversa |
| Vazamento de PII em comentario | Alto | limites de texto, redaction em logs, LGPD/retencao |
| Atribuicao incorreta a atendente/setor | Medio | capturar assignment/status no momento do fechamento |
| Baixa taxa de resposta | Medio | mensagem curta, expirar convite e medir taxa |
| Inflar NPS com testes internos | Medio | filtro por periodo/canal e opcao de exclusao de contatos de teste futuramente |
| Confundir NPS com CSAT | Medio | separar tipos e nomenclatura no design |

## Valor Para Editais

Alto.

NPS/satisfacao aparece como gap em auditorias de licitacao e aumenta aderencia em editais que exigem:

- pesquisa pos-atendimento;
- medicao de qualidade;
- relatorio de satisfacao;
- indicadores de gestao;
- SLA e qualidade de atendimento.

Para B2G, recomenda-se comunicar como "Pesquisa de satisfacao do atendimento" e suportar CSAT 1-5 primeiro. NPS 0-10 pode entrar como tipo adicional para editais que exigirem explicitamente NPS.

## Valor Para Clientes Privados

Alto para operacoes de vendas, suporte e servicos.

Usos provaveis:

- medir qualidade por atendente;
- identificar detratores;
- priorizar retorno humano;
- melhorar scripts/IA;
- demonstrar resultado para gestores.

## Recomendacao Final

Nao implementar envio automatico antes do design.

Proxima sprint correta: **Sprint 72B - NPS/Satisfaction Design**.

Recorte recomendado:

- desenhar modelo `SatisfactionSurvey`/`SatisfactionResponse`;
- definir CSAT 1-5 como MVP;
- prever NPS 0-10 como modo adicional;
- feature flag desligada por padrao;
- tenant scope obrigatorio;
- sem runtime automatico inicial;
- preparar integracao futura com fechamento de conversa, reports e templates.

## Veredito

| Item | Resultado |
| --- | --- |
| Aderencia atual | NAO ATENDE |
| Infra reaproveitavel | PARCIAL, boa |
| Esforco MVP | Medio |
| Risco tecnico | Medio |
| Risco Meta/canal | Medio/alto se automatizar sem template |
| Prioridade B2G | Alta |
| Prioridade B2B | Alta |
| Sprint recomendada | 72B - Design |
