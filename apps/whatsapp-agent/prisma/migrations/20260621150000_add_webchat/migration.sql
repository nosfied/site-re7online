CREATE TABLE "WebchatSite" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'inactive',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebchatSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebchatSettings" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "siteId" TEXT NOT NULL,
  "theme" JSONB,
  "welcomeMessage" TEXT,
  "collectName" BOOLEAN NOT NULL DEFAULT true,
  "collectEmail" BOOLEAN NOT NULL DEFAULT false,
  "collectPhone" BOOLEAN NOT NULL DEFAULT false,
  "allowAnonymous" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebchatSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebchatAllowedDomain" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "siteId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebchatAllowedDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebchatSite_clientId_slug_key" ON "WebchatSite"("clientId", "slug");
CREATE INDEX "WebchatSite_clientId_status_idx" ON "WebchatSite"("clientId", "status");
CREATE INDEX "WebchatSite_clientId_updatedAt_idx" ON "WebchatSite"("clientId", "updatedAt");

CREATE UNIQUE INDEX "WebchatSettings_siteId_key" ON "WebchatSettings"("siteId");
CREATE INDEX "WebchatSettings_clientId_siteId_idx" ON "WebchatSettings"("clientId", "siteId");

CREATE UNIQUE INDEX "WebchatAllowedDomain_siteId_domain_key" ON "WebchatAllowedDomain"("siteId", "domain");
CREATE INDEX "WebchatAllowedDomain_clientId_active_idx" ON "WebchatAllowedDomain"("clientId", "active");
CREATE INDEX "WebchatAllowedDomain_clientId_siteId_idx" ON "WebchatAllowedDomain"("clientId", "siteId");

ALTER TABLE "WebchatSite" ADD CONSTRAINT "WebchatSite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebchatSettings" ADD CONSTRAINT "WebchatSettings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebchatSettings" ADD CONSTRAINT "WebchatSettings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebchatSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebchatAllowedDomain" ADD CONSTRAINT "WebchatAllowedDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebchatAllowedDomain" ADD CONSTRAINT "WebchatAllowedDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WebchatSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
