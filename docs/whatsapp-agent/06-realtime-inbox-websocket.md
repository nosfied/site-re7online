# Realtime do Inbox — WebSocket + REST fallback

Este documento registra a arquitetura atual do realtime do `/app/inbox` no
Converta / WhatsApp Agent.

## Decisao consolidada

O realtime do inbox usa WebSocket como camada rapida de entrega de eventos, mas
REST continua sendo a fonte de verdade.

Principio:

- WebSocket entrega eventos recentes com baixa latencia.
- REST/polling corrige estado, hidrata telas, recupera perda de evento e continua
  funcionando como fallback.
- O backend nao depende de Redis/pubsub nesta etapa.
- O modelo de dados nao foi alterado para a Sprint Realtime 1.x.

## Backend

Arquivos principais:

- `apps/whatsapp-agent/src/realtime/events.ts`
- `apps/whatsapp-agent/src/realtime/hub.ts`
- `apps/whatsapp-agent/src/realtime/websocket.ts`
- `apps/whatsapp-agent/src/index.ts`
- `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`

Dependencia:

- `ws`

Endpoint WebSocket:

- interno: `/app/realtime`
- via proxy de producao: `/agent-api/app/realtime`
- URL publica esperada: `wss://converta.re7online.com/agent-api/app/realtime`

Autenticacao:

- usa o mesmo token do `/app`;
- nesta fase o token e enviado por query string;
- token ausente ou invalido rejeita o socket;
- token nao deve ser logado.

Escopo de entrega:

- cada conexao e registrada por `clientId`, `userId` e `role`;
- a filtragem obrigatoria atual e por `clientId`;
- RBAC fino por departamento fica como evolucao futura.

Evento publicado:

```ts
{
  type: "message.created",
  clientId: string,
  waId: string,
  waIdCanonical?: string | null,
  message: InboxMessageItem,
  mode?: "BOT" | "HUMAN" | null,
  handoffStatus?: "none" | "pending" | "active" | null
}
```

Publicacao:

- ocorre depois do inbound ser persistido com sucesso;
- o payload usa shape compativel com a timeline REST;
- nao envia `rawPayload` cru;
- inclui `mode` e `handoffStatus` para a regra de notificacao humana.

Logs relevantes:

- `realtime.websocket.connected`
- `realtime.websocket.disconnected`
- `realtime.websocket.auth_failed`
- `realtime.event.published`
- `realtime.event.delivered`

## Frontend

Arquivos principais:

- `src/lib/appRealtime.ts`
- `src/components/app/AppRealtimeBridge.tsx`
- `src/app/app/inbox/page.tsx`

### Bridge global

O WebSocket fica no nivel global do `/app`, via `AppRealtimeBridge`.

Motivo:

- notificacoes devem funcionar no inbox, campanhas, templates, relatorios e outras
  telas do portal do cliente;
- navegar entre paginas do `/app` nao deve abrir multiplos sockets;
- o socket e fechado no logout/saida do `/app`.

O bridge:

- carrega a sessao atual;
- abre uma unica conexao WebSocket por sessao;
- reconecta conforme o client realtime;
- despacha eventos globais por `window.dispatchEvent`;
- centraliza a decisao de som/notificacao.

### Event bus do frontend

O frontend usa eventos nativos do browser:

- `re7:inbox-realtime`: entrega eventos realtime para o inbox;
- `re7:inbox-realtime-status`: entrega status local do socket para reconciliacao
  em reconnect;
- `re7:app-notification`: entrega candidatos aceitos para som/notificacao.

Nao ha biblioteca externa para event bus.

## Regras de notificacao

A decisao central fica em `src/lib/appRealtime.ts`.

Chave de deduplicacao:

- preferencial: `message:${messageId}`;
- fallback: `message:${conversationIdentity}:${createdAt}:${bodyText}:${direction}`.

A mesma deduplicacao vale para:

- WebSocket;
- polling;
- handoff humano.

Regras atuais:

- outbound nunca notifica;
- conversa em modo `BOT` com `handoffStatus=none` nao notifica;
- conversa humana (`mode=HUMAN`) ou `handoffStatus=pending|active` pode notificar;
- evento duplicado nao toca som nem abre Notification API;
- conversa nao ativa usa som principal;
- conversa ativa e visivel usa som suave;
- conversa ativa nao recebe ponto verde/unread;
- conversa nao ativa ou ausencia de conversa selecionada recebe ponto verde/unread.

### Contrato de som local vs push nativo

