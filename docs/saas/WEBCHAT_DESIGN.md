# Sprint 73B - Webchat Design

Data: 2026-06-21

Escopo: desenho funcional e tecnico do modulo Webchat. Nao houve migration, alteracao de banco, runtime, widget real, canais, chatbot, IA, API publica ou frontend operacional.

## Objetivo

Projetar o canal **WEBCHAT** do Converta para atendimento em sites e portais, cobrindo:

- widget embutivel;
- sessao de visitante anonimo;
- upgrade para visitante identificado;
- persistencia em conversa/timeline;
- atendimento pelo inbox;
- branding por tenant;
- seguranca por dominio e rate limit;
- integracao futura com chatbot, IA, Knowledge Base e API publica.

O modulo deve nascer multi-tenant, governado por feature flag e sem automacao no primeiro MVP.

## Principios

1. **Webchat e canal proprio**: nao deve ser um improviso sobre WhatsApp, Messenger ou Public API.
2. **Tenant scope obrigatorio**: todo widget, sessao, conversa e identidade precisa resolver `clientId`.
3. **Widget publico nao usa sessao do app**: visitante recebe token proprio, curto e limitado.
4. **Dominio autorizado e obrigatorio**: widget so deve operar em origens configuradas por tenant.
5. **Inbox continua fonte operacional**: operador atende Webchat pelo mesmo `/app/inbox`.
6. **Texto primeiro**: MVP deve suportar texto; anexos, IA e KB ficam para fases posteriores.
7. **Fallback por polling antes de complexidade**: realtime visitante pode iniciar com polling curto e evoluir para SSE/WebSocket.
8. **Rollback por feature flag**: `webchat=false` por padrao no lancamento.

## Canal

Canal oficial:

```text
WEBCHAT
```

Representacao operacional sugerida:

```text
channel = "webchat"
provider = "converta"
channelAccountId = WebchatSite.id
```

O canal deve usar a mesma dinamica operacional do inbox:

- conversa aparece na lista;
- pode ser atribuida a operador;
- pode entrar em fila/setor;
- mensagens entram na timeline;
- encerramento, notas e CRM continuam funcionando.

Status apos Sprint 73F:

- `WebchatSite`, `WebchatSettings`, `WebchatAllowedDomain`, `WebchatVisitor` e `WebchatSession` existem;
- `POST /webchat/v1/session` e `GET /webchat/v1/session/:token` existem;
- `POST /webchat/v1/messages` recebe texto inbound e cria conversa `channel=webchat`;
- a conversa aparece no `/app/inbox` e usa a timeline existente;
- resposta do operador para visitante, widget publico final, polling publico, chatbot e IA seguem fora do escopo atual.

## Entidades Alvo

### WebchatWidget

Configura um widget por tenant/site.

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `name` | string | nome interno |
| `publicKey` | string | chave publica para embed |
| `status` | active/inactive/archived | controle operacional |
| `allowedDomains` | json/string[] | dominios autorizados |
| `defaultDepartmentId` | string/null | setor padrao |
| `defaultQueueId` | string/null | fila padrao |
| `welcomeMessage` | string/null | mensagem inicial |
| `offlineMessage` | string/null | mensagem fora de horario |
| `privacyText` | text/null | aviso LGPD |
| `theme` | json | cores, logo, posicao, labels |
| `metadata` | json | extensoes futuras |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Indices recomendados:

- `(clientId, status)`;
- unico por `publicKey`;
- `(clientId, name)`.

### WebchatSession

Representa uma sessao de visitante no widget.

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `widgetId` | string | widget |
| `conversationId` | uuid/null | conversa vinculada |
| `contactId` | uuid/null | contato se identificado |
| `leadId` | string/null | lead se qualificado |
| `visitorIdHash` | string | identidade anonima hash |
| `visitorTokenHash` | string | hash do token de sessao |
| `visitorName` | string/null | opcional |
| `visitorEmail` | string/null | opcional |
| `visitorPhone` | string/null | opcional |
| `status` | active/closed/expired/blocked | controle |
| `ipHash` | string/null | anti-abuso redigido |
| `userAgentHash` | string/null | anti-abuso redigido |
| `lastSeenAt` | datetime | atividade |
| `expiresAt` | datetime | expiracao |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Regras:

- token bruto nunca deve ser armazenado;
- `visitorIdHash` pode ser derivado de cookie/localStorage + widget;
- sessao expirada nao aceita nova mensagem sem renovacao.

### WebchatMessageReceipt

Opcional para futuro. No MVP, `Message`/`InboundMessage`/`OutboundMessage` podem ser suficientes.

Uso futuro:

- status de entregue/lida no widget;
- idempotencia por mensagem do visitante;
- retry de envio.

