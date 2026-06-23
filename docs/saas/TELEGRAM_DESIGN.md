# Sprint 74B/74C - Telegram Design + Settings Foundation

Data: 2026-06-23

Escopo: desenho tecnico e funcional do canal Telegram no Converta e registro da fundacao administrativa criada na Sprint 74C. A 74C nao implementa runtime, webhooks, Bot API, inbound, outbound, chatbot, IA ou Public API.

## Resumo Executivo

Telegram deve ser tratado como **novo canal provider externo**, nao como simples configuracao adicional de canal.

Estado alvo:

- `channel=telegram`;
- `provider=telegram`;
- bot Telegram cadastrado por tenant;
- bot token armazenado em `ChannelAccountSecret`;
- inbound via Telegram Bot API webhook;
- outbound humano pelo Inbox usando `sendMessage`;
- conversa e timeline reaproveitando `Conversation`, `ContactChannelIdentity`, `InboundMessage` e `OutboundMessage`;
- texto apenas no MVP;
- sem grupos, midia, IA/chatbot ou automacao no primeiro ciclo.

O reaproveitamento estimado continua em torno de 40%: modelos de canal, secrets, aliases, conversa, contato, Inbox, timeline, eventos e RBAC ajudam, mas o adapter Telegram, webhook, Bot API, tenant resolution e contratos de canal ainda precisam nascer.

## Decisoes De Design

| Tema | Decisao |
| --- | --- |
| Canal | `telegram` |
| Provider | `telegram` |
| MVP | Atendimento humano 1:1, texto apenas |
| Grupos | Fora do MVP |
| Midia/arquivos | Fora do MVP |
| IA/chatbot | Fora do MVP |
| Runtime inicial | Feature-gated por tenant |
| Configuracao | DB-first em `ChannelAccount` |
| Segredo | `ChannelAccountSecret.secretKind=telegramBotToken` |
| Tenant resolution | Por bot/account do webhook |
| Rollback | Flags `telegram*` e account flags |

## Canal E Provider

O contrato de tipos foi expandido na Sprint 74C para aceitar:

```ts
channel = "telegram"
provider = "telegram"
```

Impactos ainda esperados para runtime:

- tipos de canal/adapters;
- normalizacao de inbound;
- Inbox filters/labels/icons;
- DTOs de conversa/timeline;
- admin channel console;
- `ChannelAccount` validators;
- tests de tenant isolation;
- docs de canais.

Como varios models usam `channel` e `provider` como string, a expansao de banco tende a ser aditiva, mas o TypeScript/runtime deve ser revisado para evitar filtros fechados em WhatsApp/Messenger/Instagram/Webchat.

## Bot API

Campos Telegram relevantes:

| Campo Telegram | Uso no Converta |
| --- | --- |
| Bot token | secret criptografado para outbound e webhook setup |
| Bot username | `metadata.botUsername` e exibicao segura |
| Bot id | `metadata.botId` e/ou `channelAccountId` |
| `chat.id` | identidade do canal para outbound |
| `from.id` | identidade do usuario/contato |
| `update_id` | idempotencia e replay protection |
| `message.message_id` | providerMessageId |
| webhook secret token | validar origem do webhook |

Endpoint Telegram alvo para outbound:

```text
POST https://api.telegram.org/bot<TOKEN>/sendMessage
```

O token nunca deve aparecer em:

- logs;
- respostas API;
- UI;
- docs;
- eventos;
- screenshots.

## ChannelAccount

Telegram deve reaproveitar os models criados para canais:

### ChannelAccount

| Campo | Valor alvo |
| --- | --- |
| `clientId` | tenant dono do bot |
| `channel` | `telegram` |
| `provider` | `telegram` |
| `displayName` | nome do bot ou label interno |
| `channelAccountId` | bot id ou bot username normalizado |
| `externalAccountIds`/aliases | bot username, bot id, webhook path aliases se necessario |
| `metadata.botUsername` | username publico do bot |
| `metadata.botId` | id numerico se validado via `getMe` |
| `metadata.webhookSecretHash` | hash/indicador do secret token |
| `enabled` | habilitacao administrativa |
| `runtimeEnabled` | permite runtime Telegram |
| `inboundPersistenceEnabled` | permite inbound persistido |
| `outboundEnabled` | permite resposta humana |
| `aiEnabled` | false no MVP |
| `handoffEnabled` | true se usar Inbox humano |
| `tokenStatus` | `configured`, `missing`, `invalid` |

