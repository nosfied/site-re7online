# Instagram Business Messaging Readiness

Este documento registra o estado final validado do canal Instagram no Converta apos as sprints 66R, 66S e 66U.

## Estado Atual

O canal Instagram esta operacional para:

- inbound real via webhook Meta assinado;
- persistencia de conversas e mensagens inbound;
- inbox omnichannel com filtro Instagram;
- resposta manual humana pelo operador;
- outbound texto simples, human-only, controlado por `outboundEnabled`.

O canal Instagram nao esta habilitado para:

- IA automatica;
- handoff automatico;
- campanhas;
- envio proativo;
- midias outbound;
- templates;
- qualquer envio sem conversa inbound previa.

## Trilha Meta Usada

A integracao Instagram usa a trilha:

```text
Instagram API with Instagram Login / Business Login for Instagram
```

O fluxo oficial de conexao apos aprovacao Meta e feito pelo console interno:

```text
/admin/tenants/:tenantKey/channels
```

O callback publico configurado no painel Meta e:

```text
https://converta.re7online.com/agent-api/meta/instagram/oauth/callback
```

O fallback legacy de review permanece acessivel diretamente, mas oculto do menu do app do cliente:

```text
/app/settings/channels/instagram
```

As duas superficies leem/escrevem a mesma estrutura `channelAccounts`. Tokens nunca devem aparecer em UI, API, logs ou screenshots.

## Permissoes da Trilha Atual

Permissoes aprovadas para o fluxo operacional atual:

- `instagram_business_basic`
- `instagram_business_manage_messages`

`instagram_business_manage_comments` e `pages_read_engagement` nao fazem parte do escopo operacional aprovado atual. Comentarios/private replies exigem sprint futura especifica.

## IDs Validados para Re7online

Tenant piloto:

```text
tenantKey=re7online
username=re7online
```

IDs:

```text
channelAccountId principal = 17841470790766048
externalAccountIds alias = ["17841402386330293"]
instagramBusinessLoginId = 26979723628382383
businessLoginUsername = re7online
facebookPageId = 388765477658592
metadata.source = instagram_business_login
```

Interpretacao:

- `17841470790766048` e o ID principal usado pelo Converta para a conta Instagram conectada.
- `17841402386330293` e o alias observado em callbacks como `message_edit`.
- `26979723628382383` e o ID retornado pela trilha Instagram Business Login.
- O alias 66R.3 deve ser preservado para resolver callbacks Meta sem cruzar tenants.

## Token

O token valido da trilha Instagram Business Login e salvo em:

```text
instagramBusinessAccessToken
```

Caracteristicas:

- prefixo observado: `IGAA`;
- tenant-scoped;
- nunca exposto em UI/API/log;
- usado preferencialmente para envio Instagram;
- status publico permitido: `tokenStatus=configured` ou `missing`;
- nunca registrar token completo, link OAuth completo com segredo, ou payload bruto.

## Inbound

Fluxo validado:

```text
Instagram Direct
-> Meta webhook /agent-api/meta/webhook
-> assinatura X-Hub-Signature-256
-> tenant resolution por channelAccountId/alias
-> instagram passive adapter
-> instagram inbound persistence
-> Conversation / InboundMessage / RuntimeState
-> /app/inbox filtro Instagram
```

Logs esperados:

```text
meta.webhook.signature.valid secretScope=instagram
meta.webhook.received object=instagram
channel.tenant_resolution.matched_enabled
instagram.inbound_persistence.persisted
```

Somente eventos com `sender`, `recipient`, `message.mid` e `message.text` podem ser persistidos como mensagem inbound.

Callbacks extras `message_edit` sem `message.text` continuam sendo recebidos pelo alias e devem ser ignorados como evento sem texto. Eles nao devem criar conversa, mensagem, lead ou runtime novo.

## Outbound Manual

O outbound manual Instagram usa:

```text
POST https://graph.instagram.com/{version}/me/messages
```

Token source:

```text
instagramBusinessAccessToken
```

Payload conceitual:

```json
{
  "messaging_type": "RESPONSE",
  "recipient": { "id": "<instagram_scoped_user_id>" },
  "message": { "text": "<operator_text>" }
}
```

Gates obrigatorios antes de enviar:

- `conversation.channel === "instagram"`;
- conversa precisa ter inbound previo;
- `externalUserRef` precisa existir e ser resolvivel;
- `channelAccount.enabled=true`;
- `runtimeEnabled=true`;
- `outboundEnabled=true`;
- `tokenStatus=configured`;
- token material presente;
- usuario operador autenticado;
- envio manual humano.

Persistencia:

- criar `OutboundMessage` somente apos sucesso da API;
- `channel=instagram`;
- `provider=meta`;
- `channelAccountId=17841470790766048`;
- registrar `providerMessageId`/`metaMessageId` quando retornado;
- atualizar timeline e runtime state.

Logs permitidos:

```text
instagram.outbound.attempt
instagram.outbound.sent
instagram.outbound.blocked
instagram.outbound.failed
```

Logs proibidos:

- token;
- ID externo puro em claro;
- texto sensivel fora do escopo operacional;
- payload bruto completo.

## Marco Critico: App Live/Public

O principal marco da investigacao foi a publicacao do app Meta.

Antes do app estar publicado/Live:

- webhook Instagram assinava corretamente;
- tenant resolution por alias funcionava;
- Business Login conectava e validava identidade;
- DM real chegava apenas como `message_edit` ou sem eventos uteis;
- teste oficial `messages` retornava `no_messaging_events`;
- nao havia `message.text` persistivel.

Depois do app Meta ser publicado/Live:

- a Meta passou a entregar payload `messages` completo;
- `instagram.inbound_persistence.persisted` ocorreu;
- `Conversation channel=instagram` foi criada;
- `InboundMessage channel=instagram` foi criada;
- `RuntimeState channel=instagram` foi criado;
- outbound manual retornou `status=200`;
- `OutboundMessage channel=instagram status=SENT` foi persistido;
- a resposta chegou no Instagram Direct real.

Conclusao: para demonstrar E2E no App Review, o app precisa estar em estado publicado/Live ou em uma configuracao de reviewer/tester que efetivamente entregue o payload `messages` completo.

## Estado de Compliance

Instagram esta configurado como atendimento humano manual:

- sem IA;
- sem bot;
- sem handoff automatico;
- sem campanha;
- sem envio proativo;
- sem reaproveitar token Messenger/Page como fonte principal de envio;
- sem persistir evento sem texto;
- isolado por tenant/channelAccount/alias.

WhatsApp e Messenger nao dependem dessa trilha e nao devem ser alterados ao ajustar Instagram.

## Checklist Operacional Antes de Novo Review

- App Meta publicado/Live.
- Redirect URI Instagram Business Login configurada.
- Webhook `https://converta.re7online.com/agent-api/meta/webhook` configurado.
- Campo `messages` assinado na trilha Instagram.
- Conta Instagram `@re7online` conectada pelo console `/admin/tenants/re7online/channels`.
- `tokenStatus=configured`.
- `instagramBusinessAccessToken` presente.
- `channelAccountId=17841470790766048`.
- `externalAccountIds` inclui `17841402386330293`.
- `outboundEnabled=true` apenas no tenant/canal usado no smoke.
- Conversa de teste criada sem PII.
- Inbound real aparece no inbox.
- Resposta manual chega no Instagram Direct.
- Nenhum token visivel no video.

## Evidencia Pos-Aprovacao

As permissoes `instagram_business_basic` e `instagram_business_manage_messages` estao aprovadas para a operacao atual. Manter como evidencia reutilizavel um screencast E2E curto, sem audio, demonstrando:

1. login no Converta;
2. conexao Instagram Business pelo console admin;
3. status conectado;
4. DM real chegando no inbox;
5. resposta manual no Converta;
6. resposta chegando no Instagram Direct.

Esse video deve ser reutilizado em auditorias internas, onboarding de novos tenants e futuras revalidacoes Meta, sem expor token, payload bruto ou dados pessoais.
