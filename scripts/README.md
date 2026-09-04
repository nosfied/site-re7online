# Operational Scripts

## `deploy-impact-matrix.sh`

Calcula o impacto de runtime de um range Git:

```bash
scripts/deploy-impact-matrix.sh <base> <head>
scripts/deploy-impact-matrix.sh <base>..<head>
```

O script e somente leitura. Ele nao faz build, reload, deploy, migration ou
alteracao de banco.

Use antes de publicar na VPS para decidir quais artefatos precisam ser
buildados e quais processos PM2 precisam ser recarregados:

- `BACKEND_*`: `re7-whatsapp-agent`
- `WORKER_*`: `re7-whatsapp-web-worker`
- `FRONTEND_*`: `re7-admin-front`

Mudancas em `apps/whatsapp-agent/src/**` sao tratadas de forma conservadora
como impacto em backend e worker, porque o worker transpila modulos do backend
para `apps/whatsapp-web-worker/dist/whatsapp-agent/src`.

Se `REVIEW_REQUIRED=YES`, pare o deploy e classifique o caminho alterado antes
de prosseguir.

## `apps/whatsapp-agent/scripts/deploy-vps.sh`

O deploy da VPS consome a matriz automaticamente:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh
```

Para revisar sem alterar o checkout nem executar build/reload:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh --dry-run origin/flow-executor-quote-hardening
```

O deploy integrado faz `git pull --ff-only`, calcula o range publicado, para em
`REVIEW_REQUIRED=YES` ou `UNKNOWN_RUNTIME_IMPACT=YES`, builda todos os runtimes
afetados e somente depois recarrega os processos PM2 correspondentes.