### ChannelAccountAlias

Usar aliases para:

- bot username;
- bot id;
- caminho de webhook;
- possivel id externo retornado por `getMe`.

Aliases ajudam tenant resolution quando o webhook path usa um valor e o payload retorna outro.

### ChannelAccountSecret

Secret kind sugerido:

```text
telegramBotToken
```

Campos/metadata:

- `secretKind=telegramBotToken`;
- ciphertext criptografado com chave ja usada para channel secrets;
- hash/presenca para diagnostico seguro;
- `rotatedAt`;
- `status`.

Nao ha backfill automatico porque Telegram ainda nao existe no legado.

## Segredos E Rotacao

### Armazenamento

- Bot token deve ficar apenas em `ChannelAccountSecret`.
- UI deve exibir token apenas uma vez na criacao/rotacao, se o Converta gerar/receber o token manualmente.
- Listagens retornam somente `tokenStatus`, `secretConfigured=true/false` e data de rotacao.

### Rotacao

Fluxo futuro:

1. Admin informa novo token do BotFather.
2. Backend valida formato basico.
3. Opcionalmente chama `getMe` em teste de conexao.
4. Salva ciphertext e hash/presenca.
5. Atualiza `tokenStatus`.
6. Registra `telegram.secret.rotated`.

Rollback de token:

- manter token antigo nao e recomendado;
- se rotacao falhar, nao substituir ciphertext;
- se token novo quebrar, desabilitar `outboundEnabled` ou `runtimeEnabled`.

## Webhook Telegram

Endpoint alvo:

```text
POST /agent-api/telegram/webhook/:channelAccountId
```

Recomendacao: endpoint por bot/account, porque:

- reduz ambiguidade;
- acelera tenant resolution;
- permite secret token por bot;
- facilita rollback por account.

Validacoes:

- account existe;
- `channel=telegram`;
- `provider=telegram`;
- `enabled=true`;
- `runtimeEnabled=true`;
- feature `telegram=true`;
- header `X-Telegram-Bot-Api-Secret-Token` confere com hash/secret configurado;
- payload tem `update_id`;
- update ainda nao processado;
- log redigido.

Nao confiar apenas em IP de origem. O controle principal deve ser webhook secret token + path/account.

## Inbound

Fluxo alvo:

1. Telegram envia update para `/agent-api/telegram/webhook/:channelAccountId`.
2. Backend valida path/account/secret.
3. Deduplica por `update_id`.
4. Normaliza mensagem texto.
5. Resolve tenant pelo `ChannelAccount`.
6. Resolve/cria `Contact`.
7. Resolve/cria `ContactChannelIdentity` para `channel=telegram`.
8. Resolve/cria `Conversation channel=telegram`.
9. Persiste `InboundMessage channel=telegram`.
10. Atualiza `RuntimeState`/timeline quando aplicavel.
11. Emite realtime para operadores.
12. Registra eventos redigidos.

### DTO Normalizado Interno

Campos minimos:

```text
tenant/clientId
channel=telegram
provider=telegram
channelAccountId
chatId
telegramUserId
messageId
updateId
text
receivedAt
```

Nao persistir/logar payload bruto no fluxo normal. Payload bruto, se necessario para diagnostico, deve ficar atras de flag e redigido.

### Idempotencia

Usar:

- `update_id` como chave principal de dedupe;
- `message.message_id` como provider message id;
- `chat.id` + `message_id` como composto auxiliar.

Eventos duplicados devem retornar 200 para Telegram e registrar apenas contador/metadata redigido.

## Outbound

Fluxo alvo:

1. Operador responde no Inbox em `Conversation.channel=telegram`.
2. Backend valida:
   - `telegram=true`;
   - `telegramOutbound=true`;
   - `ChannelAccount.enabled=true`;
   - `runtimeEnabled=true`;
   - `outboundEnabled=true`;
   - bot token configurado;
   - conversa pertence ao tenant/account;
   - `chat_id` resolvivel.
