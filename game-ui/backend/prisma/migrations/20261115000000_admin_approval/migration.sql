ALTER TYPE "Role" ADD VALUE 'ADMIN';
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'SUSPENDED');
ALTER TABLE "therapists"
  ADD COLUMN "clinicName" TEXT,
  ADD COLUMN "applicationStatus" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "applicationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" INTEGER;
-- Preserve legacy access explicitly; new rows retain the PENDING default.
UPDATE "therapists" SET "applicationStatus" = CASE WHEN "isActive" THEN 'APPROVED'::"ApplicationStatus" ELSE 'SUSPENDED'::"ApplicationStatus" END,
  "submittedAt" = "createdAt";
ALTER TABLE "therapists" ADD CONSTRAINT "therapists_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "therapists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "application_decisions" (
  "id" TEXT NOT NULL PRIMARY KEY, "therapistId" INTEGER NOT NULL, "actorId" INTEGER NOT NULL, "version" INTEGER NOT NULL,
  "fromStatus" "ApplicationStatus", "toStatus" "ApplicationStatus" NOT NULL,
  "reason" TEXT, "checklist" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_decisions_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_decisions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "application_decisions_therapistId_createdAt_idx" ON "application_decisions"("therapistId", "createdAt");
CREATE UNIQUE INDEX "application_decisions_therapistId_version_key" ON "application_decisions"("therapistId", "version");
CREATE TABLE "notification_outbox" (
  "id" TEXT NOT NULL PRIMARY KEY, "eventId" TEXT NOT NULL, "therapistId" INTEGER NOT NULL,
  "recipient" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMP(3), "lockedUntil" TIMESTAMP(3), "lockToken" TEXT,
  "providerId" TEXT, "lastError" TEXT, "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_outbox_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_outbox_eventId_key" ON "notification_outbox"("eventId");
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");
