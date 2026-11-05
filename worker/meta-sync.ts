// Job meta-sync (F-801, F-704): Insights de los últimos 7 días a nivel de anuncio.
// Solo se guardan los anuncios cuyo nombre lleva un código de seguimiento (cl-C082A03V2)
// o que ya están vinculados a un creativo. El resto de la cuenta no es de esta app.
import { parseToken } from "@/lib/codes"
import { decrypt } from "@/lib/crypto"
import { notify } from "@/lib/events"
import { getAdInsights, toDaily } from "@/lib/meta-api"
import { firstSpendDate, unassignedAds } from "@/lib/performance"
import { prisma } from "@/lib/prisma"

const DAYS = 7
const ymd = (d: Date) => d.toISOString().slice(0, 10)

async function ownerIds() {
  const rows = await prisma.user.findMany({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } })
  return rows.map((r) => r.id)
}

export async function metaSync() {
  const run = await prisma.syncRun.create({ data: { kind: "meta-sync" } })
  const stats = { accounts: 0, rows: 0, ads: 0, skippedNoCode: 0, newDeployments: 0, unknownTokens: 0, unassigned: 0, errors: [] as string[] }
  try {
    const accounts = await prisma.adAccount.findMany({ where: { enabled: true }, include: { connection: true } })
    const until = new Date()
    const since = new Date(until.getTime() - (DAYS - 1) * 86400_000)
    const touchedAssets = new Set<string>()
    // Anuncios ya vinculados: se siguen leyendo aunque alguien les quite el código del nombre.
    const linked = new Set((await prisma.deployment.findMany({ select: { adId: true } })).map((d) => d.adId))

    for (const acc of accounts) {
      let rows
      try {
        rows = await getAdInsights(decrypt(acc.connection.tokenEncrypted), acc.accountId, ymd(since), ymd(until))
      } catch (e) {
        const msg = `${acc.name}: ${(e as Error).message}`
        stats.errors.push(msg)
        await prisma.metaConnection.update({ where: { id: acc.connectionId }, data: { lastError: msg, lastCheckedAt: new Date() } })
        continue
      }
      stats.accounts++
      const seen = new Set<string>()
      const skipped = new Set<string>()
      for (const row of rows) {
        if (!linked.has(row.ad_id) && !parseToken(row.ad_name)) {
          skipped.add(row.ad_id)
          continue
        }
        stats.rows++
        if (!seen.has(row.ad_id)) {
          seen.add(row.ad_id)
          await prisma.metaAd.upsert({
            where: { adId: row.ad_id },
            create: {
              adId: row.ad_id,
              accountId: acc.accountId,
              name: row.ad_name,
              adsetId: row.adset_id,
              campaignId: row.campaign_id,
            },
            update: { name: row.ad_name, adsetId: row.adset_id, campaignId: row.campaign_id, lastSeenAt: new Date() },
          })
        }
        const daily = toDaily(row)
        const date = new Date(`${row.date_start}T00:00:00Z`)
        await prisma.performanceDaily.upsert({
          where: { adId_date: { adId: row.ad_id, date } },
          create: { adId: row.ad_id, date, ...daily },
          update: daily,
        })
      }
      stats.ads += seen.size
      stats.skippedNoCode += skipped.size

      // Deployments automáticos por token.
      const ads = await prisma.metaAd.findMany({
        where: { adId: { in: [...seen] }, deployment: null },
      })
      for (const ad of ads) {
        const token = parseToken(ad.name)
        if (!token) continue
        const version = await prisma.version.findUnique({ where: { code: token.versionCode } })
        if (!version) {
          stats.unknownTokens++
          continue
        }
        await prisma.deployment.create({
          data: { adId: ad.adId, versionId: version.id, assetId: version.assetId, source: "TOKEN" },
        })
        stats.newDeployments++
        touchedAssets.add(version.assetId)
      }
      await prisma.adAccount.update({ where: { id: acc.id }, data: { lastSyncAt: new Date() } })
      await prisma.metaConnection.update({ where: { id: acc.connectionId }, data: { lastError: null, lastCheckedAt: new Date() } })
    }

    // Assets que emcreativon a gastar → testing.
    const pending = await prisma.asset.findMany({
      where: { performanceStatus: "NOT_LAUNCHED", deployments: { some: {} } },
      select: { id: true },
    })
    for (const a of pending) touchedAssets.add(a.id)
    for (const assetId of touchedAssets) {
      const asset = await prisma.asset.findUnique({ where: { id: assetId } })
      if (!asset || asset.performanceStatus !== "NOT_LAUNCHED") continue
      const start = await firstSpendDate(assetId)
      if (start)
        await prisma.asset.update({
          where: { id: assetId },
          data: { performanceStatus: "TESTING", testingSince: start, relaunchRequestedAt: null },
        })
    }

    // F-1404: alerta si crecen los anuncios con un código que no corresponde a ninguna versión.
    stats.unassigned = (await unassignedAds()).length
    const prev = await prisma.syncRun.findFirst({
      where: { kind: "meta-sync", status: "SUCCESS", id: { not: run.id } },
      orderBy: { startedAt: "desc" },
    })
    const prevUnassigned = Number((prev?.stats as { unassigned?: number } | null)?.unassigned ?? 0)
    if (stats.unassigned > prevUnassigned)
      await notify(prisma, await ownerIds(), {
        type: "sync.unassigned",
        title: `Códigos sin creativo: ${stats.unassigned}`,
        body: `Antes había ${prevUnassigned}. Hay anuncios con un código cl-… que no corresponde a ninguna versión: revisa el nombre.`,
        href: "/unassigned",
      })

    const failed = stats.errors.length > 0 && stats.accounts === 0 && accounts.length > 0
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: failed ? "FAILED" : "SUCCESS", finishedAt: new Date(), stats, error: stats.errors.join("\n") || null },
    })
    if (stats.errors.length)
      await notify(prisma, await ownerIds(), {
        type: "sync.error",
        title: "Error al sincronizar Meta",
        body: stats.errors.join(" · ").slice(0, 300),
        href: "/settings?tab=meta",
      })
    return stats
  } catch (e) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), stats, error: (e as Error).message },
    })
    await notify(prisma, await ownerIds(), {
      type: "sync.error",
      title: "La sincronización de Meta falló",
      body: (e as Error).message.slice(0, 300),
      href: "/settings?tab=meta",
    })
    throw e
  }
}
