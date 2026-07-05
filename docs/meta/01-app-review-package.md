# Meta App Review Package

Este pacote descreve o uso do Converta para revisão da Meta. O foco atual do novo review e Instagram Business Messaging E2E: conectar Instagram Business, receber DM real no inbox omnichannel e responder manualmente pelo Converta, com WhatsApp e Messenger preservados.

## Visao Geral

O Converta e uma plataforma SaaS multitenant de atendimento e CRM conversacional. Cada tenant configura suas contas de canal em `channelAccounts`, com isolamento por tenant, canal, provider e `channelAccountId`.

No piloto atual:

- Tenant piloto: `re7online`
- Canal principal do review: Instagram
- Provider: Meta
- Modo operacional: inbound Instagram + resposta manual humana
- Automacao Instagram: desativada
- IA Instagram: desativada
- Handoff automatico Instagram: desativado
- Campanhas Instagram: desativadas
- Envio proativo Instagram: desativado
- Outbound Instagram: somente humano, somente quando `outboundEnabled=true`

O app nao usa tokens globais para Instagram. O token `IGAA` da trilha Instagram Business Login e salvo no campo `instagramBusinessAccessToken` da `channelAccount` do tenant e nunca e exposto na UI, API ou logs.

## Canais Suportados

- WhatsApp: operacional legado e multicanal shadow-write/dual-read saudavel.
- Facebook/Messenger: inbound real, inbox omnichannel, timeline, resposta manual humana.
- Instagram: inbound real, inbox omnichannel, timeline e resposta manual humana, human-only.

## Arquitetura de Seguranca

- Webhook Meta assinado com `X-Hub-Signature-256`.
- Token armazenado por tenant/channelAccount.
- Nenhum token retornado pelas APIs administrativas.
- PSID/Instagram scoped user id nao e exposto no frontend.
- `externalUserRef` e criptografado para permitir resposta manual segura.
- Logs usam hash/redaction para identificadores externos.
- `channelAccountId` precisa bater com tenant/canal/provider para envio.
- Falha de token, recipient ou mismatch retorna erro seguro e nao envia mensagem.

## Fluxo do Usuario

1. Operador acessa o Converta.
2. Abre o inbox omnichannel.
3. Filtra por Instagram.
4. Cliente envia DM real para o Instagram conectado.
5. Mensagem inbound aparece na conversa Instagram.
6. Operador usa a conversa em modo humano.
7. Operador envia resposta manual.
8. Resposta chega ao Instagram Direct real.
9. Timeline registra inbound e outbound.
10. WhatsApp e Messenger continuam operando em paralelo sem mudanca funcional.

## Ambiente de Demonstracao e Dados de Teste

O screencast deve usar somente uma conversa controlada de review, enviada por uma conta Meta admin/tester ou por uma conta disponibilizada para o analista da Meta. Nao usar conversas reais de clientes no video.

Mensagem sugerida para demonstracao:

```text
Ola, este e um teste de atendimento pelo Instagram Direct para revisao da Meta.
```

Resposta sugerida pelo operador:

```text
Mensagem recebida no Converta. Esta resposta foi enviada manualmente por um operador humano.
```

Essas mensagens de teste podem permanecer no inbox como registro operacional da demonstracao. O processo de App Review nao depende de exclusao ou anonimizacao posterior da conversa. Para evitar exposicao de dados pessoais, o roteiro deve criar a conversa ja sem PII: sem nome completo, telefone, email, CPF, endereco, pedido real ou qualquer dado sensivel.

Se houver conversas reais no inbox durante a gravacao, usar filtro Instagram e selecionar apenas a conversa de teste. Quando necessario, cortar/blur no video areas com nomes, avatares, telefones ou historico de terceiros.

## Permissoes Solicitadas

### `pages_show_list`

Descricao curta: Permite listar as paginas administradas pelo usuario para conectar a pagina correta ao tenant.

Descricao longa: O Converta precisa identificar quais paginas Facebook o administrador pode conectar ao workspace/tenant. A permissao e usada somente no fluxo de configuracao de canais e para confirmar a pagina autorizada.

Justificativa tecnica: A arquitetura multitenant exige mapear uma pagina Meta especifica para uma `channelAccount` especifica. Sem listar paginas autorizadas, o usuario nao consegue selecionar a pagina correta de forma segura.

