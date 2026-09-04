# Plano de notificacoes Push PWA

Este documento define a arquitetura alvo para notificacoes em segundo plano no
Converta PWA e registra a implementacao inicial da Sprint 66O.

## Diagnostico 66N.2

- Som disparado por JavaScript local funciona apenas com a aplicacao ativa em
  foreground e apos gesto do usuario, por politicas de autoplay dos navegadores.
- Em mobile, com app em segundo plano ou tela bloqueada, o navegador pode
  suspender JavaScript, timers e websocket. Ajustes visuais ou no player de som
  nao resolvem notificacao em background.
- Permissao `Notification` isolada nao cria notificacao quando nao existe
  Service Worker recebendo eventos `push`.
- A solucao profissional para tela bloqueada/background e Web Push com Service
  Worker, VAPID, subscriptions persistidas por usuario/tenant/dispositivo e
  disparo backend no evento inbound.
- No iOS, Web Push exige app adicionado a Tela de Inicio e iOS 16.4+; Safari ou
  Chrome abertos como aba comum nao garantem push em background.

## Estado atual apos 66O

- O inbox usa websocket/realtime enquanto a aplicacao esta aberta.
- O sininho controla som local e subscription push do dispositivo quando
  suportado.
- O som local depende de gesto do usuario e so e confiavel em foreground
  (`document.visibilityState === "visible"`).
- O app nao tenta tocar som local em background/tela travada; nesses estados, a
  responsabilidade e do Web Push nativo.
- Web Push foi implementado com Service Worker, VAPID, subscription persistida
  por tenant/usuario e disparo backend em mensagem inbound.
- Se VAPID nao estiver configurado, a aplicacao continua funcionando sem push e
  os endpoints retornam estado desabilitado/seguro.
- Android/Chrome suporta Web Push em browser e PWA instalado.
- iOS suporta Web Push apenas para apps adicionados a Tela de Inicio em iOS
  16.4+.

## Componentes implementados

### Service worker

- Arquivo publico `public/sw.js`.
- Recebe eventos `push`.
- Exibe notificacao com titulo e corpo genericos, sem conteudo sensivel.
- Ao clicar, abre ou foca `/app/inbox`.
- Nao intercepta APIs nem implementa cache/offline agressivo.

### VAPID

- Script:
  `npm run push:vapid:generate`
- Variaveis:
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `WEB_PUSH_SUBJECT`
- Apenas a public key e entregue ao frontend.
- A private key deve ficar somente no ambiente backend.

### Persistencia de subscriptions

Modelo implementado:

- `PushSubscription`
  - `id`
  - `clientId`
  - `userId`
  - `endpoint`
  - `p256dh`
  - `auth`
  - `userAgent`
  - `deviceLabel`
  - `createdAt`
  - `updatedAt`
  - `revokedAt`

Regras:

- Subscription pertence sempre a um usuario e tenant.
- `endpoint` e unico e pode ser atualizado de forma idempotente.
- Unsubscribe marca `revokedAt`.
- Endpoint morto `404/410` e revogado automaticamente.
- Nenhum payload de mensagem e armazenado na subscription.

### Endpoints

- `GET /app/push/status`
- `POST /app/push/subscribe`
- `DELETE /app/push/subscribe`

Todos exigem sessao do app e usam o tenant/usuario autenticado. O body nao
aceita tenant arbitrario.

### Envio de push

Disparador inicial:

- mensagem inbound nova publicada pelo realtime.

Escopo inicial:

- conversa atribuida: notifica o usuario atribuido;
- conversa em setor: notifica admins e usuarios ativos do setor;
- sem setor/atribuicao: notifica usuarios ativos do tenant.

O payload e redigido:

- title: `Nova mensagem no Converta`;
- body: `Voce recebeu uma nova mensagem.`;
- url: `/app/inbox`;
- tag tecnica para dedupe.

Nao inclui texto da mensagem, waId, PSID, IG user id, telefone, token ou raw.

### Presenca foreground/background

A presenca do app e enviada pelo frontend para `/app/push/presence` por
subscription/device.

Contrato atual:

- `visible=true`: a pagina esta em foreground real para Web Push e deve suprimir
  notificacao nativa daquele device/subscription;
- `visible=false`: a pagina esta em background/oculta e deve receber Web Push se
  elegivel;
- em desktop/notebook, foreground real para Web Push exige
  `document.visibilityState === "visible"` e `document.hasFocus() === true`;
- uma aba Converta selecionada em janela atras de outro sistema deve enviar
  background para Web Push, mesmo que `visibilityState` continue `visible`;
- `focused` continua enviado para diagnostico e para compor o estado foreground
  real de desktop;
- som local nao depende de `focused` e continua independente de Web Push;
- em mobile/PWA, a semantica de visibilidade validada permanece preservada para
  evitar regressao de lifecycle.

Regra anti-duplicidade:

- frontend em foreground real envia presenca `visible=true`;
- backend suprime push somente para subscriptions com `visible=true` recente;
- frontend hidden ou desktop visivel sem foco envia `visible=false`; backend pode
  enviar push;
- service worker ignora push recebido logo apos mensagem `converta.app_foreground`
  para evitar duplicidade residual em Android/desktop.