Este contrato evita regressao entre desktop/notebook e mobile:

- som local e Web Push sao canais independentes;
- para som local em desktop/notebook, uma pagina Converta viva pode tocar som
  quando a preferencia local esta ativa, inclusive em aba oculta/background ou
  janela desfocada, sujeito a politica de autoplay do navegador;
- nao usar `document.hasFocus()` como bloqueio para tocar som local;
- em mobile/PWA, especialmente iOS/Android, JavaScript, timers e websocket podem
  ser suspensos em background; nesses estados, a notificacao confiavel deve ser
  Web Push/Service Worker;
- para supressao de Web Push em desktop, foreground real exige
  `document.visibilityState === "visible"` e `document.hasFocus() === true`;
- uma aba Converta selecionada em uma janela atras de outro sistema deve ser
  tratada como background para Web Push;
- em mobile/PWA, a semantica de visibilidade validada permanece preservada.

Fluxo esperado:

1. WebSocket recebe `message.created`.
2. `AppRealtimeBridge` avalia elegibilidade de som local e presenca Web Push
   separadamente.
3. Se o som local estiver habilitado e o runtime permitir, toca o som configurado
   pelo sininho.
4. Se a pagina nao estiver em foreground real para Web Push, o frontend envia
   presenca background prontamente por `visibilitychange`, `focus` e `blur`.
5. O backend suprime Web Push apenas para subscriptions com presenca foreground
   recente.

Sons:

- `public/sounds/inbox-notification.wav`: som principal;
- `public/sounds/inbox-active-message.wav`: som suave para mensagem na conversa
  aberta.

Observacao de navegador:

- apos `F5`/reload, Chrome e outros navegadores podem bloquear audio programatico
  ate haver interacao real do usuario na pagina atual;
- browsers podem limitar ou suspender JavaScript em abas ocultas/background;
- notificacoes visuais e ponto verde continuam funcionando;
- nao tentar burlar autoplay policy ou tocar audio local com a tela bloqueada.
- no iPhone/iOS, nao inicializar audio na tela de login; o desbloqueio de audio
  deve ocorrer somente em area autenticada do app, apos gesto do usuario.

### iPhone, teclado e safe-area

O inbox mobile usa `visualViewport` para ajustar a altura operacional do app,
mas iOS/WebKit tem comportamento proprio quando o teclado abre:

- o teclado pode reduzir o visual viewport sem alterar o layout viewport;
- `env(safe-area-inset-bottom)` pode continuar positivo mesmo com o teclado
  aberto, criando uma faixa vazia acima do teclado;
- por isso, enquanto o teclado mobile esta aberto no iOS, o app zera o
  `--safe-bottom-effective`;
- ao fechar o teclado no iOS, a altura do app volta para `100dvh` para evitar
  que uma altura reduzida fique presa no PWA.

Nao trocar essa regra por `100vh` global nem aplicar a correcao de iOS no
Android: o Android ja usa o comportamento padrao de resize do viewport.

## Read-state e primeira nao lida

O read-state do `/app/inbox` usa:

- `readState.lastReadAtByConversationKey`;
- `readState.manuallyUnreadByConversationKey`;
- `lastMessage.direction`;
- `lastMessage.createdAt`;
- `lastInboundAt`.

Ao abrir conversa:

1. captura `lastReadAt` antes de marcar como lida;
2. carrega a timeline recente;
3. encontra a primeira inbound com `createdAt > lastReadAt`;
4. renderiza o separador `Mensagens nao lidas`;
5. faz scroll para a ancora;
6. so depois marca a conversa como lida.

Para conversas ja lidas:

- a hydration busca a janela recente;
- renderiza em ordem crescente;
- scroll final e aplicado.

Importante:

- hydration/historico REST nao cria unread;
- resposta atrasada de timeline e ignorada por `detailRequestSeqRef`;
- polling de timeline nao roda enquanto a conversa selecionada ainda esta hidratando.

## Consistencia da timeline - incidentes SECULT

Incidente real auditado em 2026-09-01:

- causa raiz: resposta frontend obsoleta/race ao alternar rapidamente entre conversas;
- nao houve evidencia de mistura de dados no banco;
- backend tenant isolation e timeline cache isolation permaneceram corretos.

Hotfix anterior:

```text
5e020a78126e5a095bcf7eb6b30d837052901652
fix(inbox): reject stale cross-conversation timeline updates
```

Phase 1 validada em producao:

```text
9881521b712173dbe8cb66e0d55a7ae710a0e903
fix(inbox): harden timeline request isolation and ordering
```

Estado atual:

- active request abort: PASS;
- sequence guard: PRESERVED;
- identity guard: PRESERVED;
- cross-conversation protection: PASS;
- timeline ordering: DETERMINISTIC;
- polling: UNCHANGED;
- realtime: UNCHANGED;
- multitenant isolation: PASS.

```text
INBOX TIMELINE CONSISTENCY PHASE 1:
CLOSED / PRODUCTION VALIDATED
```

## Lista lateral do inbox

A lista lateral foi estabilizada para evitar efeito visual de sobe/desce:

- refresh/polling atualiza conversas existentes no lugar;
- polling nao reordena a lista inteira;
- o scroll da lista lateral e preservado durante refresh;
- o container usa `overflow-anchor: none` via classe utilitaria;
- selecao/hydration atualiza payload operacional da conversa no lugar;
- reordenacao por atividade fica reservada para eventos reais, como inbound
  realtime ou envio local.

Motivo:

- clicar em uma conversa nao deve fazer a lista recarregar;
- `Carregando conversas...` nao deve aparecer em selecao normal;
- a barra de rolagem lateral nao deve pular em polling.

## WebSocket-driven invalidation + polling fallback

Phase 2 usa WebSocket como sinal primario de mudanca do Inbox e mantem polling
como reconciliacao lenta/fallback.

Uso atual:

- eventos `message.created`, `message.status.updated`,
  `conversation.handoff.updated` e `conversation.read_state.updated` invalidam a
  lista de conversas;
- eventos de mensagem/status/handoff que pertencem a conversa selecionada
  invalidam a timeline selecionada;
- eventos de read-state nao recarregam timeline;
- invalidacoes rapidas sao coalescidas antes do REST refetch;
- reconnect do WebSocket refaz lista e timeline selecionada;
- retorno de foco/visibilidade refaz lista e timeline selecionada;
- polling lento complementa timeline quando socket falha ou evento e perdido;
- usa a mesma deduplicacao de notificacao;
- nao deve transformar hydration/historico em mensagem nova.

Regra operacional:

- WebSocket melhora latencia;
- REST preserva consistencia;
- polling nao e mais o mecanismo primario de atualizacao da lista.

Intervalos atuais:

```text
Inbox list fallback polling: 30000ms
Selected timeline fallback refresh: 60000ms
Realtime refetch debounce: 250ms
```

Plano:

- Phase 1, consistency hardening: DONE / PRODUCTION VALIDATED;
- Phase 2, WebSocket primary plus targeted list/timeline invalidation: DONE /
  PRODUCTION VALIDATED;
- Phase 3, pause hidden-tab polling and broader route query optimization: OPEN;
- Phase 4, scale/load validation with 10/30/50 sessions: OPEN.

Evidencia que motivou Phase 2:

- EXTRA 14:17 em 2026-09-02: `/app/conversations` ~103 req/min, 1232 queries/min,
  ~12 queries/request, CPU media ~87.5%, DB pressure NORMAL;
- END 17:27 em 2026-09-02: effective Inbox online 0, CPU media ~8.2%, DB
  pressure NORMAL.
- MID 03/09 pos-Phase 2: 41 `/app/conversations` req/min, 432
  `inbox.list.query_count`/60s, CPU media ~37.3%, DB pressure NORMAL.
- END 03/09 pos-Phase 2: effective Inbox online 0, `/app/conversations` 0
  observed, CPU media ~11.6%, DB pressure NORMAL.

Conclusao: polling de `/app/conversations` e contribuidor operacional
fortemente suspeito para CPU em expediente. A decisao de Phase 2 esta fechada,
mas capacidade final ainda exige validacao de carga/uso real pos-deploy.

Recheck residual em 2026-09-10 no HEAD `52a2d0b8`: a carga nao voltou pelo
dual-read nem por fallback de runtime. Em 60s, `/app/conversations` registrou
21 req/min, 246 `inbox.list.query_count`/min, ~11.7 queries/request,
`runtime_state_fallback=0` e `multichannel.dual_read=0`. CPU do backend ficou
em ~60-69% durante a amostra, com memoria estavel e DB pressure NORMAL. A
classificacao continua sendo custo residual de listagem/polling da Inbox, nao
falha da ponte realtime ou retry hibrido.

