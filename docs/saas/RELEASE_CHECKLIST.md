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
- Se tocar capacidade, swap, PM2, banco, HA, build ou carga, atualizar `docs/saas/OPERATIONAL_BASELINE.md`.
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

Em VPS com cerca de 2 GiB RAM, executar o build backend antes do frontend. Nao rodar build backend/frontend em paralelo enquanto `docs/saas/OPERATIONAL_BASELINE.md` indicar baixa memoria ou ausencia de swap.

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
POST /auth/mfa/verify
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
- Na Sprint 77H, recovery codes nao entram no login; smoke deve confirmar que recovery code continua rejeitado em `/auth/login` e `/auth/mfa/verify`.
- Rollback de 77H: desligar `mfaEnforced=false` no tenant piloto, recarregar backend se necessario e confirmar login ADMIN voltou ao contrato atual com JWT/sessao imediatos.
- Recovery code no login deve entrar somente em sprint propria apos 77I, com flag dedicada recomendada `mfaRecoveryLogin=false` por padrao.
- Smoke futuro de recovery login deve cobrir: TOTP continua funcionando, recovery valido emite sessao e marca `usedAt`, recovery reutilizado falha, recovery esgotado falha, erro generico sem revelar validade do codigo e rollback para TOTP-only.
- Recovery login nunca deve logar codigo bruto, hash, segredo TOTP, ciphertext ou indicar se o codigo existe, ja foi usado ou pertence ao usuario.
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

Relatorios mensais:

- Releases que toquem `/app/reports` ou `/app/reports/conversations` devem validar o periodo `Mes fechado anterior`.
- O smoke minimo e:
  - abrir `/app/reports`;
  - selecionar `Mes fechado anterior`;
  - confirmar indicadores de conversas, primeira resposta, resolucao, automatizados, transferencias, por atendente e por setor;
  - gerar PDF;
  - exportar CSV;
  - confirmar coluna `protocol` no CSV quando houver conversas.
- O envio mensal ao fiscal do contrato e uma rotina operacional/comercial; esta release nao cria scheduler, e-mail automatico ou cron de envio.

SIMAE 25 usuarios:

- Releases que toquem usuarios app, departamentos, filas, claim/release ou transferencia devem repetir a prova tecnica de aceite SIMAE:

```bash
cd apps/whatsapp-agent
node --import tsx src/http/simae25UsersAcceptance.test.ts
```

- O teste deve comprovar tenant isolado com `maxActiveAppUsers=25`, 25 usuarios ativos permitidos, 26o usuario bloqueado, RBAC por departamento, isolamento multitenant, claim, transferencia entre atendentes e transferencia entre departamentos.

PostgreSQL backup:

- Releases com migration ou mudanca estrutural devem confirmar que existe backup PostgreSQL recente, valido e com checksum.
- A rotina padrao e:

```bash
npm run backup:postgres
```

- O backup deve gerar:
  - arquivo `.dump` em formato custom;
  - arquivo `.dump.sha256`;
  - entrada em `backups/postgres/manifest.jsonl`;
  - status `backup.success`.
- Se `POSTGRES_BACKUP_OFFSITE_TARGET` estiver configurado, o backup tambem deve copiar `.dump` e `.dump.sha256` para o destino offsite e registrar `offsiteStatus=success`.
- Destinos offsite suportados pela rotina:
  - `file:///mnt/backup-postgres` ou caminho local/montado;
  - `rclone:<remote:path>` quando `rclone` estiver instalado/configurado fora do repo;
  - `scp:<usuario@host:/caminho>` quando chave SSH operacional estiver configurada fora do repo.
- Nunca commitar credenciais, dumps ou configuracoes de segredo do destino offsite.
- O backup deve rejeitar:
  - dump vazio;
  - dump menor que `POSTGRES_BACKUP_MIN_BYTES`;
  - dump invalido em `pg_restore --list`;
  - dump com menos objetos que `POSTGRES_BACKUP_MIN_OBJECTS`.
- O cron recomendado, apos pre-release, e:

```bash
20 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run backup:postgres >> /opt/re7online/site-re7online/apps/whatsapp-agent/backups/postgres/postgres-backup-cron.log 2>&1
```

- O smoke operacional deve validar:

```bash
npm run backup:postgres
tail -n 1 backups/postgres/manifest.jsonl
(cd backups/postgres && sha256sum -c *.dump.sha256)
pg_restore --list backups/postgres/<arquivo>.dump
npm run backup:evidence -- status --manifest backups/postgres/manifest.jsonl --require-offsite
```

- Em producao com PostgreSQL em Docker, o script usa por padrao o container `wa-agent-postgres`.
- Em ambiente local sem Docker, usar `DATABASE_URL` com `POSTGRES_BACKUP_MODE=local`.
- Dumps e manifestos nao devem ser commitados.
- A 83E implementa suporte offsite opcional/configuravel; em contratos com exigencia formal, configurar destino externo e anexar o resultado de `backup:evidence status` ao dossie operacional.

Restore drill evidence:

- Restore nunca deve ser executado sobre producao.
- Para drill, restaurar o dump em banco isolado/temporario, validar checksum e registrar evidencia local:

```bash
npm run backup:evidence -- restore-drill \
  --backup-file backups/postgres/<arquivo>.dump \
  --sha256-file backups/postgres/<arquivo>.dump.sha256 \
  --restored-into restore_validation_<data> \
  --responsible "operacao" \
  --observations "restore isolado validado"
```

- O comando gera/apenda `backups/postgres/restore-drills.jsonl`; esse arquivo operacional nao deve ser versionado.
- Para contrato com exigencia de historico formal, exportar/anexar mensalmente o status e o drill ao dossie operacional.

Load test:

- Carga real pesada nao deve ser executada diretamente na VPS de producao como primeira etapa.
- O plano oficial esta em `docs/saas/LOAD_TEST_DESIGN.md`.
- Antes de qualquer teste de carga, confirmar:
  - backup PostgreSQL atual e valido;
  - health OK;
  - PM2 online;
  - janela de execucao definida;
  - comando de parada conhecido;
  - dados de teste/sanitizados;
  - provider externo real desabilitado ou controlado.
- Producao deve receber apenas smoke de baixa intensidade, com limite de RPS e duracao curta.
- Testes nominal, pico, stress, soak e spike devem rodar primeiro em staging/ambiente isolado.
- Coletar antes/depois:
  - `/admin/ops/metrics`;
  - `/admin/ops/alerts`;
  - PM2 status;
  - health;
  - disco/memoria/CPU.
- Criterios minimos de abort:
  - 5xx acima de 1% em smoke;
  - p95 muito acima do baseline;
  - memoria livre abaixo de 20%;
  - DB health diferente de OK;
  - restart PM2 inesperado.

SLA/incidentes operacionais:

- Releases que toquem health, metricas, alertas, deploy, PM2, banco ou canais criticos devem registrar evidencia operacional do periodo.
- Endpoints protegidos:
  - `GET /admin/ops/sla/monthly?month=YYYY-MM`
  - `GET /admin/ops/incidents?month=YYYY-MM`
  - `POST /admin/ops/incidents`
  - `GET /admin/ops/maintenances?month=YYYY-MM`
  - `POST /admin/ops/maintenances`
- Smoke minimo:
  - consultar `/health`;
  - consultar `/admin/ops/metrics`;
  - consultar `/admin/ops/alerts`;
  - consultar `/admin/ops/sla/monthly?month=YYYY-MM`;
  - se houver falha real, registrar incidente com severidade, impacto, inicio/fim, causa provavel, acao adotada e comunicacao ao cliente;
  - se houver janela programada, registrar manutencao com periodo, motivo, impacto esperado e comunicacao previa.
- A evidencia 83D e interna/em memoria; para contrato com exigencia de historico formal, exportar/anexar o snapshot mensal ao dossie operacional ou evoluir para persistencia aprovada.

Pacote operacional SIMAE:

- Antes de go-live SIMAE, revisar `docs/bids/2026/simae-capinzal-sc/SIMAE_SUPPORT_SLA_TRAINING_PACK.md`.
- Confirmar:
  - canais oficiais de suporte;
  - horario de atendimento;
  - severidades e escalonamento;
  - primeira resposta critica em ate 1 hora;
  - meta de resolucao critica em ate 24 horas quando tecnicamente possivel;
  - roteiro de treinamento inicial;
  - checklist de implantacao/aceite;
  - procedimento de manutencao programada;
  - modelo de comunicacao de incidente.
- Nao incluir telefones pessoais, credenciais, tokens, dumps ou dados privados no dossie do contrato.

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

### Operacao / Observabilidade

- Abrir `/admin/ops` quando a release tocar metricas, health, logging ou operacao.
- Confirmar que `/admin/ops/metrics` segue protegido.
- Confirmar que o snapshot nao expoe token, secret, cookie, Authorization, telefone, e-mail, waId, transcript, media URL ou raw payload.
- Se a release tocar alerting futuro, validar primeiro com `alerting=false` e sem envio externo.
- Alertas reais devem permanecer atras de flag explicita e rollback por flag.
- Se a release tocar HA/escala/infra, registrar explicitamente: SPOFs afetados, backup antes da mudanca, plano de rollback, health pos-reload e impacto em PM2/Postgres/Nginx/DNS/storage.
- Em VPS com pouca RAM, manter builds sequenciais e evitar build frontend/backend em paralelo.
- Se a release tocar swap, confirmar `free -m`, `swapon --show`, rollback por `swapoff` e atualizar `OPERATIONAL_BASELINE.md`. Criacao de swap exige acesso administrativo; nao simular por caminho paralelo.
- Se a release tocar backup/restore, confirmar: ultimo backup valido, tamanho nao-zero, destino local/offsite, checksum quando existir, plano de restore e que nenhum secret/dump sera enviado por chat ou versionado no Git.
- Restore validation deve usar banco temporario isolado e deve confirmar `TEMP_DB_REMAINING=0` ao final.

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

