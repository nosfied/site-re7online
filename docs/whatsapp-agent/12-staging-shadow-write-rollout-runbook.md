# Runbook de rollout staging do shadow-write WhatsApp multicanal

Status: operacional para staging/copia; nao autoriza producao.

Fase: 66B.2 - Staging Shadow-Write Rollout Runbook.

Este runbook descreve como validar o shadow-write dos campos multicanal do WhatsApp em staging/copia. A leitura continua legada por `waId` e `clientId + waId`. Nenhuma etapa aqui ativa Messenger real, altera inbox, troca leitura ou autoriza producao.

## Travas de seguranca

Nao fazer neste runbook:

- aplicar migration em producao;
- ativar `MULTICHANNEL_SHADOW_WRITE=true` em producao;
- ativar `MULTICHANNEL_SHADOW_STRICT=true` em producao como primeira etapa;
- alterar leitura para multicanal;
- alterar inbox;
- persistir Messenger/Instagram;
- enviar outbound real;
- usar `DATABASE_URL` de producao;
- imprimir `waId`, telefone, texto de mensagem, payload bruto ou tokens em logs compartilhados.

## 1. Pre-condicoes

Antes de iniciar o rollout staging, confirmar:

- banco staging/copia restaurado;
- `DATABASE_URL` aponta para banco com nome explicitamente staging/copia, por exemplo `whatsapp_agent_multichannel_staging`;
- migration draft multicanal aplicada somente no staging;
- baseline schema atual aplicado no staging;
- backfill WhatsApp executado no staging;
- `channels:shadow:compare` com 100% matched;
- `npm run evaluation:replay` PASS;
- outbound real desabilitado;
- PM2/producao nao aponta para o banco staging.

Comandos de conferencia:

```bash
cd apps/whatsapp-agent

node -e 'const u=new URL(process.env.DATABASE_URL); console.log({host:u.hostname, database:u.pathname.slice(1), user:u.username, nodeEnv:process.env.NODE_ENV||null})'

psql "$DATABASE_URL" -c 'SELECT current_database(), current_user, inet_server_addr(), inet_server_port();'
```

Se o banco nao tiver `staging`, `copy`, `copia` ou `multichannel` no nome, parar.

## 2. Baseline antes do shadow-write

Rodar comparacao:

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

Se houver `missing > 0`, rodar backfill apenas no staging/copia:

```bash
npm run channels:backfill -- \
  --execute \
  --confirm BACKFILL_MULTICHANNEL_WHATSAPP \
  --json
```

Depois repetir:

```bash
npm run channels:shadow:compare -- --json --include-samples --limit 20
```

Se houver `mismatched > 0`, abortar e investigar antes de continuar.

## 3. Flags staging

Para validar o shadow-write no staging:

```bash
export MULTICHANNEL_SHADOW_WRITE=true
export MULTICHANNEL_SHADOW_STRICT=false
export OUTBOUND_TEXT_ENABLED=false
export WHATSAPP_ACCESS_TOKEN=""
```

Regras:

- `MULTICHANNEL_SHADOW_WRITE=true` tenta preencher campos multicanal em novas escritas WhatsApp.
- `MULTICHANNEL_SHADOW_STRICT=false` mantem fail-open.
- outbound real deve permanecer desabilitado.
- nao usar token real de envio.

## 4. Smoke WhatsApp staging

Rodar:

```bash
npm run smoke:webhook:staging -- \
  --database-url "$DATABASE_URL" \
  --message-id "wamid.staging.shadow.$(date +%s)"
```

Validar no resultado:

```json
{
  "ok": true,
  "webhookStatus": 200,
  "inboundPersisted": true,
  "runtimePersisted": true,
  "outboundGraphCalls": 0
}
```

Validar que os registros novos vieram com:

```json
{
  "channel": "whatsapp",
  "provider": "meta",
  "channelAccountId": "...",
  "hasExternalUserHash": true,
  "hasLegacyWaId": true
}
```

Critico:

- `outboundGraphCalls` deve ser `0`;
- nao pode haver envio real;
- webhook deve retornar `200`;
- leitura/inbox continuam pelo legado.

## 5. Comparacao apos smoke

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

Se `missing > 0`, verificar se o registro foi criado com `MULTICHANNEL_SHADOW_WRITE=false` ou se faltou `phoneNumberId`.

Se `mismatched > 0`, abortar rollout e investigar antes de qualquer producao.

## 6. Repetir com strict em staging

