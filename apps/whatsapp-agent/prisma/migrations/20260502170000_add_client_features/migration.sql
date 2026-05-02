-- Additive, nullable field for future tenant feature flags.
-- Defaults remain enforced in application code so existing tenants keep all modules enabled.
ALTER TABLE "Client" ADD COLUMN "features" JSONB;
