# Runbook de provisionamento de banco staging para migration multicanal

Status: operacional, sem execucao automatica.

Sprint: 65Z.5 - Staging Database Provisioning Runbook.

Este runbook descreve como criar uma copia segura do banco para testar a migration multicanal e o backfill WhatsApp legado. Ele nao autoriza alteracoes em producao.

## Travas de seguranca

Nao fazer neste runbook:

- aplicar migration em producao;
- executar `channels:backfill --execute` em producao;
- alterar runtime, webhook, inbox ou outbound;
- alterar `.env` de producao sem backup;
- expor `DATABASE_URL`, senhas, dumps ou tokens em logs compartilhados;
- rodar comandos destrutivos sem confirmar host e database.

## 1. Identificar `DATABASE_URL` atual

### Local

No ambiente local:

```bash
cd apps/whatsapp-agent
node -e 'const fs=require("fs"); const p=".env"; if(!fs.existsSync(p)){console.log("missing .env"); process.exit(0)} const line=fs.readFileSync(p,"utf8").split(/\n/).find(l=>l.startsWith("DATABASE_URL=")); if(!line){console.log("DATABASE_URL missing"); process.exit(0)} const value=line.slice("DATABASE_URL=".length).replace(/^["'\'']|["'\'']$/g,""); const u=new URL(value); console.log({host:u.hostname, port:u.port||"5432", database:u.pathname.slice(1), user:u.username})'
```

Confirmar:

- host;
- porta;
- nome do banco;
- usuario;
- se parece local, staging ou producao.

### VPS/PM2

Na VPS:

```bash
pm2 env re7-whatsapp-agent | grep -E '^DATABASE_URL:'
```

Nao colar a URL completa em chats ou tickets. Se precisar registrar, mascarar usuario, senha e host sensivel.

### Producao

Considere producao qualquer `DATABASE_URL` usada por:

- `re7-whatsapp-agent` em PM2;
- deploy ativo;
- dominios reais;
- banco com trafego real de WhatsApp.

Antes de qualquer comando destrutivo, rodar:

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
```

### Staging/copia

Um banco staging/copia deve:

- ter nome explicito, como `whatsapp_agent_staging`;
- nao ser usado por PM2/producao;
- poder ser descartado e recriado;
- ter credenciais diferentes ou, no minimo, `DATABASE_URL` exportado apenas na sessao atual;
- nao enviar WhatsApp real.

## 2. Gerar dump seguro

Preferir formato custom do PostgreSQL:

```bash
export SOURCE_DATABASE_URL="<DATABASE_URL_ORIGEM_MASCARADO_AQUI>"
pg_dump "$SOURCE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=/tmp/whatsapp_agent_staging.dump
```

Alternativa plain SQL:

```bash
pg_dump "$SOURCE_DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file=/tmp/whatsapp_agent_staging.sql
```

Regras:

- nao versionar dump;
- nao salvar em `.data`;
- nao enviar dump por chat;
- apagar o dump quando nao for mais necessario;
- proteger permissao do arquivo:

```bash
chmod 600 /tmp/whatsapp_agent_staging.dump
```

## 3. Criar banco staging/copia

Nome sugerido:

- `whatsapp_agent_staging`
- ou `whatsapp_agent_multichannel_staging`

Exemplo local:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export STAGING_DB=whatsapp_agent_multichannel_staging

createdb "$STAGING_DB"
```

Se precisar recriar:

```bash
dropdb "$STAGING_DB"
createdb "$STAGING_DB"
```

Alerta:

- `dropdb` e destrutivo;
- nunca rode `dropdb` sem conferir `PGHOST`, `PGUSER` e `STAGING_DB`;
- nunca use nome do banco de producao como `STAGING_DB`.

Conferencia antes de `dropdb`:

```bash
echo "host=$PGHOST port=$PGPORT user=$PGUSER db=$STAGING_DB"
```

## 4. Restaurar dump

### Dump custom

```bash
export STAGING_DATABASE_URL="postgresql://USER:SENHA@HOST:5432/whatsapp_agent_multichannel_staging"

pg_restore "$STAGING_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/whatsapp_agent_staging.dump
```

### Dump plain

```bash
export STAGING_DATABASE_URL="postgresql://USER:SENHA@HOST:5432/whatsapp_agent_multichannel_staging"

psql "$STAGING_DATABASE_URL" -f /tmp/whatsapp_agent_staging.sql
```

Validar:

```bash
psql "$STAGING_DATABASE_URL" -c 'SELECT current_database(), current_user, inet_server_addr(), inet_server_port();'
```

## 5. Apontar `DATABASE_URL` temporariamente

Para comandos manuais, preferir export temporario:

```bash
export DATABASE_URL="$STAGING_DATABASE_URL"
```

Nao editar `.env` de producao.

Se editar `.env` local para teste, fazer backup:

```bash
cp apps/whatsapp-agent/.env /tmp/whatsapp-agent.env.backup
```

Depois restaurar:

```bash
cp /tmp/whatsapp-agent.env.backup apps/whatsapp-agent/.env
```

Conferir antes de qualquer migration/backfill:

