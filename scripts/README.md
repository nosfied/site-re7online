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
