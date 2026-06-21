# Sprint 73A - Webchat Audit

Data: 2026-06-21

Escopo: auditoria documental e tecnica do estado atual do Converta para Webchat, widget web, chat embutido, atendimento anonimo/identificado e reaproveitamento de inbox/realtime.

Nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA, API publica ou frontend operacional.

## Resumo Executivo

O Converta **nao possui Webchat formal** hoje.

Nao foram encontrados:

- widget JavaScript embutivel;
- iframe/chat publico;
- rota publica de visitante;
- canal `webchat`;
- adapter/persistence de webchat;
- model de visitante anonimo;
- token/site key de widget;
- configuracao por dominio permitido;
- feature flag `webchat`;
- tela de configuracao do widget;
- SDK frontend para sites de terceiros.

Existe, porem, uma base tecnica relevante para reaproveitamento:

- inbox multiatendente e timeline;
- `Conversation`, `Message`, `Contact`, `Lead` e `ContactChannelIdentity`;
- realtime WebSocket do inbox;
- Public API com API keys, scopes, auditoria e rate limit;
- Knowledge Base formal;
- CRM/timeline;
- departamentos, filas, RBAC e handoff humano.

Classificacao atual: **NAO ATENDE** como Webchat funcional.

Aderencia atual estimada: **0% como canal Webchat pronto**, **45% como infraestrutura reaproveitavel**.

## Evidencias No Codigo

| Area | Evidencia | Status | Leitura |
| --- | --- | --- | --- |
| Widget web | Busca por `webchat`, `widget`, `iframe`, `visitor`, `anonymous` nao encontrou widget de produto | NAO ATENDE | Nao existe script embutivel ou UI publica |
| Feature flag | `apps/whatsapp-agent/src/features/clientFeatures.ts` e `src/lib/appFeatures.ts` nao possuem `webchat` | NAO ATENDE | Nao ha rollout controlado para Webchat |
| Canal/persistencia | Nao ha adapter `webchat`, rota inbound publica ou channel `webchat` implementado | NAO ATENDE | Falta canal completo |
| Model visitante | `schema.prisma` nao possui `WebchatVisitor`, `WebchatSession` ou `WidgetSite` | NAO ATENDE | Falta identidade publica/anonima |
| Conversas | `Conversation` possui `channel`, `provider`, `channelAccountId`, `externalUserHash` e `externalUserRef` | PARCIAL | Modelo pode suportar `channel=webchat` com nova camada |
| Contatos | `Contact` e `ContactChannelIdentity` suportam canal/provedor/identidade externa | PARCIAL | Pode mapear visitante anonimo ou identificado |
| Mensagens | `Message`, `InboundMessage`, `OutboundMessage` ja suportam timeline e direcao | PARCIAL | Pode receber mensagens webchat apos adapter |
| Realtime | `/app/realtime` e `/agent-api/app/realtime` usam WebSocket autenticado por sessao do app | PARCIAL | Serve ao operador/inbox, nao ao visitante publico |
| Inbox | `/app/inbox` ja exibe canais e timeline multicanal | PARCIAL | Pode exibir conversa webchat apos persistencia |
| Public API | `/public-api/v1` tem auth, scopes, contatos read-only e OpenAPI inicial | PARCIAL | Pode inspirar API/widget auth, mas nao substitui Webchat |
| Knowledge Base | `KnowledgeBaseCollection`/`KnowledgeBaseArticle` existem com CRUD controlado | PARCIAL | Pode alimentar respostas/FAQ futuras do widget |

## Verificacao Por Item Do Escopo

| Item | Classificacao | Evidencia | Observacao |
| --- | --- | --- | --- |
| Widget web | NAO ATENDE | Nenhum script/widget publico encontrado | Precisa nascer |
| Chat web | NAO ATENDE | Nao ha rota publica de chat | Precisa nascer |
| Inbox web | PARCIAL | `/app/inbox` operacional | E inbox do operador, nao canal Webchat |
| Chat embutido | NAO ATENDE | Nenhum iframe/embed de produto | Precisa nascer |
| Canais genericos | PARCIAL | `channel` string em conversa/mensagem | Falta adapter webchat |
| Realtime | PARCIAL | WebSocket app-only autenticado | Reaproveitavel para operador; visitante precisa canal proprio |
| Atendimento anonimo | NAO ATENDE | Nao ha visitante anonimo/session | Precisa criar identidade temporaria |
| Atendimento identificado | PARCIAL | `Contact`/`Lead` existem | Falta fluxo de identificacao no widget |
| iframe/widget | NAO ATENDE | Nao existe configuracao/site key | Precisa criar |
| SDK/frontend reaproveitavel | PARCIAL | UI e app client existem | Componentes internos ajudam, mas widget deve ser isolado/leve |

