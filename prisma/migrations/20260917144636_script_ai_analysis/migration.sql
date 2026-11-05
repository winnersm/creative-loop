-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "aiAnalysis" JSONB,
ADD COLUMN     "aiAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "script" TEXT NOT NULL DEFAULT '';