Justificativa operacional: Administradores precisam conectar a pagina da empresa para que mensagens Messenger sejam recebidas no inbox omnichannel.

Compliance:

- A permissao e usada para configuracao, nao para publicar conteudo.
- Nenhum token ou dado sensivel da pagina e exibido publicamente.
- A pagina fica associada somente ao tenant que a configurou.

Roteiro de screencast:

1. Entrar no console interno/admin.
2. Abrir tenant.
3. Abrir "Canais conectados".
4. Mostrar a pagina Facebook associada ao canal Messenger.

### `pages_manage_metadata`

Descricao curta: Permite configurar e manter a inscricao de webhook da pagina.

Descricao longa: O Converta precisa garantir que a pagina esteja inscrita no app para receber eventos de mensagens em tempo real via webhook Meta.

Justificativa tecnica: O runtime de inbound depende de Page Webhooks com o campo `messages`. A permissao permite conectar/desconectar a pagina ao app e validar a entrega de eventos.

Justificativa operacional: Sem a inscricao da pagina, mensagens reais enviadas por usuarios ao Messenger nao chegam ao inbox do Converta.

Compliance:

- Usada apenas para metadata/subscriptions.
- Nao altera conteudo publico da pagina.
- Eventos recebidos passam por assinatura e resolucao tenant/channelAccount.

Roteiro de screencast:

1. Mostrar configuracao do webhook Meta no app.
2. Mostrar URL `https://converta.re7online.com/agent-api/meta/webhook`.
3. Mostrar campo `messages` inscrito.
4. Enviar mensagem real e exibir recebimento no Converta.

### `pages_messaging`

Descricao curta: Permite receber e responder mensagens Messenger da pagina conectada.

Descricao longa: O Converta usa esta permissao para receber mensagens enviadas para a pagina e permitir que operadores humanos respondam manualmente dentro do inbox.

Justificativa tecnica: Inbound Messenger e persistido como conversa multicanal. Outbound usa Graph API `me/messages` com o token da pagina do tenant, somente quando a `channelAccount` esta habilitada para outbound.

Justificativa operacional: Esta e a permissao central para atendimento humano via Messenger. O objetivo e centralizar mensagens no inbox do Converta e permitir resposta manual pelo operador.

Compliance:

- Nenhum bot ou IA automatica Messenger esta ativo nesta fase.
- Outbound e human-in-the-loop.
- Sem envio em massa ou campanhas.
- Token e tenant-scoped.
- PSID nao aparece no frontend.

Roteiro de screencast:

1. Abrir conversa Messenger no inbox.
2. Enviar mensagem real para a pagina.
3. Mostrar inbound chegando.
4. Responder manualmente pelo Converta.
5. Mostrar resposta chegando no Messenger.
6. Mostrar timeline com inbound e outbound.

### `pages_read_engagement`

Status atual: fora do escopo aprovado/operacional da trilha Instagram Direct atual.

Descricao curta: Permite ler informacoes basicas de engajamento/contexto da pagina quando necessario para operacao do atendimento.

Descricao longa: O Converta pode precisar confirmar dados basicos da pagina conectada e validar o contexto operacional da conta Meta vinculada ao tenant.

Justificativa tecnica: A permissao apoia validacoes de pagina e leitura operacional minima para garantir que a pagina conectada corresponde ao tenant e canal configurado.

Justificativa operacional: Ajuda administradores a conferir que a pagina correta esta conectada, evitando atendimento em pagina errada.

Compliance:

- Nao e usada para perfilamento indevido.
- Nao exporta dados de engajamento para terceiros.
- Dados exibidos sao limitados ao necessario para administracao do canal.

Roteiro de screencast:

1. Abrir configuracao de canais.
2. Mostrar identificacao da pagina conectada.
3. Explicar que a leitura e usada para validar o canal conectado.

### `business_management`

Descricao curta: Permite gerenciar conexao empresarial da conta/pagina quando o cliente opera via Business Manager.

Descricao longa: O Converta atende empresas que podem administrar paginas e ativos Meta pelo Business Manager. A permissao suporta validacao e conexao segura desses ativos no processo de onboarding.

Justificativa tecnica: Em cenarios empresariais, a pagina pode estar associada a um Business Manager, exigindo permissao para resolver e validar o ativo correto.

Justificativa operacional: Permite que empresas conectem seus ativos Meta corretamente ao tenant, com governanca interna.

