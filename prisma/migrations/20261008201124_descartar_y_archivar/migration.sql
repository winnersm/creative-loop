-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('NOT_TESTED', 'CYCLE_DONE', 'OFFER_CLOSED', 'DUPLICATE', 'CONCEPT_ARCHIVED', 'OTHER');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "archiveReason" "ArchiveReason";

-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
