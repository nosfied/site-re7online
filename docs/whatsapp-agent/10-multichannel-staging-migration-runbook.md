# Runbook de staging para migration e backfill multicanal

Status: runbook operacional, somente staging/copia.

Sprint: 65Z.2 - Staging Migration & Backfill Runbook.

Este documento descreve como validar a migration multicanal e o backfill WhatsApp legado em ambiente isolado. Ele nao autoriza aplicacao em producao.

## Escopo e travas

Permitido neste runbook:

- restaurar dump em staging ou copia isolada;
- aplicar migration draft somente em staging;
- rodar dry-run de backfill;
- validar schema, replay, inbox e smoke WhatsApp;
- documentar resultados e criterios de avanco.

Proibido neste runbook:

- aplicar migration em producao;
- rodar `prisma migrate deploy` em producao;
- executar `UPDATE` em producao;
- persistir Messenger/Instagram;
- alterar runtime, webhook, inbox ou outbound;
- ativar Messenger em runtime real.

## Pre-requisitos

Antes de iniciar:

1. Gerar backup do banco de producao.
2. Restaurar o dump em banco staging/copia isolada.
3. Confirmar que o ambiente staging nao envia WhatsApp real.
4. Confirmar que `DATABASE_URL` aponta para staging.
5. Confirmar que `NODE_ENV` e variaveis de runtime estao isoladas.
6. Confirmar que `tenants.json` de staging representa os tenants esperados.
7. Confirmar commit/hash da aplicacao e registrar no checklist.
8. Confirmar que a migration revisada e o SQL draft usados sao os esperados:
   - `apps/whatsapp-agent/prisma/schema.prisma`
   - `apps/whatsapp-agent/prisma/migration-drafts/20260515165000_multichannel_persistence_schema_draft.sql`
9. Confirmar que nao ha workers de producao conectados ao banco staging.

Checklist minimo:

```bash
git rev-parse HEAD
echo "$DATABASE_URL"
npm run channels:backfill:dry-run -- --json --risk-report > /tmp/backfill-baseline.json
```

O valor de `DATABASE_URL` nao deve ser impresso em logs compartilhados se contiver credenciais.

## Etapa 1 - baseline antes da migration

Objetivo: provar que o banco legado esta consistente antes de qualquer alteracao.

Rodar:

```bash
cd apps/whatsapp-agent
npm run channels:backfill:dry-run -- --json --risk-report --limit 20 --include-samples > /tmp/multichannel-backfill-baseline.json
npm run evaluation:replay
npm run build
```

Validar no JSON:

- `dryRun=true`;
- `missingChannelAccountId` igual a zero para todos os modelos;
- `conflicts=[]`;
- `risks.missingWaId=0`;
- `risks.unknownClient=0`;
- `risks.multipleChannelAccounts=0`;
- `risks.externalUserHashCollisions=0`;
- `risks.messageWithoutConversation=0`.

Tambem validar:

- evaluation replay `PASS`;
- build backend `OK`;
- smoke WhatsApp E2E baseline em staging/copia;
- inbox abre conversas WhatsApp existentes;
- handoff supervisionado ainda funciona no baseline.

Abortar se:

- houver conflito de identidade;
- houver tenant sem identificador resolvivel e com registros ativos;
- evaluation replay falhar;
- inbox ou handoff falharem antes da migration.

## Etapa 2 - aplicar migration draft em staging

Objetivo: testar a alteracao de schema em staging, sem tocar producao.

Comando recomendado para staging, revisando o SQL antes:

```bash
cd apps/whatsapp-agent
npx prisma validate
npx prisma generate
psql "$DATABASE_URL" -f prisma/migration-drafts/20260515165000_multichannel_persistence_schema_draft.sql
npx prisma validate
npx prisma generate
npm run build
```

Regras:

- executar somente com `DATABASE_URL` de staging;
- registrar horario de inicio/fim;
- registrar tempo de execucao;
- guardar stdout/stderr em artefato interno;
- nao executar contra producao;
- nao executar se o SQL draft ainda nao foi revisado manualmente.

Validar apos aplicar:

```bash
npx prisma validate
npx prisma generate
npm run build
```

Consultas conceituais de validacao:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Conversation'
  AND column_name IN ('channel', 'provider', 'channelAccountId', 'externalUserHash', 'externalUserRef', 'legacyWaId');

