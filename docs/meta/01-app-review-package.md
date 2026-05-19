# Meta App Review Package

Este pacote descreve o uso do Converta para revisão da Meta. O foco atual é atendimento humano manual por Facebook/Messenger dentro do inbox omnichannel, com WhatsApp preservado e Instagram preparado para fase futura.

## Visao Geral

O Converta e uma plataforma SaaS multitenant de atendimento e CRM conversacional. Cada tenant configura suas contas de canal em `channelAccounts`, com isolamento por tenant, canal, provider e `channelAccountId`.

No piloto atual:

- Tenant piloto: `re7online`
- Canal: Facebook/Messenger
- Provider: Meta
- Modo operacional: inbound Messenger + resposta manual humana
- Automacao Messenger: desativada
- IA Messenger: desativada
- Handoff automatico Messenger: desativado
- Outbound Messenger: somente humano, somente quando `outboundEnabled=true`

O app nao usa tokens globais de Messenger. O `PAGE_ACCESS_TOKEN` e resolvido pela `channelAccount` do tenant e nunca e exposto na UI, API ou logs.

## Canais Suportados

- WhatsApp: operacional legado e multicanal shadow-write/dual-read saudavel.
- Facebook/Messenger: inbound real, inbox omnichannel, timeline, resposta manual humana.
- Instagram: preparado visualmente e arquiteturalmente, mas ainda nao ativo no runtime.

## Arquitetura de Seguranca

- Webhook Meta assinado com `X-Hub-Signature-256`.
- Token de pagina armazenado por tenant/channelAccount.
- Nenhum token retornado pelas APIs administrativas.
- PSID nao e exposto no frontend.
- `externalUserRef` e criptografado para permitir resposta manual segura.
- Logs usam hash/redaction para identificadores externos.
- `channelAccountId` precisa bater com tenant/canal/provider para envio.
- Falha de token, recipient ou mismatch retorna erro seguro e nao envia mensagem.

## Fluxo do Usuario

1. Operador acessa o Converta.
2. Abre o inbox omnichannel.
3. Filtra por Facebook/Messenger.
4. Cliente envia mensagem para a pagina Facebook conectada.
5. Mensagem inbound aparece na conversa Messenger.
6. Operador assume/usa conversa em modo humano.
7. Operador envia resposta manual.
8. Resposta chega ao Messenger real.
9. Timeline registra inbound e outbound.
10. WhatsApp continua operando em paralelo sem mudanca funcional.

## Ambiente de Demonstracao e Dados de Teste

O screencast deve usar somente uma conversa controlada de review, enviada por uma conta Meta admin/tester ou por uma conta disponibilizada para o analista da Meta. Nao usar conversas reais de clientes no video.

Mensagem sugerida para demonstracao:

```text
Ola, este e um teste de atendimento pelo Messenger para revisao da Meta.
```

Resposta sugerida pelo operador:

```text
Mensagem recebida no Converta. Esta resposta foi enviada manualmente por um operador humano.
```

Essas mensagens de teste podem permanecer no inbox como registro operacional da demonstracao. O processo de App Review nao depende de exclusao ou anonimizacao posterior da conversa. Para evitar exposicao de dados pessoais, o roteiro deve criar a conversa ja sem PII: sem nome completo, telefone, email, CPF, endereco, pedido real ou qualquer dado sensivel.

Se houver conversas reais no inbox durante a gravacao, usar filtro Facebook/Messenger e selecionar apenas a conversa de teste. Quando necessario, cortar/blur no video areas com nomes, avatares, telefones ou historico de terceiros.

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

## Roteiro Consolidado do Video

1. Login no Converta.
2. Abrir `/app/inbox`.
3. Mostrar filtros: Todos, WhatsApp, Instagram, Facebook/Messenger.
4. Abrir console/admin do tenant e a tela "Canais conectados".
5. Mostrar a channelAccount Messenger conectada a pagina Facebook, sem mostrar token.
6. Enviar mensagem controlada de teste para a pagina Facebook/Messenger usando conta admin/tester ou conta de review.
7. Voltar ao inbox e filtrar Facebook/Messenger.
8. Mostrar a conversa de teste inbound no topo.
9. Abrir timeline e mostrar mensagem inbound.
10. Enviar resposta manual pelo operador.
11. Mostrar resposta chegando no Messenger real.
12. Mostrar outbound registrado na timeline.
13. Abrir filtro WhatsApp e mostrar que conversas WhatsApp continuam funcionando, sem abrir conversas reais com PII.
14. Explicar isolamento multitenant: token, pagina e conversa pertencem ao tenant configurado.

Nota para o video: nao abrir diretamente `https://converta.re7online.com/agent-api/meta/webhook` como se fosse uma pagina navegavel. Esse endpoint e um webhook tecnico. Mostrar a URL no campo Callback URL do Meta Developers e, para provar que o backend publico esta online, abrir `https://converta.re7online.com/agent-api/health`.

## Checklist de Screenshots

- Meta Developers: webhook configurado com callback `https://converta.re7online.com/agent-api/meta/webhook`.
- Meta Developers: produto Messenger/Page Webhooks com campo `messages` inscrito.
- Console interno: tenant `re7online`.
- Console interno: tela "Canais conectados".
- ChannelAccount Messenger com `status=connected` e `tokenStatus=configured`, sem token visivel.
- Inbox com filtros omnichannel.
- Inbox filtrado por Facebook/Messenger.
- Timeline com mensagem inbound Messenger de teste, sem PII.
- Composer habilitado para resposta manual.
- Timeline com outbound Messenger enviado na conversa de teste.
- Messenger real exibindo a resposta recebida.

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
- Human-in-the-loop para respostas.
- WhatsApp preservado.
- Instagram nao ativo no runtime.

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

O Converta centraliza conversas de atendimento em um inbox omnichannel para empresas. Nesta revisao, o uso de Messenger e para receber mensagens da pagina Facebook conectada e permitir que operadores humanos respondam manualmente pelo Converta.

### O app envia mensagens automaticamente?

Nao para Messenger nesta fase. As respostas Messenger sao enviadas manualmente por operadores humanos. IA, automacao e handoff automatico Messenger permanecem desativados.

### Como o usuario conecta uma pagina?

Um administrador conecta a pagina ao tenant no console de canais. A pagina e salva como `channelAccount` com `channel=messenger`, `provider=meta` e `channelAccountId` da pagina.

### Como os dados sao protegidos?

Tokens nao sao retornados por API/UI. PSIDs nao sao exibidos. A referencia externa usada para resposta e criptografada. Logs usam hashes/redaction. Webhooks sao assinados e cada envio valida tenant, canal e pagina.

### Por que `pages_messaging` e necessario?

Para receber mensagens enviadas por usuarios a pagina Facebook e permitir que operadores humanos respondam manualmente via Messenger.

### Por que `pages_manage_metadata` e necessario?

Para manter a pagina inscrita nos webhooks do app e receber eventos de mensagens em tempo real.

## Evidencias Tecnicas do Piloto

- Inbound Messenger real recebido no tenant `re7online`.
- Outbound Messenger manual enviado e retornado como `SENT`.
- Timeline com inbound/outbound.
- `channels:shadow:compare` WhatsApp saudavel: `missing=0`, `mismatched=0`.
- Webhook Meta assinado ativo em producao.

Nao incluir no pacote tokens reais, PSID puro, dumps, payloads brutos ou dados pessoais de clientes. Como a exclusao/anonimizacao manual de novas conversas Messenger ainda nao faz parte do fluxo operacional, a evidencia de review deve ser criada desde a origem com dados ficticios e nao sensiveis.
