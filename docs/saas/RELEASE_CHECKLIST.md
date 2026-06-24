# Release Checklist

Status: checklist operacional atual do Converta. Este documento nao altera runtime.

## Escopo

Usar este checklist antes de qualquer deploy do RE7ONLINE WhatsApp Agent / Converta.

O checklist cobre:

- backend `apps/whatsapp-agent`
- frontend Next.js raiz
- PM2 em producao
- smoke operacional dos modulos SaaS

## Classificar Release

Antes de executar, classificar a mudanca conforme `docs/saas/CHANGE_POLICY.md`:

- Tipo A: correcao visual
- Tipo B: feature nova
- Tipo C: mudanca estrutural
- Tipo D: migration

## Pre-Release Basico

- Confirmar branch/commit correto.
- Conferir `git status --short`.
- Confirmar que nao existem secrets, dumps, `.data`, tokens ou temporarios no diff.
- Rodar `git diff --check`.
- Conferir se a mudanca exige update documental.
- Se tocar automacao/IA, rodar `npm run evaluation:replay` em `apps/whatsapp-agent`.
- Se tocar canais, rodar testes focados de canais/webhooks quando aplicavel.

## Backend

Diretorio:

```bash
cd apps/whatsapp-agent
```

Validacoes:

```bash
npm run db:generate
npm run build
```

Lint:

- Nao existe script `lint` no `apps/whatsapp-agent/package.json` no estado atual.
- Se um script de lint for adicionado futuramente, ele passa a ser obrigatorio neste checklist.

Prisma:

- Se houver migration nova em `apps/whatsapp-agent/prisma/migrations`, revisar se e destrutiva.
- Antes de production deploy com migration, seguir `docs/RUNBOOK_WHATSAPP_AGENT.md`.
- Em producao, aplicar migration com:

```bash
npm run db:deploy
```

Somente executar `db:deploy` quando a release tiver migration aprovada.

Webhooks Public API:

- Releases que criam ou rotacionam segredo de webhook exigem `WEBHOOK_SECRET_ENCRYPTION_KEY` configurada em producao.
- A chave deve ser estavel, forte e nunca commitada.
- Sem essa env, endpoints legados continuam listaveis, mas criacao/rotacao de segredo deve falhar de forma controlada.
- Releases futuras que executem dispatch HTTP externo de webhooks devem exigir flags explicitas por tenant, com dry-run default, SSRF reforcado, timeout curto e smoke contra endpoint controlado.
- Nenhum deploy deve ativar `webhookDispatchExecute` por padrao.

MFA/TOTP:

- Releases que toquem MFA devem manter `mfaRequired=false` e `mfaEnforced=false` por padrao ate sprint propria de runtime.
- `MFA_SECRET_ENCRYPTION_KEY` deve estar configurada, forte e estavel em producao antes de enrollment ou verificacao TOTP.
- `/app/mfa/verify-shadow` deve validar codigo TOTP sem alterar login, JWT, `AppAuthSession`, password reset ou enforcement.
- O smoke de producao deve validar:

```bash
GET /app/mfa
POST /app/mfa/enrollment
POST /app/mfa/verify-shadow
GET /app/mfa/recovery-codes/status
POST /app/mfa/recovery-codes/generate
```

