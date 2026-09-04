-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'THERAPIST');

-- CreateTable
CREATE TABLE "therapists" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "specialization" TEXT,
    "licenseNumber" TEXT,
    "phoneNumber" TEXT,
    "role" "Role" NOT NULL DEFAULT 'THERAPIST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "therapists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" SERIAL NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientAge" INTEGER NOT NULL,
    "painAbduction" BOOLEAN NOT NULL DEFAULT false,
    "painFlexion" BOOLEAN NOT NULL DEFAULT false,
    "painExternalRotation" BOOLEAN NOT NULL DEFAULT false,
    "painInternalRotation" BOOLEAN NOT NULL DEFAULT false,
    "painExtension" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "missionId" INTEGER NOT NULL,
    "sessionScore" INTEGER NOT NULL DEFAULT 0,
    "sessionHits" INTEGER NOT NULL DEFAULT 0,
    "sessionLevel" INTEGER NOT NULL DEFAULT 1,
    "sessionTime" TEXT,
    "therapistId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "therapists_username_key" ON "therapists"("username");

-- CreateIndex
CREATE UNIQUE INDEX "therapists_email_key" ON "therapists"("email");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "therapists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
