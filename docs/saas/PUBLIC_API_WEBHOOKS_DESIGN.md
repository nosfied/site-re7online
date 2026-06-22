# Sprint 70G/70H/70I/70J.1 - Public API Webhooks Design + Infra/Shadow/Secret Rotation MVP

Data: 2026-06-22

Escopo: desenho tecnico e funcional dos webhooks outbound da API publica do Converta.

Na Sprint 70G nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA ou rotas publicas.

Na Sprint 70H foi implementada a infraestrutura inicial, ainda sem envio automatico de webhooks:

- models `WebhookEndpoint`, `WebhookDelivery` e `WebhookAttempt`;
- feature flag `webhooks=false` por padrao;
- CRUD tenant-scoped em `/app/webhooks`;
- segredo de assinatura exibido uma unica vez e armazenado apenas como hash;
- validacao de URL HTTPS com bloqueio basico de localhost, loopback e redes privadas;
- helper HMAC SHA-256;
- auditoria de `webhook.endpoint.created`, `webhook.endpoint.updated` e `webhook.endpoint.disabled`.

Importante: a 70H nao cria dispatch automatico, worker, retries reais, dead letter operacional ou emissao de eventos de negocio. Esses itens continuam em fase futura.

Na Sprint 70I foi implementado o modo shadow/manual, ainda sem chamada HTTP externa:

- service `generateWebhookShadowDelivery`;
- CLI `npm run webhooks:shadow -- --tenant demo-prefeitura --event message.received --json`;
- payloads shadow para `contact.created`, `conversation.created`, `message.received` e `message.sent`;
- calculo de `payloadHash`;
- calculo de assinatura HMAC para validar canonicalizacao;
- persistencia opcional de `WebhookDelivery.status=shadow` e `WebhookAttempt.status=skipped` somente com `--record-attempts`;
- auditoria `webhook.shadow.generated`, `webhook.shadow.skipped` e `webhook.shadow.denied`.

Limite importante da 70I: como a 70H armazena apenas `signingSecretHash`, o shadow usa o hash como material tecnico de assinatura (`X-Converta-Signature-Mode: shadow_hash_key`). Isso valida formato/canonicalizacao sem expor segredo, mas nao substitui a assinatura real de dispatch. Antes de envio HTTP real, sera necessario rotacionar/recriar segredo ou introduzir armazenamento criptografado do segredo.

Na Sprint 70J.1 foi adicionada criptografia e rotacao do segredo de assinatura, ainda sem chamada HTTP externa:

- env obrigatoria para criacao/rotacao: `WEBHOOK_SECRET_ENCRYPTION_KEY`;
- campos `signingSecretCiphertext`, `signingSecretKeyVersion` e `signingSecretRotatedAt` em `WebhookEndpoint`;
- criacao de endpoint salva hash + ciphertext e retorna segredo uma unica vez;
- `POST /app/webhooks/{id}/rotate-secret` gera novo segredo, atualiza hash/ciphertext e retorna o novo segredo uma unica vez;
- shadow delivery usa o segredo descriptografado quando disponivel (`X-Converta-Signature-Mode: encrypted_secret`);
- endpoints legados sem ciphertext continuam funcionando em modo `shadow_hash_key` ate rotacao.

Importante: a 70J.1 prepara HMAC real, mas ainda nao cria dispatch automatico, worker, retry real, dead letter operacional ou chamada HTTP externa.

## Objetivo

Projetar a camada de eventos outbound para integracoes externas tenant-scoped, complementando a API publica read-only ja existente:

- `GET /public-api/v1/health`;
- `GET /public-api/v1/contacts`;
- `GET /public-api/v1/contacts/{id}`;
- `GET /public-api/v1/conversations`;
- `GET /public-api/v1/conversations/{id}`;
- `GET /public-api/v1/conversations/{id}/messages`.

Os webhooks devem permitir que sistemas de terceiros recebam eventos relevantes sem polling agressivo, mantendo seguranca, isolamento multi-tenant, auditoria e minimizacao de dados.

## Principios