- Confirmar que segredo, ciphertext e codigo TOTP nao aparecem em resposta, log ou listagem.
- Recovery codes devem ser exibidos apenas na resposta de geracao/regeneracao, armazenados somente como hash e nunca retornados por status/listagem.
- O smoke de recovery codes deve cobrir: `mfa=false` bloqueado, geracao com `mfa=true`, status sem codigos/hash, regeneracao invalida codigos antigos nao usados, `AGENT` bloqueado e login ainda funcionando sem MFA obrigatorio.
- MFA obrigatorio em login so pode ser ativado em sprint/runtime propria com rollback por `mfaEnforced=false`.
- A primeira sprint de runtime deve ser shadow: avaliar politica e auditar `login.mfa_shadow_required`/`login.mfa_shadow_not_required`/`login.mfa_shadow_skipped` sem bloquear login.
- Runtime shadow de MFA deve preservar resposta atual de `/auth/login`, emissao de JWT e criacao de `AppAuthSession`; o smoke deve comparar que login continua 200 sem `mfaRequired` bloqueante.
- Enforcement de login exige tenant piloto, perfil inicial `ADMIN`, desafio temporario com TTL curto, maximo de tentativas, smoke de login/MFA e plano de rollback por `mfaEnforced=false`.
- Nao expandir enforcement para `SUPERVISOR`/`AGENT` antes de recovery codes ou procedimento assistido aprovado.
- Sprint de enforcement deve validar que `/auth/login` nao emite JWT final nem cria `AppAuthSession` final antes do TOTP valido quando `mfaEnforced=true`.
- O smoke de enforcement deve cobrir: challenge criado, codigo invalido, codigo valido, challenge expirado, excesso de tentativas, rollback `mfaEnforced=false` e login ADMIN recuperado.
- Nao ligar enforcement se houver risco de travar o ultimo ADMIN do tenant piloto.

Scheduling reminders:

- Releases que toquem envio de lembretes devem manter `schedulingRemindersSend=false` por padrao.
- `npm run scheduling-reminders:send` deve operar em dry-run por default.
- Qualquer envio real exige `--tenant`, `--execute`, limite baixo e tenant piloto com `schedulingRemindersSend=true`.
- O smoke de producao deve validar primeiro:

```bash
npm run scheduling-reminders:send -- --tenant demo-prefeitura --json
```

- Nao criar cron, worker ou scheduler automatico sem sprint propria.
- Nao enviar lembrete sem template aprovado no MVP controlado.

Audio transcription:

- Releases que toquem transcricao devem manter `audioTranscriptionRuntime=false` por padrao.
- `npm run audio-transcriptions:shadow` deve operar em dry-run por default.
- `--record` pode criar apenas registros `shadow/skipped`; nao deve baixar midia, chamar provider STT ou gerar transcript real.
- Processamento real usa CLI manual `npm run audio-transcriptions:process`, com `--dry-run` default e `--execute` explicito.
- Antes de executar provider, confirmar custo vigente, DPA/LGPD, `OPENAI_API_KEY`, limites por tenant e rollback por `audioTranscriptionRuntime=false`.
- Smoke recomendado:

```bash
npm run audio-transcriptions:shadow -- --tenant demo-prefeitura --json
npm run audio-transcriptions:process -- --tenant demo-prefeitura --json
```

- Execute real deve ser feito apenas em tenant piloto:

```bash
npm run audio-transcriptions:process -- --tenant demo-prefeitura --message <messageId> --execute --json
```

- Piloto com midia real deve seguir `docs/saas/AUDIO_TRANSCRIPTION_REAL_MEDIA_PILOT_DESIGN.md`: audio autorizado, ate 3 audios iniciais, ate 60 segundos por audio, `messageId` explicito, revisao de logs, cleanup confirmado e `audioTranscriptionRuntime=false` ao final.
- Processamento real de audio exige provider aprovado, politica LGPD/retencao, limpeza de arquivo temporario e rollback por flag.

Advanced search:

- Releases que toquem busca avancada devem manter `advancedSearchRuntime=false` por padrao.
- `npm run search:index-shadow` deve operar em dry-run por default.
- `--record` pode criar apenas registros `SearchIndex`; nao deve alterar Inbox, IA, canais ou runtime de busca.
- Busca textual em `/app/search?q=...` exige `advancedSearchRuntime=true` no tenant piloto.
- Com `advancedSearchRuntime=false`, `/app/search` deve continuar acessivel em modo diagnostico e bloquear apenas consultas textuais com `q`.
- O runtime 76D nao pode criar indice automaticamente, nao pode alterar Inbox, nao pode chamar IA e nao pode consultar canais.
- Smoke recomendado:

```bash
npm run search:index-shadow -- --tenant demo-prefeitura --json
npm run search:index-shadow -- --tenant demo-prefeitura --json --record
```

