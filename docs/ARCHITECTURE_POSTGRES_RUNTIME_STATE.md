# Postgres-first runtime state

## Objetivo

`ConversationRuntimeState` e a tabela `Conversation` devem ser a fonte oficial do estado operacional do atendimento. O runtime JSON permanece como cache/fallback durante a transição.

## Flags de transição

- `STORAGE_MODE=json`: comportamento legado. Leitura e escrita só no JSON.
- `STORAGE_MODE=hybrid`: escrita no JSON e no Postgres. Leitura segue conforme `CONV_STATE_READ_SOURCE`.
- `CONV_STATE_READ_SOURCE=json`: leitura pelo JSON.
- `CONV_STATE_READ_SOURCE=hybrid`: leitura pelo JSON e comparação silenciosa com Postgres. Divergências geram `state.shadow.read_mismatch`.
- `CONV_STATE_READ_SOURCE=postgres`: leitura principal pelo Postgres, com fallback para JSON se o estado do Postgres estiver ausente/inválido.
- `CONV_STATE_DB_WRITE_STRICT=true`: falha a escrita se a escrita sombra no Postgres falhar. Não ativar no início do rollout.

## Rollout recomendado

1. Rodar backfill:

   ```bash
   cd /opt/re7online/site-re7online/apps/whatsapp-agent
   npm run state:backfill
   npm run state:validate
   ```

2. Ativar dual-write sem trocar leitura:

   ```env
   STORAGE_MODE=hybrid
   CONV_STATE_READ_SOURCE=json
   CONV_STATE_DB_WRITE_STRICT=false
   ```

3. Ativar leitura híbrida:

   ```env
   STORAGE_MODE=hybrid
   CONV_STATE_READ_SOURCE=hybrid
   ```

4. Monitorar logs:

   ```bash
   pm2 logs re7-whatsapp-agent --lines 1000 --nostream | grep state.shadow.read_mismatch
   ```

   O objetivo para avançar é zero divergência recorrente.

5. Somente depois migrar leitura:

   ```env
   STORAGE_MODE=hybrid
   CONV_STATE_READ_SOURCE=postgres
   ```

## Estado atual de producao

Atualizado em 2026-05-03.

Producao esta na etapa de leitura principal pelo Postgres, mantendo escrita hibrida e fallback JSON:

```env
STORAGE_MODE=hybrid
CONV_STATE_READ_SOURCE=postgres
CONV_STATE_DUAL_WRITE=false
CONV_STATE_SHADOW_COMPARE=false
```

O JSON ainda nao deve ser removido. Ele continua sendo gravado e serve como fallback operacional durante a janela monitorada.

Validacao executada apos a virada:

```json
{
  "event": "runtime_state.validation.completed",
  "clientsScanned": 4,
  "recordsScanned": 40,
  "missingInPostgres": 0,
  "mismatches": 0,
  "invalidReferences": 4,
  "samples": []
}
```

Os `invalidReferences` sao referencias legadas de setor/fila normalizadas para `null` pelos scripts de backfill/validate. Nao bloqueiam a leitura Postgres enquanto `missingInPostgres` e `mismatches` permanecerem zerados.

Validacoes operacionais executadas:

- health local e externo OK;
- inbox do ADMIN carregando;
- inbox do SUPERVISOR carregando;
- dashboard carregando;
- claim em conversa demo alterou estado para `IN_PROGRESS`;
- close em conversa demo alterou estado para `CLOSED`;
- sem ocorrencias recentes de `state.shadow.write_failed`, `state.shadow.read_mismatch`, `state.read.fallback_json`, `state.shadow.read_compare_failed`, `Prisma` ou `error` nos logs filtrados.

Comandos de monitoramento recomendados durante a janela:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run state:validate
pm2 logs re7-whatsapp-agent --lines 1000 --nostream | grep -E 'state.shadow.write_failed|state.shadow.read_mismatch|state.read.fallback_json|state.shadow.read_compare_failed|Prisma|error'
```

Rollback imediato para leitura JSON:

```env
STORAGE_MODE=hybrid
CONV_STATE_READ_SOURCE=json
```

Depois:

```bash
pm2 reload re7-whatsapp-agent --update-env
curl -sS https://api.re7online.com/health
npm run state:validate
```

## Critérios de aceite

- `npm run state:validate` sem `missingInPostgres` e sem `mismatches`.
- Sem `state.shadow.read_mismatch` recorrente em produção.
- Inbox e dashboard exibem a mesma fila.
- Handoff automático entra como `WAITING` sem `assignedUserId`.
- Claim manual muda para `IN_PROGRESS` com `assignedUserId`.

## Não fazer nesta fase

- Não remover o JSON.
- Não ativar `CONV_STATE_DB_WRITE_STRICT=true` antes de uma janela monitorada.
- Não trocar todos os tenants para `postgres` sem validar `state:validate`.