1. **Tenant scope obrigatorio**: todo endpoint de webhook pertence a exatamente um `clientId`.
2. **Assinatura obrigatoria**: toda entrega deve ser assinada com HMAC-SHA256.
3. **DTO publico, nao payload interno**: eventos usam contratos publicos estaveis, sem `rawPayload`, tokens, ciphertext ou provider payload.
4. **Entrega assincrona**: a emissao do evento nao pode bloquear o fluxo operacional principal.
5. **Retries controlados**: falhas temporarias devem ser reprocessadas com backoff.
6. **Dead letter auditavel**: falhas definitivas devem ficar visiveis para suporte/cliente.
7. **Rollback por tenant**: desabilitar webhooks nao pode afetar WhatsApp, Messenger, Instagram, Webchat, Scheduling, NPS ou Public API read-only.
8. **Sem escrita publica nesta fase**: webhooks outbound nao implicam endpoints de escrita.

## Eventos Candidatos

| Evento | Origem | Prioridade | Payload base | Observacao |
| --- | --- | --- | --- | --- |
| `contact.created` | `Contact` / CRM | P1 | Contact publico minimo | Emitir quando contato nasce por canal, webchat ou importacao futura |
| `conversation.created` | `Conversation` | P0 | Conversation publico minimo | Alto valor para integracao com protocolo/CRM externo |
| `message.received` | `InboundMessage` | P0 | Message publico minimo | Para inbound de WhatsApp, Messenger, Instagram e Webchat |
| `message.sent` | `OutboundMessage` | P0 | Message publico minimo | Para resposta humana/automacao enviada/persistida |
| `appointment.created` | `Appointment` | P1 | Appointment publico minimo | Apos Scheduling estar habilitado no tenant |
| `appointment.confirmed` | `Appointment` | P2 | Appointment publico minimo | Depende de fluxo de confirmacao futuro |
| `survey.responded` | `SatisfactionResponse` | P1 | Survey response publico minimo | Apos NPS/Satisfaction ter link/disparo operacional |

Eventos fora do MVP inicial:

- `campaign.sent`;
- `campaign.completed`;
- `message.failed`;
- `conversation.closed`;
- `department.assigned`;
- `webchat.session.started`.

Esses eventos podem entrar depois que os eventos P0 estiverem estaveis.

## Modelo Conceitual

### WebhookEndpoint

Modelo implementado na Sprint 70H:

| Campo | Tipo | Finalidade |
| --- | --- | --- |
| `id` | string/uuid | Identificador interno |
| `clientId` | string | Tenant dono do endpoint |
| `name` | string | Nome amigavel |
| `url` | string | URL HTTPS de destino |
| `signingSecretHash` | string | Hash SHA-256 do segredo exibido uma unica vez |
| `signingSecretCiphertext` | string/null | Segredo criptografado para assinatura futura |
| `signingSecretKeyVersion` | string/null | Referencia da chave de criptografia |
| `signingSecretRotatedAt` | datetime/null | Data da ultima criacao/rotacao do segredo |
| `active` | boolean | Endpoint ativo/inativo |
| `createdByUserId` | string/null | Usuario que criou |
| `createdAt` / `updatedAt` | datetime | Auditoria |

Regras:

- segredo exibido apenas uma vez na criacao;
- segredo tambem pode ser exibido uma unica vez apos rotacao;
- segredo em claro nunca e persistido;
- URL deve ser `https://` em producao;
- bloquear IPs privados/link-local por padrao para evitar SSRF;
- localhost, loopback e redes privadas sao bloqueados tambem no MVP;
- gestao inicial fica no `/app/webhooks`, protegida por RBAC e feature flag.

### WebhookDelivery

Modelo implementado para diagnostico e fila futura:

| Campo | Tipo | Finalidade |
| --- | --- | --- |
| `id` | string/uuid | Delivery id |
| `clientId` | string | Tenant |
| `endpointId` | string | Endpoint destino |
| `eventType` | string | Tipo do evento |
| `payloadHash` | string | Hash do payload publico futuro |
| `status` | string | Estado da entrega futura |
| `createdAt` / `updatedAt` | datetime | Auditoria |

### WebhookAttempt

Modelo implementado para tentativas futuras:

| Campo | Tipo | Finalidade |
| --- | --- | --- |
| `id` | string/uuid | Attempt id |
| `clientId` | string | Tenant |
| `deliveryId` | string | Delivery |
| `attemptNumber` | int | Numero da tentativa |
| `status` | string | Estado da tentativa |
| `responseCode` | int/null | Status HTTP redigido |
| `createdAt` | datetime | Auditoria |

