# Plano de notificacoes Push PWA

Este documento define a arquitetura alvo para notificacoes em segundo plano no
Converta PWA. Ele nao ativa push real nesta etapa.

## Estado atual

- O inbox usa websocket/realtime enquanto a aplicacao esta aberta.
- O som local depende de gesto do usuario apos reload, por politica de autoplay
  dos navegadores.
- Em mobile, websocket nao garante notificacao quando o app esta fechado,
  suspenso ou em segundo plano.
- Android/Chrome suporta Web Push em browser e PWA instalado.
- iOS suporta Web Push apenas para apps adicionados a Tela de Inicio em iOS
  16.4+.

## Objetivo futuro

Enviar notificacoes push para operadores quando uma conversa elegivel receber
mensagem inbound ou evento operacional, respeitando tenant, setor, atribuicao,
permissoes e preferencia do usuario.

## Componentes necessarios

### Service worker

- Registrar service worker somente para o app.
- Receber eventos `push`.
- Exibir notificacao com titulo, resumo seguro e identificador tecnico.
- Abrir `/app/inbox` ou conversa especifica ao clicar.
- Nao interceptar APIs de forma agressiva.
- Nao implementar offline complexo no primeiro ciclo.

### VAPID

- Criar par VAPID por ambiente.
- Armazenar secrets apenas no backend.
- Public key pode ser entregue ao frontend.
- Rotacao deve revogar subscriptions antigas quando necessario.

### Persistencia de subscriptions

Modelo futuro sugerido:

- `PushSubscription`
  - `id`
  - `clientId`
  - `userId`
  - `endpoint`
  - `p256dh`
  - `auth`
  - `userAgent`
  - `deviceLabel`
  - `platform`
  - `enabled`
  - `createdAt`
  - `updatedAt`
  - `revokedAt`

Regras:

- Subscription pertence sempre a um usuario e tenant.
- Logout deve desativar ou revogar subscription local.
- Admin deve poder revogar dispositivos de um usuario.
- Nunca compartilhar subscription entre tenants.

### Endpoints futuros

- `POST /app/push/subscribe`
- `POST /app/push/unsubscribe`
- `GET /app/push/devices`
- `DELETE /app/push/devices/:id`

Todos exigem sessao do app e escopo do tenant.

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
- nao duplicar notificacao para conversa aberta em foco.

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

## Criterio para implementar push real

- Modelo de dados aprovado.
- VAPID configurado por ambiente.
- Service worker validado em Android e iOS instalado.
- Teste multi-tenant com usuario de setores diferentes.
- Opt-out e revogacao de dispositivo funcionando.
- Logs sem PII.
