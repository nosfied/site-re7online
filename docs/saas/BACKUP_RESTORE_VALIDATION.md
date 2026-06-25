# Sprint 78K - Backup Restore Validation MVP

Data: 2026-06-25

Escopo: validacao controlada de restore em ambiente isolado, sem alterar banco de producao, sem substituir runtime, sem alterar cron, sem alterar infraestrutura e sem apontar PM2 para banco restaurado.

## Resumo Executivo

A Sprint 78K validou duas partes do processo de restore:

1. backup `.data` mais recente: integridade do tar validada;
2. dump PostgreSQL valido mais recente: restaurado em banco temporario isolado e descartado depois.

Resultado:

- mecanismo de restore de arquivo `.data`: **OK**;
- mecanismo de restore de dump PostgreSQL: **OK em ambiente isolado**;
- atualidade do dump PostgreSQL: **NAO OK como ponto de recuperacao atual**, pois o dump valido mais recente esta atrasado em relacao as migrations atuais;
- producao: **nao alterada**;
- banco temporario: **removido**.

## Confirmacao De Seguranca

Esta sprint nao:

- restaurou sobre producao;
- alterou o banco `whatsapp_agent`;
- alterou PM2;
- alterou `.env`;
- alterou cron;
- alterou Nginx/Docker/infra;
- executou migration em producao;
- apontou runtime para banco temporario;
- copiou dump para fora da VPS.

## Auditoria Previa

### Reaproveitado

| Item | Uso na validacao |
| --- | --- |
| `backup-data.sh` | origem do tar `.data` diario. |
| `.backups` | diretorio dos backups `.data`. |
| `backups/` | origem do dump PostgreSQL valido mais recente. |
| container `wa-agent-postgres` | ambiente isolado para criar banco temporario. |
| Prisma CLI | validacao de migrations no banco temporario. |

### Pontos Que Precisam Correcao Futura

| Item | Achado |
| --- | --- |
| Backup DB diario | nao evidenciado. |
| Dumps zero-byte | existem dumps pre-release com tamanho 0. |
| Atualidade do dump | dump valido mais recente esta atrasado contra schema atual. |
| Offsite | nao evidenciado. |
| Checksum formal | calculado manualmente nesta validacao, mas nao automatizado. |
| Restore drill periodico | esta sprint e o primeiro registro formal. |

## Artefatos Validados

### Backup `.data`

```text
arquivo: .backups/20260625-031501.tar.gz
tamanho: 1,655,156 bytes
entradas tar: 324
duracao listagem: 0s
resultado: OK
```

Validacao executada:

- arquivo existe;
- tamanho nao-zero;
- `tar -tzf` completou;
- listagem possui entradas.

### Dump PostgreSQL

```text
arquivo: backups/pre-72c-70e-20260621162232.dump
tamanho: 4,875,077 bytes
sha256: c020e64594d692d38e42f33b6dd0483cde4904cb6021aa56f22392c2d4801bc3
objetos pg_restore --list: 354
duracao restore: 6s
resultado restore: OK
```

Banco temporario:

```text
restore_validation_78k_20260625113737
```

Resultados no banco restaurado:

```text
tabelas publicas: 40
migrations registradas: 42
clients: 4
```

O banco temporario foi removido ao final:

```text
TEMP_DB_REMAINING=0
```

## Validacao De Migrations

`prisma migrate status` foi executado contra o banco temporario restaurado.

Resultado:

```text
PRISMA_STATUS_EXIT=1
46 migrations encontradas no repo
9 migrations ainda nao aplicadas no dump restaurado
```

Migrations pendentes no dump:

```text
20260620213000_add_satisfaction
20260621150000_add_webchat
20260621190000_add_webchat_sessions
20260622153000_add_public_api_webhooks
20260622190000_add_webhook_secret_encryption
20260623120000_add_audio_transcriptions
20260624110000_add_advanced_search
20260624143000_add_mfa_schema
20260624170000_add_mfa_challenges
```

Conclusao: o dump validado prova que o restore funciona, mas nao representa o schema atual de producao. Para recuperacao real, o sistema precisa de backup PostgreSQL diario atual e validado.

## RTO Observado

| Etapa | Tempo observado |
| --- | --- |
| Listagem `.data` tar | 0s |
| Restore PostgreSQL isolado | 6s |
| Validacao Prisma | poucos segundos |

Este RTO nao e RTO operacional completo. Ele mede apenas restore tecnico de dump pequeno em banco temporario local, sem subir aplicacao, sem Nginx, sem DNS, sem midia externa e sem smoke funcional completo.

## Checklist Validado

| Check | Resultado |
| --- | --- |
| `.data` tar existe | OK |
| `.data` tar nao-zero | OK |
| `.data` tar listavel | OK |
| dump PostgreSQL existe | OK |
| dump PostgreSQL nao-zero | OK |
| checksum calculado | OK |
| `pg_restore --list` | OK |
| restore em banco isolado | OK |
| contagem de tabelas | OK |
| contagem de migrations | OK |
| Prisma status contra temporario | OK, detectou pendencias |
| producao preservada | OK |
| banco temporario removido | OK |

## Inconsistencias

1. O dump valido mais recente esta defasado.
2. Existem dumps 0 byte em `backups/`.
3. Nao ha evidencia de backup PostgreSQL diario.
4. Backups seguem na propria VPS.
5. Restore de `.env`, Nginx, certificados e PM2 nao foi executado; apenas desenhado na 78J.
6. Health/login/API nao foram executados contra runtime restaurado, porque isso exigiria app isolada apontando para banco temporario.

## Melhorias Recomendadas

Prioridade imediata:

1. criar rotina de dump PostgreSQL diario em formato custom;
2. rejeitar/alertar arquivo 0 byte;
3. gerar SHA256 para todo backup;
4. manter manifesto com data, tamanho, checksum, tipo e status;
5. copiar DB dump e `.data` tar para destino offsite;
6. repetir restore validation mensalmente;
7. na proxima validacao, criar dump atual antes do restore isolado.

## Atualizacao Pos-78L

A Sprint 78L implementa a rotina que corrige o achado principal desta validacao:

- `npm run backup:postgres`;
- dump PostgreSQL diario em formato custom;
- checksum SHA-256;
- manifest JSONL;
- rejeicao de dump vazio/invalido;
- validacao por `pg_restore --list`;
- retencao local;
- logs com eventos `backup.success`, `backup.failed` e `backup.invalid`.

Com isso, a proxima validacao de restore deve usar um dump gerado pela 78L, nao um dump pre-release antigo.

## Proxima Sprint Recomendada

**78M - Load Test Design**

Somente depois de ativar/validar o backup PostgreSQL diario na VPS.

Depois:

- 78N Capacity/Swap Hardening;
- 78O HA Runtime Plan;
- Offsite Backup MVP;
- Restore Drill recorrente com dump atual.

## Result Report

- Auditoria dos backups atuais concluida.
- Restore `.data` validado por listagem tar.
- Restore PostgreSQL validado em banco temporario isolado.
- Integridade basica validada por contagens e Prisma status.
- Inconsistencia de migrations detectada.
- Banco temporario removido.
- Producao nao foi alterada.
