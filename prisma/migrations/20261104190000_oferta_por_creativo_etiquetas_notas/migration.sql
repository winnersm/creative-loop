-- La oferta pasa del concepto a cada creativo (ajustes de Elkin, 2026-11-04).
-- Cada creativo existente hereda la oferta que tenía su concepto, así no se pierde nada.
-- GEO e idioma del concepto salían de la oferta: se quitan y se leen de la oferta del creativo.

-- 1. Columnas nuevas en Asset
ALTER TABLE "Asset" ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "offerId" TEXT;

-- 2. Copiar la oferta del concepto a sus creativos
UPDATE "Asset" a SET "offerId" = c."offerId" FROM "Concept" c WHERE a."conceptId" = c."id";

-- 3. Quitar la oferta, el GEO y el idioma del concepto
ALTER TABLE "Concept" DROP CONSTRAINT "Concept_offerId_fkey";
DROP INDEX "Concept_offerId_idx";
ALTER TABLE "Concept" DROP COLUMN "geo",
DROP COLUMN "language",
DROP COLUMN "offerId";

-- 4. Etiquetas de equipo
CREATE TABLE "AssetLabel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetLabel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_AssetToAssetLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssetToAssetLabel_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "AssetLabel_name_key" ON "AssetLabel"("name");
CREATE INDEX "_AssetToAssetLabel_B_index" ON "_AssetToAssetLabel"("B");
CREATE INDEX "Asset_offerId_idx" ON "Asset"("offerId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_AssetToAssetLabel" ADD CONSTRAINT "_AssetToAssetLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_AssetToAssetLabel" ADD CONSTRAINT "_AssetToAssetLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "AssetLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