## Reaproveitamento Por Modulo

| Modulo | Reaproveitamento | Observacao |
| --- | --- | --- |
| Inbox | Alto | Timeline, filtros, atribuicao, handoff e envio humano podem receber `channel=webchat` |
| Realtime | Medio/alto | Realtime do operador ja existe; visitante precisa socket/SSE separado e publico |
| Conversation | Alto | Campos de canal/identidade externa ja existem |
| Contact | Medio/alto | Pode vincular visitante identificado ou criar contato anonimo depois de captura |
| ContactChannelIdentity | Alto | Bom encaixe para `channel=webchat`, `provider=converta_widget`, `channelAccountId=widgetId` |
| Lead | Medio | Pode qualificar visitante e registrar CRM/timeline |
| CRM Timeline | Alto | Historico webchat deve aparecer junto aos demais canais |
| Public API | Medio | Infra de API keys/scopes/auditoria/rate limit inspira endpoints de widget/admin |
| Knowledge Base | Medio | Pode alimentar FAQ/assistente no widget futuramente |
| Chatbot/IA | Medio | Pode responder webchat em fase posterior, mas nao no MVP inicial |
| Departments/Queues | Alto | Webchat deve entrar em fila/setor como outros canais |
| Reports/Dashboard | Medio | Podem agregar canal webchat depois da persistencia |

## Gaps Reais

### Banco

Nao existe estrutura especifica para:

- `WebchatWidget`;
- `WebchatSite`;
- `WebchatVisitor`;
- `WebchatSession`;
- configuracao de dominio permitido;
- segredo publico do widget;
- customizacao visual por tenant.

Observacao: parte do estado pode usar `Conversation`, `ContactChannelIdentity` e `Message`, mas o widget precisa de entidade propria para configuracao e seguranca.

### Backend

Faltam:

- endpoint publico para iniciar sessao de webchat;
- endpoint publico para enviar mensagem do visitante;
- endpoint publico para buscar historico permitido;
- autenticar widget por chave publica + dominio;
- rate limit por widget/IP/sessao;
- persistencia inbound `channel=webchat`;
- outbound do operador para visitante;
- entrega realtime para visitante;
- auditoria redigida.

### Frontend

Faltam:

- pagina/widget isolado;
- script embutivel;
- tema basico por tenant;
- estado minimizado/aberto;
- formulario de identificacao opcional;
- aviso LGPD/privacidade;
- anexos, se exigidos, em fase posterior.

### Admin/App

Faltam:

- feature flag `webchat`;
- tela `/app/webchat` ou `/app/settings/webchat`;
- configuracao de widget;
- dominios permitidos;
- horario/setor/fila padrao;
- instrucoes de instalacao do script.

## Classificacao De Aderencia

| Requisito | Classificacao | Justificativa |
| --- | --- | --- |
| Webchat publico funcional | NAO ATENDE | Nao ha widget, endpoint publico ou sessao de visitante |
| Widget embutivel em site | NAO ATENDE | Nao ha script ou iframe de produto |
| Atendimento anonimo | NAO ATENDE | Falta identidade/sessao publica |
| Atendimento identificado | PARCIAL | Contatos/leads existem, mas sem captura via widget |
| Encaminhamento ao inbox | PARCIAL | Inbox suporta canais, mas falta adapter webchat |
| Realtime operador | PARCIAL | WebSocket app-only ja existe |
| Realtime visitante | NAO ATENDE | Falta socket/SSE publico por sessao |
| Historico no CRM/timeline | PARCIAL | Modelos existem, mas falta persistencia webchat |
| Relatorios por canal | PARCIAL | Reports podem filtrar canal se mensagens existirem |
| Feature flag/rollout | NAO ATENDE | Falta `webchat` |
| LGPD/privacidade | PARCIAL | Retencao/LGPD geral existe, mas falta aviso/consentimento no widget |
| Knowledge Base no webchat | PARCIAL futuro | KB existe, mas runtime ainda nao consome |

## MVP Recomendado

### Objetivo Do MVP

Criar um canal Webchat simples, seguro e demonstravel, sem IA automatica inicial.

MVP proposto:

- feature flag `webchat=false`;
- model de widget/site por tenant;
- script ou iframe embutivel;
- sessao de visitante anonimo;
- envio/recebimento texto;
- persistencia em `Conversation`/`Message` com `channel=webchat`;
- conversa aparece no `/app/inbox`;
- operador responde pelo inbox;
- visitante recebe resposta no widget;
- sem anexos no primeiro MVP;
- sem IA/chatbot no primeiro MVP;
- sem Public API externa no primeiro MVP.

## Modelo Alvo Sugerido

