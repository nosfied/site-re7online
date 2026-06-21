# Sprint 70B - Public API Design

Data: 2026-06-20

Escopo: desenho tecnico e funcional. Nao houve alteracao de codigo, banco, runtime, autenticacao, canais ou rotas.

## Objetivo

Definir a primeira arquitetura da API publica do Converta com base na auditoria da Sprint 70A.

A API publica deve ser uma camada propria, versionada e segura. Ela nao deve expor diretamente as rotas internas `/app/*` nem `/admin/*`.

## Principios

- Banco e tenant atual continuam como fonte de verdade.
- Toda chamada publica deve resolver exatamente um tenant.
- Nenhum endpoint publico pode aceitar `clientId` livre para trocar tenant.
- Tokens internos Meta, secrets, ciphertext e configuracoes sensiveis nunca devem aparecer.
- Dados pessoais devem ser minimizados por DTO publico.
- Endpoints de leitura entram antes de endpoints de escrita.
- Envio de mensagens deve ser tratado como fase posterior, com idempotencia, scopes e politica Meta.
- API publica deve ser versionada desde o primeiro dia.

## Namespace

Namespace alvo:

```text
/public-api/v1
```

Motivos:

- separa explicitamente contrato publico de `/app` e `/admin`;
- facilita regras de proxy, rate limit e logs;
- permite versionamento futuro `/public-api/v2`;
- evita ambiguidade com rotas internas do frontend.

Rotas internas seguem inalteradas:

```text
/app/*
/admin/*
/webhook
/app/realtime
```

## Autenticacao

Modelo alvo: **API Key por tenant**.

Formato recomendado para cliente:

```http
Authorization: Bearer cvt_live_xxxxxxxxx
```

Formato alternativo aceito apenas se for necessario para compatibilidade:

```http
X-Converta-Api-Key: cvt_live_xxxxxxxxx
```

### Armazenamento

Criar em sprint futura um model dedicado, por exemplo:

```text
PublicApiKey
```

Campos sugeridos:

| Campo | Finalidade |
| --- | --- |
| `id` | Identificador interno |
| `clientId` | Tenant dono da chave |
| `name` | Nome amigavel da integracao |
| `keyPrefix` | Prefixo visivel para suporte, sem expor chave |
| `keyHash` | Hash da chave completa |
| `scopes` | Lista de permissoes |
| `status` | active, disabled, revoked |
| `rateLimitPerMinute` | Limite especifico opcional |
| `expiresAt` | Expiracao opcional |
| `lastUsedAt` | Auditoria operacional |
| `createdByUserId` | Usuario que criou |
| `revokedAt` | Data de revogacao |
| `createdAt` / `updatedAt` | Auditoria |

Regras:

- armazenar somente hash da chave;
- exibir a chave completa somente uma vez na criacao;
- permitir revogar e recriar;
- nunca logar chave completa;
- resolver `clientId` pela chave, nao por parametro.

## Scopes

Scopes iniciais:

| Scope | Permite | Observacao |
| --- | --- | --- |
| `read` | Leitura geral permitida | Base para endpoints GET |
| `write` | Escrita geral permitida | Nao deve habilitar envio de mensagem sozinho |
| `contacts` | Contatos/leads/CRM | Pode ser read/write conforme metodo |
| `conversations` | Conversas e timeline | Acesso a dados sensiveis |
| `messages` | Mensagens | Separar leitura de envio em fase futura |
| `campaigns` | Campanhas/templates | Alto risco; nao entra no MVP inicial |
| `webhooks` | Configurar webhooks outbound | Fase posterior |

Recomendacao de combinacao:

- `read + contacts`: listar contatos/leads;
- `read + conversations`: listar conversas;
- `read + conversations + messages`: ler timeline;
- `write + contacts`: atualizar dados de lead/CRM;
- `write + messages`: envio futuro, com controles adicionais;
- `webhooks`: gerenciar endpoints de eventos.

## Entidades MVP

### Contact

Representa lead/contato do tenant.

Campos publicos sugeridos:

```json
{
  "id": "contact_123",
  "displayName": "Maria Silva",
  "channels": [
    {
      "channel": "whatsapp",
      "externalRefMasked": "5584****1234"
    }
  ],
  "status": "qualified",
  "businessStatus": "interessado",
  "tags": ["varejo"],
  "createdAt": "2026-06-20T12:00:00.000Z",
  "updatedAt": "2026-06-20T12:30:00.000Z"
}
```

