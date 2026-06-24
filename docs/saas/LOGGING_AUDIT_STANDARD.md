# Sprint 78B - Logging & Audit Standard

Data: 2026-06-24

Escopo: padronizacao interna de logging, redaction e auditoria operacional do Converta.

Nao foram introduzidas dependencias externas, dashboards, Prometheus, OpenTelemetry, Grafana ou infraestrutura nova.

## Auditoria Inicial

### O Que Ja Existia

| Item | Evidencia | Leitura |
| --- | --- | --- |
| Logger central | `apps/whatsapp-agent/src/logger/logger.ts` | Base reaproveitada. |
| Logs JSON | `logger.info/warn/error` serializam JSON | Mantido. |
| Contexto async | `AsyncLocalStorage` no logger | Reaproveitado para `requestId`, `correlationId` e tenant. |
| RequestId | Mensagens, eventos, rotas, scripts e reports usam `requestId` | Reaproveitado. |
| Auditoria persistida | model `Event` tenant-scoped | Reaproveitado. |
| Tenant scope | muitos eventos usam `clientId`; alguns usam `tenantId` | Padronizado no envelope como `tenantId`, preservando `clientId`. |
| Modulos sensiveis | MFA, webhooks, audio, search, scheduling, telegram, webchat, Public API | Ja registram eventos redigidos em varios fluxos. |
| Scripts CLI | muitos usam `console.log` para relatorios JSON/dry-run | Mantidos fora do runtime; nao foram refatorados nesta sprint. |

### O Que Foi Reaproveitado

- `logger` central;
- `AsyncLocalStorage`;
- eventos existentes sem renomeacao;
- `requestId`;
- `clientId`;
- `tenantId` quando ja presente;
- model `Event`;
- padrao de logs JSON;
- taxonomia de eventos ja existente por modulo.

### O Que Foi Padronizado

- envelope de log passa a incluir `level`;
- `correlationId` usa valor explicito ou cai para `requestId`;
- `tenantId` usa valor explicito ou cai para `clientId`;
- campos padrao passam a existir no output:
  - `timestamp`;
  - `level`;
  - `event`;
  - `requestId`;
  - `correlationId`;
  - `tenantId`;
  - `userId`;
  - `channel`;
  - `module`;
  - `durationMs`.
- redaction passa a ser recursiva;
- suporte a `debug` foi adicionado no logger central.

### O Que Precisou Nascer

- redaction recursiva central;
- mascaramento de PII basico para `email`, `phone`, `waId` e `externalUserRef`;
- helper testavel `redactLogValue`;
- helper testavel `buildLogRecord`;
- testes focados do logger.

## Envelope Padrao

Todo log operacional deve seguir o formato:

```json
{
  "timestamp": "2026-06-24T00:00:00.000Z",
  "level": "info",
  "event": "module.action",
  "requestId": "request-id",
  "correlationId": "correlation-id",
  "tenantId": "client-id",
  "userId": "user-id",
  "channel": "whatsapp",
  "module": "public_api",
  "durationMs": 12,
  "metadata": {}
}
```

Campos adicionais existentes continuam permitidos para compatibilidade, mas novos logs devem preferir:

- `event` para nome da acao;
- `module` para area;
- `metadata` para detalhes nao sensiveis;
- `durationMs` para tempo da operacao;
- `tenantId` como alias operacional de `clientId`.

## Severidade

| Level | Uso |
| --- | --- |
| `debug` | diagnostico local, amostragem ou flag explicita. |
| `info` | eventos operacionais esperados. |
| `warn` | fallback, bloqueio esperado, validacao negada, retry/skipped. |
| `error` | falha inesperada, excecao, provider error, persistencia ou corrupcao. |

## Taxonomia

Eventos novos devem seguir:

