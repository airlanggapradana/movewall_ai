-- AlterTable
ALTER TABLE "assessments" ADD COLUMN "kinematicReplayData" TEXT;
ALTER TABLE "assessments" ADD COLUMN "clientSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assessments_clientSessionId_key" ON "assessments"("clientSessionId");

