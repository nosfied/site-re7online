CREATE TABLE "DepartmentBusinessHourException" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "intervals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentBusinessHourException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentBusinessHourException_clientId_departmentId_date_key" ON "DepartmentBusinessHourException"("clientId", "departmentId", "date");
CREATE INDEX "DepartmentBusinessHourException_clientId_departmentId_date_idx" ON "DepartmentBusinessHourException"("clientId", "departmentId", "date");
CREATE INDEX "DepartmentBusinessHourException_departmentId_date_idx" ON "DepartmentBusinessHourException"("departmentId", "date");

ALTER TABLE "DepartmentBusinessHourException" ADD CONSTRAINT "DepartmentBusinessHourException_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentBusinessHourException" ADD CONSTRAINT "DepartmentBusinessHourException_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
