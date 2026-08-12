-- Additive foundation for multi-department memberships and department business hours.
CREATE TABLE "UserDepartmentMembership" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDepartmentMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepartmentBusinessHour" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "departmentId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentBusinessHour_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDepartmentMembership_userId_departmentId_key" ON "UserDepartmentMembership"("userId", "departmentId");
CREATE INDEX "UserDepartmentMembership_clientId_userId_idx" ON "UserDepartmentMembership"("clientId", "userId");
CREATE INDEX "UserDepartmentMembership_clientId_departmentId_idx" ON "UserDepartmentMembership"("clientId", "departmentId");
CREATE INDEX "UserDepartmentMembership_clientId_departmentId_isActive_idx" ON "UserDepartmentMembership"("clientId", "departmentId", "isActive");

CREATE INDEX "DepartmentBusinessHour_clientId_departmentId_weekday_idx" ON "DepartmentBusinessHour"("clientId", "departmentId", "weekday");
CREATE INDEX "DepartmentBusinessHour_departmentId_weekday_idx" ON "DepartmentBusinessHour"("departmentId", "weekday");

ALTER TABLE "UserDepartmentMembership" ADD CONSTRAINT "UserDepartmentMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDepartmentMembership" ADD CONSTRAINT "UserDepartmentMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDepartmentMembership" ADD CONSTRAINT "UserDepartmentMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentBusinessHour" ADD CONSTRAINT "DepartmentBusinessHour_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentBusinessHour" ADD CONSTRAINT "DepartmentBusinessHour_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill primary memberships from the legacy primary department column.
INSERT INTO "UserDepartmentMembership" (
  "id", "clientId", "userId", "departmentId", "isPrimary", "isActive", "createdAt", "updatedAt"
)
SELECT
  concat('legacy-udm-', md5(u."id" || ':' || u."departmentId")),
  u."clientId",
  u."id",
  u."departmentId",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
JOIN "Department" d ON d."id" = u."departmentId" AND d."clientId" = u."clientId"
WHERE u."departmentId" IS NOT NULL
ON CONFLICT ("userId", "departmentId") DO NOTHING;