### Metrics Foundation

- `GET /admin/ops/metrics` deve permanecer protegido pelo mesmo fluxo de `/admin/*`.
- O snapshot de metricas nao deve conter token, secret, cookie, Authorization, telefone, e-mail, waId, transcript, mediaUrl ou raw payload.
- Smokes de release devem validar `/health`, uma chamada autenticada a `/admin/ops/metrics` e presenca de `http.requests`, `http.request.duration` e `health.db.status` quando houver trafego.
- Metricas da 78C sao em memoria e podem zerar em reload PM2; nao usar como fonte historica contratual ate sprint de dashboards/exportacao.

### Load Test Fixtures

Para carga autenticada controlada:

```bash
cd apps/whatsapp-agent
npm run load-test:tenant:bootstrap -- status --tenant loadtest-prefeitura --json
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime false --execute --json
npm run load-test:fixtures -- prepare --tenant loadtest-prefeitura --users 20 --login-users 2 --api-keys 20
npm run search:index-shadow -- --tenant loadtest-prefeitura --json --record
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime true --execute --json
```

O `prepare` precisa confirmar o fluxo completo de Webchat:

```text
session -> inbound -> conversation -> claim -> outbound -> timeline
```

Se houver `claim_failed`, `conversation_not_found`, `conversation_not_assigned` ou ausencia de `OutboundMessage`, interromper a release de carga e corrigir o fluxo real antes da 78N.3.

Desde a 78N.6, o `prepare` tambem precisa confirmar `inboxDetail` e gerar `INBOX_DETAIL_CONVERSATIONS_JSON`. Antes de repetir carga maior, validar:

```bash
npm run load-test:fixtures -- status
PROFILE=vu1 DURATION=30s ../../load-tests/k6/run-load-profile.sh inbox-detail
PROFILE=vu5 DURATION=30s ../../load-tests/k6/run-load-profile.sh inbox-detail
```

O resultado esperado e `0%` erro, sem `session_replaced` e sem `Conversa fora do seu departamento`.

Depois:

```bash
set -a
source ../../load-tests/k6/results/fixtures.env
set +a
PROFILE=vu20 DURATION=30s ../../load-tests/k6/run-load-profile.sh public-api
PROFILE=vu20 DURATION=30s ../../load-tests/k6/run-load-profile.sh search
PROFILE=vu20 DURATION=30s ../../load-tests/k6/run-load-profile.sh inbox-read
PROFILE=vu20 DURATION=30s ../../load-tests/k6/run-load-profile.sh inbox-detail
```

Desde a 78N.4, `login` e cenario separado de protecao:

```bash
PROFILE=vu1 DURATION=30s SLEEP_SECONDS=5 ../../load-tests/k6/run-load-profile.sh login
```

Nao executar `login` com `vu5`, `vu10`, `vu20` ou `vu50`. As rotas autenticadas devem reutilizar `APP_TOKENS_JSON` gerado pelo `prepare`, sem martelar `/auth/login`.

Ao final, sempre executar:

```bash
npm run load-test:fixtures -- cleanup --tenant loadtest-prefeitura
```

Preservar `load-tests/k6/results/fixtures.env` ate o cleanup, porque ele contem segredos temporarios necessarios para revogar API keys e arquivar o site Webchat pelo fluxo app. Nunca versionar `fixtures.env` ou manifests com segredos temporarios.
O cleanup tambem remove `SearchIndex` do tenant tecnico. Nao executar cleanup antes de concluir a carga planejada.

Nao usar `demo-prefeitura` para carga. Esse tenant e reservado a demonstracoes, POC e validacao funcional. Testes de carga devem usar tenant tecnico dedicado, conforme `docs/saas/LOAD_TEST_TENANT_DESIGN.md`.

### Inbox Read Performance

Antes de qualquer otimizacao em `/app/conversations`, consultar `docs/saas/INBOX_QUERY_PATH_AUDIT.md`.

Mudancas de performance na listagem do Inbox devem:

- preservar multitenancy, RBAC, departamento e ownership;
- nao usar ADMIN como bypass;
- medir `inbox-read` antes/depois;
- manter `health`, `public-api` e `search` fora do escopo da mudanca;
- nao criar indice/migration sem `EXPLAIN ANALYZE` ou evidencia equivalente;
- validar que `inbox-detail` continua respeitando departamento;
- rodar `PROFILE=vu5` antes de `vu10`/`vu20`.

Depois da 78O.2, validar tambem em `/admin/ops/metrics`:

```text
inbox.list.duration
inbox.list.query_count
inbox.list.response_bytes
```

Confirmar que os labels usam apenas `module`, `route`, `operation`, `tenantId` e `status`, sem telefone, e-mail, waId, token, transcript ou rawPayload.

Bootstrap inicial do tenant tecnico:

```bash
cd apps/whatsapp-agent
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --json
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime true --execute --json
```

Nao executar carga na sprint de bootstrap. Primeiro validar status, features e quota.

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