SELECT to_regclass('"ContactChannelIdentity"');
```

Abortar se:

- migration falhar parcialmente;
- `prisma generate` falhar;
- build falhar;
- houver lock prolongado ou impacto de performance inesperado no banco staging.

## Etapa 3 - backfill dry-run pos-migration

Objetivo: confirmar que a migration nao mudou a leitura dos dados nem a resolubilidade do backfill.

Rodar:

```bash
cd apps/whatsapp-agent
npm run channels:backfill:dry-run -- --json --risk-report --limit 20 --include-samples > /tmp/multichannel-backfill-post-migration.json
```

Comparar:

```bash
jq '.counts, .resolvable, .missingChannelAccountId, .risks, .riskByTenant' /tmp/multichannel-backfill-baseline.json
jq '.counts, .resolvable, .missingChannelAccountId, .risks, .riskByTenant' /tmp/multichannel-backfill-post-migration.json
```

Esperado:

- mesmas contagens de registros;
- `missingChannelAccountId` continua zero;
- `conflicts` continua vazio;
- nenhum `waId` ou telefone bruto aparece no output;
- `riskByTenant` pode manter warnings de configuracao, mas nao deve introduzir conflito novo.

Abortar se:

- surgirem conflitos novos;
- surgirem registros nao resolviveis;
- o script imprimir PII;
- o dry-run depender de campos novos ainda vazios para funcionar.

## Etapa 4 - backfill real em staging

O script real de backfill ainda nao existe nesta sprint. Ele deve ser implementado em sprint futura antes de qualquer escrita.

Requisitos obrigatorios para o script futuro:

- operar somente contra staging ate aprovacao manual;
- exigir flag explicita como `--execute`;
- padrao sempre dry-run;
- idempotente;
- transacional quando possivel;
- atualizar apenas campos multicanal nullable;
- nunca sobrescrever `waId` legado;
- usar uma funcao unica de hash;
- gerar relatorio de `updated`, `skipped`, `conflicts` e `unchanged`;
- nao imprimir `waId`, telefone, texto de mensagem ou payload bruto;
- suportar `--tenant`;
- suportar rollback logico quando possivel;
- abortar ao encontrar conflito de identidade.

Fluxo esperado para staging quando o script existir:

```bash
npm run channels:backfill -- --dry-run --json --risk-report > /tmp/backfill-real-dry-run.json
npm run channels:backfill -- --execute --json --tenant <tenantKey> > /tmp/backfill-execute-tenant.json
npm run channels:backfill -- --execute --json > /tmp/backfill-execute-all.json
```

Depois do backfill real em staging, rodar novamente o dry-run:

```bash
npm run channels:backfill:dry-run -- --json --risk-report > /tmp/backfill-after-execute.json
```

## Etapa 5 - validacao funcional e operacional

Validacoes obrigatorias apos migration e backfill em staging:

### Counts antes/depois

Validar que o numero de registros nao mudou em:

- `Conversation`;
- `ConversationRuntimeState`;
- `InboundMessage`;
- `OutboundMessage`;
- `Lead`;
- `Contact`;
- `Event`;
- `LeadNote`.

### Amostragem sem PII

Usar hashes e contagens. Evitar selecionar `waId`, texto, payloads ou telefones em outputs compartilhados.

Consultas conceituais:

```sql
SELECT channel, provider, COUNT(*)
FROM "Conversation"
GROUP BY channel, provider;

SELECT COUNT(*)
FROM "Conversation"
WHERE channel = 'whatsapp'
  AND provider = 'meta'
  AND "externalUserHash" IS NOT NULL;
