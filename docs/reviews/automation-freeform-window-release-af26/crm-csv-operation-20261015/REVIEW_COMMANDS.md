# Revisão e reprodução local

Não são comandos de instalação. Não apontar estes testes a uma base produtiva. O laboratório sintético usado foi encerrado; recriação/uso de outro laboratório exige ambiente isolado com schema canônico e dados sintéticos, nunca dump de tenant para esta prova. O novo teste PostgreSQL recusa qualquer destino além de 127.0.0.1:55781/retention_lab.

No worktree, provas sem PostgreSQL:

```bash
node --import ./apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs src/lib/crmImportRecovery.test.ts
node --import ./apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs --test apps/whatsapp-agent/src/crm/crmContactUpsert.test.ts apps/whatsapp-agent/src/crm/crmContactsReadModelContract.test.ts apps/whatsapp-agent/src/events/eventRetentionPolicy.test.ts
apps/whatsapp-agent/node_modules/.bin/tsc --noEmit --incremental false -p apps/whatsapp-agent/tsconfig.json
node_modules/.bin/tsc --noEmit --incremental false -p docs/reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/tsconfig.sources.json
node_modules/.bin/tsc --noEmit --incremental false -p docs/reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/tsconfig.client-test.json
```

Somente com o laboratório sintético previamente disponível, sem credencial produtiva, a partir de apps/whatsapp-agent:

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55781/retention_lab node --import tsx --test src/crm/crmCsvImportOperation.postgres.test.ts
DATABASE_URL=postgresql://postgres@127.0.0.1:55781/retention_lab node --import tsx --test src/http/crmCapabilityRoutes.test.ts
```

A suíte HTTP usa porta local efêmera e auth sintética. Reutilizar as provas atuais; comandos são para revisão/reprodução quando necessária, não instrução de repetir suites válidas por rotina. Os dois typechecks frontend foram delimitados às fontes de produção e ao teste novo, excluindo testes antigos com erros já registrados; configs revisáveis nesta pasta e logs na evidência local. Nenhuma suite Prisma de retenção executada.

Conferir PUBLIC_FILES_SHA256.json antes da revisão. Roteiros de produção, staging, restart ou liberação da guarda não fazem parte desta entrega.

Revisão de navegador: BROWSER_REVIEW.md e browser/ contêm harness/driver e evidências sintéticas. O harness exige NODE_ENV=test, DATABASE_URL exatamente loopback55781/retention_lab e RE7_CSV_REVIEW_ROOT para o worktree. Não carregar .env. Executar serve.ts com o mesmo loader; frontend local isolado usa cópia das fontes/configs não secretas e node_modules reutilizado, sem .env. O perfil agent-browser re7-csv-review é separado do habitual. O laboratório atual está encerrado; comandos futuros somente em laboratório sintético, não roteiro de janela produtiva.
