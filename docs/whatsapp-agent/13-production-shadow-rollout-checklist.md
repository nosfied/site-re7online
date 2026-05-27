# Checklist de rollout de producao do shadow-write WhatsApp multicanal

Status: checklist operacional; nao ativa producao automaticamente.

Fase: 66C - Production Shadow Rollout Plan.

Objetivo: ativar somente a escrita paralela dos campos multicanal do WhatsApp em producao, mantendo leitura 100% legada por `waId` e `clientId + waId`.

## Nao fazer nesta fase

- nao trocar leitura para multicanal;
- nao alterar inbox;
- nao ativar Messenger/Instagram real;
- nao enviar outbound novo;
- nao alterar rotas;
- nao alterar handoff, orchestrator ou IA;
- nao ativar dual-read;
- nao usar campos multicanal para decisao operacional.

## Estrategia de flags

Configuracao alvo inicial em producao:

```bash
MULTICHANNEL_SHADOW_WRITE=true
MULTICHANNEL_SHADOW_STRICT=false
```

`STRICT` deve permanecer `false` no primeiro rollout de producao.

Rollback operacional:

```bash
MULTICHANNEL_SHADOW_WRITE=false
MULTICHANNEL_SHADOW_STRICT=false
pm2 reload re7-whatsapp-agent --update-env
```

## 1. Pre-check obrigatorio

Antes de qualquer flag em producao:

- [ ] backup atual do banco concluido e testado;
- [ ] migration multicanal aplicada em producao;
- [ ] schema baseline atual aplicado em producao;
- [ ] backfill WhatsApp executado em producao;
- [ ] backfill idempotente validado;
- [ ] `channels:shadow:compare` sem `missing` e sem `mismatched`;
- [ ] health do backend OK;
- [ ] `npm run evaluation:replay` PASS;
- [ ] WhatsApp webhook smoke PASS;
- [ ] inbox smoke PASS;
- [ ] rollback de flags testado em staging;
- [ ] janela operacional definida;
- [ ] responsavel acompanhando logs.

## 2. Verificar ambiente

Na VPS:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent

pm2 env re7-whatsapp-agent | grep -E '^(DATABASE_URL|MULTICHANNEL_SHADOW_WRITE|MULTICHANNEL_SHADOW_STRICT):'
```

Nao colar `DATABASE_URL` completa em chats ou tickets.

Confirmar banco:

```bash
psql "$DATABASE_URL" -c 'SELECT current_database(), current_user, inet_server_addr(), inet_server_port();'
```

Confirmar health:

```bash
curl -sS https://converta.re7online.com/agent-api/health
```

## 3. Verificar colunas e compare

Rodar:

```bash
npm run channels:shadow:compare -- --json --include-samples --limit 20
```

Esperado:

```json
{
  "ok": true,
  "counts": {
    "missing": 0,
    "mismatched": 0
  }
}
```

Se `missing > 0`, nao ativar flag. Corrigir backfill.

Se `mismatched > 0`, nao ativar flag. Investigar divergencia.

## 4. Rollout-check passivo

Com as flags alvo configuradas no ambiente da sessao ou no PM2 antes do reload, rodar:

```bash
MULTICHANNEL_SHADOW_WRITE=true \
MULTICHANNEL_SHADOW_STRICT=false \
npm run channels:shadow:rollout-check -- --json
```

Esperado:

```json
{
  "ok": true,
  "summary": {
    "columnsAvailable": true,
    "compareMissing": 0,
    "compareMismatched": 0,
    "shadowWriteEnabled": true,
    "shadowStrictDisabled": true,
    "replayPassed": true
  }
}
```

Este comando nao altera flags do PM2 e nao ativa producao sozinho.

## 5. Ativar flag em producao

Somente depois dos checks:

```bash
pm2 set re7-whatsapp-agent:MULTICHANNEL_SHADOW_WRITE true
pm2 set re7-whatsapp-agent:MULTICHANNEL_SHADOW_STRICT false
pm2 reload re7-whatsapp-agent --update-env
```

Se o ambiente usa arquivo/ecosystem em vez de `pm2 set`, alterar somente as duas flags e recarregar com `--update-env`.

Confirmar:

```bash
pm2 env re7-whatsapp-agent | grep -E '^(MULTICHANNEL_SHADOW_WRITE|MULTICHANNEL_SHADOW_STRICT):'
```

## 6. Smoke pos-ativacao

Validar health:

```bash
curl -sS https://converta.re7online.com/agent-api/health
```

Validar webhook WhatsApp com numero controlado ou fluxo real supervisionado:

- mensagem inbound recebida;
- resposta/comportamento funcional igual ao legado;
- inbox mostra a conversa normalmente;
- handoff/IA/orchestrator sem mudanca funcional;
- nenhum outbound novo fora do comportamento existente.

Rodar compare:

```bash
npm run channels:shadow:compare -- --json --include-samples --limit 20
```

Esperado:

- `mismatched=0`;
- `missing=0` ou apenas registros antigos conhecidos se backfill ainda estiver em execucao;
- novos inbound devem aparecer matched.

## 7. Observabilidade

Acompanhar logs por 15 a 30 minutos:

```bash
pm2 logs re7-whatsapp-agent --lines 200 --nostream | \
  egrep 'multichannel.shadow_write|webhook.process.error|db.persist.error'
