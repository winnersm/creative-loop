/*
  Warnings:

  - You are about to drop the column `translatedFromId` on the `Asset` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_translatedFromId_fkey";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "translatedFromId";
