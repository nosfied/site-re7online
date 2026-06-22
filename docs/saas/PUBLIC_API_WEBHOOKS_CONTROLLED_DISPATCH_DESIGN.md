# Sprint 70J.2 - Public API Webhook Controlled Dispatch Design

Data: 2026-06-22

Escopo: desenho tecnico e operacional do primeiro dispatch HTTP externo controlado para webhooks da API publica.

Esta sprint nao altera codigo, banco, migrations, runtime, canais, IA, chatbot, Scheduling, Webchat ou Public API REST. Tambem nao faz chamada HTTP externa. O objetivo e definir as regras antes da Sprint 70K, que podera implementar envio real apenas em modo manual/piloto.

## Estado Atual

As sprints anteriores deixaram a base de webhooks no seguinte estado:

- 70H: `WebhookEndpoint`, `WebhookDelivery`, `WebhookAttempt`, CRUD em `/app/webhooks`, feature `webhooks=false` por padrao;
- 70I: shadow/manual delivery com payload publico, `payloadHash`, HMAC shadow, delivery `shadow` e attempt `skipped`, sem HTTP externo;
- 70J.1: `signingSecretCiphertext`, `signingSecretKeyVersion`, `signingSecretRotatedAt`, rotacao de segredo e HMAC real preparado com segredo descriptografavel.

Ainda nao existe:

- cron/job/worker permanente;
- retry automatico;
- dead letter operacional por falha real;
- acoplamento com eventos reais de negocio.

Na Sprint 70K foi implementado o primeiro dispatch HTTP externo controlado:

- CLI `npm run webhooks:dispatch`;
- dry-run como comportamento default;
- envio real apenas com `--execute`;
- flags `webhookDispatch` e `webhookDispatchExecute`, ambas desligadas por padrao;
- HMAC real usando segredo criptografado;
- uma tentativa HTTP, sem redirects e sem retry automatico;
- status `pending`, `delivered` e `failed` em `WebhookDelivery`/`WebhookAttempt`;
- SSRF hardening com HTTPS obrigatorio, bloqueio de destinos internos e DNS validado antes do envio.

## Objetivo Do Dispatch Controlado

Validar, com baixo risco, a primeira chamada HTTP externa assinada pelo Converta para endpoint de webhook de um tenant piloto.

O dispatch inicial deve ser manual, explicito e reversivel. Ele nao deve nascer acoplado aos eventos reais de WhatsApp, Messenger, Instagram, Webchat, Scheduling, Satisfaction ou Public API.

## CLI Manual/Piloto

Comando futuro recomendado:

```bash
npm run webhooks:dispatch -- \
  --tenant demo-prefeitura \
  --endpoint <endpointId> \
  --event message.received \
  --payload-fixture minimal \
  --dry-run \
  --json
```

Regras:

- `--tenant` obrigatorio;
- `--endpoint` obrigatorio;
- `--event` obrigatorio;
- `--dry-run` deve ser o comportamento padrao;
- `--execute` deve ser obrigatorio para chamada HTTP real;
- `--json` deve emitir relatorio redigido;
- `--payload-fixture` pode usar fixture segura para `contact.created`, `conversation.created`, `message.received` e `message.sent`;
- `--payload-file` pode ser aceito futuramente, desde que passe por validacao e sanitizacao;
- sem `--execute`, nenhum socket HTTP externo deve ser aberto.

Exemplo de envio real futuro:

```bash
npm run webhooks:dispatch -- \
  --tenant demo-prefeitura \
  --endpoint <endpointId> \
  --event message.received \
  --payload-fixture minimal \
  --execute \
  --json
```

## Feature Flags

Flags futuras:

| Flag | Default | Finalidade |
| --- | --- | --- |
| `webhooks` | `false` | Exibe e permite gerenciar endpoints no tenant |
| `webhookDispatch` | `false` | Permite gerar deliveries para dispatch manual |
| `webhookDispatchExecute` | `false` | Permite abrir HTTP externo real |