## Contrato De Entrega

Endpoint externo:

```text
POST https://cliente.gov.br/webhooks/converta
```

Headers obrigatorios:

```http
Content-Type: application/json
User-Agent: Converta-Webhooks/1.0
X-Converta-Event: message.received
X-Converta-Delivery-Id: whd_01HX...
X-Converta-Event-Id: evt_01HX...
X-Converta-Timestamp: 1760000000
X-Converta-Signature: sha256=...
```

Payload base:

```json
{
  "id": "evt_01HX...",
  "type": "message.received",
  "createdAt": "2026-06-22T14:00:00.000Z",
  "tenant": {
    "id": "client_public_or_internal_id",
    "key": "demo-prefeitura"
  },
  "data": {}
}
```

Observacoes:

- `tenant.key` e util para integracao humana, mas pode ser omitido se houver risco contratual;
- `data` deve seguir o mesmo DTO publico da API REST quando possivel;
- eventos de mensagem devem usar os mesmos criterios de minimizacao da rota `GET /public-api/v1/conversations/{id}/messages`.

## Assinatura HMAC

Assinatura recomendada:

```text
signature = HMAC-SHA256(secret, timestamp + "." + rawBody)
```

Header:

```http
X-Converta-Signature: sha256=<hex>
```

Validacao pelo consumidor:

1. ler `X-Converta-Timestamp`;
2. rejeitar se timestamp estiver fora da janela recomendada, por exemplo 5 minutos;
3. recomputar HMAC usando o `rawBody` exato;
4. comparar com tempo constante;
5. usar `X-Converta-Delivery-Id` para idempotencia.

Rotacao de segredo:

- suportar segredo atual e segredo anterior durante janela de transicao;
- incluir `X-Converta-Signature-Version: v1` se houver evolucao futura;
- nunca exibir segredo completo depois da criacao.

## Retries

Respostas consideradas sucesso:

- qualquer status HTTP `2xx`.

Respostas consideradas retryable:

- timeout;
- erro DNS temporario;
- `408`;
- `425`;
- `429`;
- `5xx`.

Respostas consideradas falha definitiva:

- `400`;
- `401`;
- `403`;
- `404`;
- `410`;
- `413`;
- `422`.

Politica inicial sugerida:

| Tentativa | Delay |
| ---: | --- |
| 1 | imediato |
| 2 | 1 minuto |
| 3 | 5 minutos |
| 4 | 15 minutos |
| 5 | 1 hora |
| 6 | 6 horas |
| 7 | 24 horas |

Limites:

- timeout por request: 10 segundos;
- payload maximo: 256 KB no MVP;
- maximo de 7 tentativas;
- depois disso, status `dead_letter`.

## Dead Letter

Um delivery deve ir para dead letter quando:

- esgota tentativas;
- endpoint retorna falha definitiva;
- endpoint esta desabilitado antes de entregar;
- payload excede limite permitido;
- assinatura/segredo do endpoint esta invalido;
- politica SSRF bloqueia destino.

Dead letter deve registrar:

- `deliveryId`;
- `eventType`;
- `endpointId`;
- `attemptCount`;
- `lastStatusCode`;
- `lastError` redigido;
- timestamps.

Nao registrar:

- token interno;
- segredo do webhook;
- Authorization recebido de terceiros;
- payload bruto de fornecedor Meta;
- response body completo do endpoint externo.

## Auditoria

Eventos internos recomendados:

| Evento | Quando |
| --- | --- |
| `api.webhook.endpoint.created` | Endpoint criado |
| `api.webhook.endpoint.updated` | Eventos/URL/status alterados |
| `api.webhook.endpoint.disabled` | Endpoint desativado |
| `api.webhook.delivery.queued` | Delivery criado |
| `api.webhook.delivery.sent` | HTTP 2xx |
| `api.webhook.delivery.retry_scheduled` | Falha retryable |
| `api.webhook.delivery.dead_letter` | Falha definitiva |
| `api.webhook.delivery.discarded` | Evento descartado por endpoint desativado/filtro |

Campos minimos:

