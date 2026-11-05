import { Film, Image as ImageIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PerformancePill, Pill, ProductionPill } from "@/components/board/cells"
import { EmptyState, Kpi, PageHeader } from "@/components/page-header"
import type { ProductionStatus } from "@/generated/prisma/enums"
import { isOverdue, shortDate, timeAgo } from "@/lib/format"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { FORMAT, PRIORITY, PRODUCTION_STATUS } from "@/lib/status"

export const metadata = { title: "Mis tareas · Creative Loop" }

const GROUPS: ProductionStatus[] = ["CHANGES_REQUESTED", "IN_PROGRESS", "BRIEF", "IN_REVIEW", "APPROVED"]
const PRIO = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

/** F-306 / F-1202 · My Tasks y home del editor. */
export default async function TasksPage() {
  const user = await requireUser()
  if (user.role !== "EDITOR" && user.role !== "MANAGER" && user.role !== "OWNER") redirect("/")

  const assets = await prisma.asset.findMany({
    where: { editorId: user.id, productionStatus: { in: GROUPS } },
    include: {
      concept: { select: { code: true, title: true, color: true } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { id: true, thumbKey: true, number: true } },
    },
  })
  assets.sort(
    (a, b) =>
      (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || PRIO[a.priority] - PRIO[b.priority],
  )
  const results = await prisma.asset.findMany({
    where: { editorId: user.id, performanceStatus: { in: ["WINNER", "LOSER", "INCONCLUSIVE", "TESTING"] } },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { code: true, performanceStatus: true, updatedAt: true, concept: { select: { title: true } } },
  })

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const dueToday = assets.filter((a) => a.deadline && a.deadline <= today && a.productionStatus !== "IN_REVIEW" && a.productionStatus !== "APPROVED")
  const overdue = assets.filter((a) => isOverdue(a.deadline, a.productionStatus) && a.productionStatus !== "IN_REVIEW")
  const changes = assets.filter((a) => a.productionStatus === "CHANGES_REQUESTED")

  return (
    <div>
      <PageHeader title="Mis tareas" description="Ordenadas por fecha límite y prioridad" />
      <div className="space-y-8 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Para hoy" value={dueToday.length} />
          <Kpi label="Atrasadas" value={overdue.length} tone={overdue.length ? "danger" : undefined} />
          <Kpi label="Cambios pedidos" value={changes.length} tone={changes.length ? "warning" : undefined} />
          <Kpi label="En revisión" value={assets.filter((a) => a.productionStatus === "IN_REVIEW").length} />
        </div>

        {!assets.length && <EmptyState>No tienes tareas asignadas.</EmptyState>}
        {GROUPS.map((status) => {
          const list = assets.filter((a) => a.productionStatus === status)
          if (!list.length) return null
          const s = PRODUCTION_STATUS[status]
          return (
            <section key={status}>
              <h2 className="mb-2 text-base font-semibold" style={{ color: s.color }}>
                {s.label} <span className="font-normal text-muted-foreground">({list.length})</span>
              </h2>
              <div className="overflow-hidden rounded-lg border">
                {list.map((a) => {
                  const late = isOverdue(a.deadline, a.productionStatus)
                  const Icon = a.mediaType === "VIDEO" ? Film : ImageIcon
                  return (
                    <Link
                      key={a.id}
                      href={`/assets/${a.code}`}
                      className="flex items-center gap-3 border-b border-l-[5px] bg-card px-3 py-2.5 text-sm last:border-b-0 hover:bg-row-hover"
                      style={{ borderLeftColor: a.concept.color }}
                    >
                      {a.versions[0]?.thumbKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/versions/${a.versions[0].id}/thumb`} alt="" className="h-10 w-7 rounded-sm object-cover" />
                      ) : (
                        <Icon className="size-5 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.code}</span>
                          <span className="rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[a.format].label}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.concept.title} · {a.brief || "sin indicaciones"}
                        </div>
                      </div>
                      <Pill label={PRIORITY[a.priority].label} color={PRIORITY[a.priority].color} className="w-16 justify-center" />
                      <ProductionPill status={a.productionStatus} className="w-32 justify-center" />
                      <span className={`w-24 text-right text-xs ${late ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                        {a.deadline ? shortDate(a.deadline) : "sin fecha"}
                        {late ? " · atrasada" : ""}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        })}

        <section>
          <h2 className="mb-2 text-base font-semibold">Mis últimos resultados</h2>
          {results.length ? (
            <div className="flex flex-wrap gap-2">
              {results.map((r) => (
                <Link key={r.code} href={`/assets/${r.code}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-row-hover">
                  <span className="font-medium">{r.code}</span>
                  <PerformancePill status={r.performanceStatus} className="h-5 text-[11px]" />
                  <span className="text-xs text-muted-foreground">{timeAgo(r.updatedAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>Aún no hay resultados de tus creativos.</EmptyState>
          )}
        </section>
      </div>
    </div>
  )
}