Politica:

- mascarar identificadores externos por padrao;
- permitir campo completo somente se houver justificativa de escopo e LGPD;
- nao expor waid/psid bruto sem necessidade.

### Conversation

Representa atendimento/conversa.

Campos publicos sugeridos:

```json
{
  "id": "conv_123",
  "channel": "whatsapp",
  "status": "waiting",
  "mode": "human",
  "contactId": "contact_123",
  "departmentId": "dept_123",
  "assignedToUserId": "user_123",
  "lastMessageAt": "2026-06-20T12:30:00.000Z",
  "unreadCount": 2,
  "createdAt": "2026-06-20T12:00:00.000Z",
  "updatedAt": "2026-06-20T12:30:00.000Z"
}
```

Politica:

- filtrar sempre por tenant da API key;
- paginação obrigatoria;
- filtros por canal/status/data;
- nao expor configuracoes internas da automacao.

### Message

Representa mensagem de timeline.

Campos publicos sugeridos:

```json
{
  "id": "msg_123",
  "conversationId": "conv_123",
  "direction": "inbound",
  "channel": "whatsapp",
  "type": "text",
  "text": "Ola",
  "sentAt": "2026-06-20T12:30:00.000Z",
  "providerMessageId": "wamid.redacted",
  "status": "delivered"
}
```

Politica:

- mensagens podem conter PII; exigir `messages` scope;
- midias devem entrar depois, com URL assinada e expiração curta;
- provider ids devem ser redigidos ou normalizados.

## Endpoints MVP

### Health

```http
GET /public-api/v1/health
```

Scopes: nenhum ou `read`.

Resposta:

```json
{
  "ok": true,
  "service": "converta-public-api",
  "version": "v1"
}
```

### Contacts

```http
GET /public-api/v1/contacts
GET /public-api/v1/contacts/{contactId}
```

Scopes:

```text
read contacts
```

Filtros iniciais:

- `updatedSince`;
- `createdSince`;
- `status`;
- `businessStatus`;
- `limit`;
- `cursor`.

### Conversations

```http
GET /public-api/v1/conversations
GET /public-api/v1/conversations/{conversationId}
```

Scopes:

```text
read conversations
```

Filtros iniciais:

- `channel`;
- `status`;
- `updatedSince`;
- `limit`;
- `cursor`.

### Messages

```http
GET /public-api/v1/conversations/{conversationId}/messages
```

Scopes:

```text
read conversations messages
```

Filtros iniciais:

- `since`;
- `until`;
- `direction`;
- `limit`;
- `cursor`.

### Escrita fora do MVP inicial

Nao incluir no primeiro MVP:

```http
POST /public-api/v1/messages
POST /public-api/v1/conversations/{conversationId}/messages
POST /public-api/v1/campaigns
```

Motivo:

- risco de abuso;
- politica Meta;
- necessidade de idempotencia;
- custos;
- impacto operacional;
- exigencia de auditoria forte.

## Rate limit

Modelo: por tenant e por API key.

Cabecalhos recomendados:

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1760000000
```

Resposta quando exceder:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

Payload:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded.",
    "requestId": "req_123"
  }
}
```

Sugestao inicial:

| Plano | Limite inicial |
| --- | ---: |
| Default | 120 req/min |
| Licitacao/enterprise | configuravel |
| Burst | avaliar depois |

## Auditoria

Eventos obrigatorios:

```text
api.request
api.denied
api.rate_limited
```

### api.request

Emitir em toda chamada aceita.

Campos:

- `requestId`;
- `clientId`;
- `apiKeyId`;
- `method`;
- `path`;
- `statusCode`;
- `durationMs`;
- `scopeMatched`;
- `rateLimitRemaining`;
- `timestamp`.

### api.denied

Emitir quando a chamada for negada.

Motivos:

- chave ausente;
- chave invalida;
- chave revogada;
- escopo insuficiente;
- tenant inativo;
- recurso inexistente no tenant.

Nunca logar chave completa.

### api.rate_limited

Emitir quando exceder limite.

Campos:

- `requestId`;
- `clientId`;
- `apiKeyId`;
- `limit`;
- `window`;
- `path`;
- `timestamp`.

