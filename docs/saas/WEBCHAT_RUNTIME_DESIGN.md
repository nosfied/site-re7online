# Sprint 73D - Webchat Runtime Design

Data: 2026-06-21

Escopo: desenho tecnico e funcional do runtime Webchat. Nao houve alteracao de codigo, banco, migrations, widget, rotas publicas, runtime de canais, inbox, chatbot ou IA.

## Contexto

A Sprint 73C colocou em producao a fundacao administrativa do Webchat:

- `WebchatSite`;
- `WebchatSettings`;
- `WebchatAllowedDomain`;
- CRUD tenant-scoped em `/app/webchat`;
- feature flag `webchat=false` por padrao.

Antes da Sprint 73E ainda nao existia:

- widget publico;
- sessao publica de visitante;
- endpoints `/webchat/v1`;
- mensagens Webchat;
- realtime/polling publico;
- entrada de Webchat no Inbox.

Status apos Sprint 73E:

- `WebchatVisitor` e `WebchatSession` implementados;
- `POST /webchat/v1/session` implementado;
- `GET /webchat/v1/session/:token` implementado;
- criacao/recuperacao de sessao publica implementada;
- validacao de site ativo, feature `webchat` e dominios permitidos implementada;
- naquele momento, mensagens, polling, widget visual, realtime e inbox ainda estavam fora do runtime.

Status apos Sprint 73F:

- `POST /webchat/v1/messages` implementado para mensagem texto inbound;
- validacao de sessao, origem, site ativo e feature `webchat` reaproveitada;
- mensagem cria/atualiza `Contact`, `ContactChannelIdentity`, `Lead`, `Conversation`,
  `ConversationRuntimeState` e `InboundMessage` com `channel=webchat`;
- conversa passa a aparecer no `/app/inbox` e na timeline pelo mesmo caminho multicanal;
- outbound, widget publico final, polling publico, chatbot e IA continuam fora do runtime.

Status apos Sprint 73H:

- feature flag `webchatOutbound=false` criada para rollout controlado;
- resposta humana pelo Inbox para `Conversation.channel=webchat` liberada somente com `webchat=true` e `webchatOutbound=true`;
- outbound Webchat persiste `OutboundMessage channel=webchat provider=converta`;
- timeline do Inbox reflete a resposta humana persistida;
- sessoes invalidas/expiradas, site inativo e dominio nao permitido bloqueiam o envio com evento redigido `webchat.outbound.blocked`;
- a mensagem fica marcada como `delivery=pending_public_polling`, pois o visitante ainda nao possui endpoint publico de leitura;
- polling publico, widget final, chatbot e IA continuam fora do runtime.

Status apos Sprint 73I:

- `GET /webchat/v1/messages` implementado para polling publico do visitante;
- polling valida token de sessao, origem permitida, site ativo, sessao ativa/nao expirada, feature `webchat=true` e rate limit;
- retorno publico usa a timeline real (`InboundMessage` + `OutboundMessage`) com DTO seguro;
- cursor opaco e `limit` seguro foram adicionados;
- eventos redigidos `webchat.message.polled` e `webchat.polling.denied` foram definidos no runtime;
- widget final, WebSocket/SSE, chatbot e IA continuam fora do runtime.

Este documento define como o runtime deve nascer sem improvisar sobre WhatsApp, Messenger, Instagram ou Public API.

## Principios De Runtime

1. **DB tenant-scoped**: todo acesso parte de `WebchatSite.clientId`.
2. **Dominio autorizado obrigatorio**: nenhuma sessao publica deve iniciar fora de `WebchatAllowedDomain.active=true`.
3. **Token publico limitado**: visitante nunca usa sessao do `/app` nem API key publica.
4. **Texto primeiro**: o MVP runtime aceita apenas mensagem texto.
5. **Inbox como destino operacional**: mensagens validas criam/atualizam `Conversation` com `channel=webchat`.
6. **Polling antes de realtime complexo**: MVP deve ser previsivel e barato; SSE/WebSocket ficam para evolucao.
7. **Automacao desligada no inicio**: chatbot/IA/KB entram em shadow ou sprint propria.
8. **Rollback por tenant**: desligar `Client.features.webchat` deve parar bootstrap, envio e leitura publica.

## Arquitetura Alvo

