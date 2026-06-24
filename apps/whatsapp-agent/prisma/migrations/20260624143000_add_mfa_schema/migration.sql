CREATE TABLE "MfaTotpSecret" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enrolledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfaTotpSecret_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaTotpSecret_clientId_userId_key" ON "MfaTotpSecret"("clientId", "userId");
CREATE INDEX "MfaTotpSecret_clientId_enabled_idx" ON "MfaTotpSecret"("clientId", "enabled");
CREATE INDEX "MfaTotpSecret_userId_idx" ON "MfaTotpSecret"("userId");

CREATE UNIQUE INDEX "MfaRecoveryCode_clientId_userId_codeHash_key" ON "MfaRecoveryCode"("clientId", "userId", "codeHash");
CREATE INDEX "MfaRecoveryCode_clientId_userId_usedAt_idx" ON "MfaRecoveryCode"("clientId", "userId", "usedAt");

ALTER TABLE "MfaTotpSecret" ADD CONSTRAINT "MfaTotpSecret_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaTotpSecret" ADD CONSTRAINT "MfaTotpSecret_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
