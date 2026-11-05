// Borra los anuncios sin código de seguimiento (cl-…) que se guardaron antes de que la
// sincronización dejara de traerlos, junto con su rendimiento diario.
// No toca los anuncios vinculados a un creativo.
// Uso: docker compose exec app npx tsx scripts/purge-ads-without-code.mts           (solo cuenta)
//      docker compose exec app npx tsx scripts/purge-ads-without-code.mts --apply   (borra)
import "dotenv/config"
import { parseToken } from "../src/lib/codes"
import { prisma } from "../src/lib/prisma"

const apply = process.argv.includes("--apply")
const ads = await prisma.metaAd.findMany({ where: { deployment: null }, select: { adId: true, name: true } })
const ids = ads.filter((a) => !parseToken(a.name)).map((a) => a.adId)
const rows = await prisma.performanceDaily.count({ where: { adId: { in: ids } } })
console.log(`${ids.length} anuncio(s) sin código · ${rows} fila(s) de rendimiento diario`)
if (apply && ids.length) {
  await prisma.$transaction([
    prisma.performanceDaily.deleteMany({ where: { adId: { in: ids } } }),
    prisma.metaAd.deleteMany({ where: { adId: { in: ids } } }),
  ])
  console.log("borrados")
} else if (!apply) console.log("(sin --apply no se borra nada)")
await prisma.$disconnect()
