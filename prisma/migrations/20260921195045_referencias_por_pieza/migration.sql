-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "references" TEXT[] DEFAULT ARRAY[]::TEXT[];
