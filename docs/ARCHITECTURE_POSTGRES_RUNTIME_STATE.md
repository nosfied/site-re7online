# Postgres-first runtime state

## Objetivo

`ConversationRuntimeState` e a tabela `Conversation` sao a fonte oficial do estado operacional do atendimento. O runtime JSON foi desativado para operacao e permanece apenas como legado arquivado/diagnostico.

## Flags de transição

- `STORAGE_MODE=json`: comportamento legado. Leitura e escrita só no JSON.
- `STORAGE_MODE=hybrid`: escrita no JSON e no Postgres. Leitura segue conforme `CONV_STATE_READ_SOURCE`.
- `STORAGE_MODE=postgres`: runtime operacional conversa somente em Postgres. O storage JSON ainda pode existir para superficies legadas nao-runtime.
- `CONV_STATE_READ_SOURCE=json`: leitura pelo JSON.
- `CONV_STATE_READ_SOURCE=hybrid`: leitura pelo JSON e comparação silenciosa com Postgres. Divergências geram `state.shadow.read_mismatch`.
- `CONV_STATE_READ_SOURCE=postgres`: leitura pelo Postgres sem fallback JSON. Estado ausente gera `state.postgres.read_missing`; falha de leitura gera `state.postgres.read_failed`.
- `CONV_STATE_JSON_WRITE_ENABLED=false`: impede novas escritas no runtime JSON quando `STORAGE_MODE=hybrid`.
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

6. Parar escrita no JSON durante a janela monitorada:

   ```env
   STORAGE_MODE=hybrid
   CONV_STATE_READ_SOURCE=postgres
   CONV_STATE_JSON_WRITE_ENABLED=false
   ```

7. Finalizar em Postgres-only para runtime operacional:

   ```env
   STORAGE_MODE=postgres
   CONV_STATE_READ_SOURCE=postgres
   CONV_STATE_JSON_WRITE_ENABLED=false
   ```

## Estado atual de producao

Atualizado em 2026-05-06.

Producao esta na etapa Postgres-only para runtime operacional:

```env
STORAGE_MODE=postgres
CONV_STATE_READ_SOURCE=postgres
CONV_STATE_JSON_WRITE_ENABLED=false
```

O JSON nao recebe novas escritas e nao e fallback operacional. Arquivos antigos `conversations.json` devem ser preservados apenas em backup/arquivo legado ate o fim da janela de observacao.

Validacao executada durante a virada:

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

Os `invalidReferences` e eventuais `mismatches` sao esperados quando comparados contra JSON legado envelhecido. A validacao critica para Postgres-only e `missingInPostgres: 0`.

Validacoes operacionais executadas:

- health local e externo OK;
- inbox do ADMIN carregando;
- inbox do SUPERVISOR carregando;
- dashboard carregando;
- claim em conversa demo alterou estado para `IN_PROGRESS`;
- close em conversa demo alterou estado para `CLOSED`;
- sem ocorrencias recentes de `state.read.fallback_json`, `state.read.fallback_json_failed`, `state.postgres.read_failed`, `Prisma` ou `error` nos logs filtrados.

Comandos de monitoramento recomendados durante a janela:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run state:validate
pm2 logs re7-whatsapp-agent --lines 1000 --nostream | grep -E 'state.read.fallback_json|state.read.fallback_json_failed|state.postgres.read_missing|state.postgres.read_failed|Prisma|error'
```

Rollback operacional recomendado:

```env
STORAGE_MODE=hybrid
CONV_STATE_READ_SOURCE=postgres
CONV_STATE_JSON_WRITE_ENABLED=false
```

Se for necessario voltar a depender do JSON, restaurar o backup `.data-runtime-json-legacy-*.tar.gz`, reverter o commit da limpeza e aplicar:

```env
STORAGE_MODE=hybrid
CONV_STATE_READ_SOURCE=json
CONV_STATE_JSON_WRITE_ENABLED=true
```

Depois de qualquer alteracao:

```bash
pm2 reload re7-whatsapp-agent --update-env
curl -sS https://api.re7online.com/health
npm run state:validate
```

## Critérios de aceite

- `npm run state:validate` sem `missingInPostgres`.
- Sem `state.read.fallback_json` ou `state.read.fallback_json_failed` em producao.
- Sem `state.postgres.read_failed` recorrente em producao.
- Inbox e dashboard exibem a mesma fila.
- Handoff automático entra como `WAITING` sem `assignedUserId`.
- Claim manual muda para `IN_PROGRESS` com `assignedUserId`.

## Não fazer nesta fase

- Não remover o JSON.
- Não ativar `CONV_STATE_DB_WRITE_STRICT=true` antes de uma janela monitorada.
- Não trocar todos os tenants para `postgres` sem validar `state:validate`.
