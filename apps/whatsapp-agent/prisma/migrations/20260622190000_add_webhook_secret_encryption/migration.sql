ALTER TABLE "WebhookEndpoint"
  ADD COLUMN "signingSecretCiphertext" TEXT,
  ADD COLUMN "signingSecretKeyVersion" TEXT,
  ADD COLUMN "signingSecretRotatedAt" TIMESTAMP(3);

CREATE INDEX "WebhookEndpoint_clientId_signingSecretKeyVersion_idx"
  ON "WebhookEndpoint"("clientId", "signingSecretKeyVersion");
