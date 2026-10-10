# Reprodução isolada — não usar DATABASE_URL produtiva

Requer Node20.20.0, PostgreSQL16, schema Prisma existente instalado em bancos **vazios sintéticos**, dependências já presentes da API. Não importar index.ts, iniciar scheduler global ou provider real. Os testes protegem hostname127.0.0.1, nomes de bancos e cwd temporário; não remover esses guards.

Na raiz da branch de revisão, defina `RE7_REVIEW_ROOT=$PWD`, `RE7_NODE20=/tmp/re7-pm2-lab/node`. Crie por procedimento local aprovado as bases `re7_guard37_prevention_20261010` e `re7_guard37_regression_20261010` com somente schema sintético (sem dados de produção). Use cwd `/tmp/re7-guard37-reproduction-20261010` para JSON/runtime locais. Configuração sintética: NODE_ENV=test, APP_AUTH_SECRET=guard37-synthetic-only, WHATSAPP_ACCESS_TOKEN=synthetic-only, WHATSAPP_PHONE_NUMBER_ID=synthetic-only, STORAGE_MODE=json. Não usar env privado nem credenciais reais.

```bash
cd /tmp/re7-guard37-reproduction-20261010
export NODE_ENV=test APP_AUTH_SECRET=guard37-synthetic-only WHATSAPP_ACCESS_TOKEN=synthetic-only WHATSAPP_PHONE_NUMBER_ID=synthetic-only STORAGE_MODE=json
export DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55432/re7_guard37_prevention_20261010?schema=public
"$RE7_NODE20" --import "$RE7_REVIEW_ROOT/apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs" --test "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignAcceptedResult.test.ts" "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignAcceptedResultRunner.test.ts"
"$RE7_NODE20" --import "$RE7_REVIEW_ROOT/apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs" --test "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignAcceptedResultWebhook.test.ts" "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignAcceptedDeliveryReview.test.ts"
export DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55432/re7_guard37_regression_20261010?schema=public
"$RE7_NODE20" --import "$RE7_REVIEW_ROOT/apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs" --test --test-name-pattern='campaign runner persists provider acceptance|campaign runner materializes CRM identity for provider failure|old pseudo snapshot|identity rejects privacy|real PostgreSQL: aliases' "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignRunner.test.ts" "$RE7_REVIEW_ROOT/apps/whatsapp-agent/src/campaigns/campaignEligibility.test.ts"
cd "$RE7_REVIEW_ROOT/apps/whatsapp-agent"
"$RE7_NODE20" node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd "$RE7_REVIEW_ROOT"
python3 docs/reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/frontend_guard_contract_test.py
```

Resultados são testes source via tsx/Prisma em Node20, não compilados de uma release empacotada. Não executar o antigo campaignGuard37Incident.test.ts contra a prevenção: sua expectativa zero Outbound é evidência congelada da origem85. Não chamar apply/ack/setter produtivo. O setter nos testes altera somente JSON sintético isolado. O verificador .6 não concede capacidade de escrita; as únicas gravações correspondentes são fixtures do teste local.
