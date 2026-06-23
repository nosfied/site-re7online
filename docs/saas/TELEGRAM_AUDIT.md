# Sprint 74A - Telegram Audit

Data: 2026-06-21

Escopo: auditoria documental e tecnica do estado atual do Converta para Telegram, bots, webhook Telegram, canais genericos e reaproveitamento da arquitetura multicanal.

Nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA, API publica ou frontend operacional.

## Resumo Executivo

O Converta **nao possui canal Telegram funcional** hoje.

Atualizacao pos-74C: ja existe fundacao administrativa em `/app/telegram`, usando `ChannelAccount`, `ChannelAccountAlias` e `ChannelAccountSecret.secretKind=telegramBotToken` criptografado. Ainda nao existe webhook, inbound, outbound, Bot API, polling ou integracao com Inbox/timeline.

Nao foram encontrados:

- adapter Telegram;
- webhook Telegram;
- bot token configuravel;
- uso de Bot API;
- outbound Telegram;
- inbound Telegram;
- tenant resolution para Telegram;
- feature flag `telegram`;
- provider `telegram`;
- canal `telegram` nos tipos internos;
- tela de configuracao de bot.

Existe reaproveitamento relevante, mas limitado:

- modelos multicanal (`Conversation`, `Message`, `InboundMessage`, `OutboundMessage`, `ContactChannelIdentity`);
- `ChannelAccount`, `ChannelAccountAlias` e `ChannelAccountSecret`;
- inbox/timeline;
- realtime do operador;
- eventos/auditoria;
- departments/queues/RBAC;
- padrao de adapters para WhatsApp/Messenger/Instagram.

Classificacao atual: **NAO ATENDE**.

Aderencia atual estimada pos-74C: **15% como Telegram funcional/governanca**, **45% como infraestrutura reaproveitavel**.

## Evidencias No Codigo

| Area | Evidencia | Status | Leitura |
| --- | --- | --- | --- |
| Tipos de canal | `apps/whatsapp-agent/src/channels/channel.types.ts` define `Channel = "whatsapp" | "instagram" | "messenger"` | NAO ATENDE | Telegram nem entra no contrato atual |
| Provider | `Provider = "meta"` no mesmo arquivo | NAO ATENDE | Telegram exige provider novo |
| Adapters | Existem adapters passivos para WhatsApp, Messenger e Instagram | PARCIAL | Padrao pode ser reaproveitado |
| Adapter Telegram | Nenhum `telegramAdapter` encontrado | NAO ATENDE | Precisa nascer |
| Webhook Telegram | Nenhuma rota Telegram encontrada | NAO ATENDE | Precisa nascer |
| Bot token | Nenhum campo/secret especifico de bot token | NAO ATENDE | Pode usar `ChannelAccountSecret` |
| ChannelAccount | `ChannelAccount`, `ChannelAccountAlias`, `ChannelAccountSecret` existem | PARCIAL | Modelo serve para conta Telegram se tipos forem expandidos |
| Conversas | `Conversation` tem `channel`, `provider`, `channelAccountId`, `externalUserHash`, `externalUserRef` | PARCIAL | Pode persistir Telegram depois de adapter |
| Identidade | `ContactChannelIdentity` e `Contact` suportam canal/provedor/identidade externa | PARCIAL | Bom encaixe para chat/user ID Telegram |
| Inbox | `/app/inbox` exibe timeline multicanal | PARCIAL | Pode receber `channel=telegram` apos persistencia |
| Realtime | `/app/realtime` publica eventos para operadores | PARCIAL | Pode notificar inbox apos inbound Telegram |
| Docs existentes | `GAP_REUSE_AUDIT`, `B2G_READINESS_AUDIT`, `BID_READINESS_MATRIX` citam Telegram como gap | PARCIAL | Existe consciencia documental, nao implementacao |

## Verificacao Por Item Do Escopo