Auditoria de query shape no mesmo dia confirmou que a listagem ja usa batching
para leads, inbound/outbound preview, runtime state, assignee, departments,
queues e channel state. O custo residual e majoritariamente overhead fixo por
refresh, nao N+1 dominante. O primeiro patch seguro aplicado removeu apenas a
leitura duplicada de `Client.features/profile` no caminho `/app/conversations`,
reutilizando os dados ja carregados por `getScopedClientById()` na mesma
request. Isso reduz aproximadamente uma query fixa por refresh sem cache global
e sem alterar runtime, read state, channel state, previews, RBAC ou tenant
isolation. O impacto real em CPU permanece pendente de janela comparavel
pos-deploy.

Auditoria subsequente no HEAD `48c206fa` isolou `channel_state_batch` como o
maior stage restante da rota, com media ~615ms e p95 ~1411ms na amostra
operacional. O stage nao fazia chamada externa nem N+1 de consultas, mas
materializava historico de outbound Web Session para calcular aviso de troca de
identidade: na forma SECULT observada, 251 identidades geravam cerca de 10.3k
linhas retornadas por refresh. A otimizacao escolhida mantem as tres consultas
tenant-scoped do stage, preserva a verdade de `ChannelAccount`/lifecycle por
request e limita o historico a ultima linha por identidade via SQL parametrizado.
Nao ha cache global, cache de estado de canal, mudanca de polling ou alteracao
de realtime.

Validacao comparavel pos-deploy no HEAD `1aae26b5` em 2026-09-10, durante
janela real de ~5m10s com 88 requests para `/app/conversations`, registrou
~17 req/min, ~10.7 queries/request, `runtime_state_fallback=0` e
`multichannel.dual_read=0`. A CPU media do backend ficou em ~14.0% com um pico
isolado de 69%, worker ~0.3%, memoria estavel e health PASS. O
`channel_state_batch` SECULT caiu para media de intervalo ~189ms; o p95
cumulativo desde o restart ficou ~692ms. A otimizacao esta classificada como
REAL VALIDATED / IMPROVED, com proximos hotspots provaveis em
`last_message_lookup` e `runtime_state_lookup`. A medicao nao alterou
polling/realtime e nao executou mutation.

Gap exposto por Phase 2: mensagens `message.created` geradas no worker Web
Session nao chegavam ao WebSocket do backend e eram mascaradas pelo polling
agressivo anterior. O fix `12eb83db` reutilizou a ponte worker->backend
existente e foi validado com smoke real controlado no Demo. Isso nao justificou
reverter o polling lento.

Validacao real de notificacoes apos os fixes:

- foreground real: Converta visivel e focado suprime Web Push, realtime e som
  local funcionam;
- aba em background: Web Push visual aparece e som local desktop permanece
  independente;
- todas as abas fechadas: Web Push visual aparece e clique abre/foca o Converta;
- janela Converta atras de outro sistema: Web Push visual aparece, som local
  continua funcionando e realtime permanece funcional.

## Nginx em producao

O proxy precisa suportar upgrade WebSocket.

Bloco esperado:

```nginx
location /agent-api/app/realtime {
    proxy_pass http://127.0.0.1:3001/app/realtime;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Validacao manual recomendada

1. Abrir `/app/inbox`.
2. Confirmar socket `101 Switching Protocols` no DevTools.
3. Receber inbound humano em conversa nao aberta:
   - lista atualiza;
   - ponto verde aparece;
   - som principal toca uma vez.
4. Receber inbound na conversa aberta:
   - timeline atualiza;
   - som suave toca uma vez;
   - nao cria ponto verde.
5. Abrir conversa com varias nao lidas:
   - separador `Mensagens nao lidas` aparece;
   - scroll vai para a primeira nao lida.
6. Abrir conversa ja lida:
   - scroll vai para o final.
7. Navegar para `/app/campaigns` ou `/app/templates`:
   - socket continua ativo;
   - inbound humano em conversa nao ativa toca som principal.
8. Desconectar/recarregar:
   - polling continua trazendo estado.

## Pendencias tecnicas conhecidas

- Migrar token da query string para `Sec-WebSocket-Protocol`.
- `conversation.updated` e `handoff.updated` dedicados.
- Pub/sub externo se houver multiplas instancias do backend.
- Proxima bateria de medicao de carga real em 2026-09-08, com START, MID, EXTRA
  e END, para correlacionar active app users, realtime connections, inbox
  presence, `/app/conversations` requests/min, query counts, runtime fallbacks,
  backend CPU e pressao DB.