```text
Site do cliente
  -> widget/script futuro
  -> /webchat/v1/session
  -> WebchatSite + WebchatAllowedDomain
  -> WebchatVisitor/WebchatSession
  -> /webchat/v1/messages
  -> Conversation channel=webchat
  -> InboundMessage/OutboundMessage
  -> /app/inbox
```

O runtime publico deve ficar separado de `/public-api/v1`. A Public API e para integracoes autenticadas por API key; o Webchat e para visitante final com token de sessao proprio.

## Sessao Publica

### Visitante Anonimo

Fluxo recomendado:

1. Widget carrega com `siteId` ou `publicKey` futuro.
2. Browser chama `POST /webchat/v1/session`.
3. Backend valida:
   - site ativo;
   - feature `webchat=true`;
   - origem em `WebchatAllowedDomain`;
   - rate limit por site/origem/IP hash;
   - `allowAnonymous=true` quando visitante nao fornece dados.
4. Backend cria ou reusa sessao anonima.
5. Backend retorna `visitorToken`, `sessionId`, configuracao publica minima e `expiresAt`.
6. Browser grava token em cookie/localStorage com escopo do dominio do cliente.

Dados que podem existir no token:

- `sessionId`;
- `siteId`;
- `clientId` indireto ou assinado;
- `expiresAt`;
- nonce.

Dados que nao devem ir no token:

- token interno do Converta;
- API key;
- ids sensiveis de provider;
- dados de outros tenants.

### Recuperacao De Sessao

O widget deve tentar recuperar a sessao com:

- cookie first-party do site;
- localStorage como fallback;
- `GET /webchat/v1/session` com `Authorization: Bearer <visitorToken>`.

Se a sessao estiver expirada:

- retornar `401 session_expired`;
- widget deve iniciar nova sessao;
- conversa anterior pode ser reaberta apenas se regra futura permitir.

### Visitante Identificado

O upgrade anonimo para identificado acontece quando o visitante informa:

- nome;
- email;
- telefone.

Regras:

- respeitar `WebchatSettings.collectName`;
- respeitar `collectEmail`;
- respeitar `collectPhone`;
- nao exigir dados quando `allowAnonymous=true`;
- se `allowAnonymous=false`, bloquear mensagem ate coleta minima definida.

## Identidade E Modelos Futuros

### WebchatVisitor

Modelo futuro recomendado:

| Campo | Uso |
| --- | --- |
| `id` | identificador interno |
| `clientId` | tenant scope |
| `siteId` | origem do widget |
| `visitorIdHash` | identidade anonima redigida |
| `contactId` | contato vinculado, opcional |
| `name` | nome declarado |
| `email` | email declarado |
| `phone` | telefone declarado |
| `metadata` | extensoes futuras |
| `createdAt/updatedAt` | auditoria |

### WebchatSession

Modelo futuro recomendado:

| Campo | Uso |
| --- | --- |
| `id` | sessao |
| `clientId` | tenant scope |
| `siteId` | origem |
| `visitorId` | visitante |
| `conversationId` | conversa no inbox |
| `tokenHash` | hash do token publico |
| `status` | active/closed/expired/blocked |
| `ipHash` | anti-abuso redigido |
| `userAgentHash` | anti-abuso redigido |
| `lastSeenAt` | atividade |
| `expiresAt` | expiracao |
| `createdAt/updatedAt` | auditoria |

### ContactChannelIdentity

Ao identificar o visitante, criar ou atualizar identidade:

```text
channel = webchat
externalId = visitorIdHash ou webchatVisitorId
contactId = Contact.id
clientId = tenant
```

Isso preserva o padrao multicanal sem vazar dados entre tenants.

## Endpoints Futuros

Namespace:

```text
/webchat/v1
```

### `GET /webchat/v1/session`

Objetivo: validar sessao atual.

Entrada:

- `Authorization: Bearer <visitorToken>`;
- `Origin`;
- opcional `siteId`.

Resposta segura:

- `sessionId`;
- `siteId`;
- `status`;
- `visitor`;
- configuracao publica minima;
- `expiresAt`.

### `POST /webchat/v1/session`

Objetivo: criar ou renovar sessao.

Entrada:

- `siteId` ou `publicKey`;
- dados opcionais de visitante;
- `Origin`.

Validacoes:

- feature `webchat`;
- site ativo;
- dominio permitido;
- spam/rate limit;
- coleta minima conforme settings.

### `GET /webchat/v1/messages`

Objetivo: buscar mensagens permitidas para a sessao.

Entrada:

- `Authorization: Bearer <visitorToken>`;
- `limit`;
- `cursor`;
- `since`.

Resposta:

- mensagens normalizadas;
- `direction`;
- `text`;
- `createdAt`;
- status publico basico.

Nao expor:

- raw payload;
- ids internos sensiveis;
- external user refs;
- tokens;
- dados de operador que nao sejam publicos.

### `POST /webchat/v1/messages`

Objetivo: receber mensagem texto do visitante.

Status: implementado como MVP inbound na Sprint 73F. Ainda nao envia resposta ao visitante.

Entrada:

- `sessionToken`;
- `text`.

Fluxo:

1. validar token de sessao;
2. validar dominio/origem;
3. aplicar rate limit;
4. criar/atualizar `Contact` e `ContactChannelIdentity`;
5. criar/atualizar `Conversation` se ainda nao existir;
6. criar `InboundMessage` na fonte usada pelo inbox;
7. atualizar `ConversationRuntimeState`;
8. registrar `Event` redigido `webchat.message.received`;
9. emitir realtime interno para operadores quando houver conexao ativa;
10. retornar mensagem normalizada.

## Integracao Com Inbox

Quando a primeira mensagem valida chegar:

1. resolver `clientId` pelo site;
2. localizar ou criar visitante;
3. localizar ou criar contato, se identificado;
4. criar `Conversation`:
   - `channel=webchat`;
   - `clientId`;
   - `contactId` quando existir;
   - `status=WAITING` ou equivalente ao padrao atual;
5. criar/atualizar `ConversationRuntimeState`;
6. rotear para departamento padrao futuro, se configurado;
7. registrar `InboundMessage`;
8. exibir no `/app/inbox`.

### Department Routing

MVP:

- usar fila geral do tenant.

Fase seguinte:

- `WebchatSite.defaultDepartmentId`;
- regras por horario;
- regras por tag/caminho do site.

### CRM Timeline

Eventos esperados:

- sessao iniciada;
- visitante identificado;
- mensagem recebida;
- mensagem enviada;
- sessao encerrada.

O CRM deve tratar Webchat como canal de relacionamento, nao como API tecnica.

## Realtime

### Polling

Recomendado para o primeiro canal E2E, mas somente depois do outbound humano estar controlado.

Vantagens:

- baixo risco operacional;
- facil de debugar;
- funciona em ambientes restritivos;
- sem infraestrutura extra.

Desvantagens:

- maior latencia percebida;
- mais requests.

Parametros iniciais:

- polling a cada 3-5 segundos quando janela aberta;
- backoff quando aba estiver oculta;
- pausa quando sessao fechada.
- `limit` maximo baixo por chamada;
- cursor ou `since` obrigatorio para evitar payload crescente;
- rate limit por sessao/IP hash;
- resposta vazia barata quando nao houver mensagens novas.

### Polling Publico Do Visitante

Endpoint alvo:

```text
GET /webchat/v1/messages
```

Parametros:

- `sessionToken`;
- `cursor` ou `since`;
- `limit`.

Validacoes:

- token de sessao valido;
- sessao ativa e nao expirada;
- `Origin` em `WebchatAllowedDomain.active=true`;
- dominio igual ao dominio da sessao;
- site ativo;
- feature `webchat=true`;
- rate limit por sessao/IP hash.

Retorno seguro:

```json
{
  "ok": true,
  "messages": [
    {
      "id": "public_message_id",
      "direction": "inbound|outbound",
      "type": "text",
      "text": "mensagem normalizada",
      "status": "sent|delivered|read|failed",
      "createdAt": "2026-06-21T10:00:00.000Z"
    }
  ],
  "page": {
    "limit": 30,
    "nextCursor": "opaque_cursor"
  }
}
```

Nao retornar:

- `waId`;
- `externalUserRef`;
- token bruto ou hash;
- `channelAccountId` interno;
- `rawPayload`;
- ids internos de operador;
- email/telefone do visitante;
- dados de outro tenant.

Ordenacao:

- estavel por `createdAt` + `id`;
- mensagens antigas e novas devem reconciliar sem duplicar;
- cursor opaco preferivel a page numerica.

Eventos:

- `webchat.message.polled`;
- `webchat.polling.denied`;
- `webchat.message.read` apenas se a chamada tambem confirmar leitura.

Logs:

- logar `clientId`, `siteId`, `sessionId`, contagem retornada, cursor presente/ausente;
- nunca logar token, texto completo ou IP bruto.