3. Backend chama Telegram Bot API `sendMessage`.
4. Se sucesso, persiste `OutboundMessage channel=telegram`.
5. Atualiza timeline/status.
6. Se falha, persiste status failed/erro redigido.

MVP outbound:

- texto simples;
- sem markdown avancado;
- sem anexos;
- sem botoes;
- sem comandos;
- sem grupo.

## Segurança

Controles obrigatorios:

- webhook secret token por bot;
- path/account nao previsivel quando possivel;
- rate limit por bot/account;
- limite de payload;
- dedupe por `update_id`;
- nenhum token em logs;
- nenhum payload bruto por default;
- IDs Telegram brutos mascarados em logs;
- validar tenant/account antes de persistir;
- bloquear runtime se account disabled;
- registrar falhas com `telegram.webhook.denied`.

Riscos principais:

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Vazamento de bot token | Alto | `ChannelAccountSecret`, redaction, UI one-time, nenhum log |
| Tenant errado | Alto | account path + alias + clientId obrigatório |
| Reprocessamento de update | Medio/alto | dedupe por `update_id` |
| Spam | Medio | rate limit por chat/account |
| Grupos fora do escopo | Medio | rejeitar `chat.type != private` no MVP |
| Payload bruto sensivel | Medio | logs redigidos e sem rawPayload |
| Misturar Meta/Telegram | Medio | provider separado `telegram` |

## Feature Flags

Flags futuras:

| Flag | Default | Uso |
| --- | --- | --- |
| `telegram` | false | habilita modulo/cadastro e visibilidade |
| `telegramInbound` | false | permite persistencia inbound |
| `telegramOutbound` | false | permite resposta humana |

Todas devem nascer `false`.

No MVP, `telegram=true` nao deve implicar outbound automatico.

## UI / Admin

### App Tenant

Tela futura:

```text
/app/settings/channels/telegram
```

ou aba em canais, se o design do app consolidar canais.

Funcionalidades:

- cadastrar bot token;
- informar label/display name;
- validar conexao via `getMe`;
- exibir bot username/id;
- configurar webhook;
- mostrar `tokenStatus`;
- rotacionar token;
- testar inbound em shadow;
- nenhum token em listagem.

### Admin Interno

No console interno:

- listar contas Telegram por tenant;
- exibir `channelAccountId`;
- aliases;
- metadata segura;
- flags `enabled/runtime/inbound/outbound/ai/handoff`;
- tokenStatus;
- webhook status;
- ultimos erros redigidos.

Admin interno nao deve substituir o fluxo app-facing se o cliente precisar gerenciar o bot.

## Inbox / Timeline

Atualizacoes futuras:

- label `Telegram`;
- icone Telegram;
- filtro `telegram`;
- composer texto simples;
- bloquear midia no MVP com mensagem propria;
- status de envio `sent/failed`;
- mensagens inbound/outbound aparecem na mesma timeline multicanal.

Guardrails:

- nao permitir responder se `telegramOutbound=false`;
- nao permitir responder se account/token invalidos;
- nao misturar `chat_id` de outro tenant;
- nao chamar IA/chatbot no MVP.

## Eventos E Auditoria

Eventos previstos:

| Evento | Quando |
| --- | --- |
| `telegram.account.created` | bot/account cadastrado |
| `telegram.secret.rotated` | token rotacionado |
| `telegram.webhook.received` | update recebido e validado |
| `telegram.webhook.denied` | update bloqueado por seguranca/config |
| `telegram.inbound.persisted` | inbound texto persistido |
| `telegram.outbound.sent` | Bot API aceitou envio |
| `telegram.outbound.failed` | Bot API falhou |
| `telegram.outbound.blocked` | guardrail impediu envio |

Eventos devem conter:

- `clientId`;
- `channelAccountId`;
- status/erro redigido;
- hashes/ultimos digitos quando necessario;
- nunca token, raw payload ou texto completo sensivel.

## Roadmap Tecnico

### Sprint 74C - Telegram Schema/Settings

- expandir tipos/contratos para `telegram`;
- adicionar flags `telegram`, `telegramInbound`, `telegramOutbound`;
- cadastrar `ChannelAccount` Telegram;
- salvar `telegramBotToken` em `ChannelAccountSecret`;
- UI de settings/admin diagnostico;
- sem webhook runtime.

