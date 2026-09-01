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

- se `document.visibilityState === "visible"`, o app e considerado em foreground
  para som local, mesmo que `document.hasFocus()` seja `false`;
- isso cobre desktop/notebook com o inbox visivel e outra janela em foco;
- nao usar `document.hasFocus()` como bloqueio para tocar som local;
- se `document.visibilityState !== "visible"`, o app nao deve tentar tocar som
  local via JavaScript;
- em background, aba oculta, PWA minimizado ou tela travada, a notificacao deve
  ser feita via Web Push/Service Worker;
- no mobile, especialmente iOS/Android, JavaScript, timers e websocket podem ser
  suspensos em background; nao depender de audio local nesses estados.

Fluxo esperado:

1. WebSocket recebe `message.created`.
2. `AppRealtimeBridge` avalia se a pagina esta `visible`.
3. Se estiver `visible`, toca o som local configurado pelo sininho.
4. Se estiver `hidden`, nao toca audio local; o backend deve enviar Web Push se
   existir subscription elegivel.
5. O backend suprime Web Push apenas para subscriptions com presenca `visible`
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

## Polling fallback

O polling continua ativo.

Uso atual:

- atualiza a lista de conversas;
- complementa timeline quando socket falha ou evento e perdido;
- usa a mesma deduplicacao de notificacao;
- nao deve transformar hydration/historico em mensagem nova.

Regra operacional:

- WebSocket melhora latencia;
- REST/polling preserva consistencia.

Direcao alvo ainda nao totalmente implementada:

```text
Initial REST load
+
WebSocket as primary change signal
+
conversation-scoped invalidation/refetch
+
slow reconciliation polling
+
focus/reconnect reconciliation
+
active request cancellation
+
stale-response guard
+
deterministic timeline ordering
```

Plano:

- Phase 1, consistency hardening: DONE / PRODUCTION VALIDATED;
- Phase 2, WebSocket primary plus targeted list/timeline invalidation: OPEN;
- Phase 3, reduce polling to reconciliation/fallback and pause hidden tabs: OPEN;
- Phase 4, scale/load validation with 10/30/50 sessions: OPEN.

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

- RBAC realtime por departamento/ownership.
- Resync explicito apos reconnect.
- Migrar token da query string para `Sec-WebSocket-Protocol`.
- `conversation.updated` e `handoff.updated` dedicados.
- Pub/sub externo se houver multiplas instancias do backend.
- Medicao START/MID/END em expediente SECULT para correlacionar active app users, realtime connections, inbox presence, `/app/conversations` requests/min, query counts, runtime fallbacks, backend CPU e pressao DB.