- `requestId`;
- `clientId`;
- `endpointId`;
- `eventType`;
- `deliveryId`;
- `status`;
- `statusCode`;
- `attemptCount`;
- `durationMs`;
- `errorCode` redigido.

## Tenant Scope E Feature Flags

O fluxo deve ser:

```text
Evento operacional
-> clientId resolvido no proprio evento
-> buscar endpoints active do clientId
-> filtrar por eventType
-> gerar payload publico
-> enfileirar delivery
-> worker entrega com HMAC
```

Regras:

- nunca entregar evento de um tenant para endpoint de outro tenant;
- nao aceitar `clientId` no payload como fonte autoritativa;
- endpoints devem ser criados por usuario ADMIN/SUPERVISOR do tenant ou por console interno;
- se houver feature flag futura, usar `publicApiWebhooks=false` por default;
- desabilitar webhooks deve impedir novas entregas sem afetar API REST.

## Seguranca

### SSRF

Bloquear destinos:

- `localhost`;
- `127.0.0.0/8`;
- `10.0.0.0/8`;
- `172.16.0.0/12`;
- `192.168.0.0/16`;
- link-local;
- metadata cloud;
- IPv6 local/private equivalente.

Permitir apenas `https://` em producao.

### PII e minimizacao

Payloads devem usar DTOs publicos:

- contato: id publico, nome, telefone mascarado quando aplicavel, canal, timestamps;
- conversa: id, canal, status, departamento, timestamps, contato relacionado;
- mensagem: id, direction, channel, type, text se seguro, createdAt, status;
- agendamento: id, service/resource publico, horario, status;
- pesquisa: id, score, tipo, comentario opcional com limite.

Nao expor:

- `rawPayload`;
- `externalUserRef`;
- waId/PSID bruto quando nao necessario;
- tokens;
- provider payload;
- ciphertext;
- IP/user-agent bruto;
- dados de outro tenant.

### Rate limit de entrega

Aplicar por tenant e por endpoint:

- maximo de entregas por minuto;
- fila por endpoint;
- protecao contra tempestade de eventos;
- possibilidade de pausar endpoint automaticamente apos muitas falhas.

## Eventos E Payloads

### contact.created

Disparo:

- novo `Contact` criado por inbound, webchat ou operacao futura.

Payload:

```json
{
  "contact": {
    "id": "contact_123",
    "name": "Maria",
    "channels": ["whatsapp"],
    "createdAt": "2026-06-22T14:00:00.000Z"
  }
}
```

### conversation.created

Disparo:

- nova `Conversation` criada para WhatsApp, Messenger, Instagram ou Webchat.

Payload:

```json
{
  "conversation": {
    "id": "conv_123",
    "channel": "webchat",
    "status": "waiting",
    "contactId": "contact_123",
    "createdAt": "2026-06-22T14:00:00.000Z"
  }
}
```

### message.received

Disparo:

- `InboundMessage` persistida.

Payload:

```json
{
  "message": {
    "id": "msg_123",
    "conversationId": "conv_123",
    "direction": "inbound",
    "channel": "whatsapp",
    "type": "text",
    "text": "Ola",
    "createdAt": "2026-06-22T14:00:00.000Z"
  }
}
```

### message.sent

Disparo:

- `OutboundMessage` persistida com status enviado ou equivalente.

Payload:

```json
{
  "message": {
    "id": "msg_456",
    "conversationId": "conv_123",
    "direction": "outbound",
    "channel": "webchat",
    "type": "text",
    "text": "Como posso ajudar?",
    "status": "sent",
    "createdAt": "2026-06-22T14:01:00.000Z"
  }
}
```

### appointment.created

Disparo:

- `Appointment` criado em tenant com Scheduling habilitado.

Payload:

```json
{
  "appointment": {
    "id": "apt_123",
    "status": "scheduled",
    "startsAt": "2026-06-23T13:00:00.000Z",
    "endsAt": "2026-06-23T13:30:00.000Z"
  }
}
```

### appointment.confirmed

Disparo futuro:

- confirmacao de compromisso quando o fluxo de confirmacao existir.

### survey.responded

Disparo:

- `SatisfactionResponse` criada.

Payload:

```json
{
  "survey": {
    "id": "survey_123",
    "type": "csat",
    "score": 5,
    "respondedAt": "2026-06-22T14:05:00.000Z"
  }
}
```

## Ordem Recomendada De Implementacao

### Sprint 70H - Webhooks Schema + Endpoint CRUD

Escopo:

- models aditivos para endpoints e deliveries;
- CRUD em `/app/api-keys` ou `/app/settings/integrations`;
- feature `publicApiWebhooks=false` por default;
- sem entrega real ainda.

### Sprint 70I - Webhooks Delivery Shadow

Escopo:

- gerar deliveries em modo shadow/manual;
- nao chamar endpoint externo;
- validar payloads publicos e filtros por evento;
- calcular `payloadHash`;
- calcular HMAC em modo `shadow_hash_key`;
- registrar `WebhookDelivery.status=shadow` e `WebhookAttempt.status=skipped` apenas quando `--record-attempts`;
- disponibilizar CLI `webhooks:shadow`.

Status: implementado como MVP seguro, sem dispatch automatico.

### Sprint 70J.1 - Webhook Secret Encryption + Rotation

Escopo:

- armazenar segredo criptografado em `WebhookEndpoint.signingSecretCiphertext`;
- manter `signingSecretHash` para identificacao/validacao;
- exigir `WEBHOOK_SECRET_ENCRYPTION_KEY` forte para criacao/rotacao;
- retornar segredo apenas uma vez;
- permitir rotacao por `/app/webhooks/{id}/rotate-secret`;
- manter endpoints legados sem ciphertext funcionando em modo shadow legado;
- sem envio HTTP externo.

Status: implementado como preparacao para HMAC real.

### Sprint 70J - Webhooks Controlled Delivery

Pre-requisito: 70J.1 concluida e `WEBHOOK_SECRET_ENCRYPTION_KEY` configurada em producao.

Escopo:

- entrega real para tenant piloto;
- HMAC;
- retries;
- dead letter;
- smoke com endpoint de teste.

### Sprint 70K - Webhooks Public Docs + OpenAPI

Escopo:

- documentacao para integradores;
- exemplos de validacao HMAC;
- exemplos de payload;
- troubleshooting.

## Rollback

Rollback operacional:

1. desabilitar feature `publicApiWebhooks`;
2. pausar worker de delivery;
3. marcar endpoint como `disabled`;
4. manter API REST read-only funcionando;
5. preservar deliveries para auditoria ou reprocessamento manual.

Rollback de seguranca:

1. revogar segredo do endpoint;
2. rotacionar secret;
3. invalidar deliveries pendentes;
4. auditar ultimas entregas por `deliveryId`.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Vazamento de PII | Alto | DTO publico minimo, scopes, redaction e payload size limit |
| Vazamento cross-tenant | Alto | `clientId` do evento como fonte autoritativa e testes de isolamento |
| SSRF | Alto | Bloqueio de IPs privados, HTTPS obrigatorio e DNS validation |
| Tempestade de eventos | Medio/alto | Rate limit por endpoint, fila e pausa automatica |
| Endpoint de cliente instavel | Medio | Retries com backoff e dead letter |
| Replay attack | Medio | Timestamp, HMAC e idempotencia por delivery id |
| Acoplamento com eventos internos | Medio | DTO publico independente de `Event.payload` interno |
| Custo operacional | Medio | Limites por plano e observabilidade de fila |

## Criterio De Pronto Para Implementar

Antes de implementar:

- confirmar se webhooks sao exigidos pelo edital-alvo;
- definir se a gestao inicial sera em `/app/api-keys` ou `/app/settings/integrations`;
- escolher storage de fila/delivery;
- definir feature flag `publicApiWebhooks`;
- decidir payload publico exato para `message.received` e `message.sent`;
- criar testes de isolamento cross-tenant e assinatura HMAC.

## Conclusao

O Converta ja possui API publica read-only demonstravel. Webhooks outbound sao a proxima evolucao natural para integracoes B2G mais maduras, mas devem nascer como camada separada, assinada, tenant-scoped, com retries e dead letter desde o inicio.

Nao se recomenda implementar envio de mensagens por API antes de estabilizar os webhooks outbound, porque webhooks aumentam aderencia de integracao com risco menor que escrita publica.