### WebchatWidget

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `name` | string | nome interno |
| `publicKey` | string | chave publica do widget |
| `status` | active/inactive |
| `allowedDomains` | json/string[] | dominios autorizados |
| `defaultDepartmentId` | string/null | setor padrao |
| `defaultQueueId` | string/null | fila padrao |
| `theme` | json | cores/textos basicos |
| `privacyText` | text/null | aviso LGPD |
| `createdAt/updatedAt` | datetime | auditoria |

### WebchatSession

Campos sugeridos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope |
| `widgetId` | string | widget |
| `conversationId` | uuid/null | conversa vinculada |
| `contactId` | uuid/null | contato se identificado |
| `visitorIdHash` | string | identidade anonima hash |
| `visitorName` | string/null | opcional |
| `visitorEmail` | string/null | opcional, se habilitado |
| `status` | active/closed/expired |
| `lastSeenAt` | datetime |
| `expiresAt` | datetime |
| `createdAt/updatedAt` | datetime | auditoria |

## Seguranca E LGPD

Requisitos minimos:

- chave publica de widget nao deve conceder acesso ao `/app`;
- origem/domino deve ser validado;
- rate limit por IP/widget/sessao;
- token de sessao curto e rotacionavel;
- comentario/mensagem nunca logado em eventos tecnicos;
- dados de visitante anonimo devem respeitar retencao do tenant;
- consentimento/aviso LGPD configuravel por tenant;
- bloquear cross-tenant por `clientId` em todas as queries.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Spam/bots no widget | Alto | rate limit, allowlist de dominio, captcha em fase posterior |
| Vazamento cross-tenant | Alto | `clientId` obrigatorio e testes de isolamento |
| Expor token de app no widget | Alto | token publico separado, sem reutilizar sessao `/app` |
| CORS/origem mal configurada | Alto | validar `Origin` e `allowedDomains` |
| Aumento de carga realtime | Medio/alto | canal de visitante separado, TTL e limites |
| LGPD sem consentimento claro | Medio/alto | aviso configuravel e minimizacao de dados |
| Duplicar conversa por visitante | Medio | cookie/local storage + session server-side |
| Reaproveitar Public API indevidamente | Medio | Public API nao deve virar auth de visitante |

## Impacto Em Editais

Alto.

Webchat aparece como gap recorrente em editais multicanal mais amplos, especialmente quando o objeto exige atendimento digital nao limitado ao WhatsApp.

Com Webchat MVP, a aderencia melhora para:

- portais municipais;
- CAC online;
- ouvidoria digital;
- atendimento fora do WhatsApp;
- demonstracao de omnichannelidade real.

Enquanto nao existir Webchat funcional, a classificacao em editais que exigem canal web deve permanecer **NAO ATENDE**.

## Impacto Em Clientes Privados

Alto para clientes com site proprio.

Casos provaveis:

- atendimento comercial no site;
- captacao de leads sem depender de WhatsApp;
- suporte inicial;
- triagem de duvidas recorrentes;
- continuidade da conversa no inbox.

## Roadmap Recomendado

### Sprint 73B - Webchat Design

Somente desenho:

- modelo de widget/sessao;
- protocolo de visitante;
- endpoints publicos;
- realtime visitante;
- seguranca/CORS/rate limit;
- relacao com inbox;
- rollout por feature flag.

### Sprint 73C - Webchat Schema + App Settings MVP

Estrutura sem runtime publico:

- models aditivos;
- feature `webchat=false`;
- CRUD de widget em `/app/settings/webchat`;
- dominios permitidos;
- snippet de instalacao;
- sem chat publico ainda.

### Sprint 73D - Webchat Public Widget + Inbound MVP

Primeiro fluxo real:

- widget simples;
- iniciar sessao;
- enviar mensagem inbound;
- persistir conversa `channel=webchat`;
- aparecer no inbox;
- sem IA automatica.

### Sprint 73E - Webchat Outbound/Realtime MVP

Completar ponta a ponta:

- operador responde no inbox;
- visitante recebe no widget;
- realtime/polling publico;
- expiracao de sessao;
- eventos e auditoria.

### Sprint 73F - Webchat Enhancements

Depois do E2E:

- identificacao opcional;
- upload/anexos;
- handoff/setores avancados;
- KB/IA shadow;
- CSAT pos-chat;
- theming avancado.

## Recomendacao Final

Nao implementar Webchat diretamente sem design.

Proxima sprint correta: **Sprint 73B - Webchat Design**.

Recorte recomendado:

- desenhar `WebchatWidget` e `WebchatSession`;
- definir feature flag `webchat=false`;
- definir protocolo publico de visitante;
- definir seguranca por dominio, rate limit e token de sessao;
- definir como `channel=webchat` entra no inbox;
- nao alterar runtime WhatsApp, Messenger, Instagram, IA, chatbot ou Public API existente.