```bash
cd apps/whatsapp-agent
node -e 'const u=new URL(process.env.DATABASE_URL); console.log({host:u.hostname, database:u.pathname.slice(1), user:u.username, nodeEnv:process.env.NODE_ENV||null})'
```

## 6. Validar que e staging

Rodar:

```bash
psql "$DATABASE_URL" -c 'SELECT current_database(), current_user, inet_server_addr(), inet_server_port();'
```

Contagens basicas:

```bash
psql "$DATABASE_URL" -c 'SELECT COUNT(*) AS clients FROM "Client";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) AS conversations FROM "Conversation";'
psql "$DATABASE_URL" -c 'SELECT COUNT(*) AS inbound_messages FROM "InboundMessage";'
```

Confirmar:

- `current_database()` e o banco staging/copia;
- contagens fazem sentido com o dump;
- PM2/producao nao aponta para esse banco;
- `NODE_ENV` nao esta como `production` para execucao do backfill.

Marcador opcional, se for seguro criar objeto temporario na sessao:

```sql
CREATE TEMP TABLE staging_marker_check AS
SELECT 'staging_only'::text AS marker, now() AS checked_at;
SELECT * FROM staging_marker_check;
```

Tabela temporaria desaparece ao encerrar a sessao.

## 7. Sequencia depois do restore

Entrar no app:

```bash
cd apps/whatsapp-agent
```

Baseline antes da migration:

```bash
npm run channels:backfill -- --json --risk-report --limit 20 --include-samples > /tmp/backfill-baseline.json
npm run evaluation:replay
```

Aplicar SQL draft somente no staging:

```bash
psql "$DATABASE_URL" -f prisma/migration-drafts/20260515165000_multichannel_persistence_schema_draft.sql
```

Validar Prisma/build:

```bash
npx prisma validate
npx prisma generate
npm run build
```

Dry-run pos-migration:

```bash
npm run channels:backfill -- --json --risk-report --limit 20 --include-samples > /tmp/backfill-post-migration-dry-run.json
```

Se e somente se:

- `conflicts=[]`;
- `missingChannelAccountId=0`;
- `risks.externalUserHashCollisions=0`;
- `risks.messageWithoutConversation=0`;
- banco confirmado como staging;
- `NODE_ENV` nao e `production`;

executar backfill em staging:

```bash
npm run channels:backfill -- \
  --execute \
  --confirm BACKFILL_MULTICHANNEL_WHATSAPP \
  --json > /tmp/backfill-execute-staging.json
```

Dry-run pos-execute:

```bash
npm run channels:backfill -- --json --risk-report --limit 20 --include-samples > /tmp/backfill-after-execute.json
```

Replays:

```bash
npm run evaluation:replay
node --import tsx --test src/agent/qualification.test.ts src/agent/controlledAssistant.test.ts
```

## 8. Checklist anti-acidente

Antes de qualquer comando destrutivo ou `--execute`:

- [ ] `DATABASE_URL` foi conferido.
- [ ] Host nao e producao.
- [ ] Database nao e producao.
- [ ] Usuario confere com ambiente staging/copia.
- [ ] PM2/producao nao aponta para esse banco.
- [ ] `NODE_ENV` nao esta como `production`.
- [ ] Dump foi restaurado com sucesso.
- [ ] Dry-run baseline foi salvo.
- [ ] `conflicts=0`.
- [ ] `missingChannelAccountId=0`.
- [ ] Nao ha logs com segredo ou PII.
- [ ] Existe plano de rollback: dropar/recriar staging a partir do dump.

Comando de conferencia rapida:

```bash
node -e 'const u=new URL(process.env.DATABASE_URL); console.log("CONFIRM", {host:u.hostname, database:u.pathname.slice(1), user:u.username, nodeEnv:process.env.NODE_ENV||null})'
```

## 9. Rollback staging

Rollback recomendado:

```bash
dropdb "$STAGING_DB"
createdb "$STAGING_DB"
pg_restore "$STAGING_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/whatsapp_agent_staging.dump
```

Ou, com SQL plain:

```bash
dropdb "$STAGING_DB"
createdb "$STAGING_DB"
psql "$STAGING_DATABASE_URL" -f /tmp/whatsapp_agent_staging.sql
```

Nao tocar producao para rollback de staging.

## 10. Artefatos a guardar fora do Git

Guardar em local seguro:

- dump usado;
- hash do commit;
- `/tmp/backfill-baseline.json`;
- `/tmp/backfill-post-migration-dry-run.json`;
- `/tmp/backfill-execute-staging.json`;
- `/tmp/backfill-after-execute.json`;
- logs de migration;
- resultado de `evaluation:replay`;
- checklist assinado.

Nao versionar:

- dumps;
- outputs com dados reais;
- `.data`;
- backups;
- tokens;
- `DATABASE_URL`.

## Recomendacao operacional

Executar este runbook manualmente por Deifson/Codex em uma sessao controlada, com `DATABASE_URL` exportado apenas para staging/copia. A execucao deve parar imediatamente se qualquer conferencia indicar banco de producao ou se o dry-run tiver conflitos.
