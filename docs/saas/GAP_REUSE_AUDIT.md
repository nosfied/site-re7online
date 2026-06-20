# Gap Reuse Audit

Sprint 69A - auditoria de reaproveitamento para gaps B2G.

Escopo auditado:

1. API publica
2. NPS
3. Agendamento
4. Webchat
5. Base de conhecimento
6. Telegram

Fonte primaria: codigo e documentacao existentes no repositorio. Nenhum comportamento foi alterado.

## Resumo Executivo

| Gap | Classificacao | Existe implementado? | Parcial reaproveitavel? | Feature flag escondida? | Documentacao existente? |
| --- | --- | --- | --- | --- | --- |
| API publica | PARCIAL | Nao como API publica versionada | Sim, APIs internas `/app`, `/admin` e integrações Meta | Nao | Sim, bid package e B2G audit |
| NPS | NAO ATENDE | Nao | Pouco, apenas reports/dashboard como destino futuro | Nao | Sim, gap citado em auditorias |
| Agendamento | PARCIAL | Nao como modulo agenda | Sim, fluxo legado de demo/agendamento textual | Nao | Sim, docs antigas e bid matrix |
| Webchat | NAO ATENDE | Nao | Baixo, apenas inbox/realtime podem ser base | Nao | Sim, citado como gap |
| Base de conhecimento | PARCIAL | Sim, modulo formal iniciado | Sim, `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, `/app/knowledge-base`, `knowledge.base.ts`, IA tenant-scoped, prompts/config | Sim como CRUD, ainda nao consumido pelo runtime | Sim, KB MVP design |
| Telegram | NAO ATENDE | Nao | Medio-baixo, arquitetura multicanal pode inspirar | Nao | Sim, citado como gap |

Conclusao: o proximo bloco com melhor relacao ganho/reuso e **Base de conhecimento + NPS**, seguido por **API publica**. Webchat e Telegram exigem canais novos e devem vir depois de contratos de API/canal mais claros. Agendamento tem codigo reaproveitavel, mas nao deve ser vendido como modulo pronto.

## 1. API Publica

### Existe algo implementado?

Nao existe uma API publica formal, versionada, documentada e autenticada para terceiros.

Existe, porem, uma API operacional robusta usada pelo app e pelo console interno:

- `src/lib/appClientApi.ts`
- `src/lib/whatsappAdminApi.ts`
- `apps/whatsapp-agent/src/http/routes.ts`

Superficies existentes:

- autenticacao do app;
- inbox/conversas;
- usuarios;
- departamentos;
- chatbot;
- templates;
- campanhas;
- relatorios;
- dashboard;
- CRM/timeline;
- configuracoes;
- canais/admin.

### Existe algo parcial?

Sim.

Reaproveitavel:

- padrao de rotas HTTP ja consolidado;
- autenticacao app/admin existente;
- escopo por tenant/clientId;
- RBAC;
- modelos Prisma;
- exportacao de relatorios;
- webhooks Meta como referencia de entrada;
- logs redigidos.

Falta para virar API publica:

- namespace versionado, por exemplo `/public-api/v1`;
- API keys/client credentials por tenant;
- rate limit por integracao;
- OpenAPI/Swagger;
- contrato de payload;
- webhooks de saida;
- auditoria por integracao;
- politica de escopo/permissao.

### Existe algo escondido por feature flag?

Nao. As flags atuais cobrem modulos do app, nao API publica externa.

Evidencia:

- `src/lib/appFeatures.ts`
- `apps/whatsapp-agent/src/features/clientFeatures.ts`

### Existe algo legado reaproveitavel?

Sim. As rotas internas e tipos de `appClientApi.ts`/`whatsappAdminApi.ts` podem orientar o contrato publico, mas nao devem ser expostas diretamente.

### Existe documentacao pronta?

Parcial:

- `docs/saas/bid-package/12-integracoes.md`
- `docs/saas/B2G_READINESS_AUDIT.md`
- `docs/saas/BID_READINESS_MATRIX.md`

### Classificacao

**PARCIAL**

## 2. NPS

### Existe algo implementado?

Nao foi localizado modulo NPS, pesquisa de satisfacao, model dedicado, rota dedicada ou tela dedicada.

Nao foram encontrados modelos como:

- `NpsSurvey`
- `SatisfactionSurvey`
- `Rating`
- `SurveyResponse`

### Existe algo parcial?

Parcial muito indireto:

- relatorios/dashboard podem ser destino para metricas futuras;
- campanhas/templates podem enviar pesquisa futuramente;
- CRM/timeline pode registrar evento de resposta futuramente.

Isso nao configura NPS implementado.

### Existe algo escondido por feature flag?

Nao.

As flags atuais nao incluem `nps`, `satisfaction` ou `survey`.

### Existe algo legado reaproveitavel?

Baixo.

Possiveis reaproveitamentos:

- templates oficiais para envio de pergunta pos-atendimento;
- eventos para auditoria;
- timeline para registrar resposta;
- reports para consolidar nota futura.

### Existe documentacao pronta?

Parcial como gap:

- `docs/saas/B2G_READINESS_AUDIT.md`
- `docs/saas/BID_READINESS_MATRIX.md`
- `docs/saas/bid-package/09-relatorios.md`

### Classificacao

**NAO ATENDE**

## 3. Agendamento

### Existe algo implementado?

Nao existe modulo completo de agenda com:

- servicos;
- slots;
- calendario;
- disponibilidade;
- confirmacao;
- reagendamento;
- lembretes;
- integracao com Google/Outlook;
- tela administrativa de agenda;
- relatorios de agendamento.

### Existe algo parcial?

Sim.

Existe fluxo textual/legado relacionado a demo e agendamento:

- `apps/whatsapp-agent/src/conversation/conversation.service.ts`
  - `parseDemoIntent`
  - `applyDemoRequestedTransition`
  - `applyDemoScheduledTransition`
  - `getDemoScheduledQuickReply`
- `apps/whatsapp-agent/src/whatsapp/flowExecutor.ts`
  - `runMidDemoFlowExecutor`
  - `runPostDemoFlowExecutor`
- `apps/whatsapp-agent/scripts/e2e-demo.sh`
  - fluxo E2E de demo solicitada/agendada.

Esse codigo detecta intencao e extrai dia/horario em texto, mas nao e uma agenda institucional.

### Existe algo escondido por feature flag?

Nao.

Nao ha feature `scheduling` ou `appointments`.

### Existe algo legado reaproveitavel?

Sim.

Reaproveitavel:

- parser simples de intencao de agendamento;
- estados `demoStatus`, `lastDemoScheduledAt`, `demoPreferredSchedule`;
- eventos `lead.demo_scheduled`;
- fluxo de confirmacao textual;
- testes/demo de agendamento.

Nao reaproveitavel como produto final:

- falta persistencia formal de agenda;
- falta disponibilidade;
- falta UI;
- falta integracao de calendario;
- falta lembrete automatico por agenda.

### Existe documentacao pronta?

Parcial:

- `docs/whatsapp-agent/00-visao-produto.md`
- `docs/whatsapp-agent/01-compliance-e-janelas.md`
- `docs/saas/BID_READINESS_MATRIX.md`
- `docs/saas/B2G_READINESS_AUDIT.md`

### Classificacao

**PARCIAL**

## 4. Webchat

### Existe algo implementado?

Nao foi localizado canal Webchat, widget publico, script embutivel, rota publica de visitante ou adapter webchat.

Nao existem evidencias de:

- widget JS;
- canal `webchat`;
- model de visitante anonimo;
- token/site embed;
- inbox source webchat;
- configuracao por dominio.

### Existe algo parcial?

Parcial arquitetural:

- inbox ja suporta timeline;
- realtime/WebSocket ja existe;
- multi-channel persistence pode inspirar novo canal;
- conversation models sao reutilizaveis;
- frontend pode reaproveitar componentes visuais.

Mas nao ha webchat funcional.

### Existe algo escondido por feature flag?

Nao.

Nao ha feature flag `webchat`.

### Existe algo legado reaproveitavel?

Baixo/medio:

- realtime inbox;
- timeline;
- envio/recebimento textual;
- tenant resolution pode ser adaptado por dominio/widget key;
- UI do inbox.

### Existe documentacao pronta?

Somente como gap:

- `docs/saas/B2G_READINESS_AUDIT.md`
- `docs/saas/BID_READINESS_MATRIX.md`
- `docs/saas/bid-package/README.md`

### Classificacao

**NAO ATENDE**

## 5. Base De Conhecimento

### Existe algo implementado?

Existe uma base minima/legada:

- `apps/whatsapp-agent/src/knowledge/knowledge.base.ts`
- `apps/whatsapp-agent/src/knowledge/re7.seed.md`

Conteudo atual e pequeno e voltado ao contexto Re7/demo, nao a um modulo por tenant.

### Existe algo parcial?

Sim.

Peças reaproveitaveis:

- IA tenant-scoped;
- `aiAssistantConfig`;
- `aiIntentQualification`;
- topicos permitidos/bloqueados;
- contexto de negocio por tenant;
- prompts e catalogo de intencoes DB-first;
- evaluation/replay para regressao de IA.

Falta para virar modulo de base de conhecimento:

- model `KnowledgeArticle`/`KnowledgeCollection`;
- tela de CRUD por tenant;
- versionamento/aprovacao;
- busca semantica ou full-text;
- anexos/fontes;
- ranking/feedback;
- integracao explicita com IA antes do fallback;
- auditoria de resposta baseada em fonte.

### Existe algo escondido por feature flag?

Nao como feature separada.

O uso fica acoplado a:

- `chatbot`;
- configuracoes de IA/automacao;
- flags operacionais de IA.

### Existe algo legado reaproveitavel?

Sim.

Reaproveitavel:

- `knowledge.base.ts` como semente historica;
- docs de backlog KB-first;
- pipeline de IA;
- configuracao por tenant;
- evaluation/replay.

### Existe documentacao pronta?

Parcial:

- `docs/whatsapp-agent/03-backlog-mvp.md` menciona "KB-first IA";
- `docs/saas/automation-ai-tenant-playbook.md`;
- `docs/saas/B2G_READINESS_AUDIT.md`;
- `docs/saas/bid-package/07-ia.md`.

### Classificacao

**PARCIAL**

## 6. Telegram

### Existe algo implementado?

Nao foi localizado canal Telegram, adapter, webhook, token, outbound, inbound ou tenant resolution para Telegram.

Nao existem evidencias de:

- `telegramAdapter`;
- rota de webhook Telegram;
- model/canal `telegram`;
- configuracao de bot token;
- envio via Bot API;
- UI especifica.

### Existe algo parcial?

Parcial arquitetural:

- modelos de conversas multi-canal;
- campo `channel` em conversas/mensagens;
- padroes de adapter para WhatsApp/Messenger/Instagram;
- tenant resolution de canais Meta como referencia;
- inbox omnichannel.

Mas Telegram exige implementacao de canal novo.

### Existe algo escondido por feature flag?

Nao.

Nao ha feature flag `telegram`.

### Existe algo legado reaproveitavel?

Medio-baixo:

- padroes de persistencia inbound/outbound;
- timeline/inbox;
- logs redigidos;
- arquitetura de channel accounts como inspiracao;
- templates conceituais de canal, mas nao codigo Telegram.

### Existe documentacao pronta?

Somente como gap:

- `docs/saas/B2G_READINESS_AUDIT.md`;
- `docs/saas/BID_READINESS_MATRIX.md`;
- `docs/saas/bid-package/README.md`.

### Classificacao

**NAO ATENDE**

## Mapa De Reaproveitamento

| Item | Reaproveitar primeiro | Evitar reaproveitar diretamente |
| --- | --- | --- |
| API publica | autenticação, RBAC, tenant scope, rotas internas como referencia | expor `/app` ou `/admin` diretamente para terceiros |
| NPS | templates, timeline, reports | tratar evento generico como NPS sem model proprio |
| Agendamento | parser demo, estados/eventos, fluxo textual | vender como agenda sem slots/calendario |
| Webchat | inbox, realtime, conversation models | adaptar webhook Meta como se fosse webchat |
| Base de conhecimento | IA config, evaluation, `knowledge.base.ts` | manter base global hardcoded como fonte por tenant |
| Telegram | padrao multichannel e inbox | reaproveitar channelAccounts Meta sem model/token proprio |

## Priorizacao Recomendada

| Prioridade | Sprint sugerida | Motivo |
| --- | --- | --- |
| P1 | Base de conhecimento por tenant | Maior reuso com IA ja existente e maior valor para B2G |
| P1 | NPS/pesquisa pos-atendimento | Gap recorrente em editais, escopo medio e impacto em relatorios |
| P2 | API publica v1 | Importante para integracoes, mas exige governanca forte |
| P2 | Agendamento MVP | Existe parser legado, mas precisa virar modulo real |
| P3 | Webchat | Canal novo, alto impacto, exige widget/public identity |
| P3 | Telegram | Canal novo, menor reuso e maior superficie operacional |

## Proxima Sprint Recomendada

**Sprint 69B - Knowledge Base + NPS Design**

Escopo sugerido:

1. desenhar models de `KnowledgeArticle`/`KnowledgeCollection`;
2. desenhar fluxo KB-first antes da IA;
3. desenhar model de `SatisfactionSurvey`/`NpsResponse`;
4. integrar NPS a finalizacao de atendimento;
5. definir relatorio de satisfacao;
6. nao implementar Telegram/Webchat ainda.

Justificativa: Base de conhecimento e NPS sao os gaps com maior recorrencia em editais e maior reaproveitamento da base atual.