```

Eventos esperados:

- `multichannel.shadow_write.applied`

Eventos que exigem investigacao:

- `multichannel.shadow_write.failed`
- `multichannel.shadow_write.skipped_schema_missing`
- `db.persist.error`
- `webhook.process.error`

Nao compartilhar logs com `waId`, texto ou payload bruto.

## 8. Queries de verificacao

Sem imprimir telefone:

```sql
SELECT channel, provider, COUNT(*)
FROM "InboundMessage"
WHERE "createdAt" > now() - interval '1 hour'
GROUP BY channel, provider;
```

```sql
SELECT COUNT(*) AS missing_recent
FROM "InboundMessage"
WHERE "createdAt" > now() - interval '1 hour'
  AND (
    channel IS NULL OR provider IS NULL OR "channelAccountId" IS NULL
    OR "externalUserHash" IS NULL OR "legacyWaId" IS NULL
  );
```

```sql
SELECT COUNT(*) AS mismatched_recent
FROM "InboundMessage"
WHERE "createdAt" > now() - interval '1 hour'
  AND (channel <> 'whatsapp' OR provider <> 'meta');
```

## 9. Rollback

Rollback imediato:

```bash
pm2 set re7-whatsapp-agent:MULTICHANNEL_SHADOW_WRITE false
pm2 set re7-whatsapp-agent:MULTICHANNEL_SHADOW_STRICT false
pm2 reload re7-whatsapp-agent --update-env
```

Depois:

```bash
curl -sS https://converta.re7online.com/agent-api/health
pm2 logs re7-whatsapp-agent --lines 100 --nostream | egrep 'multichannel.shadow_write|webhook.process.error|db.persist.error'
```

Efeito do rollback:

- para novas escritas multicanal;
- leitura legada segue intacta;
- inbox segue intacto;
- campos ja preenchidos permanecem no banco sem efeito operacional.

## 10. Criterios de sucesso

Rollout aprovado se:

- health OK;
- WhatsApp segue funcional;
- inbox smoke PASS;
- handoff/IA/orchestrator sem regressao;
- `channels:shadow:compare` saudavel;
- sem `skipped_schema_missing`;
- sem aumento de `db.persist.error` ou `webhook.process.error`;
- rollback documentado.

## 11. Proximo passo apos estabilidade

Depois de periodo de observacao com `STRICT=false`:

- manter leitura legada;
- avaliar `MULTICHANNEL_SHADOW_STRICT=true` apenas em staging;
- preparar fase de shadow compare continuo;
- somente depois discutir dual-read ou leitura multicanal.
