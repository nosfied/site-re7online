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