```

### Smoke WhatsApp

Validar em staging/copia:

- recebimento inbound WhatsApp de teste;
- resposta automatizada onde permitido;
- handoff supervisionado;
- status de conversa no inbox;
- finalizacao de conversa;
- reabertura conforme comportamento atual;
- nenhum efeito em Messenger/Instagram.

### Qualification e evaluation

Rodar:

```bash
npm run evaluation:replay
node --import tsx --test src/agent/qualification.test.ts src/agent/controlledAssistant.test.ts
```

### Retention/LGPD

Confirmar que o desenho futuro de retention cobre:

- `externalUserHash`;
- `externalUserRef`;
- `legacyWaId`;
- `ContactChannelIdentity`;
- novos campos em `Lead`, `Contact`, `Conversation`, `RuntimeState` e mensagens.

Nao ativar persistencia real de novos canais antes dessa cobertura.

### Performance

Executar `EXPLAIN ANALYZE` em queries criticas do inbox antes de qualquer ativacao multicanal.

Foco:

- listagem por tenant/status/updatedAt;
- busca por identidade;
- timeline por conversa;
- lookup de inbound idempotente.

## Rollback

Rollback principal:

1. Parar processos que usam o banco staging.
2. Restaurar backup/dump anterior.
3. Reaplicar env staging.
4. Rodar `npm run build`.
5. Rodar `npm run evaluation:replay`.
6. Validar smoke WhatsApp.

Rollback SQL conceitual, apenas se restore nao for possivel e em staging:

- remover FKs novas;
- remover partial indexes novos;
- remover `ContactChannelIdentity`;
- remover colunas multicanal adicionadas;
- regenerar Prisma Client;
- rodar build.

Nao usar rollback SQL manual em producao sem backup validado.

## Criterios de abortar

Abortar a janela se qualquer item ocorrer:

- `DATABASE_URL` aponta para producao;
- migration falha;
- build falha;
- `prisma generate` falha;
- dry-run passa a mostrar conflitos;
- `missingChannelAccountId` aumenta;
- WhatsApp E2E falha;
- inbox falha;
- handoff falha;
- replay falha;
- output expõe PII;
- queries de inbox ficam lentas de forma relevante;
- rollback nao foi testado.

## Criterios para avancar para producao

So considerar producao quando todos os itens forem verdadeiros:

- staging migration OK;
- backfill real em staging OK;
- zero conflitos de identidade;
- `missingChannelAccountId=0`;
- WhatsApp E2E OK;
- inbox OK;
- handoff supervisionado OK;
- evaluation replay PASS;
- testes de qualification PASS;
- retention/LGPD revisado para novos campos;
- performance aceitavel;
- rollback testado;
- aprovacao manual registrada;
- janela de manutencao definida.

## Decisao `demo-prefeitura`

O dry-run 65Z.1 mostrou:

- registros resolviveis;
- `missingChannelAccountId=0`;
- `conflicts=[]`;
- tenant `demo-prefeitura` sem `WaPhoneNumber` formal;
- resolucao via `TenantConfig.metaPhoneNumberId`.

Opcoes:

### Opcao A - criar `WaPhoneNumber` formal

Vantagens:

- padroniza a origem de `channelAccountId`;
- reduz excecao operacional;
- facilita auditoria e futuras migrations;
- aproxima `demo-prefeitura` dos demais tenants.

Riscos/cuidados:

- garantir que o valor cadastrado corresponde ao `metaPhoneNumberId` correto;
- nao duplicar conta se ja houver configuracao equivalente;
- validar smoke WhatsApp apos cadastro.

### Opcao B - aceitar `TenantConfig.metaPhoneNumberId` como fallback

Vantagens:

- nao exige ajuste de dados agora;
- dry-run ja resolve todos os registros;
- menor intervencao imediata.

Riscos/cuidados:

- fonte canonica fica dividida entre banco e arquivo de tenant;
- auditoria de canal fica menos uniforme;
- futura migration/backfill precisa manter fallback documentado.

### Recomendacao

Para staging, a opcao B e aceitavel porque nao bloqueia o backfill e permite validar a migration.

Antes de producao, recomenda-se a opcao A: criar `WaPhoneNumber` formal para `demo-prefeitura` ou registrar decisao explicita de manter `TenantConfig.metaPhoneNumberId` como fonte canonica desse tenant.

## Artefatos a guardar

Guardar em local interno, fora do Git:

- dump/backup usado;
- hash do commit;
- `/tmp/multichannel-backfill-baseline.json`;
- `/tmp/multichannel-backfill-post-migration.json`;
- logs de migration;
- relatorio do backfill real em staging quando existir;
- checklist assinado de aprovacao manual.

Nao versionar:

- dumps;
- outputs com dados reais;
- `.data`;
- candidates reais;
- logs contendo credenciais.

## Proximo passo recomendado

Implementar o script real de backfill WhatsApp para staging, com padrao dry-run, flag `--execute`, idempotencia e relatorio anti-PII. Depois disso, executar este runbook em copia/staging antes de qualquer decisao de producao.
