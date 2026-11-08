-- AlterTable
ALTER TABLE "patients"
ADD COLUMN "homeAccessCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "patients_homeAccessCode_key" ON "patients"("homeAccessCode");

-- AlterTable
ALTER TABLE "assessments"
ADD COLUMN "sessionMode" TEXT NOT NULL DEFAULT 'CLINIC',
ADD COLUMN "aiSummaryDraft" TEXT,
ADD COLUMN "aiSummaryApproved" BOOLEAN NOT NULL DEFAULT false;

