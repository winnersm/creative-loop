// Recalcula el control técnico de las versiones aún no enviadas tras cambiar las reglas.
// Uso: docker compose exec app npx tsx scripts/recheck-qa.mts
import "dotenv/config"
import { prisma } from "../src/lib/prisma"
import { recheckPendingVersions } from "../src/lib/qa-recheck"

const n = await recheckPendingVersions(prisma)
console.log(`control técnico recalculado en ${n} versión(es)`)
await prisma.$disconnect()