### Sprint 74D - Telegram Webhook Shadow

- criar endpoint webhook;
- validar secret/path/account;
- normalizar update em shadow;
- dedupe por `update_id`;
- registrar eventos shadow;
- sem persistir conversa ainda.

### Sprint 74E - Telegram Inbound MVP

- persistir inbound texto;
- criar/associar contato, identidade e conversa;
- aparecer no Inbox/timeline;
- sem outbound.

### Sprint 74F - Telegram Outbound Controlado

- resposta humana texto simples pelo Inbox;
- Bot API `sendMessage`;
- token via `ChannelAccountSecret`;
- persistir `OutboundMessage`;
- rollback por `telegramOutbound=false`.

### Sprint 74G - Midia/Arquivos

- avaliar fotos/documentos/audio;
- storage;
- limites;
- antivirus se aplicavel;
- nao implementar antes de texto estar estavel.

## Smoke Futuro

### Settings

- criar bot no tenant teste;
- validar `getMe`;
- confirmar token redigido;
- rotacionar token;
- desabilitar account.

### Webhook Shadow

- POST shadow em `/telegram/webhook/:tenantOrAlias`;
- enviar payload Telegram simulado ou encaminhado manualmente;
- confirmar `telegram.webhook.received`;
- confirmar `telegram.webhook.shadow_parsed`;
- confirmar tenant/account correto;
- confirmar dedupe.

### Inbound

- mensagem Telegram cria `Conversation channel=telegram`;
- cria `InboundMessage channel=telegram`;
- aparece no Inbox;
- filtro Telegram funciona.

### Outbound

- operador responde texto;
- Bot API retorna OK;
- `OutboundMessage channel=telegram`;
- usuario recebe no Telegram;
- erro de token marca failed.

## Rollback

Rollback por camadas:

1. `telegramOutbound=false`: bloqueia envio.
2. `telegramInbound=false`: bloqueia persistencia inbound.
3. `telegram=false`: oculta/desativa modulo.
4. `ChannelAccount.enabled=false`: desativa bot especifico.
5. Remover webhook no Telegram Bot API se necessario.

Nao apagar `ChannelAccount`/secrets durante incidente sem backup, para preservar auditoria e possibilidade de retorno.

## Impacto Em Editais

Com a Sprint 74D, Telegram passa de "fundacao administrativa criada" para "webhook shadow validavel", mas continua:

```text
NAO ATENDE como canal funcional
PARCIAL como configuracao/governanca/shadow
```

So deve mudar para `ATENDE COM AJUSTE` apos inbound e outbound texto estarem funcionais em tenant piloto.

## Status Pos-74C/74D

Implementado:

- `channel=telegram` e `provider=telegram` em `ChannelAccount`;
- aliases por `ChannelAccountAlias`;
- token do bot em `ChannelAccountSecret.secretKind=telegramBotToken`, criptografado;
- flags `telegram`, `telegramInbound` e `telegramOutbound`, todas `false` por padrao;
- CRUD tenant-scoped em `/app/telegram`;
- rotacao segura do token;
- diagnostico placeholder informando que Bot API/runtime ainda nao existem;
- endpoint shadow `POST /telegram/webhook/:tenantOrAlias`;
- resolucao por `ChannelAccount` ou `ChannelAccountAlias`;
- validacao de `telegram=true`, `telegramInbound=true`, account ativa e token configurado;
- parsing redigido de `update_id`, `chat.id`, `message_id`, `from.id` e presenca/tamanho de `text`;
- replay protection em memoria por `update_id`;
- eventos `telegram.webhook.received`, `telegram.webhook.shadow_parsed` e `telegram.webhook.shadow_failed`.

Nao implementado:

- chamada `getMe` ou qualquer chamada Bot API;
- inbound;
- outbound;
- polling;
- integracao com Inbox/timeline.

## Veredito

Sprint 74B concluiu o desenho do canal Telegram, a Sprint 74C criou a fundacao sem runtime e a Sprint 74D adicionou webhook shadow sem persistencia. A implementacao segue incremental:

1. inbound texto;
2. outbound humano;
3. midia somente depois.

Nao houve chamada Bot API, Conversation, Contact, InboundMessage, OutboundMessage, inbound real ou outbound na Sprint 74D.