## Erros padronizados

Formato:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Insufficient scope.",
    "requestId": "req_123",
    "details": []
  }
}
```

Codigos iniciais:

| HTTP | Code | Uso |
| ---: | --- | --- |
| 400 | `bad_request` | Parametro invalido |
| 401 | `unauthorized` | Chave ausente/invalida |
| 403 | `forbidden` | Scope insuficiente |
| 404 | `not_found` | Recurso inexistente no tenant |
| 409 | `conflict` | Conflito futuro de escrita |
| 422 | `validation_failed` | Payload invalido |
| 429 | `rate_limited` | Limite excedido |
| 500 | `server_error` | Erro interno |

## Paginacao

Modelo recomendado: cursor.

Resposta:

```json
{
  "data": [],
  "page": {
    "nextCursor": "cursor_abc",
    "hasMore": true
  }
}
```

Regras:

- `limit` default 50;
- `limit` max 100;
- cursor opaco;
- ordenacao estavel por `updatedAt`/`id`.

## OpenAPI

Estrutura alvo:

```text
docs/saas/public-api/openapi.yaml
docs/saas/public-api/README.md
docs/saas/public-api/examples/
```

Estrutura inicial do OpenAPI:

```yaml
openapi: 3.1.0
info:
  title: Converta Public API
  version: 1.0.0
servers:
  - url: https://converta.re7online.com/public-api/v1
security:
  - bearerApiKey: []
components:
  securitySchemes:
    bearerApiKey:
      type: http
      scheme: bearer
  schemas:
    Contact:
      type: object
    Conversation:
      type: object
    Message:
      type: object
paths:
  /health:
    get:
      summary: Public API health
