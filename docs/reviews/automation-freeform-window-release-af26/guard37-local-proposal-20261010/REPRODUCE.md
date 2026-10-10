# Reproducing the incident locally

Test source: `apps/whatsapp-agent/src/campaigns/campaignGuard37Incident.test.ts`.
Use Node20.20.0 and existing agent dependencies; no application entrypoint/build.
An empty dedicated local PostgreSQL database must have the attested current schema.
The executed setup copied schema-only from the prior synthetic eligibility laboratory:

```bash
createdb -h /tmp -p 55432 re7_guard37_synthetic_20261010
pg_dump -h /tmp -p 55432 -d re7_campaign_eligibility_20261008 --schema-only --no-owner --no-privileges -f /tmp/re7-guard37-schema.sql
psql -h /tmp -p 55432 -d re7_guard37_synthetic_20261010 -v ON_ERROR_STOP=1 -q -f /tmp/re7-guard37-schema.sql
mkdir -p /tmp/re7-guard37-reproduction-20261010
cd /tmp/re7-guard37-reproduction-20261010
env NODE_ENV=test DATABASE_URL='postgresql://deifson-oliveira@127.0.0.1:55432/re7_guard37_synthetic_20261010?schema=public' APP_AUTH_SECRET=guard37-synthetic-only WHATSAPP_ACCESS_TOKEN=synthetic-only WHATSAPP_PHONE_NUMBER_ID=synthetic-only STORAGE_MODE=json /tmp/re7-pm2-lab/node --import /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs --test /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/apps/whatsapp-agent/src/campaigns/campaignGuard37Incident.test.ts
```

These are laboratory paths, not VPS commands. `createdb` must deny an existing database; do not repeat against a consumed fixture. The proof database and local ledger remain as evidence of the executed run. A separate fresh laboratory must provision the same schema for a repeat. URL, cwd and NODE_ENV assertions reject production or an arbitrary DB; fetch is simulated and never delegated to originalFetch. No real credentials are used.

The local ledger is read during the provider callback and after completion; actual filesystem lock/fsync is used. PostgreSQL writes/transactions/queue claim/suspension are real local effects. Provider response alone is simulated. No CRM/persistence failure is mocked. No webhook, scheduler timer, receipt, recovery, retry or opening after failure is run.