| Item | Classificacao | Evidencia | Observacao |
| --- | --- | --- | --- |
| Adapters | NAO ATENDE | Nao ha `telegramAdapter` | Criar inbound/outbound |
| Webhooks | NAO ATENDE | Nao ha rota Telegram | Criar endpoint dedicado |
| Bots | NAO ATENDE | Nao ha Bot API/token | Criar configuracao segura |
| Canais genericos | PARCIAL | Models usam strings de canal, mas tipos TS restringem canais | Exige ampliar contrato |
| Abstracoes multicanal | PARCIAL | `ChannelAdapter`, `ChannelAccount`, normalizacao existem | Reaproveitamento real |
| ChannelAccount | PARCIAL | Model generico existe | Pode armazenar bot account |
| ChannelAccountAlias | PARCIAL | Alias existe | Pode mapear bot username/chat aliases |
| ChannelAccountSecret | PARCIAL | Secrets criptografados existem | Pode guardar bot token |
| Conversation | PARCIAL | Campos multicanal existem | Precisa adapter/persistence |
| ContactChannelIdentity | PARCIAL | Suporta identidade externa por canal | Pode mapear Telegram user/chat |
| Inbox | PARCIAL | Omnichannel operacional | Precisa `channel=telegram` |
| CRM Timeline | PARCIAL | Conversa/mensagens reaproveitaveis | Depende de persistencia |
| Public API | PARCIAL | Padroes de auth/auditoria | Nao substitui Bot API |
| Webchat design | PARCIAL | Ajuda em identidade/canal novo | Telegram e canal provider externo, nao widget proprio |

## Reaproveitamento Por Modulo

| Modulo | Reaproveitamento | Observacao |
| --- | --- | --- |
| ChannelAccount | Alto | Armazenar bot/account Telegram com flags e status |
| ChannelAccountSecret | Alto | Guardar bot token criptografado |
| ChannelAccountAlias | Medio | Alias por bot username ou ids auxiliares |
| ChannelAdapter | Alto | Criar `TelegramAdapter` seguindo contrato atual, apos expandir tipos |
| Conversation | Alto | `channel=telegram`, `provider=telegram`, `channelAccountId=botId/username` |
| ContactChannelIdentity | Alto | Mapear `telegramUserId`/`chatId` hash/ref |
| Inbox | Alto | Atendimento humano via timeline existente |
| Realtime | Medio/alto | Notificar operadores depois de persistir inbound |
| Departments/Queues | Alto | Roteamento igual aos demais canais |
| Public API | Baixo/medio | Padroes de auditoria/rate limit, nao auth do canal |
| Webchat design | Medio | Ajuda a pensar novo canal e identidade, mas protocolo e diferente |
| Knowledge Base/IA | Medio futuro | Pode responder Telegram depois de shadow/replay |

## Gaps Reais

### Tipos E Contratos

Hoje o contrato multicanal e fechado em:

```ts
Channel = "whatsapp" | "instagram" | "messenger"
Provider = "meta"
```

Telegram exigiria:

```ts
Channel = "telegram" // adicional
Provider = "telegram" // adicional
```

Isso impacta adapters, normalizacao, readiness, admin console, feature flags, testes, docs e possivelmente filtros do inbox.

### Banco / Configuracao

O modelo `ChannelAccount` pode ser reaproveitado, mas faltam convencoes:

- `channel="telegram"`;
- `provider="telegram"`;
- `channelAccountId` como bot id ou bot username normalizado;
- `secretKind="telegramBotToken"`;
- metadata para `botUsername`, `botId`, `webhookUrl`, `allowedUpdates`;
- flags de runtime/outbound/inbound.

### Backend

Faltam:

- endpoint webhook Telegram;
- validacao de origem/secret token do webhook;
- normalizacao de updates Telegram;
- persistencia inbound;
- outbound via Bot API `sendMessage`;
- tratamento de chat privado/grupo;
- idempotencia por `update_id`/`message_id`;
- tenant resolution por bot/account;
- logs redigidos.

### Frontend / Admin

Faltam:

- feature flag `telegram`;
- UI de configuracao do bot;
- status de webhook;
- validacao de token;
- instrucoes BotFather;
- filtro/icone Telegram no inbox, se ainda nao houver fallback visual adequado.

## Classificacao De Aderencia

| Requisito | Classificacao | Justificativa |
| --- | --- | --- |
| Telegram inbound | NAO ATENDE | Nao ha webhook/adapter |
| Telegram outbound | NAO ATENDE | Nao ha Bot API/send |
| Bot token seguro | PARCIAL | `ChannelAccountSecret` pode armazenar, mas nao ha fluxo Telegram |
| Tenant resolution | PARCIAL | `ChannelAccount`/alias ajudam, mas nao ha runtime Telegram |
| Inbox Telegram | PARCIAL | Inbox pode receber canais, mas falta persistencia |
| CRM/timeline | PARCIAL | Modelos existem, falta canal |
| Realtime operador | PARCIAL | Pode publicar eventos apos persistencia |
| Feature flag | NAO ATENDE | Falta `telegram` |
| Admin config | NAO ATENDE | Falta tela/rota especifica |
| Grupos Telegram | NAO ATENDE | Nao definido |
| Mídia Telegram | NAO ATENDE | Nao definido |
| IA/chatbot Telegram | NAO ATENDE | Canal nao existe |

