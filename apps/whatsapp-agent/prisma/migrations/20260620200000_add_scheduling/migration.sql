CREATE TABLE "SchedulingService" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "departmentId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulingService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulingResource" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "departmentId" TEXT,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'person',
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulingResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulingAvailability" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "serviceId" TEXT,
  "resourceId" TEXT,
  "weekday" INTEGER NOT NULL,
  "startsAtLocal" TEXT NOT NULL,
  "endsAtLocal" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
  "status" TEXT NOT NULL DEFAULT 'active',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchedulingAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "serviceId" TEXT,
  "resourceId" TEXT,
  "departmentId" TEXT,
  "contactId" UUID,
  "leadId" TEXT,
  "conversationId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Fortaleza',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentReminder" (
  "id" TEXT NOT NULL,
  "clientId" UUID NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "kind" TEXT NOT NULL DEFAULT 'reminder',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "templateName" TEXT,
  "templateLang" TEXT,
  "requestId" TEXT,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchedulingService_clientId_status_idx" ON "SchedulingService"("clientId", "status");
CREATE INDEX "SchedulingService_clientId_departmentId_idx" ON "SchedulingService"("clientId", "departmentId");
CREATE INDEX "SchedulingService_clientId_updatedAt_idx" ON "SchedulingService"("clientId", "updatedAt");

CREATE INDEX "SchedulingResource_clientId_status_idx" ON "SchedulingResource"("clientId", "status");
CREATE INDEX "SchedulingResource_clientId_departmentId_idx" ON "SchedulingResource"("clientId", "departmentId");
CREATE INDEX "SchedulingResource_clientId_userId_idx" ON "SchedulingResource"("clientId", "userId");
CREATE INDEX "SchedulingResource_clientId_updatedAt_idx" ON "SchedulingResource"("clientId", "updatedAt");

CREATE INDEX "SchedulingAvailability_clientId_status_idx" ON "SchedulingAvailability"("clientId", "status");
CREATE INDEX "SchedulingAvailability_clientId_weekday_idx" ON "SchedulingAvailability"("clientId", "weekday");
CREATE INDEX "SchedulingAvailability_clientId_serviceId_idx" ON "SchedulingAvailability"("clientId", "serviceId");
CREATE INDEX "SchedulingAvailability_clientId_resourceId_idx" ON "SchedulingAvailability"("clientId", "resourceId");

CREATE INDEX "Appointment_clientId_status_idx" ON "Appointment"("clientId", "status");
CREATE INDEX "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt");
CREATE INDEX "Appointment_clientId_serviceId_idx" ON "Appointment"("clientId", "serviceId");
CREATE INDEX "Appointment_clientId_resourceId_idx" ON "Appointment"("clientId", "resourceId");
CREATE INDEX "Appointment_clientId_contactId_idx" ON "Appointment"("clientId", "contactId");
CREATE INDEX "Appointment_clientId_leadId_idx" ON "Appointment"("clientId", "leadId");
CREATE INDEX "Appointment_clientId_conversationId_idx" ON "Appointment"("clientId", "conversationId");

CREATE INDEX "AppointmentReminder_clientId_status_idx" ON "AppointmentReminder"("clientId", "status");
CREATE INDEX "AppointmentReminder_clientId_scheduledAt_idx" ON "AppointmentReminder"("clientId", "scheduledAt");
CREATE INDEX "AppointmentReminder_appointmentId_scheduledAt_idx" ON "AppointmentReminder"("appointmentId", "scheduledAt");

ALTER TABLE "SchedulingService"
  ADD CONSTRAINT "SchedulingService_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchedulingService"
  ADD CONSTRAINT "SchedulingService_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchedulingResource"
  ADD CONSTRAINT "SchedulingResource_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchedulingResource"
  ADD CONSTRAINT "SchedulingResource_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchedulingResource"
  ADD CONSTRAINT "SchedulingResource_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchedulingAvailability"
  ADD CONSTRAINT "SchedulingAvailability_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchedulingAvailability"
  ADD CONSTRAINT "SchedulingAvailability_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "SchedulingService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchedulingAvailability"
  ADD CONSTRAINT "SchedulingAvailability_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "SchedulingResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "SchedulingService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "SchedulingResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentReminder"
  ADD CONSTRAINT "AppointmentReminder_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentReminder"
  ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