| Prefixo | Modulo |
| --- | --- |
| `auth.*` | login, sessoes, password reset |
| `mfa.*` ou `login.mfa_*` | MFA e desafios de login |
| `search.*` | busca/indexacao |
| `audio.*` | transcricao de audio |
| `telegram.*` | canal Telegram |
| `webchat.*` | canal Webchat |
| `webhook.*` | webhooks publicos |
| `public_api.*` ou `api.*` | API publica |
| `campaign.*` | campanhas |
| `scheduling.*` ou `appointment.*` | agendamento |
| `channel_accounts.*` | contas de canal |

Eventos existentes nao devem ser renomeados apenas por estetica. Renomeacao so deve ocorrer se houver migracao documentada ou compatibilidade.

## Redaction

O logger central redige recursivamente chaves relacionadas a:

- tokens;
- Authorization/Bearer;
- secrets;
- ciphertext;
- password;
- cookies;
- OTP/TOTP/MFA/recovery codes;
- raw payload;
- media URL;
- transcript.

Tambem mascara:

- `email`;
- `phone`;
- `waId`;
- `externalUserRef`.

Regras:

- nunca logar segredo bruto;
- nunca logar ciphertext;
- nunca logar codigo MFA/OTP/recovery;
- nunca logar transcript de audio;
- nunca logar payload bruto de provider;
- nunca logar URL completa de midia;
- nunca logar cookie ou Authorization.

## Auditoria Persistida

O model `Event` continua sendo a base de auditoria:

- `clientId`;
- `eventName`;
- `requestId`;
- `messageId`;
- `conversationId`;
- `payloadJson`;
- `createdAt`.

Regras para novos eventos:

- `payloadJson` deve ser redigido antes de persistir;
- `requestId` deve ser unico por evento quando houver constraint;
- eventos de seguranca devem evitar PII;
- eventos de negacao devem usar motivos genericos;
- eventos de sucesso podem guardar contagens e IDs internos tenant-scoped.

## Modulos Auditados

| Modulo | Estado 78B |
| --- | --- |
| Login/Auth/MFA | Usa eventos e logger; redaction central agora cobre codes/secrets/cookies. |
| Public API | Mantem eventos `api.*`; envelope central passa a padronizar `tenantId`/`correlationId`. |
| Webhooks | Mantem eventos e segredo criptografado; redaction central cobre token/secret/ciphertext. |
| Scheduling | Mantem eventos de shadow/send; logger central reduz risco de template/token em log. |
| Search | Mantem eventos shadow/index; logger central preserva request/correlation. |
| Audio | Mantem eventos shadow/process; transcript/mediaUrl sao redigidos centralmente. |
| Telegram/Webchat | Mantem taxonomia por canal; redaction central cobre tokens/payloads. |
| Campaigns | Ja usa logger e requestId; mantido. |
| CLIs | Continuam com `console.log` para relatorio humano/JSON; nao fazem parte do runtime logger nesta sprint. |

## Testes Criados

Arquivo:

- `apps/whatsapp-agent/src/logger/logger.test.ts`

Cobertura:

- redaction recursiva;
- mascaramento de PII;
- `requestId`;
- `correlationId`;
- `tenantId` derivado de `clientId`;
- preservacao de contexto via `logger.withContext`;
- ausencia de vazamento de cookie, media URL, recovery code, token, ciphertext, transcript e raw payload.

## Fora De Escopo

- dashboards;
- Prometheus;
- OpenTelemetry;
- Grafana;
- tracing distribuido;
- alertas externos;
- refatoracao de todos os scripts CLI;
- renomeacao massiva de eventos existentes;
- mudanca no model `Event`.

## Proxima Etapa

Sprint recomendada: **78C - Metrics Foundation**.

Pre-condicoes:

- logger central endurecido;
- redaction testada;
- envelope padrao documentado;
- taxonomia acordada.

## Confirmacao De Escopo

Sprint 78B:

- nao altera banco;
- nao cria migration;
- nao adiciona dependencia externa;
- nao adiciona dashboard;
- nao adiciona provider;
- nao altera canais;
- nao altera login/MFA runtime;
- nao altera comportamento funcional do usuario.