Regras:

- `webhooks=true` e requisito para qualquer operacao;
- `webhookDispatch=true` habilita dry-run/persistencia manual;
- `webhookDispatchExecute=true` e requisito adicional para `--execute`;
- todas as flags devem ser avaliadas no tenant dono do endpoint;
- rollback deve ser possivel apenas desligando `webhookDispatchExecute`.

## Segurança E SSRF

O dispatch real deve reforcar a validacao ja usada no cadastro.

### Regras De URL

- permitir apenas `https://`;
- bloquear `localhost`;
- bloquear loopback IPv4 e IPv6;
- bloquear redes privadas RFC1918;
- bloquear link-local;
- bloquear multicast;
- bloquear IPs de metadata cloud, incluindo `169.254.169.254`;
- bloquear host sem DNS valido;
- bloquear URL com usuario/senha embutidos;
- bloquear porta incomum por padrao, salvo allowlist futura;
- bloquear redirect para destino nao permitido.

### DNS E Redirect

Antes do envio:

1. resolver DNS do host;
2. validar todos os IPs resolvidos;
3. abrir conexao somente se todos forem permitidos;
4. se houver redirect, resolver e validar novamente o novo destino;
5. bloquear redirect de HTTPS para HTTP;
6. bloquear mudanca para IP privado/loopback apos redirect;
7. limitar quantidade de redirects a no maximo 1 no MVP, ou bloquear redirects totalmente na primeira versao.

Recomendacao para 70K: bloquear redirects no primeiro dispatch real. Liberar redirects aumenta superficie de SSRF.

### Timeout E Resposta

Limites iniciais:

| Item | Valor recomendado |
| --- | --- |
| Timeout total HTTP | 5s |
| Timeout DNS/conexao | 2s |
| Response body max | 32 KB |
| Payload max | 128 KB |
| Redirects | 0 no MVP |
| User-Agent | `Converta-Webhooks/1.0` |

Nao persistir response body bruto. Persistir apenas `responseBodyHash`, `responseCode`, `durationMs` e `errorCode` redigido.

## Assinatura HMAC

O dispatch real deve usar o segredo descriptografado de `WebhookEndpoint.signingSecretCiphertext`.

Canonical string:

```text
timestamp + "." + rawBody
```

Algoritmo:

```text
HMAC-SHA256(secret, canonicalString)
```

Headers:

```http
Content-Type: application/json
User-Agent: Converta-Webhooks/1.0
X-Converta-Event: message.received
X-Converta-Delivery-Id: <deliveryId>
X-Converta-Timestamp: <unix_seconds>
X-Converta-Signature: sha256=<hex>
```

Regras:

- segredo em claro nunca deve ir para logs, API, UI ou banco;
- endpoints sem `signingSecretCiphertext` nao devem executar dispatch real;
- endpoint legado deve retornar erro controlado `webhook_secret_not_encrypted` e orientar rotacao;
- `rawBody` deve ser exatamente o JSON enviado.

## Delivery E Attempt

### WebhookDelivery.status

Estados futuros:

| Status | Uso |
| --- | --- |
| `pending` | Delivery criado para execucao futura/manual |
| `delivered` | Ultimo attempt retornou HTTP 2xx |
| `failed` | Falha apos tentativa manual, ainda reprocessavel |
| `skipped` | Nao executado por dry-run, endpoint inativo, flag desligada ou validacao |
| `dead_letter` | Falha definitiva ou limite atingido |
| `shadow` | Estado existente para 70I, sem HTTP externo |

### WebhookAttempt

Campos conceituais adicionais para versao futura:

| Campo | Finalidade |
| --- | --- |
| `requestStartedAt` | Inicio da tentativa |
| `requestFinishedAt` | Fim da tentativa |
| `responseCode` | Status HTTP, se houver |
| `responseBodyHash` | Hash SHA-256 do body truncado/limitado |
| `errorCode` | Codigo redigido de erro |
| `durationMs` | Duracao total |