## Sessao De Visitante

### Visitante Anonimo

Fluxo:

1. Site carrega widget com `publicKey`.
2. Widget chama endpoint de bootstrap.
3. Backend valida origem contra `allowedDomains`.
4. Backend cria ou reusa `WebchatSession`.
5. Widget recebe token de sessao curto.
6. Primeira mensagem cria `Conversation` com `channel=webchat`.

Dados minimos:

- `visitorIdHash`;
- `widgetId`;
- `clientId`;
- `conversationId` quando existir;
- `expiresAt`.

### Visitante Identificado

Upgrade opcional:

1. Widget solicita nome/email/telefone, conforme configuracao.
2. Backend valida e atualiza `WebchatSession`.
3. Sistema cria ou vincula `Contact`.
4. Pode criar/vincular `Lead`.
5. `ContactChannelIdentity` registra a identidade `webchat`.

Regra:

- identificacao deve ser opcional no MVP;
- nao bloquear atendimento anonimo quando o tenant permitir;
- LGPD deve explicar uso de dados.

## Relacao Com Modelos Existentes

| Modelo | Uso No Webchat |
| --- | --- |
| `Contact` | contato identificado apos captura de nome/email/telefone |
| `ContactChannelIdentity` | identidade externa por widget/sessao/hash |
| `Lead` | qualificacao comercial/institucional futura |
| `Conversation` | conversa principal no inbox, `channel=webchat` |
| `ConversationRuntimeState` | atribuicao, fila, status e modo operacional |
| `Message` | timeline operacional |
| `InboundMessage` | mensagem recebida do visitante |
| `OutboundMessage` | resposta do operador para visitante |
| `Department`/`Queue` | roteamento inicial |
| `Event` | auditoria redigida |
| `KnowledgeBaseArticle` | respostas/FAQ futuras |

## Widget

### Formatos

#### Script Embutivel

Modelo preferencial:

```html
<script
  src="https://converta.re7online.com/webchat/widget.js"
  data-widget-key="wgt_xxx"
  async
></script>
```

Vantagens:

- instalacao simples;
- melhor controle de posicao/estado;
- pode criar iframe interno isolado.

#### Iframe

Modelo alternativo:

```html
<iframe
  src="https://converta.re7online.com/webchat/embed?w=wgt_xxx"
  title="Atendimento"
></iframe>
```

Vantagens:

- isolamento visual maior;
- implantacao previsivel em portais publicos.

Recomendacao: oferecer script que injeta iframe interno. Isso combina facilidade com isolamento.

### UI Do MVP

Controles minimos:

- bolha flutuante;
- painel aberto/fechado;
- mensagem de boas-vindas;
- lista simples de mensagens;
- campo de texto;
- estado enviando/erro;
- aviso de privacidade;
- formulario opcional de identificacao.

Nao incluir no MVP:

- anexos;
- emoji picker;
- audio;
- avaliacao/NPS;
- IA automatica;
- historico multi-dispositivo.

## Identidade

### Cookie / LocalStorage

Uso:

- manter `visitorId` opaco no navegador;
- reabrir conversa no mesmo navegador;
- evitar duplicidade de sessao.

Cuidados:

- visitor ID nao deve conter PII;
- expirar conforme politica do tenant;
- suportar navegadores que bloqueiam storage.

### Token De Visitante

Token de sessao:

- emitido pelo backend;
- curto;
- assinado ou armazenado por hash;
- escopo limitado a uma sessao/widget;
- nao permite acesso ao `/app` nem Public API.

### Upgrade Para Contato Identificado

Quando o visitante informa dados:

- normalizar nome/email/telefone;
- criar/vincular `Contact`;
- criar `ContactChannelIdentity`;
- atualizar conversa com `externalUserHash`/`externalUserRef`;
- registrar evento `webchat.visitor.identified`.

## Endpoints Alvo

Namespace sugerido:

```text
/webchat/v1
```