### SSE

Boa fase intermediaria.

Vantagens:

- servidor envia eventos em tempo quase real;
- mais simples que WebSocket;
- encaixa bem para fluxo servidor -> visitante.

Desvantagens:

- reconexao precisa ser bem tratada;
- pode exigir ajustes de proxy/timeouts.

### WebSocket

Nao recomendado para primeiro MVP.

Vantagens:

- bidirecional;
- menor latencia.

Desvantagens:

- mais superficie operacional;
- exige lifecycle e escala mais cuidadosos;
- maior risco para inicio do canal.

### Recomendacao

Status atual 73E/73F:

```text
POST mensagem visitante
realtime interno existente para operadores
```

Proxima fase recomendada:

```text
73H: outbound humano controlado - implementado
73I: polling publico controlado
73J: widget minimo
```

WebSocket so deve entrar se houver requisito real de baixa latencia ou volume que justifique.

## Outbound Humano Pelo Inbox

Objetivo: permitir que o operador responda conversas `channel=webchat` pelo `/app/inbox`, sem usar WhatsApp,
Messenger, Instagram ou Meta.

### Guardrails

O envio Webchat foi implementado para texto e deve ser liberado apenas quando:

- `Conversation.channel === "webchat"`;
- `Conversation.provider === "converta"`;
- feature `webchat=true`;
- feature `webchatOutbound=true`;
- `WebchatSite.status=active`;
- `WebchatSession.status=active`;
- sessao nao expirada;
- origem/domino da sessao ainda permitido;
- operador tem acesso RBAC/departamento;
- conversa esta em modo humano e permite resposta.

Se qualquer condicao falhar:

- nao criar `OutboundMessage` como enviado;
- retornar erro operacional claro ao Inbox;
- registrar `webchat.outbound.blocked` redigido.

### Persistencia

Usar `OutboundMessage` como fonte da timeline:

| Campo | Valor |
| --- | --- |
| `clientId` | tenant da conversa |
| `waId/waIdCanonical` | `Conversation.waId` sintetico `webchat:<hash>` |
| `channel` | `webchat` |
| `provider` | `converta` |
| `channelAccountId` | `WebchatSite.id` |
| `externalUserHash` | hash do visitante |
| `messageId` | `webchat:out:<siteId>:<hash>` |
| `externalMessageId` | nulo ou igual ao id publico gerado |
| `type` | `TEXT` no MVP |
| `status` | `SENT` no MVP quando persistido |
| `bodyText` | texto normalizado |
| `rawPayload` | metadados redigidos, sem token |

Tambem atualizar:

- `Conversation.lastOutboundAt`;
- `ConversationRuntimeState.lastOutboundAt`;
- `ConversationRuntimeState.lastOutboundMessageId`;
- status operacional conforme regra atual do Inbox, sem alterar canais Meta.

### Status Inicial

No MVP 73H, resposta Webchat nao depende de API externa. Portanto:

- `SENT`: mensagem persistida e pronta para polling futuro;
- `DELIVERED`: futuro, quando o widget confirmar recebimento;
- `READ`: futuro, quando o visitante abrir/confirmar leitura;
- `FAILED`: apenas para falha interna antes de persistir/disponibilizar.

`DELIVERED` e `READ` nao devem ser simulados no MVP.

### Separacao Dos Canais Meta

O caminho Webchat nao deve chamar:

- `sendTextMessage` WhatsApp;
- Messenger Graph API;
- Instagram Graph API;
- adapters Meta;
- templates Meta.

O dispatcher do Inbox deve tratar `webchat` em branch propria:

```text
channel=whatsapp   -> WhatsApp outbound atual
channel=messenger  -> Messenger outbound atual
channel=instagram  -> Instagram outbound atual
channel=webchat    -> persistir OutboundMessage local para polling
outro              -> bloquear
```

### Erros Ao Operador

Mensagens sugeridas:

- `Sessao Webchat expirada. O visitante precisa iniciar uma nova conversa.`
- `Envio por Webchat desativado neste tenant.`
- `Site Webchat inativo ou dominio nao permitido.`
- `Conversa Webchat fora do seu departamento.`

Nao exibir:

- token;
- hash de visitante;
- detalhes internos de schema;
- IP/origem bruta alem do dominio permitido quando necessario.

## Seguranca

### Allowed Domains

Usar `WebchatAllowedDomain`:

- normalizar dominio;
- validar `Origin`;
- validar `Referer` apenas como apoio, nunca como fonte unica;
- permitir wildcard somente em sprint futura e com cuidado.

Erros:

- `403 origin_not_allowed`;
- log `webchat.origin.denied` redigido.

### Anti-Spam

Camadas:

- rate limit por `siteId`;
- rate limit por `ipHash`;
- limite de tamanho de mensagem;
- limite de sessoes por IP hash;
- bloqueio por `visitorIdHash`;
- cooldown apos excesso.

### Captcha Opcional

Nao deve entrar no MVP inicial.

Pontos de ativacao futura:

- dominio publico com abuso;
- muitas sessoes anonimas;
- bursts de mensagens;
- comportamento suspeito.

### Abuse Detection

Eventos e sinais:

- muitas sessoes por IP hash;
- muitas mensagens por minuto;
- mensagens repetidas;
- dominios negados recorrentes;
- tentativas com token invalido.

Logs nunca devem incluir:

- IP bruto;
- token bruto;
- texto completo de mensagem quando nao necessario;
- dados sensiveis de visitante.

## Multi-Tenant

Tenant resolution:

```text
siteId/publicKey
  -> WebchatSite
  -> clientId
  -> Client.features.webchat
  -> WebchatAllowedDomain
```

Todas as queries devem filtrar por `clientId`.

Isolamento obrigatorio:

- sessao sempre pertence a um site;
- site sempre pertence a um client;
- conversa sempre pertence ao mesmo client;
- contato/lead sempre do mesmo client;
- mensagem nunca deve buscar conversa apenas por id sem `clientId`.

Branding:

- `WebchatSettings.theme`;
- mensagem de boas-vindas;
- coleta de dados;
- labels e cores futuras.

## Integracoes Futuras

| Integracao | Estrategia |
| --- | --- |
| Chatbot | permitir `channel=webchat` em flows apenas por flag futura |
| IA | iniciar com shadow; resposta automatica so depois do E2E humano |
| Knowledge Base | lookup shadow por tenant e tags |
| Public API | expor conversas/mensagens webchat nas rotas read-only ja existentes quando canal existir |
| Scheduling | permitir criar agendamento a partir de conversa Webchat em sprint futura |
| NPS | disparar pesquisa ao encerrar sessao/conversa |

## Feature Flags

Flags recomendadas:

| Flag | Default | Uso |
| --- | --- | --- |
| `webchat` | `false` | habilita modulo, settings, sessao, inbound e polling publico |
| `webchatOutbound` | `false` | habilita resposta humana pelo Inbox |

Regras:

- polling publico nao permite envio pelo operador;
- se `webchat=false`, todas as rotas publicas e operacoes do canal devem bloquear;
- rollout deve ser por tenant piloto antes de habilitar em qualquer perfil padrao.

## Eventos

Eventos minimos:

```text
webchat.session.started
webchat.session.recovered
webchat.session.closed
webchat.session.expired
webchat.visitor.identified
webchat.message.received
webchat.message.outbound_created
webchat.message.polled
webchat.message.read
webchat.outbound.blocked
webchat.polling.denied
webchat.origin.denied
webchat.rate_limited
webchat.abuse_detected
```

Evento nunca deve registrar:

- token;
- IP bruto;
- user agent bruto;
- payload sensivel;
- mensagem completa em log operacional amplo.

## Rollback

Rollback por tenant:

```text
Client.features.webchat=false
```

Efeito esperado:

- bootstrap retorna `feature_not_enabled`;
- novas sessoes nao iniciam;
- novas mensagens publicas nao entram;
- conversas existentes ficam preservadas no inbox para historico.

Rollback seletivo:

```text
Client.features.webchatOutbound=false
```

Efeito esperado:

- inbound permanece ativo, se `webchat=true`;
- operador deixa de responder pelo Webchat;
- visitante ainda pode consultar mensagens por polling enquanto `webchat=true`;
- timeline e historico permanecem preservados.

Rollback operacional:

- desativar `WebchatSite.status`;
- desativar dominios em `WebchatAllowedDomain.active=false`;
- desligar job/realtime futuro, se existir;
- manter tabelas inertes.

Rollback de release:

- reverter commit/redeploy;
- tabelas podem permanecer inertes;
- nao remover dados sem plano de retencao.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Cross-tenant por `siteId` | Alto | todas as queries por `clientId`; testes de isolamento |
| Origem falsa | Alto | validar `Origin` contra allowlist; token assinado |
| Spam publico | Alto | rate limit, cooldown, captcha futuro |
| Vazamento de token | Alto | token curto, hash no banco, nunca logar |
| Duplicidade de conversa | Medio | `visitorIdHash` + sessao ativa + idempotencia |
| Sobrecarga por polling | Medio | backoff, limites por sessao e intervalo minimo |
| LGPD incompleta | Medio/alto | privacy text e coleta opcional por tenant |
| Operador confundir canal | Medio | badge `Webchat` no inbox em sprint runtime |
| Resposta em sessao expirada | Medio | bloquear outbound e instruir nova sessao |
| Visitante nao receber mensagem persistida | Medio | polling com cursor, status publico e testes E2E |
| Mistura com canais Meta | Alto | branch propria `channel=webchat`, sem adapters Meta |

## Ordem Recomendada De Implementacao

### Sprint 73E - Webchat Public Session Schema + Bootstrap

Status: implementado como primeiro runtime real, sem mensagens.

- criar modelos `WebchatVisitor` e `WebchatSession`;
- criar `POST/GET /webchat/v1/session`;
- validar `Origin` e allowed domains;
- token assinado/hash;
- sem mensagem ainda.

### Sprint 73F - Webchat Inbound Text MVP

- `POST /webchat/v1/messages`;
- criar conversa `channel=webchat`;
- persistir inbound texto;
- aparecer no inbox;
- sem outbound visitante ainda.

### Sprint 73G - Webchat Outbound + Polling Design

Status: design documental, sem alteracao funcional.

- definir resposta humana pelo Inbox;
- definir polling publico do visitante;
- definir `webchatOutbound` e rollback por `webchat`;
- definir eventos e rollback;
- separar implementacoes em 73H/73I/73J.

### Sprint 73H - Webchat Human Outbound Controlled MVP

- habilitar resposta humana pelo Inbox apenas para tenant piloto;
- persistir `OutboundMessage channel=webchat`;
- nao criar widget final;
- nao criar IA/chatbot;
- manter polling publico desligado ate 73I;
- validar que WhatsApp/Messenger/Instagram nao sao chamados.

Status: implementado como outbound humano controlado e persistido. O visitante ainda nao recebe a mensagem porque `GET /webchat/v1/messages` fica para 73I.

### Sprint 73I - Webchat Visitor Polling MVP

- `GET /webchat/v1/messages`;
- visitante recebe inbound/outbound seguros por polling;
- status publico basico;
- cursor/since;
- rate limit e backoff;
- sem widget final ainda.

Status: implementado como polling publico controlado. O visitante consegue buscar mensagens inbound/outbound da propria sessao com DTO seguro. Ainda nao ha widget final, WebSocket/SSE, IA ou chatbot.

### Sprint 73J - Webchat Minimal Widget

- widget tecnico minimo embutivel;
- abrir/fechar painel;
- criar/restaurar sessao;
- enviar inbound;
- consultar polling;
- sem anexos e sem IA.

### Sprint 73K - Identification + Department Routing

- upgrade anonimo -> identificado;
- vincular `Contact`;
- roteamento por departamento;
- eventos CRM.

### Sprint 73L - Realtime/SSE + Intelligence Shadow

- SSE opcional;
- KB/IA/chatbot em shadow;
- NPS pos-chat em design/runtime posterior.

## Criterios De Sucesso Do Runtime MVP

- `webchat=false` continua bloqueando tudo;
- dominio nao autorizado recebe 403;
- visitante anonimo consegue iniciar sessao quando permitido;
- mensagem texto cria conversa Webchat no inbox;
- operador responde e visitante recebe por polling;
- nenhum token/API key aparece no browser alem do token de visitante;
- logs redigidos;
- rollback por tenant funciona sem migration.

## Confirmacao 73G

Esta sprint alterou apenas documentacao. Nao houve:

- codigo de runtime;
- migration;
- novo endpoint;
- habilitacao de outbound;
- widget publico;
- alteracao em WhatsApp, Messenger ou Instagram;
- alteracao em chatbot, IA, Inbox ou Public API.

## Confirmacao 73D

Esta sprint alterou apenas documentacao. Nao houve:

- codigo de runtime;
- migration;
- widget;
- endpoint publico;
- alteracao em WhatsApp, Messenger ou Instagram;
- alteracao em chatbot, IA, Inbox ou Public API.
