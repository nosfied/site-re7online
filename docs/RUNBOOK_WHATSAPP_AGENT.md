# RUNBOOK OPERACIONAL — WhatsApp Agent

## Objetivo
Padronizar o fluxo manual-controlado do `apps/whatsapp-agent` no modelo atual:

`LOCAL -> VALIDACAO LOCAL -> COMMIT/PUSH -> VPS -> VALIDACAO POS-DEPLOY`

Este runbook reflete o estado real atual do projeto:
- ambiente local funcional para backend, frontend e banco
- validacao real no `/app/login` e `/app/inbox`
- deploy manual na VPS
- rastreabilidade minima por branch, commit, horario e resultado

Runbooks complementares:
- `docs/onboarding.md`
- `docs/saas/runbook-re7.md`
- `docs/whatsapp-agent/05-env-and-smoke-test.md`
- `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md`

## Principios operacionais
- Producao nao deve mais ser usada como ambiente principal de descoberta de bug.
- Todo patch deve passar por validacao local real antes da VPS.
- O deploy continua manual, mas deve ser rastreavel.
- Nao ha obrigatoriedade de PR formal ou CI/CD complexo neste momento.
- O commit exato que foi validado localmente deve ser o mesmo commit levado para a VPS.

## Fluxo padrao
1. Desenvolver e validar localmente.
2. Rodar build local.
3. Registrar o commit.
4. Fazer `push` da branch de trabalho.
5. Atualizar a VPS manualmente.
6. Validar health e fluxo funcional minimo na VPS.
7. Registrar o deploy.

## Pre-requisitos locais
- Repositorio local clonado
- PostgreSQL local funcional
- `.env` local configurado em `apps/whatsapp-agent/.env`
- backend local funcional
- frontend local funcional

Portas atuais de referencia:
- backend local: `http://127.0.0.1:3002`
- frontend local: `http://localhost:3000`

## Fluxo local

### 1) Backend local
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
npm run dev
```

### 2) Frontend local
Em outro terminal:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
PORT=3000 NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=http://127.0.0.1:3002 npm run dev
```

### 3) Validacao funcional local minima
Validar no navegador:
- `http://localhost:3000/app/login`
- `http://localhost:3000/app/inbox`

Checklist local minimo:
- login no `/app/login`
- inbox carregando
- fluxo do patch sendo validado localmente
- quando aplicavel, confirmar no banco o estado persistido
- quando o patch afetar realtime/inbox:
  - confirmar WebSocket `101 Switching Protocols` em `/agent-api/app/realtime`
    ou `/app/realtime`
  - validar ponto verde, som principal, som suave e fallback por polling
  - validar que trocar conversa nao recarrega nem desloca a lista lateral

Exemplo ja validado no estado atual:
- Sprint 37 validada localmente
- `CLOSED` persistindo com `closedAt` confirmado no banco

### 4) Build local final
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm run build

cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
npm run build
```

### 5) Commit e push
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git status
git add <arquivos>
git commit -m "<mensagem>"
git push origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

Branch de trabalho atual:
- `flow-executor-quote-hardening`

### Deploy com commit fixo (recomendado)
Depois do `push` local, capture o commit exato validado:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git rev-parse HEAD
git rev-parse --short HEAD
```

Na VPS, prefira deployar o commit exato:

```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout <commit_hash>
git rev-parse --short HEAD
```

Uso recomendado:
- branch continua sendo a referencia de trabalho
- commit exato passa a ser a referencia de deploy
- isso evita subir codigo diferente do que foi validado localmente

## Fluxo de deploy sem migration

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias e rebuildar
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
```

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Fluxo de deploy com migration
Use este fluxo quando o patch incluir migration Prisma nova.

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias, generate e migration
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
npm run db:deploy
npm run build
```

### Backup antes de migration (obrigatorio em producao)
Antes de rodar `db:deploy`, gerar backup do banco:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
```

Objetivo:
- ter um ponto de recuperacao minimo antes de migration
- aumentar a seguranca operacional sem burocracia extra

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Checklist pre-deploy
- patch validado localmente
- `/app/login` validado localmente
- `/app/inbox` validado localmente quando o patch afetar atendimento
- backend local buildando
- frontend local buildando quando houver alteracao em `src/`
- commit criado
- commit enviado para `origin`
- commit identificado (`git rev-parse --short HEAD`)
- definido se o patch tem migration ou nao

## Checklist pos-deploy
- `curl -sS http://127.0.0.1:3001/health`
- `pm2 logs re7-whatsapp-agent --lines 50`
- processo `re7-whatsapp-agent` ativo no PM2
- porta `3001` ativa
- sem processo duplicado escutando a mesma porta
- commit da VPS confere com o commit validado localmente
- smoke funcional minimo do patch em producao

