-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "scriptTranslation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scriptTranslationLang" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scriptTranslationOf" TEXT NOT NULL DEFAULT '';