Compliance:

- Uso limitado a onboarding/configuracao.
- Nao concede acesso cross-tenant.
- Nao compartilha ativos entre clientes.
- Nao altera permissoes fora do fluxo administrado.

Roteiro de screencast:

1. Mostrar tenant/canais.
2. Mostrar pagina associada ao tenant.
3. Explicar que cada tenant possui sua propria configuracao e token.

## Permissoes Instagram Aprovadas

Para a trilha Instagram API with Instagram Login / Business Login for Instagram, o fluxo operacional aprovado usa somente:

- `instagram_business_basic`
- `instagram_business_manage_messages`

`instagram_business_manage_comments` e `pages_read_engagement` nao fazem parte do escopo aprovado/operacional atual. O fluxo E2E validado para Instagram usa Business Login pelo console interno, webhook `messages`, inbox e resposta manual.

### `instagram_business_basic`

Descricao curta: Permite identificar a conta Instagram Business conectada ao tenant.

Descricao longa: O Converta usa esta permissao durante o Business Login for Instagram para confirmar a identidade da conta conectada, exibir status seguro da conexao e vincular o ativo correto ao tenant.

Justificativa tecnica: A plataforma e multitenant. Cada tenant precisa mapear uma conta Instagram Business especifica para uma `channelAccount`, sem misturar ativos de outros tenants.

Compliance:

- Usada somente para onboarding/validacao da conta conectada.
- Token nao e exibido.
- IDs tecnicos sao usados para resolucao de canal, nao para perfilamento.

Roteiro de screencast:

1. Login no Converta.
2. Abrir `/admin/tenants/:tenantKey/channels`.
3. Clicar em `Connect Instagram Business`.
4. Concluir Business Login.
5. Mostrar `@re7online` conectado, sem token.

### `instagram_business_manage_messages`

Descricao curta: Permite receber e responder mensagens Instagram Direct da conta conectada.

Descricao longa: O Converta usa esta permissao para receber DMs reais via webhook Meta e permitir que operadores humanos respondam manualmente pelo inbox.

Justificativa tecnica: O inbound e recebido por webhook assinado, resolvido por tenant/channelAccount e persistido como conversa Instagram. O outbound manual usa `graph.instagram.com/{version}/me/messages` com `instagramBusinessAccessToken` tenant-scoped, somente quando `outboundEnabled=true`.

Justificativa operacional: Empresas precisam centralizar Instagram Direct junto com WhatsApp e Messenger para atendimento humano em uma fila unica.

Compliance:

- Sem IA no Instagram.
- Sem bot no Instagram.
- Sem handoff automatico.
- Sem campanhas.
- Sem envio proativo.
- Somente resposta manual em conversa inbound existente.
- Eventos sem `message.text` nao sao persistidos como conversa.

Roteiro de screencast:

1. Enviar DM real para `@re7online`.
2. Mostrar a mensagem chegando no inbox Instagram.
3. Abrir a conversa.
4. Digitar resposta manual.
5. Mostrar a resposta chegando no Instagram Direct.

### `instagram_business_manage_comments`

Status atual: fora do escopo aprovado/operacional da trilha Instagram Direct atual. Comentarios e private replies exigem sprint futura especifica antes de qualquer novo review.

## Roteiro Consolidado do Video

1. Login no Converta.
2. Abrir `/admin/tenants/re7online/channels`.
3. Mostrar console `Canais conectados` com status seguro, sem token.
4. Clicar em `Connect Instagram Business`, se o video precisar demonstrar OAuth.
5. Concluir Business Login e retornar ao Converta.
6. Validar que `@re7online` esta conectado.
7. Abrir `/app/inbox`.
8. Mostrar filtros: Todos, WhatsApp, Instagram, Facebook/Messenger.
9. Enviar DM controlada de teste para `@re7online`.
10. Filtrar Instagram.
11. Mostrar a conversa de teste inbound no topo.
12. Abrir timeline e mostrar mensagem inbound.
13. Enviar resposta manual pelo operador.
14. Mostrar resposta chegando no Instagram Direct real.
15. Mostrar outbound registrado na timeline.
16. Explicar isolamento multitenant: token, conta Instagram e conversa pertencem ao tenant configurado.