Nao reintroduzir:

- bloqueio de som por `document.hasFocus()`;
- acoplamento entre som local e a feature `browserPushNotifications`;
- polling agressivo em background;
- payload push com PII.

### Estado validado em producao

Status em 2026-09-03/2026-09-04:

- feature gate `browserPushNotifications` por tenant: DEPLOYED;
- opt-in por usuario no `/app`: DEPLOYED;
- infraestrutura reutilizada: `public/sw.js`, `PushSubscription`, VAPID
  canonico, `webPushService` e rotas `/app/push/*`;
- nenhum novo Service Worker, nenhuma nova identidade VAPID e nenhuma migration
  adicional na consolidacao semanal;
- reparo operacional: o worker passou a reutilizar a mesma identidade VAPID
  canonica de producao; nao documentar valores ou segredos;
- mobile/PWA preservado.

Matriz real validada:

- TRUE FOREGROUND: Converta visivel e focado suprime Web Push, realtime funciona
  e som local toca;
- BACKGROUND TAB: aba Converta oculta/background recebe Web Push visual;
- CLOSED TAB: todas as abas Converta fechadas, browser aberto, Web Push visual
  aparece e clique abre/foca o Converta;
- WINDOW BEHIND ANOTHER APPLICATION: aba Converta selecionada, mas janela sem
  foco real, passa a receber Web Push visual e preserva som local desktop.

Som nativo da notificacao continua controlado por navegador/sistema operacional
e nao deve ser descrito como garantido.

## Objetivo futuro

Enviar notificacoes push para operadores quando uma conversa elegivel receber
mensagem inbound ou evento operacional, respeitando tenant, setor, atribuicao,
permissoes e preferencia do usuario.

## Evolucoes planejadas

### Service worker

- Abrir conversa especifica ao clicar quando houver identificador interno seguro.
- Badge nativo/unread quando suportado.

### VAPID

- Rotacao deve revogar subscriptions antigas quando necessario.

### Persistencia de subscriptions

- Logout deve desativar ou revogar subscription local.
- Admin deve poder revogar dispositivos de um usuario.
- Campo de plataforma/dispositivo pode ser adicionado se a gestao de dispositivos
  crescer.

### Endpoints futuros de gestao

- `GET /app/push/devices`
- `DELETE /app/push/devices/:id`

## Envio de push

Disparadores iniciais:

- mensagem inbound nova;
- conversa transferida para setor/usuario;
- handoff humano solicitado.

O envio deve reutilizar a mesma politica de elegibilidade ja usada no realtime:

- usuario pertence ao tenant;
- usuario pode ver o setor;
- conversa atribuida ao usuario ou ao setor correto;
- nao notificar o proprio autor de outbound;
- nao duplicar notificacao para app visivel/foreground.

## Deduplicacao

Usar chave tecnica por evento:

- `messageId` ou `metaMessageId`;
- `conversationId`;
- `createdAt`;
- `eventType`.

O backend deve evitar reenvio em retry quando o push ja foi aceito pelo provedor.
O frontend deve tratar cliques repetidos sem abrir telas duplicadas.

## Payload seguro

Payload push nao deve conter:

- texto integral da mensagem quando houver risco LGPD;
- waId puro;
- PSID/IG user id;
- token;
- raw payload.

Payload recomendado:

- titulo: `Nova mensagem no Converta`;
- body curto e generico, ou nome do contato quando permitido;
- `conversationKey` interno seguro, se nao expuser identificador externo;
- `channel`;
- `tenantKey` apenas se necessario para roteamento e sem expor a terceiros.

## Badge/unread

Na primeira fase, badge deve ser derivado do contador ja existente do inbox.
Atualizacao nativa de badge pode ser implementada depois, pois suporte varia por
navegador e plataforma.

## iOS

Requisitos:

- usuario precisa instalar o PWA pela Tela de Inicio;
- iOS 16.4+;
- permissao de notificacao concedida no app instalado;
- service worker ativo no escopo do PWA.

Browsers iOS dentro do Safari/Chrome sem instalacao nao recebem push em segundo
plano de forma confiavel.

## Android

Android Chrome pode receber Web Push em PWA instalado e, em alguns casos, no
browser. Ainda assim, a UX recomendada e instalar o app.

## Rollout recomendado

1. Service worker passivo sem cache agressivo.
2. UI de permissao por usuario.
3. Persistencia de subscription em staging.
4. Envio manual de push de teste.
5. Envio em inbound para tenant piloto.
6. Monitorar entrega, erros e opt-out.
7. Rollout gradual por tenant.

## Riscos

- Notificar usuario errado por falha de escopo multi-tenant.
- Vazamento de PII em payload push.
- Duplicidade entre websocket e push.
- Subscriptions obsoletas gerando erro recorrente.
- iOS com comportamento diferente entre Safari, Chrome e standalone.

## Criterio para rollout operacional

- Migration `PushSubscription` aplicada.
- VAPID configurado por ambiente.
- Service worker validado em Android e iOS instalado.
- Teste multi-tenant com usuarios de setores diferentes.
- Opt-out e revogacao de dispositivo funcionando.
- Logs sem PII.