```

OpenAPI deve ser gerado/validado em sprint propria antes de declarar API publica pronta para edital.

## Webhooks outbound

Webhooks sao fase posterior ao MVP read-only.

### Eventos minimos

| Evento | Quando emitir |
| --- | --- |
| `conversation.created` | Nova conversa criada |
| `conversation.updated` | Status, departamento, atribuicao ou dados relevantes mudaram |
| `message.created` | Nova mensagem inbound/outbound persistida |
| `handoff.requested` | Automacao solicitou atendimento humano |
| `conversation.closed` | Atendimento finalizado |
| `contact.updated` | Dados do contato/lead mudaram |

### Modelo de entrega

Endpoint configurado por tenant:

```text
POST https://cliente.gov.br/webhooks/converta
```

Headers:

```http
X-Converta-Event: message.created
X-Converta-Delivery-Id: dlv_123
X-Converta-Signature: sha256=...
X-Converta-Timestamp: 1760000000
```

Assinatura:

```text
HMAC-SHA256(secret, timestamp + "." + rawBody)
```

Payload:

```json
{
  "id": "evt_123",
  "type": "message.created",
  "createdAt": "2026-06-20T12:00:00.000Z",
  "tenant": {
    "id": "client_123"
  },
  "data": {}
}
```

Regras:

- retry com backoff;
- limite de tentativas;
- status de entrega;
- segredo por endpoint;
- redaction quando necessario;
- nao incluir tokens internos;
- permitir desativar webhook sem afetar canais.

## Multi-tenant

Fluxo obrigatorio:

```text
API key
-> keyHash lookup
-> clientId
-> client status/features
-> scopes
-> rate limit
-> endpoint handler tenant-scoped
```

Regras:

- nao aceitar `tenantKey` ou `clientId` como seletor autoritativo;
- filtros sempre restritos ao `clientId` resolvido;
- testes obrigatorios de cross-tenant denial;
- auditoria deve registrar `clientId` interno, nao dados sensiveis.

## LGPD e minimizacao

Medidas obrigatorias:

- DTO publico reduzido;
- mascarar identificadores externos por padrao;
- controlar acesso a texto de mensagens via `messages` scope;
- expor midia somente por URL assinada e expirada, em fase posterior;
- respeitar retencao/anonimizacao existente;
- logar metadados, nao conteudo.

## Relacao com modulos existentes

| Modulo interno | Uso no design publico | Observacao |
| --- | --- | --- |
| Inbox/conversations | Base para conversations/messages | Criar DTO publico |
| CRM/timeline | Base para contacts/status/notas | Proteger PII |
| Reports | Futuro endpoint read-only | Baixo risco relativo |
| Campaigns | Fora do MVP inicial | Risco Meta/custo |
| Templates | Fora do MVP inicial | Exige governanca |
| Knowledge Base | Futuro endpoint read-only/admin | Nao entra no MVP 70C |
| Admin channel accounts | Nao expor | Interno/sensivel |
| Meta/OAuth | Nao expor | Interno/sensivel |

## Rollout recomendado

### Fase 1 - Design e contrato

- criar docs da API;
- definir modelos;
- validar OpenAPI;
- revisar LGPD;
- revisar seguranca.

### Fase 2 - Infra de chave e auditoria

- `PublicApiKey`;
- middleware de auth;
- rate limit;
- eventos `api.*`;
- testes de isolamento.

### Fase 3 - MVP read-only

- health;
- contacts;
- conversations;
- messages;
- OpenAPI publicada.

### Fase 4 - Webhooks outbound

- eventos minimos;
- assinatura HMAC;
- retry;
- dashboard/status.

### Fase 5 - Escrita controlada

- atualizar lead/status/nota;
- avaliar envio de mensagem;
- idempotency key;
- escopos estritos.

## Testes obrigatorios da implementacao futura

- API key valida resolve tenant correto;
- API key invalida retorna 401;
- scope insuficiente retorna 403;
- tenant A nao acessa recurso do tenant B;
- rate limit retorna 429;
- logs nao contem chave completa;
- payload nao contem token/ciphertext;
- paginação retorna cursor estavel;
- OpenAPI valida;
- endpoints read-only nao alteram banco;
- webhook signature valida no consumidor de teste.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Exposicao de PII | Alto | Scopes, DTO minimo, redaction e LGPD review |
| Cross-tenant data leak | Alto | Middleware obrigatorio por API key e testes |
| Abuso de mensagens/campanhas | Alto | Nao incluir escrita no MVP |
| Acoplamento com `/app` | Medio/alto | Criar camada publica separada |
| Falta de OpenAPI confiavel | Medio | OpenAPI como artefato obrigatorio |
| Rate limit insuficiente | Medio | Limite por API key e tenant |
| Webhook sem retry/auditoria | Medio | Implementar fila/status antes de liberar |

## Decisao

A API publica do Converta deve iniciar como **read-only, tenant-scoped e versionada**.

O MVP correto nao e "abrir as rotas existentes". O MVP correto e criar uma camada `/public-api/v1` com API Key, scopes, rate limit, auditoria e OpenAPI.

## Status de implementacao

Sprint 70C implementa apenas a fundacao segura:

- schema `PublicApiKey`;
- API key tenant-scoped com hash;
- gestao interna por ADMIN/SUPERVISOR;
- middleware de autenticacao para `/public-api/v1`;
- rate limit basico por chave;
- auditoria `api.request`, `api.denied`, `api.rate_limited`, `api.key.created`, `api.key.revoked`;
- `GET /public-api/v1/health`.

Sprint 70D amplia a API publica com o primeiro endpoint de negocio somente leitura:

- `GET /public-api/v1/contacts`;
- `GET /public-api/v1/contacts/{id}`;
- OpenAPI inicial em `docs/saas/public-api/openapi.yaml`;
- DTO publico minimo para contato:
  - `id`;
  - `name`;
  - `phone` mascarado;
  - `channel`;
  - `createdAt`;
  - `updatedAt`;
  - `lastConversationAt`;
  - `leadStatus`;
  - `tags`.

Sprint 70E amplia a API publica com conversas somente leitura:

- `GET /public-api/v1/conversations`;
- `GET /public-api/v1/conversations/{id}`;
- OpenAPI atualizado em `docs/saas/public-api/openapi.yaml`;
- DTO publico minimo para conversa:
  - `id`;
  - `status`;
  - `channel`;
  - `createdAt`;
  - `updatedAt`;
  - `assignedUser`;
  - `department`;
  - `contactId`;
  - `metrics`;
  - `lastActivityAt`.

Ainda ficam fora apos 70E:

- messages;
- campaigns;
- webhooks outbound;
- escrita publica.

Proxima sprint recomendada apos 70E: **Sprint 70F - Messages Read MVP**, ainda sem escrita:

1. messages read-only por conversa;
2. redacao/limites de PII;
3. exemplos de integracao e erros.
