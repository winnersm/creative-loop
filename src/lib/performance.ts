// Agregación de performance por asset (F-803). Usado por la web y el worker.
import { parseToken } from "@/lib/codes"
import { prisma } from "@/lib/prisma"
import { addRow, emptyTotals, withDerived, type Metrics, type Totals } from "@/lib/metrics"

export type DateRange = { from?: Date; to?: Date }

/** Totales por asset a partir de sus deployments. */
export async function totalsByAsset(assetIds: string[], range: DateRange = {}): Promise<Map<string, Totals>> {
  const out = new Map<string, Totals>()
  if (!assetIds.length) return out
  const deployments = await prisma.deployment.findMany({
    where: { assetId: { in: assetIds } },
    select: {
      adId: true,
      assetId: true,
      asset: { select: { offer: { select: { conversionEvent: true, payoutCents: true } } } },
    },
  })
  if (!deployments.length) return out
  const byAd = new Map(deployments.map((d) => [d.adId, d]))
  const rows = await prisma.performanceDaily.findMany({
    where: {
      adId: { in: [...byAd.keys()] },
      date: { gte: range.from, lte: range.to },
    },
  })
  for (const row of rows) {
    const d = byAd.get(row.adId)!
    const t = out.get(d.assetId) ?? emptyTotals()
    // Sin oferta no se sabe qué evento es conversión: cuenta gasto e impresiones, no conversiones.
    addRow(t, row, d.asset.offer ?? NO_OFFER)
    out.set(d.assetId, t)
  }
  return out
}

const NO_OFFER = { conversionEvent: "", payoutCents: 0 }

export async function metricsByAsset(assetIds: string[], range: DateRange = {}): Promise<Map<string, Metrics>> {
  const totals = await totalsByAsset(assetIds, range)
  return new Map([...totals].map(([k, v]) => [k, withDerived(v)]))
}

/** Primer día con gasto de un asset (inicio del testing). */
export async function firstSpendDate(assetId: string): Promise<Date | null> {
  const ads = await prisma.deployment.findMany({ where: { assetId }, select: { adId: true } })
  if (!ads.length) return null
  const row = await prisma.performanceDaily.findFirst({
    where: { adId: { in: ads.map((a) => a.adId) }, spendCents: { gt: 0 } },
    orderBy: { date: "asc" },
    select: { date: true },
  })
  return row?.date ?? null
}

/** Anuncios con gasto y sin asset (F-705). */
/**
 * F-705 · Anuncios con un código de seguimiento que no corresponde a ninguna versión
 * (código mal escrito o de una versión que no existe), con gasto en los últimos 7 días.
 * Los anuncios sin código ni siquiera se sincronizan.
 */
export async function unassignedAds() {
  const ads = (
    await prisma.metaAd.findMany({
      where: { deployment: null, ignored: false },
      orderBy: { lastSeenAt: "desc" },
    })
  )
    .map((a) => ({ ...a, code: parseToken(a.name)?.versionCode ?? null }))
    .filter((a) => a.code)
  if (!ads.length) return []
  // Mismo periodo que la sincronización: hoy y los 6 días anteriores (UTC).
  const since = new Date(`${new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)}T00:00:00Z`)
  const spend = await prisma.performanceDaily.groupBy({
    by: ["adId"],
    where: { adId: { in: ads.map((a) => a.adId) }, date: { gte: since } },
    _sum: { spendCents: true, impressions: true },
  })
  const byAd = new Map(spend.map((s) => [s.adId, s._sum]))
  return ads
    .map((a) => ({ ...a, spendCents: byAd.get(a.adId)?.spendCents ?? 0, impressions: byAd.get(a.adId)?.impressions ?? 0 }))
    .filter((a) => a.spendCents > 0)
}
