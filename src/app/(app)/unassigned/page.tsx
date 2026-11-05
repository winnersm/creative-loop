import { UnassignedTable } from "@/components/unassigned-table"
import { EmptyState, PageHeader } from "@/components/page-header"
import { dateTime } from "@/lib/format"
import { unassignedAds } from "@/lib/performance"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/session"

export const metadata = { title: "Códigos sin creativo · Creative Loop" }

/** F-705 · Anuncios con código cl-… que no corresponde a ninguna versión. El objetivo es que esté en 0. */
export default async function UnassignedPage() {
  await requirePermission("launch.manage")
  const [ads, versions, lastSync, accounts] = await Promise.all([
    unassignedAds(),
    prisma.version.findMany({
      where: { approvedFor: { isNot: null } },
      orderBy: { code: "desc" },
      select: { code: true, asset: { select: { concept: { select: { title: true } } } } },
    }),
    prisma.syncRun.findFirst({ where: { kind: "meta-sync" }, orderBy: { startedAt: "desc" } }),
    prisma.adAccount.findMany({ select: { accountId: true, name: true } }),
  ])
  const accountName = new Map(accounts.map((a) => [a.accountId, a.name]))
  const sync = lastSync
    ? `Última sincronización: ${dateTime(lastSync.startedAt)} · ${lastSync.status === "SUCCESS" ? "correcto" : lastSync.status === "FAILED" ? "con errores" : "en curso"}.`
    : "Todavía no se ha sincronizado Meta."
  return (
    <div>
      <PageHeader
        title="Códigos sin creativo"
        description={`${sync} Solo se traen de Meta los anuncios con código cl-… en el nombre y se vinculan solos. Aquí quedan los que llevan un código que no corresponde a ninguna versión (mal escrito o de una versión que no existe).`}
      />
      <div className="p-6">
        {ads.length ? (
          <UnassignedTable
            ads={ads.map((a) => ({
              adId: a.adId,
              name: a.name,
              account: accountName.get(a.accountId) ?? a.accountId,
              code: a.code!,
              campaignId: a.campaignId,
              spendCents: a.spendCents,
              impressions: a.impressions,
              lastSeenAt: a.lastSeenAt.toISOString(),
            }))}
            versions={versions.map((v) => ({ code: v.code, title: v.asset.concept.title }))}
          />
        ) : (
          <EmptyState>Todo vinculado: cada anuncio con código está enlazado a su creativo. ✅</EmptyState>
        )}
      </div>
    </div>
  )
}