- Execute `--record` somente em tenant piloto com `advancedSearch=true` e `advancedSearchRuntime=false`.
- Para smoke runtime, habilite temporariamente `advancedSearchRuntime=true`, valide `/app/search` com texto/filtros/paginacao, e retorne a flag para `false` se a busca ainda nao for ficar disponivel para usuarios finais.
- Indexacao de transcricoes deve usar `npm run search:index-audio` em dry-run por default.
- `search:index-audio --record` exige `advancedSearch=true`, `advancedSearchRuntime=true` e `audioTranscription=true`, e so deve gravar transcricoes `completed` como `source=audio_transcription`.
- `search:index-audio` nao pode baixar midia, chamar STT, processar audio, alterar Inbox, usar IA ou criar job automatico.

## Frontend

Diretorio raiz do repo:

```bash
npm run build
```

Lint frontend:

```bash
npm run lint
```

Observacao:

- O frontend raiz possui script `lint`.
- Se a release for somente backend/docs e o tempo operacional exigir corte menor, registrar no result report quando o lint nao for executado.

## Operacao VPS

Ordem padrao sem migration:

1. `git pull`
2. instalar dependencias se `package.json` ou lock mudar
3. build backend
4. build frontend
5. PM2 reload
6. health check

PM2:

```bash
pm2 reload re7-whatsapp-agent --update-env
pm2 reload re7-admin-front --update-env
```

Health:

```bash
curl -sS https://converta.re7online.com/agent-api/health
```

Resultado esperado:

- HTTP 200
- JSON ou payload de health saudavel

## Smoke Tests

### Inbox

- Abrir `/app/inbox`.
- Confirmar lista de conversas.
- Abrir conversa WhatsApp.
- Abrir conversa Messenger se existir.
- Abrir filtro Instagram se aplicavel.
- Confirmar realtime sem duplicidade perceptivel.

### Chatbot

- Abrir `/app/chatbot`.
- Confirmar carregamento de settings.
- Se a release tocou automacao, validar tenant de teste ou replay.
- Nao alterar fluxos de tenant em smoke sem aprovacao.

### Dashboard

- Abrir `/app/dashboard`.
- Validar que o perfil/feature do tenant permite ou nega corretamente.

### Campaigns

- Abrir `/app/campaigns`.
- Confirmar listagem.
- Nao disparar campanha real em smoke padrao.

### Templates

- Abrir `/app/templates`.
- Confirmar listagem/status.
- Se tocou Meta templates, validar token/status sem expor secret.

### CRM Timeline

- Abrir CRM ou timeline da conversa.
- Confirmar leads/notas/historico basico.
- Confirmar que retention/LGPD nao removeu dados inesperadamente.

### Canais

WhatsApp:

```bash
npm run channels:shadow:compare -- --json
```

Tenant config / channel account migrations:

```bash
npm run tenants-json:retirement:check
```

Use this command whenever the release touches tenant configuration, channel accounts, OAuth, webhook tenant resolution or JSON fallback removal. The command must not expose tokens and must report whether the database was reachable.

Messenger:

- Validar pelo menos uma conversa ou status de token se a release tocou Meta.

Instagram:

- Validar apenas se a release tocou Instagram.
- Nao ativar outbound/flags em smoke sem escopo explicito.

## Pos-Deploy

Verificar:

- PM2 status dos processos.
- Health da API.
- Rotas principais: `/app/login`, `/app/inbox`, `/admin`.
- Logs recentes do backend.
- Erros 5xx.
- Eventos criticos:
  - falha de auth
  - falha de webhook
  - erro de token Meta
  - erro de DB
  - fila de notificacao/push anormal

## Result Report Minimo

Todo deploy deve registrar:

- commit hash
- tipo da mudanca
- build backend: OK/falhou/nao aplicavel
- build frontend: OK/falhou/nao aplicavel
- migrations: sim/nao
- PM2 reload: OK/falhou
- health: OK/falhou
- smoke inbox: OK/falhou/nao executado
- shadow compare WhatsApp: OK/falhou/nao executado
- pendencias
