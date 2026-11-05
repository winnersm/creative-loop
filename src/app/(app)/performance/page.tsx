import { PerformanceTable, type PerfRow } from "@/components/performance-table"
import { SyncStatus } from "@/components/sync-status"
import { PageHeader } from "@/components/page-header"
import type { PerformanceStatus } from "@/generated/prisma/enums"
import { can } from "@/lib/permissions"
import { metricsByAsset } from "@/lib/performance"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/session"
import { PERFORMANCE_STATUS } from "@/lib/status"
import { getLookups } from "@/server/queries"

export const metadata = { title: "Rendimiento · Creative Loop" }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const parseDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined)

/** F-804 · Vista Performance. */
export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const user = await requirePermission("money.view")
  const sp = await searchParams
  const status = one(sp.status) as PerformanceStatus | undefined
  const filters = {
    offer: one(sp.offer) ?? "",
    editor: one(sp.editor) ?? "",
    status: status && status in PERFORMANCE_STATUS ? status : "",
    tag: one(sp.tag) ?? "",
    from: one(sp.from) ?? "",
    to: one(sp.to) ?? "",
  }

  const [lookups, runs] = await Promise.all([
    getLookups(),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 6 }),
  ])
  const assets = await prisma.asset.findMany({
    where: {
      deployments: { some: {} },
      ...(filters.editor ? { editorId: filters.editor } : {}),
      ...(filters.status ? { performanceStatus: filters.status as PerformanceStatus } : {}),
      ...(filters.offer ? { offerId: filters.offer } : {}),
      ...(filters.tag ? { concept: { tags: { some: { valueId: filters.tag } } } } : {}),
    },
    include: {
      editor: { select: { name: true } },
      concept: { select: { code: true, title: true } },
      offer: { select: { code: true, targetCpaCents: true } },
      overrideValue: { select: { label: true } },
      overrideDimension: { select: { label: true } },
    },
  })
  const metrics = await metricsByAsset(
    assets.map((a) => a.id),
    { from: parseDate(filters.from), to: parseDate(filters.to) },
  )
  const rows: PerfRow[] = assets.map((a) => {
    const m = metrics.get(a.id)
    return {
      code: a.code,
      concept: a.concept.title,
      offer: a.offer?.code ?? "—",
      editor: a.editor?.name ?? "—",
      variable: a.overrideValue ? `${a.overrideDimension?.label}: ${a.overrideValue.label}` : "—",
      status: a.performanceStatus,
      targetCpaCents: a.offer?.targetCpaCents ?? null,
      spendCents: m?.spendCents ?? 0,
      conversions: m?.conversions ?? 0,
      cpaCents: m?.cpaCents ?? null,
      revenueCents: m?.revenueCents ?? 0,
      roas: m?.roas ?? null,
      hookRate: m?.hookRate ?? null,
      holdRate: m?.holdRate ?? null,
      ctr: m?.ctr ?? null,
      impressions: m?.impressions ?? 0,
    }
  })

  return (
    <div>
      <PageHeader title="Rendimiento" description="Métricas de Meta unidas por creativo (solo lectura)">
        <SyncStatus
          runs={runs.map((r) => ({
            id: r.id,
            kind: r.kind,
            status: r.status,
            startedAt: r.startedAt.toISOString(),
            error: r.error,
            stats: r.stats as Record<string, unknown>,
          }))}
          canForce={can(user, "sync.force")}
        />
      </PageHeader>
      <div className="p-6">
        <PerformanceTable
          rows={rows}
          filters={filters}
          offers={lookups.offers.map((o) => ({ id: o.id, label: `${o.code} · ${o.name}` }))}
          editors={lookups.editors.filter((e) => e.role === "EDITOR").map((e) => ({ id: e.id, label: e.name }))}
          tags={lookups.dimensions.flatMap((d) => d.values.map((v) => ({ id: v.id, label: `${d.label}: ${v.label}` })))}
        />
      </div>
    </div>
  )
}