Somente depois de `missing=0` e `mismatched=0`, testar strict no staging:

```bash
export MULTICHANNEL_SHADOW_WRITE=true
export MULTICHANNEL_SHADOW_STRICT=true

npm run smoke:webhook:staging -- \
  --database-url "$DATABASE_URL" \
  --message-id "wamid.staging.shadow.strict.$(date +%s)"
```

Esperado:

- smoke PASS;
- `outboundGraphCalls=0`;
- `channels:shadow:compare` continua com `missing=0` e `mismatched=0`.

Teste controlado de schema ausente:

- opcional;
- executar apenas em banco descartavel;
- remover/renomear colunas multicanal apenas em copia temporaria;
- validar que `STRICT=true` falha;
- restaurar a copia.

Nao executar esse teste em staging compartilhado nem em producao.

## 7. Validacoes finais

Rodar:

```bash
npm run evaluation:replay

node --import tsx --test \
  src/agent/qualification.test.ts \
  src/agent/controlledAssistant.test.ts

node --import tsx --test \
  src/channels/whatsappMultichannelShadowWrite.test.ts \
  src/channels/whatsappShadowCompare.test.ts

npm run build
git diff --check
```

Smoke de inbox staging:

- abrir o inbox apontando para staging;
- confirmar que conversas WhatsApp ainda aparecem por `waId`;
- abrir conversa usada no smoke;
- confirmar timeline sem erro;
- confirmar que status/handoff continuam iguais;
- confirmar que nenhum campo multicanal e usado como leitura principal.

Readiness/preflight:

```bash
curl -sS -H "X-Admin-Token: $ADMIN_TOKEN" \
  "$AGENT_BASE_URL/admin/channel-runtime-readiness" | jq
```

O readiness/preflight de canais Meta deve permanecer passivo e sem runtime real.

## 8. Criterios para aprovar producao futura

Producao so pode ser considerada depois de:

- staging migration OK;
- staging backfill OK;
- `channels:shadow:compare` 100% matched;
- smoke WhatsApp staging PASS;
- inbox staging PASS;
- replay PASS;
- qualification/controlledAssistant PASS;
- `MULTICHANNEL_SHADOW_STRICT=true` PASS em staging;
- rollback testado;
- janela operacional definida;
- aprovacao manual.

Configuracao inicial recomendada para producao futura:

```bash
MULTICHANNEL_SHADOW_WRITE=true
MULTICHANNEL_SHADOW_STRICT=false
```

Nao iniciar producao com strict true.

## 9. Rollback

Rollback operacional:

```bash
MULTICHANNEL_SHADOW_WRITE=false
MULTICHANNEL_SHADOW_STRICT=false
pm2 reload re7-whatsapp-agent --update-env
```

Efeito:

- o sistema para de escrever campos multicanal novos;
- leitura legada continua funcionando;
- inbox continua usando o comportamento atual;
- campos multicanal ja preenchidos podem permanecer no banco sem afetar operacao.

Rollback de banco:

- nao deve ser necessario para desligar shadow-write;
- se a migration staging precisar ser revertida, restaurar o backup/dump;
- em producao futura, rollback de banco deve seguir plano aprovado separadamente.

## 10. Checklist rapido

Antes:

- [ ] `DATABASE_URL` e staging/copia.
- [ ] `NODE_ENV` nao e `production`.
- [ ] outbound real desabilitado.
- [ ] migration draft aplicada no staging.
- [ ] backfill staging executado.
- [ ] `channels:shadow:compare` 100% matched.
- [ ] replay PASS.

Durante:

- [ ] `MULTICHANNEL_SHADOW_WRITE=true`.
- [ ] `MULTICHANNEL_SHADOW_STRICT=false`.
- [ ] `smoke:webhook:staging` PASS.
- [ ] `outboundGraphCalls=0`.
- [ ] registros novos com campos multicanal.
- [ ] `channels:shadow:compare` sem missing/mismatch.

Depois:

- [ ] testar `STRICT=true` em staging.
- [ ] replay PASS.
- [ ] tests PASS.
- [ ] inbox smoke PASS.
- [ ] readiness/preflight inalterados.
- [ ] flags desligadas ou documentadas no staging.

## Veredito esperado

Se todos os checks passarem, o shadow-write WhatsApp esta pronto para planejamento de producao com:

- migration real aprovada;
- backfill real aprovado;
- shadow-write inicialmente fail-open;
- leitura legada preservada;
- observabilidade via `channels:shadow:compare`.