## MVP Recomendado

### Objetivo Do MVP

Criar Telegram como canal humano simples, privado 1:1, sem grupos e sem IA automatica.

MVP proposto:

- feature flag `telegram=false`;
- `Channel`/`Provider` expandidos;
- `ChannelAccount` para bot Telegram;
- `ChannelAccountSecret` para bot token;
- webhook Telegram por bot/account;
- persistencia inbound texto;
- conversa aparece no `/app/inbox`;
- operador responde texto pelo inbox;
- outbound via Bot API `sendMessage`;
- sem midia no primeiro MVP;
- sem grupos no primeiro MVP;
- sem IA/chatbot no primeiro MVP.

## Modelo Alvo Sugerido

### ChannelAccount Telegram

Usar o modelo existente:

| Campo | Valor sugerido |
| --- | --- |
| `channel` | `telegram` |
| `provider` | `telegram` |
| `channelAccountId` | bot id ou bot username normalizado |
| `displayName` | nome do bot |
| `metadata.botUsername` | username publico |
| `metadata.botId` | id numerico, se validado |
| `metadata.webhookSecretHash` | hash/indicador, nao segredo bruto |
| `enabled` | true/false |
| `runtimeEnabled` | true/false |
| `inboundPersistenceEnabled` | true/false |
| `outboundEnabled` | true/false |
| `aiEnabled` | false por padrao |

Secret:

```text
ChannelAccountSecret.secretKind = "telegramBotToken"
```

### Identidade

Mapear:

| Telegram | Converta |
| --- | --- |
| `from.id` | `externalUserHash`/`externalUserRef` |
| `chat.id` | `externalThreadId` ou metadata |
| `message.message_id` | `externalMessageId` |
| bot id/username | `channelAccountId` |

Regras:

- usar hash para indices;
- guardar ref criptografada somente se necessaria para outbound;
- nao logar IDs brutos em eventos tecnicos quando puder evitar.

## Endpoints Alvo

Namespace sugerido:

```text
/agent-api/telegram/webhook/:channelAccountId
```

Ou, se preferir um endpoint unico:

```text
/agent-api/telegram/webhook
```

Recomendacao: endpoint por account/bot reduz ambiguidade e facilita tenant resolution.

Validacoes:

- `X-Telegram-Bot-Api-Secret-Token`, se configurado;
- account/bot existente e ativo;
- `runtimeEnabled=true`;
- `inboundPersistenceEnabled=true`.

## Fluxo Inbound

1. Telegram envia update.
2. Backend valida secret token.
3. Resolve `ChannelAccount` por bot/account.
4. Normaliza update para `NormalizedInboundEvent`.
5. Ignora updates sem mensagem textual no MVP.
6. Resolve/cria `ContactChannelIdentity`.
7. Resolve/cria `Conversation`.
8. Persiste `InboundMessage`/`Message`.
9. Atualiza `ConversationRuntimeState`.
10. Publica realtime para operadores.

## Fluxo Outbound

1. Operador responde no inbox.
2. Backend valida:
   - conversa `channel=telegram`;
   - account ativa;
   - `outboundEnabled=true`;
   - token configurado.
3. Resolve bot token via `ChannelAccountSecret`.
4. Envia `sendMessage` para Bot API.
5. Persiste `OutboundMessage`/`Message`.
6. Atualiza timeline e status.

## Feature Flag E Rollout

Feature flag futura:

```text
telegram
```

Default:

```text
business=false
government=false
```

Rollout:

1. schema/config;
2. bot validation;
3. inbound shadow/dry-run;
4. inbound real;
5. outbound real;
6. IA/chatbot apenas depois.

## Seguranca

Requisitos minimos:

- token do bot somente em `ChannelAccountSecret`;
- token nunca em UI/API/log;
- validar secret token do webhook;
- rate limit por bot/account;
- idempotencia por update/message;
- redigir payload bruto;
- restringir grupos no MVP ou tratar explicitamente;
- desabilitar IA por padrao.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Vazamento de bot token | Alto | `ChannelAccountSecret`, redaction, nenhum token em logs/UI |
| Resolver tenant errado | Alto | `ChannelAccount` unico por bot + shadow compare |
| Grupos criarem ruido/PII | Alto | MVP 1:1 privado; grupos off |
| Spam no bot publico | Medio/alto | rate limit e bloqueio por usuario/chat |
| Updates duplicados | Medio | idempotencia por `update_id`/`message_id` |
| Midia fora do escopo | Medio | texto primeiro; midia em sprint posterior |
| Misturar Telegram com Meta | Medio | provider separado `telegram`, nao reaproveitar provider `meta` |

## Impacto Em Editais

Alto quando o edital exige multicanal alem de WhatsApp/Meta.

Enquanto Telegram nao existir, a classificacao em editais que exigem esse canal deve permanecer **NAO ATENDE**.

Com MVP 1:1 texto, a aderencia melhora para:

- atendimento multicanal;
- portais/orgaos que usam Telegram como canal auxiliar;
- POC de omnichannel;
- reducao de gap frente a editais avancados.

## Impacto Em Clientes Privados

Medio.

Telegram pode ser util para:

- comunidades;
- suporte tecnico;
- publico que prefere Telegram;
- continuidade omnichannel.

Para clientes comerciais brasileiros, WhatsApp tende a permanecer prioritario. Telegram deve vir depois de Webchat/NPS se o objetivo imediato for aderencia B2G ampla, salvo edital especifico.

## Roadmap Recomendado

### Sprint 74B - Telegram Design

Somente desenho:

- contrato de channel/provider;
- Bot API;
- webhook;
- token/secret;
- identity mapping;
- inbound/outbound;
- grupos vs 1:1;
- rollout/rollback.

### Sprint 74C - Telegram Schema/Config MVP

Estrutura sem runtime real:

- expandir tipos com `telegram`;
- feature `telegram=false`;
- admin/app settings para bot;
- validar token em fluxo controlado;
- salvar token criptografado.

### Sprint 74D - Telegram Inbound MVP

Primeiro fluxo real:

- webhook;
- texto 1:1;
- persistencia;
- inbox;
- realtime operador.

### Sprint 74E - Telegram Outbound MVP

Completar ponta a ponta:

- resposta humana pelo inbox;
- Bot API `sendMessage`;
- persistencia outbound;
- smoke real.

### Sprint 74F - Telegram Enhancements

Depois do E2E humano:

- media;
- grupos, se fizer sentido;
- templates/quick replies nativos;
- chatbot/IA shadow;
- KB shadow.

## Recomendacao Final

Telegram deve ser tratado como canal novo, nao como simples configuracao em `ChannelAccount`.

Proxima sprint correta: **Sprint 74B - Telegram Design**.

Recorte recomendado:

- desenhar o provider `telegram`;
- definir Bot API, webhook e secret token;
- definir `ChannelAccountSecret.secretKind=telegramBotToken`;
- definir identidade `from.id/chat.id`;
- manter feature flag `telegram=false`;
- nao alterar WhatsApp, Messenger, Instagram, Webchat, IA, chatbot ou Public API existente.

## Status Pos-Sprint 74B

A Sprint 74B criou o desenho tecnico em `docs/saas/TELEGRAM_DESIGN.md`.

Decisoes consolidadas:

- Telegram sera `channel=telegram` e `provider=telegram`;
- o MVP sera atendimento humano 1:1, texto apenas;
- grupos, midia, IA/chatbot e automacao ficam fora do primeiro ciclo;
- bot token deve ficar em `ChannelAccountSecret.secretKind=telegramBotToken`;
- tenant resolution deve ocorrer por `ChannelAccount`/alias do bot;
- inbound deve criar `Contact`, `ContactChannelIdentity`, `Conversation channel=telegram` e `InboundMessage`;
- outbound deve usar Bot API `sendMessage` e persistir `OutboundMessage`;
- flags futuras: `telegram`, `telegramInbound`, `telegramOutbound`, todas `false` por padrao.

Classificacao apos o design:

- Telegram funcional: **NAO ATENDE**;
- arquitetura desenhada: **PARCIAL**;
- proxima etapa segura: **Sprint 74C - Telegram Schema/Settings**.
