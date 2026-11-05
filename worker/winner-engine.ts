// Job winner-engine (F-901–F-903): evalúa los assets en testing y guarda cada evaluación.
import { managerIds, notify } from "@/lib/events"
import { withDerived } from "@/lib/metrics"
import { totalsByAsset } from "@/lib/performance"
import { prisma } from "@/lib/prisma"
import { PERFORMANCE_STATUS } from "@/lib/status"
import { DEFAULT_RULE, evaluate, type WinnerRuleConfig } from "@/lib/winner-rules"

export async function winnerEngine() {
  const run = await prisma.syncRun.create({ data: { kind: "winner-engine" } })
  const stats = { evaluated: 0, changed: 0 }
  try {
    const rules = await prisma.winnerRule.findMany()
    const global: WinnerRuleConfig = rules.find((r) => r.offerId === null) ?? DEFAULT_RULE
    const byOffer = new Map(rules.filter((r) => r.offerId).map((r) => [r.offerId!, r]))

    const assets = await prisma.asset.findMany({
      where: { performanceStatus: "TESTING" },
      include: { offer: true, concept: { select: { title: true } } },
    })
    const totals = await totalsByAsset(assets.map((a) => a.id))
    const managers = await managerIds(prisma)

    for (const asset of assets) {
      // Sin oferta no hay CPA objetivo con el que juzgar.
      const offer = asset.offer
      if (!offer) continue
      const rule = byOffer.get(offer.id) ?? global
      const m = withDerived(totals.get(asset.id) ?? { spendCents: 0, impressions: 0, clicks: 0, videoPlays3s: 0, thruplays: 0, conversions: 0, revenueCents: 0 })
      const since = asset.testingSince ?? asset.updatedAt
      const daysInTesting = Math.floor((Date.now() - since.getTime()) / 86400_000)
      const result = evaluate(
        {
          spendCents: m.spendCents,
          conversions: m.conversions,
          hookRate: asset.mediaType === "VIDEO" ? m.hookRate : null,
          daysInTesting,
          targetCpaCents: offer.targetCpaCents,
        },
        rule,
      )
      stats.evaluated++
      await prisma.winnerEvaluation.create({
        data: {
          assetId: asset.id,
          previous: asset.performanceStatus,
          result: result.status,
          reason: result.reason,
          metrics: { ...m, daysInTesting, targetCpaCents: offer.targetCpaCents, rule: { ...rule } },
        },
      })
      if (result.status === asset.performanceStatus) continue
      stats.changed++
      await prisma.asset.update({ where: { id: asset.id }, data: { performanceStatus: result.status } })
      const label = PERFORMANCE_STATUS[result.status].label
      const href = `/assets/${asset.code}`
      await notify(prisma, managers, { type: "performance.change", title: `${asset.code}: ${label}`, body: result.reason, href })
      // El editor ve la etiqueta, nunca las cifras.
      await notify(prisma, [asset.editorId], { type: "performance.change", title: `Tu creativo ${asset.code}: ${label}`, href })
    }

    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats } })
    return stats
  } catch (e) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), stats, error: (e as Error).message },
    })
    throw e
  }
}