Nota para o video: nao abrir diretamente `https://converta.re7online.com/agent-api/meta/webhook` como se fosse uma pagina navegavel. Esse endpoint e um webhook tecnico. Mostrar a URL no campo Callback URL do Meta Developers e, para provar que o backend publico esta online, abrir `https://converta.re7online.com/agent-api/health`.

## Roteiro Bilíngue para Screencast Instagram

O video deve ser curto, sem audio e com textos sobrepostos. Usar uma conversa de teste sem PII.

### English

1. **Login**
   Text: `We log in to Converta as an authorized operator.`

2. **Open Instagram settings**
   Text: `The tenant has an Instagram Business channel connected through Instagram Business Login.`

3. **Validate connection**
   Text: `The connected account is @re7online. Tokens are stored securely and are never displayed.`

4. **Open the omnichannel inbox**
   Text: `Converta centralizes WhatsApp, Facebook Messenger and Instagram conversations in one inbox.`

5. **Send a real Instagram DM**
   Text: `A test user sends a real Instagram Direct message to @re7online.`

6. **Receive the message**
   Text: `The Instagram message is received by webhook and appears in the Converta inbox.`

7. **Open the timeline**
   Text: `The operator opens the Instagram conversation and sees the inbound message.`

8. **Manual reply**
   Text: `The operator manually types a response. No AI, bot, campaign or proactive message is used.`

9. **Send through Converta**
   Text: `Converta sends the manual reply through the Instagram Messaging API.`

10. **Confirm delivery in Instagram Direct**
    Text: `The customer receives the response in Instagram Direct.`

11. **Show the timeline**
    Text: `The timeline records the inbound and outbound messages for the same Instagram conversation.`

12. **Security note**
    Text: `Tokens and external user identifiers are never exposed in the UI, API or logs.`

### Portugues

1. **Login**
   Texto: `Entramos no Converta como operador autorizado.`

2. **Abrir configuracao Instagram**
   Texto: `O tenant possui um canal Instagram Business conectado pelo Instagram Business Login.`

3. **Validar conexao**
   Texto: `A conta conectada e @re7online. Tokens sao salvos com seguranca e nunca sao exibidos.`

4. **Abrir inbox omnichannel**
   Texto: `O Converta centraliza conversas de WhatsApp, Facebook Messenger e Instagram em um unico inbox.`

5. **Enviar DM real**
   Texto: `Um usuario de teste envia uma mensagem real pelo Instagram Direct para @re7online.`

6. **Receber a mensagem**
   Texto: `A mensagem Instagram e recebida por webhook e aparece no inbox do Converta.`

7. **Abrir timeline**
   Texto: `O operador abre a conversa Instagram e visualiza a mensagem recebida.`

8. **Resposta manual**
   Texto: `O operador digita uma resposta manual. Nao ha IA, bot, campanha ou envio proativo.`

9. **Enviar pelo Converta**
   Texto: `O Converta envia a resposta manual pela Instagram Messaging API.`

10. **Confirmar no Instagram Direct**
    Texto: `O cliente recebe a resposta no Instagram Direct.`

11. **Mostrar timeline**
    Texto: `A timeline registra a mensagem recebida e a resposta enviada na mesma conversa Instagram.`

12. **Nota de seguranca**
    Texto: `Tokens e identificadores externos nunca sao expostos na UI, API ou logs.`

## Checklist de Screenshots

- Meta Developers: webhook configurado com callback `https://converta.re7online.com/agent-api/meta/webhook`.
- Meta Developers: produto Instagram API with Instagram Login com campo `messages` inscrito.
- Meta Developers: redirect URI `https://converta.re7online.com/agent-api/meta/instagram/oauth/callback`.
- Console interno: tenant `re7online`.
- Console interno: tela "Canais conectados".
- ChannelAccount Instagram com `status=connected` e `tokenStatus=configured`, sem token visivel.
- Console `/admin/tenants/re7online/channels` com `@re7online` conectado.
- Inbox com filtros omnichannel.
- Inbox filtrado por Instagram.
- Timeline com mensagem inbound Instagram de teste, sem PII.
- Composer habilitado para resposta manual.
- Timeline com outbound Instagram enviado na conversa de teste.
- Instagram Direct real exibindo a resposta recebida.

## Checklist de Compliance

