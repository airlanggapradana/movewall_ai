-- Fase 0: entitas Patient + persetujuan data + audit log
-- Fase 1: skala nyeri 0-10, peta nyeri, metrik sesi (ROM maksimum, akurasi, kompensasi)

-- CreateTable
CREATE TABLE "patients" (
    "id" SERIAL NOT NULL,
    "medicalRecordNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "therapistId" INTEGER NOT NULL,
    "consentGivenAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "therapistId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: kolom baru pada assessments (patientId dibuat nullable dulu untuk backfill)
ALTER TABLE "assessments"
    ADD COLUMN "patientId" INTEGER,
    ADD COLUMN "painAbductionScore" INTEGER,
    ADD COLUMN "painFlexionScore" INTEGER,
    ADD COLUMN "painExternalRotationScore" INTEGER,
    ADD COLUMN "painInternalRotationScore" INTEGER,
    ADD COLUMN "painExtensionScore" INTEGER,
    ADD COLUMN "painRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "maxRomDeg" DOUBLE PRECISION,
    ADD COLUMN "accuracyPercent" INTEGER,
    ADD COLUMN "compensationEvents" INTEGER;

-- Backfill: satu pasien per (terapis, nama yang dinormalisasi). Usia diambil dari sesi terbaru.
-- Persetujuan data sengaja dibiarkan NULL: belum pernah dicatat, terapis harus mencatatnya.
WITH ranked AS (
    SELECT
        "therapistId",
        lower(btrim("patientName")) AS "key",
        btrim("patientName") AS "name",
        "patientAge" AS "age",
        "createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY "therapistId", lower(btrim("patientName"))
            ORDER BY "createdAt" DESC, "id" DESC
        ) AS "rn",
        MIN("createdAt") OVER (
            PARTITION BY "therapistId", lower(btrim("patientName"))
        ) AS "firstAt"
    FROM "assessments"
)
INSERT INTO "patients" ("medicalRecordNo", "name", "age", "therapistId", "createdAt", "updatedAt")
SELECT
    'TMP-' || "therapistId" || '-' || md5("key"),
    "name",
    "age",
    "therapistId",
    "firstAt",
    "createdAt"
FROM ranked
WHERE "rn" = 1;

UPDATE "patients"
SET "medicalRecordNo" = 'MW-' || lpad("id"::text, 6, '0')
WHERE "medicalRecordNo" LIKE 'TMP-%';

UPDATE "assessments" a
SET "patientId" = p."id"
FROM "patients" p
WHERE p."therapistId" = a."therapistId"
  AND lower(btrim(p."name")) = lower(btrim(a."patientName"));

-- Semua baris kini punya pasien
ALTER TABLE "assessments" ALTER COLUMN "patientId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "patients_medicalRecordNo_key" ON "patients"("medicalRecordNo");

-- CreateIndex
CREATE INDEX "patients_therapistId_name_idx" ON "patients"("therapistId", "name");

-- CreateIndex
CREATE INDEX "audit_logs_therapistId_createdAt_idx" ON "audit_logs"("therapistId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "assessments_patientId_createdAt_idx" ON "assessments"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

