# Prova local da fronteira webhook/CRM

Reutilize as dependências da API e Node20.20.0 existentes; não reconstruir nem importar index.ts. Criar PostgreSQL16 isolado em127.0.0.1:55432 com banco **vazio** `re7_guard37_webhook_20261010` e schema Prisma efetivo aplicado sem dados produtivos. Cwd temporário obrigatório `/tmp/re7-guard37-reproduction-20261010`; configs/auth/JSON/ledger sintéticos. Provider é fetch simulado, nunca credenciais reais.

Defina RE7_REVIEW_ROOT para a raiz da branch e RE7_NODE20 para Node20.20.0. Use as variáveis sintéticas de REPRODUCE_IMPLEMENTATION.md, trocando DATABASE_URL para a base acima:

```bash
cd /tmp/re7-guard37-reproduction-20261010
export NODE_ENV=test APP_AUTH_SECRET=guard37-synthetic-only WHATSAPP_ACCESS_TOKEN=synthetic-only WHATSAPP_PHONE_NUMBER_ID=synthetic-only STORAGE_MODE=json
export DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55432/re7_guard37_webhook_20261010?schema=public
"$RE7_NODE20" --import "$RE7_REVIEW_ROOT/apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs" --test "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignAcceptedWebhookCrmBoundary.test.ts"
cd "$RE7_REVIEW_ROOT/apps/whatsapp-agent"
"$RE7_NODE20" node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Para reproduzir a origem sem modificar esta preparação: checkout/worktree **isolado**162edc79, levar somente a fixture nova e dependências locais já presentes; executar os três testes before/during/after pelo filtro `--test-name-pattern='real international runner'`. Cada um falha pela ausência de metaStatus; não usar outros dois testes para atribuir essa causa. A execução registrada comparou controller exato de162 e bytes corrigidos, restaurando sempre o arquivo local após execução. Logs e hashes ficam no manifesto, sem artefato privado publicado.

As duas regressões afetadas usam bases sintéticas anteriores protegidas e comandos de REPRODUCE_IMPLEMENTATION, selecionando somente campaignAcceptedResultWebhook.test.ts e o nome `delayed campaign delivery does not reset a newer human cycle` em campaignRunner.test.ts. Nenhum teste concede apply/ack ou lê a VPS.