- `PAGE_ACCESS_TOKEN` tenant-scoped.
- Sem token global/env para Messenger outbound.
- APIs administrativas redigem `pageAccessToken`.
- Logs nao exibem token.
- PSID nao aparece no frontend.
- `externalUserRef` criptografado.
- `externalUserHash` usado para observabilidade sem ID puro.
- Webhook assinado por `X-Hub-Signature-256`.
- Tenant/account mismatch aborta envio.
- Outbound bloqueado quando falta token, recipient ou flag.
- Messenger AI OFF.
- Messenger automacao/bot OFF.
- Messenger handoff automatico OFF.
- Instagram AI OFF.
- Instagram automacao/bot OFF.
- Instagram handoff automatico OFF.
- Instagram campanhas OFF.
- Instagram envio proativo OFF.
- Human-in-the-loop para respostas.
- WhatsApp preservado.

## Checklist Operacional Antes da Submissao

- App Meta no modo correto para review.
- Usuarios admin/tester configurados, se app ainda estiver em Development.
- Conta/roteiro de teste sem PII preparado para o screencast.
- Pagina Facebook vinculada ao app.
- Webhook publico acessivel.
- Verify token correto.
- `META_APP_SECRET` configurado.
- Assinatura valida testada.
- Campo `messages` inscrito.
- Permissoes solicitadas selecionadas.
- Privacy Policy publicada.
- Terms/termos publicados, se aplicavel.
- Business verification encaminhada/concluida quando exigido.
- Video/screencast gravado.
- Screenshots anexados.
- Conta de teste/instrucoes para analista documentadas.
- Confirmado que o video nao exibe tokens, PSID, payload raw ou conversas reais de clientes.

## Respostas Padrao para Meta

### O que o app faz?

O Converta centraliza conversas de atendimento em um inbox omnichannel para empresas. Nesta revisao, o uso de Instagram Business Messaging e para receber mensagens Direct da conta Instagram conectada e permitir que operadores humanos respondam manualmente pelo Converta.

### O app envia mensagens automaticamente?

Nao para Instagram. As respostas Instagram sao enviadas manualmente por operadores humanos. IA, automacao, handoff automatico, campanhas e envio proativo Instagram permanecem desativados.

### Como o usuario conecta uma conta Instagram?

Um operador interno Re7online acessa `/admin/tenants/:tenantKey/channels`, clica em `Connect/Reconnect Instagram Business` e conclui o Instagram Business Login. A conta e salva como `channelAccount` com `channel=instagram`, `provider=meta`, `channelAccountId` principal da conta Instagram e aliases tecnicos para callbacks Meta. A rota `/app/settings/channels/instagram` permanece apenas como fallback legacy temporario e nao aparece no menu do cliente.

### Como os dados sao protegidos?

Tokens nao sao retornados por API/UI. Instagram scoped user ids nao sao exibidos. A referencia externa usada para resposta e criptografada. Logs usam hashes/redaction. Webhooks sao assinados e cada envio valida tenant, canal e conta Instagram.

### Por que `instagram_business_manage_messages` e necessario?

Para receber mensagens Direct enviadas por usuarios para a conta Instagram Business conectada e permitir que operadores humanos respondam manualmente pelo Converta.

### Por que `instagram_business_basic` e necessario?

Para identificar e validar a conta Instagram Business conectada ao tenant durante o Business Login.

## Evidencias Tecnicas do Piloto

- Instagram Business Login conectado para `@re7online`.
- Token `IGAA` salvo em `instagramBusinessAccessToken`, sem exposicao.
- Inbound Instagram real recebido no tenant `re7online`.
- `instagram.inbound_persistence.persisted` validado.
- `Conversation channel=instagram` criada.
- `InboundMessage channel=instagram` criada.
- `RuntimeState channel=instagram` criado.
- Outbound Instagram manual enviado via `graph.instagram.com/{version}/me/messages`.
- Outbound Instagram retornou `status=200` e foi persistido como `SENT`.
- Timeline com inbound/outbound.
- `channels:shadow:compare` WhatsApp saudavel: `missing=0`, `mismatched=0`.
- Webhook Meta assinado ativo em producao.
- Marco critico: o app Meta precisou estar publicado/Live para que a Meta entregasse payload `messages` completo. Antes disso, chegavam apenas `message_edit`/`no_messaging_events`.

Nao incluir no pacote tokens reais, Instagram scoped user id puro, dumps, payloads brutos ou dados pessoais de clientes. A evidencia de review deve ser criada desde a origem com dados ficticios e nao sensiveis.