Observacao: os campos acima podem exigir migration futura. Na 70K, se a decisao for evitar migration, parte desses dados pode ficar temporariamente em metadata redigida se ja houver campo compativel. Se nao houver campo, a 70K deve criar migration aditiva pequena.

## Retry Policy

Primeira versao de dispatch real:

- sem retry automatico;
- sem worker permanente;
- sem backoff automatico;
- retry apenas manual por CLI futuro;
- cada `--execute` cria no maximo uma tentativa HTTP.

Classificacao:

| Resultado | Status sugerido |
| --- | --- |
| HTTP 2xx | `delivered` |
| HTTP 3xx | `failed` ou `skipped` se redirect bloqueado antes da chamada |
| HTTP 4xx | `failed`, exceto politica futura de dead letter |
| HTTP 5xx | `failed` |
| timeout | `failed` |
| SSRF bloqueado | `skipped` |
| endpoint inativo | `skipped` |
| segredo ausente/legado | `skipped` |

Retry automatico so deve entrar depois que o dispatch manual estiver estavel e observado em tenant piloto.

## Dead Letter

Na primeira versao sem retry automatico, `dead_letter` deve ser raro e manual.

Marcar `dead_letter` quando:

- endpoint fica inativo antes da execucao de delivery pendente;
- payload excede limite e nao pode ser reduzido;
- segredo esta ausente e o endpoint nao e rotacionado;
- tentativas manuais excedem limite definido;
- falha definitiva e operador marca como encerrada.

Visualizacao futura em `/app/webhooks`:

- listar deliveries `failed` e `dead_letter`;
- mostrar ultimo `responseCode`;
- mostrar `errorCode` redigido;
- permitir copiar `deliveryId`;
- nao mostrar payload bruto ou segredo.

## Limites

Limites iniciais recomendados:

| Limite | Valor |
| --- | --- |
| Dispatches por comando | 1 |
| Dispatches por endpoint/minuto | 5 |
| Dispatches por tenant/minuto | 20 |
| Payload max | 128 KB |
| Response body max armazenavel | 0 bruto, apenas hash |
| Timeout | 5s |
| Attempts automaticos | 0 |
| Attempts manuais por delivery | 3 |

Esses limites devem ser constantes configuraveis antes de virarem plano comercial.

## Smoke Futuro

Usar endpoint controlado de teste, nunca endpoint de cliente real na primeira validacao.

Cenarios:

1. **Dry-run default**
   - `--dry-run`;
   - nenhum HTTP externo;
   - assinatura calculada;
   - relatorio redigido.

2. **HTTP 2xx**
   - endpoint controlado retorna 200;
   - delivery `delivered`;
   - attempt com `responseCode=200`;
   - assinatura validada no receptor.

3. **HTTP 4xx**
   - endpoint controlado retorna 400/403;
   - delivery `failed`;
   - attempt com `responseCode`;
   - sem retry automatico.

4. **Timeout**
   - endpoint demora mais que 5s;
   - delivery `failed`;
   - `errorCode=timeout`;
   - duration registrado.

5. **SSRF**
   - URL localhost/private/metadata;
   - chamada bloqueada antes do socket;
   - delivery `skipped`;
   - `errorCode=ssrf_blocked`.

6. **Endpoint legado**
   - endpoint sem ciphertext;
   - `--execute` bloqueado;
   - orientar rotacao;
   - shadow continua possivel.

## Auditoria

Eventos recomendados:

| Evento | Quando |
| --- | --- |
| `webhook.dispatch.dry_run` | Dispatch calculado sem HTTP |
| `webhook.dispatch.execute_requested` | Operador/CLI solicitou `--execute` |
| `webhook.dispatch.sent` | HTTP externo retornou 2xx |
| `webhook.dispatch.failed` | HTTP externo falhou |
| `webhook.dispatch.skipped` | Validacao/flag/SSRF bloqueou antes do envio |
| `webhook.dispatch.dead_lettered` | Delivery marcado como dead letter |