Checks adicionais uteis:
```bash
pm2 status
curl -sS http://127.0.0.1:3001/admin/health -H "X-Admin-Token: $ADMIN_TOKEN"
lsof -i :3001
```

Quando o patch afetar realtime/inbox, validar tambem no navegador:
- `/app/inbox` abre sem erro;
- socket aparece como `101 Switching Protocols`;
- inbound em conversa nao ativa atualiza lista, ponto verde e som principal;
- inbound na conversa aberta atualiza timeline e toca som suave;
- polling continua atualizando estado se o socket cair.

## Retencao de midia local

Midias outbound enviadas pelo `/app/inbox` sao cacheadas localmente em
`apps/whatsapp-agent/.data/media/outbound/` para permitir reabertura,
download e reproducao futura sem depender apenas da URL temporaria da Meta.

Limpeza manual:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup
```

Cron recomendado:

```cron
0 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log 2>&1
```

Na VPS `converta.re7online.com`, essa entrada ja foi instalada no crontab do usuario
`deploy` em 2026-04-28, no commit `dbfcbd5`.

Verificacao:

```bash
crontab -l | grep media:cleanup
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar.

Detalhes: `docs/whatsapp-agent/ops/MEDIA_RETENTION.md`.

## Retencao LGPD automatica

A retencao LGPD remove conversas antigas da operacao por soft delete e
anonimizacao, conforme `RetentionConfig.retentionDays` de cada tenant. A rotina
nao deve apagar fisicamente mensagens, eventos, metricas, leads ou contacts.

Execucao manual global, para todos os tenants existentes no banco no momento da
execucao:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run
```

Execucao manual limitada a um tenant especifico, quando necessario:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run -- --client-key justa-advocacia
```

Cron global instalado na VPS `converta.re7online.com`, no usuario `deploy`, em
2026-05-02. Ele roda para todos os tenants existentes no momento da execucao:

```cron
30 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run retention:run >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log 2>&1
```

Verificacao:

```bash
crontab -l | grep retention
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar. Para novos tenants, nao e necessario
criar nova linha de cron: a execucao global ja inclui todos os tenants com
`RetentionConfig` no banco, criando configuracao default de 90 dias quando ela
ainda nao existir.

Antes de usar retencao curta em producao, validar `RetentionConfig.retentionDays`
na tela `/app/settings/privacy`. Valores baixos, como 1 a 7 dias, podem retirar
conversas ativas da operacao.

## Registro minimo do deploy
Registrar preferencialmente em:
- `docs/DEPLOY_LOG.md`

Registrar no minimo:

- branch:
- commit:
- horario:
- houve migration? `sim` / `nao`
- quem executou:
- validacao local: `ok` / `falhou`
- validacao pos-deploy: `ok` / `falhou`
- observacoes:

Exemplo:

```md
Deploy WhatsApp Agent
- branch: flow-executor-quote-hardening
- commit: abc1234
- horario: 2026-04-12 14:35 BRT
- migration: nao
- validacao local: ok (/app/login, /app/inbox)
- validacao pos-deploy: ok (/health, smoke do patch)
- observacoes: sem erro no PM2
```

## Rollback
Rollback minimo operacional:
1. identificar o commit anterior estavel
2. fazer checkout desse commit na VPS
3. reinstalar dependencias
4. rodar `db:generate`
5. rebuildar
6. reiniciar PM2
7. validar `/health`

Comandos:
```bash
cd /opt/re7online/site-re7online
git log --oneline -n 10
git checkout <commit_anterior>

cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
pm2 restart re7-whatsapp-agent --update-env
curl -sS http://127.0.0.1:3001/health
pm2 logs re7-whatsapp-agent --lines 50
```

Observacao:
- rollback de codigo nao reverte automaticamente migration destrutiva
- se o patch tiver migration sensivel, avaliar impacto antes do deploy

## Observacoes praticas
- Compare link pode continuar sendo usado para revisao rapida, mas nao substitui o registro do commit exato deployado.
- O repositorio da VPS continua em:
  - `/opt/re7online/site-re7online`
- O backend principal continua em:
  - `/opt/re7online/site-re7online/apps/whatsapp-agent`
- Processo PM2 de producao:
  - `re7-whatsapp-agent`
- Health real da VPS:
  - `http://127.0.0.1:3001/health`

## Resumo operacional
- descubra bug localmente
- corrija localmente
- valide localmente
- build local
- commit + push
- deploy manual na VPS
- valide `/health` e o fluxo afetado
- registre branch, commit, horario e resultado