Endpoints do MVP:

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/webchat/widget.js` | script publico |
| `GET` | `/webchat/embed` | iframe/painel |
| `POST` | `/webchat/v1/bootstrap` | valida widget/origem e cria sessao |
| `POST` | `/webchat/v1/messages` | visitante envia mensagem |
| `GET` | `/webchat/v1/messages` | visitante busca mensagens permitidas |
| `POST` | `/webchat/v1/identify` | visitante se identifica |
| `POST` | `/webchat/v1/close` | visitante encerra sessao |

Regras:

- `bootstrap` usa `publicKey` + `Origin`;
- demais rotas usam token de visitante;
- todas aplicam rate limit;
- nenhuma aceita `clientId` do browser.

## Realtime Visitante

Fase MVP pode usar:

```text
polling curto
```

Motivo:

- menor risco operacional;
- evita abrir WebSocket publico antes da prova de fluxo;
- simples para proxy/CDN.

Evolucao:

```text
SSE ou WebSocket publico por sessao
```

Nao reutilizar diretamente `/app/realtime`, porque ele e autenticado por sessao do app e entrega eventos de operador.

## Integracao Com Inbox

Quando mensagem inbound do visitante chegar:

1. Resolver widget e tenant.
2. Resolver/criar `WebchatSession`.
3. Resolver/criar `ContactChannelIdentity`.
4. Resolver/criar `Conversation` com:
   - `channel=webchat`;
   - `provider=converta_widget`;
   - `channelAccountId=widgetId`;
   - `externalUserHash=visitorIdHash`.
5. Criar `Message`/`InboundMessage`.
6. Criar/atualizar `ConversationRuntimeState`.
7. Publicar realtime para operadores pelo hub atual.

Resposta do operador:

1. Inbox envia outbound para conversa webchat.
2. Backend valida sessao ativa.
3. Persiste `OutboundMessage`/`Message`.
4. Disponibiliza para o visitante via polling/SSE/WebSocket.

## Integracao Futura Com Chatbot, IA E KB

### Chatbot

Fase futura:

- permitir `channel=webchat` como entrada de flows;
- usar roteamento/slots existentes;
- desabilitado por padrao;
- handoff para humano em baixa confianca.

### IA

Fase futura:

- `webchatAiEnabled=false` por padrao;
- usar `aiAssistantConfig` e `aiIntentQualification`;
- shadow antes de responder;
- nao responder automaticamente antes de evaluation/replay.

### Knowledge Base

Fase futura:

- usar apenas artigos `published`;
- respeitar tenant;
- shadow lookup primeiro;
- registrar `knowledge.article.used` somente quando habilitado.

## Integracao Com Public API

Public API nao deve autenticar visitante.

Reaproveitamento permitido:

- padroes de rate limit;
- auditoria;
- OpenAPI futura para endpoints administrativos;
- webhooks outbound para eventos webchat em fase posterior.

Nao fazer:

- usar API key do tenant no browser;
- expor contatos/conversas via widget;
- misturar `/public-api/v1` com `/webchat/v1`.

## Seguranca

### Rate Limit

Minimos:

- por IP;
- por widget;
- por sessao;
- por tenant;
- limite de mensagens por minuto;
- limite de bootstrap por origem.

### Spam Protection

Fases:

1. rate limit + dominio autorizado;
2. bloqueio por IP hash/sessao;
3. honeypot invisivel;
4. captcha apenas se abuso real justificar.

### Allowlist De Dominio

Obrigatorio:

- validar `Origin`;
- comparar hostname normalizado com `allowedDomains`;
- aceitar subdominios somente se configurado;
- logar rejeicoes sem dados sensiveis.

### Conteudo E PII

Regras:

- nao logar corpo da mensagem;
- limitar tamanho de mensagem;
- sanitizar HTML;
- bloquear script injection;
- comentario/dados pessoais seguem retencao LGPD do tenant.

## Multi-Tenant E Branding

Cada widget pertence a um tenant.

Config por tenant:

- nome do widget;
- dominios permitidos;
- logo/nome exibido;
- cor primaria;
- texto de boas-vindas;
- texto de privacidade;
- setor/fila padrao;
- horario/estado offline em fase posterior.

Feature flag:

```text
webchat
```

Default:

```text
business=false
government=false
```

Habilitacao por `Client.features.webchat`.

## Eventos E Auditoria

Eventos recomendados:

```text
webchat.widget.created
webchat.widget.updated
webchat.session.started
webchat.session.reused
webchat.session.expired
webchat.visitor.identified
webchat.message.received
webchat.message.delivered_to_visitor
webchat.origin.denied
webchat.rate_limited
```

Payload redigido:

```json
{
  "widgetId": "...",
  "sessionId": "...",
  "conversationId": "...",
  "channel": "webchat",
  "reason": "origin_denied"
}
```

Nao logar:

- corpo da mensagem;
- token de visitante;
- email/telefone bruto;
- IP bruto.

## Classificacao: Reaproveita, Migra, Novo

| Item | Classificacao | Observacao |
| --- | --- | --- |
| `/app/inbox` | Reaproveita | Operador atende webchat no inbox existente |
| `Conversation` | Reaproveita | `channel=webchat` |
| `Message`/`InboundMessage`/`OutboundMessage` | Reaproveita | Timeline e persistencia |
| `ContactChannelIdentity` | Reaproveita | Identidade externa do visitante |
| `Contact`/`Lead` | Reaproveita | Upgrade para visitante identificado |
| `Department`/`Queue` | Reaproveita | Roteamento inicial |
| Realtime do operador | Reaproveita | Notifica inbox apos inbound |
| Public API patterns | Reaproveita | Rate limit/auditoria, nao auth de visitante |
| Knowledge Base | Reaproveita futuro | Conteudo aprovado em fases posteriores |
| `WebchatWidget` | Novo | Configuracao publica por tenant |
| `WebchatSession` | Novo | Sessao anonima/identificada |
| Widget JS/iframe | Novo | Superficie publica |
| Realtime visitante | Novo | Polling/SSE/WebSocket publico |
| Feature flag `webchat` | Novo | Rollout controlado |

## Roadmap Recomendado

### Sprint 73C - Webchat Schema + App Settings MVP

Status: implementado em producao.

- models `WebchatSite`, `WebchatSettings` e `WebchatAllowedDomain`;
- migration aditiva;
- feature flag `webchat=false`;
- CRUD simples em `/app/webchat`;
- dominios permitidos;
- configuracoes iniciais de coleta/tema/mensagem de boas-vindas;
- sem widget, iframe, snippet funcional, sessao, mensagem ou realtime.

### Sprint 73D - Webchat Runtime Design

Status: concluido em `docs/saas/WEBCHAT_RUNTIME_DESIGN.md`.

Define sessao publica, endpoints `/webchat/v1`, identidade de visitante, entrada no inbox, estrategia de polling/SSE/WebSocket, seguranca, eventos e rollback. Nao implementa runtime.

### Sprint 73E - Webchat Session Bootstrap MVP

Status: implementado como runtime inicial sem mensagens.

- models `WebchatVisitor` e `WebchatSession`;
- `POST /webchat/v1/session`;
- `GET /webchat/v1/session/:token`;
- token de visitante gerado pelo backend e armazenado apenas como hash;
- validacao de site ativo, feature `webchat`, dominio permitido e rate limit basico;
- painel tecnico em `/app/webchat` para criar/restaurar sessao;
- sem widget visual, mensagem, polling, websocket, chatbot, IA ou inbox.

### Sprint 73F - Webchat Inbound Text MVP

Primeiro fluxo real:

- script/iframe simples;
- bootstrap com dominio autorizado;
- sessao anonima;
- envio de mensagem texto;
- persistencia `channel=webchat`;
- conversa aparece no inbox.

### Sprint 73G - Webchat Outbound + Visitor Polling

Completar ponta a ponta:

- operador responde no inbox;
- visitante recebe por polling;
- status basico de envio;
- expiracao de sessao;
- eventos redigidos.

### Sprint 73H - Webchat Realtime + Identification

Evoluir:

- SSE/WebSocket publico;
- identificacao opcional;
- vinculo com `Contact`/`Lead`;
- horario/offline;
- melhor UX mobile.

### Sprint 73I - Webchat Intelligence

Somente depois do E2E humano:

- Knowledge Base shadow;
- chatbot shadow;
- IA shadow;
- habilitacao gradual de resposta automatica;
- CSAT/NPS pos-chat.

## Riscos E Mitigacoes

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Spam/bot em site publico | Alto | rate limit, dominio autorizado, bloqueio por sessao/IP hash |
| Cross-tenant por publicKey | Alto | `publicKey` unico e toda query por `clientId` resolvido |
| Token de visitante vazado | Alto | token curto, hash no banco, escopo limitado |
| Usar token do app no widget | Alto | proibido; widget usa token proprio |
| CORS permissivo demais | Alto | validar `Origin` contra allowlist |
| Sobrecarga de realtime publico | Medio/alto | iniciar com polling e limites |
| LGPD sem aviso | Medio/alto | privacy text obrigatorio por widget |
| Widget quebrar layout do site | Medio | iframe isolado e CSS encapsulado |
| Duplicar conversas | Medio | visitorId local + sessao server-side |

## Criterios De Sucesso Do MVP

- `webchat=false` por padrao;
- widget configuravel por tenant;
- dominios autorizados;
- sessao anonima segura;
- mensagem inbound aparece no inbox;
- operador responde e visitante recebe;
- nenhum uso de API key no browser;
- logs sem PII/token;
- rollback por feature flag.

## Recomendacao Final

A proxima sprint correta e **Sprint 73C - Webchat Schema + App Settings MVP**.

Recorte recomendado:

- criar models aditivos `WebchatSite`, `WebchatSettings` e `WebchatAllowedDomain`;
- adicionar feature flag `webchat=false`;
- criar tela de configuracao em `/app/webchat`;
- manter apenas configuracao interna de sites, preferencias e dominios permitidos;
- nao publicar widget funcional ainda;
- nao alterar WhatsApp, Messenger, Instagram, IA, chatbot, Public API ou runtime de canais.
