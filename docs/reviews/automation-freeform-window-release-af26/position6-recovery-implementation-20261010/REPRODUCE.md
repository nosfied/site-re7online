# Reprodução local e escopo dos ensaios

Usar checkout destes bytes, dependências preservadas de whatsapp-agent, Node **20.20.0** e PostgreSQL16 local. Não usar arquivo/configuração/DB produtivos. O teste valida hostname loopback, nome exato de DB e versão Node antes de limpar sua fixture. O DB deve ser **novo e dedicado**: ele é apagado/repopulado entre casos. Reutilizar schema Prisma vigente, sem migration produtiva.

```bash
createdb -h 127.0.0.1 -p 55432 -U deifson-oliveira re7_position6_recovery_20261010
export DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55432/re7_position6_recovery_20261010
export NODE_ENV=test APP_AUTH_SECRET=synthetic-only WHATSAPP_ACCESS_TOKEN=synthetic-only WHATSAPP_PHONE_NUMBER_ID=synthetic-only STORAGE_MODE=json
/tmp/re7-pm2-lab/node apps/whatsapp-agent/node_modules/prisma/build/index.js db push --schema apps/whatsapp-agent/prisma/schema.prisma --skip-generate
/tmp/re7-pm2-lab/node --import ./apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs --test apps/whatsapp-agent/src/campaigns/campaignAcceptedDeliveryRecovery.test.ts apps/whatsapp-agent/src/campaigns/campaignRecipientResultTruth.test.ts
/tmp/re7-pm2-lab/node apps/whatsapp-agent/node_modules/typescript/bin/tsc -p apps/whatsapp-agent/tsconfig.json --noEmit
```

Na execução registrada, o banco novo foi criado e recebeu o schema vigente por psql a partir do schema sintético preservado; não se repetiu migration/build funcional. A receita acima permite criar o mesmo schema a partir de Prisma. Não executar createdb/db push sobre DB existente ou produtivo. Falha de autenticação/permissão é impedimento, não autorização para alterar servidor.

Regressão diretamente afetada: `campaignAcceptedFailureReconciliation.test.ts` executada em DB sintético separado `re7_guard37_regression_20261010`, Node20 e mesmos providers fictícios. Um caso integrado passa pelo wrapper FAILED131026, read models, SQL real, receipt e replay. Essa fixture usa o produtor de provider sintético existente; não representa provider real.

A suíte .6 roda SQL/ledger/CLI efetivos. Resultados de provider são fixtures armazenadas, não chamadas. EIO de archive é injeção explícita; rollback do trigger é PostgreSQL real. Não há teste de reboot, crash real, DB/ledger atomicidade ou aceite humano produtivo. Provas anteriores de prevenção/webhook/CRM continuam válidas nos seus próprios escopos.

O patch sanitizado contém somente código/testes/CLI, com contexto zero. Para conferir sua aplicação sobre a origem e643ebbafaa851b1a0780d41eea0ea6c1079fce1 em checkout isolado, usar `git apply --check --unidiff-zero position6-recovery.sanitized.patch`. O manifesto de origem/resultado confirma os bytes; não aplicar sobre a produção ou preparação frontend.
