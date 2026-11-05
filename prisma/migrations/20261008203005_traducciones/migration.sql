-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "translatedFromId" TEXT;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_translatedFromId_fkey" FOREIGN KEY ("translatedFromId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
