import { RotateCcw, Rocket } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PerformancePill } from "@/components/board/cells"
import { RelaunchButton } from "@/components/relaunch-button"
import { EmptyState, Kpi, PageHeader } from "@/components/page-header"
import { ReviewList } from "@/components/review-list"
import { Button } from "@/components/ui/button"
import { can } from "@/lib/permissions"
import { unassignedAds } from "@/lib/performance"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { APP_TZ, timeAgo } from "@/lib/format"
import { getReviewQueue } from "@/server/review-queue"

export const metadata = { title: "Inicio · Creative Loop" }

/** F-1201 · Home del manager. */
export default async function HomePage() {
  const user = await requireUser()
  if (user.role === "EDITOR") redirect("/tasks")
  if (user.role === "BUYER") redirect("/launch")

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 86400_000)
  const [review, overdue, editing, approvedNotLaunched, unassigned, news] = await Promise.all([
    getReviewQueue(),
    prisma.asset.count({
      where: { deadline: { lt: now }, productionStatus: { in: ["BRIEF", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED"] } },
    }),
    prisma.asset.count({ where: { productionStatus: { in: ["IN_PROGRESS", "CHANGES_REQUESTED"] } } }),
    prisma.asset.count({
      where: { productionStatus: "APPROVED", OR: [{ deployments: { none: {} } }, { relaunchRequestedAt: { not: null } }] },
    }),
    unassignedAds().then((a) => a.length),
    prisma.winnerEvaluation.findMany({
      where: { createdAt: { gte: dayAgo }, result: { in: ["WINNER", "LOSER", "INCONCLUSIVE"] } },
      orderBy: { createdAt: "desc" },
      include: { asset: { select: { id: true, code: true, performanceStatus: true, concept: { select: { title: true } } } } },
    }),
  ])
  // Solo cambios reales (no re-evaluaciones con el mismo resultado).
  const changes = news.filter((n) => n.previous !== n.result)

  return (
    <div>
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        description={new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeZone: APP_TZ }).format(now)}
      />
      <div className="space-y-8 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Por revisar" value={review.length} href="/review" />
          <Kpi label="Atrasados" value={overdue} href="/boards" tone={overdue ? "danger" : undefined} />
          <Kpi label="En edición" value={editing} href="/boards?status=IN_PROGRESS" />
          <Kpi label="Aprobados sin lanzar" value={approvedNotLaunched} href="/launch" tone={approvedNotLaunched ? "warning" : undefined} />
          <Kpi label="Códigos sin creativo" value={unassigned} href="/unassigned" tone={unassigned ? "danger" : undefined} />
        </div>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Novedades de rendimiento (24 h)</h2>
          {changes.length ? (
            <div className="overflow-hidden rounded-lg border">
              {changes.map((n) => (
                <div key={n.id} className="flex items-center gap-3 border-b bg-card px-3 py-2 text-sm last:border-0">
                  <PerformancePill status={n.result} className="w-32 justify-center" />
                  <Link href={`/assets/${n.asset.code}`} className="font-medium hover:underline">
                    {n.asset.code}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {n.asset.concept.title} · {n.reason}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  {n.result === "WINNER" && can(user, "asset.create") && (
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/assets/${n.asset.code}`} />}>
                      <Rocket /> Iterar
                    </Button>
                  )}
                  {n.result === "INCONCLUSIVE" && n.asset.performanceStatus === "INCONCLUSIVE" && (
                    <RelaunchButton assetId={n.asset.id}>
                      <RotateCcw /> Relanzar
                    </RelaunchButton>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Sin cambios de estado en las últimas 24 h.</EmptyState>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cola de revisión</h2>
            <Link href="/review" className="text-sm text-primary hover:underline">
              Ver todo
            </Link>
          </div>
          {review.length ? <ReviewList items={review.slice(0, 6)} /> : <EmptyState>No hay nada por revisar.</EmptyState>}
        </section>
      </div>
    </div>
  )
}