Campos permitidos:

- `clientId`;
- `endpointId`;
- `deliveryId`;
- `eventType`;
- `status`;
- `responseCode`;
- `durationMs`;
- `errorCode`;
- `requestId`.

Nao logar:

- segredo;
- ciphertext;
- raw response body;
- payload bruto se contiver PII;
- tokens;
- headers sensiveis.

## Rollback

Rollback imediato:

1. desligar `webhookDispatchExecute`;
2. manter `webhookDispatch` se ainda precisar de dry-run;
3. manter endpoints cadastrados;
4. manter shadow delivery;
5. nao apagar deliveries/attempts;
6. revisar logs por `deliveryId`.

Rollback por endpoint:

1. desativar endpoint em `/app/webhooks`;
2. rotacionar segredo se houver suspeita;
3. pausar reprocessamentos manuais.

Rollback por tenant:

1. desligar `webhooks`;
2. desligar `webhookDispatch`;
3. desligar `webhookDispatchExecute`;
4. preservar dados para auditoria.

## Ordem Recomendada

### 70K - Controlled Dispatch MVP

Implementar:

- CLI `webhooks:dispatch`;
- dry-run default;
- `--execute` protegido por `webhookDispatchExecute`;
- uma tentativa HTTP manual;
- SSRF reforcado;
- HMAC real com segredo criptografado;
- status `delivered`, `failed` e `skipped`;
- smoke com endpoint controlado.

Nao implementar:

- worker;
- cron;
- retry automatico;
- eventos reais;
- fan-out para varios endpoints;
- dispatch em massa.

Status: implementado como MVP manual/piloto, sem cron, sem dispatch automatico e sem acoplamento a eventos reais.

### 70L - Manual Retry + Dead Letter UI

Implementar depois:

- retry manual por delivery;
- visualizacao de failed/dead letter;
- controles por endpoint.

### 70M - Event Coupling Shadow

Antes de envio automatico:

- gerar deliveries shadow a partir de eventos reais;
- comparar volume;
- validar payloads;
- medir risco.

### 70N - Automatic Dispatch Pilot

Somente depois:

- tenant piloto;
- evento unico, por exemplo `message.received`;
- limites baixos;
- rollback por flag.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| SSRF | Alto | DNS validation, HTTPS, bloqueio de redes privadas, redirect bloqueado |
| Vazamento de segredo | Alto | segredo descriptografado apenas em memoria, redaction e testes |
| Vazamento de PII | Alto | payload publico minimo e response body hash-only |
| Endpoint lento degrada sistema | Medio/alto | CLI/manual primeiro, timeout curto, sem acoplar runtime |
| Reenvio duplicado | Medio | `X-Converta-Delivery-Id` e idempotencia no consumidor |
| Cliente interpreta dry-run como envio | Medio | CLI com `--execute` obrigatorio e relatorio claro |
| Dead letter sem visibilidade | Medio | UI/report antes de retry automatico |

## Criterio Para Liberar Implementacao 70K

Antes de implementar 70K:

- confirmar endpoint controlado para smoke;
- confirmar `WEBHOOK_SECRET_ENCRYPTION_KEY` em producao;
- confirmar pelo menos um endpoint com `secretStatus=encrypted`;
- manter `webhookDispatchExecute=false` por default;
- definir se a 70K precisa migration para campos adicionais de attempt;
- revisar testes SSRF;
- definir payload fixture minimo.

## Conclusao

O Converta ja tem os pre-requisitos tecnicos para assinar webhooks reais: endpoints tenant-scoped, segredo criptografado, rotacao, shadow delivery e HMAC preparado. O primeiro envio HTTP externo deve ser introduzido apenas como dispatch manual/piloto, com `--dry-run` default, `--execute` explicito, SSRF reforcado, timeout curto e rollback por flag.
