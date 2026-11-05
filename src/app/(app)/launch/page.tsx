import { type LaunchGroup, LaunchList } from "@/components/launch-list"
import { EmptyState, PageHeader } from "@/components/page-header"
import { can } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/session"
import { rootOf } from "@/lib/variations"
import { buildLaunchData } from "@/server/launch"

export const metadata = { title: "Lanzamiento · Creative Loop" }

/** F-706 · Aprobados sin lanzar + paquete de lanzamiento. */
export default async function LaunchPage() {
  const user = await requirePermission("launch.manage")
  const assets = await prisma.asset.findMany({
    where: {
      productionStatus: "APPROVED",
      approvedVersionId: { not: null },
      OR: [{ deployments: { none: {} } }, { relaunchRequestedAt: { not: null } }],
    },
    orderBy: { approvedAt: "asc" },
    include: {
      approvedVersion: { select: { id: true, code: true, thumbKey: true } },
      offer: { select: { code: true, name: true, product: true, geo: true } },
      concept: { include: { tags: { include: { value: true, dimension: true } } } },
      overrideDimension: true,
      overrideValue: true,
    },
  })

  // Linaje completo de esos conceptos: una variación cuelga de su original aunque este no esté aprobado.
  const lineage = await prisma.asset.findMany({
    where: { conceptId: { in: [...new Set(assets.map((a) => a.conceptId))] } },
    select: { id: true, code: true, iteratedFromId: true },
  })
  const parentOf = new Map(lineage.map((l) => [l.id, l.iteratedFromId]))
  const codeOf = new Map(lineage.map((l) => [l.id, l.code]))

  const groups = new Map<string, LaunchGroup>()
  for (const a of [...assets].sort((x, y) => x.number - y.number)) {
    const angleTag =
      a.overrideDimension?.key === "angle" && a.overrideValue
        ? a.overrideValue.value
        : (a.concept.tags.find((t) => t.dimension.key === "angle")?.value.value ?? "creative")
    const rootId = rootOf(a.id, parentOf)
    const g = groups.get(a.conceptId) ?? {
      id: a.conceptId,
      code: a.concept.code,
      title: a.concept.title,
      color: a.concept.color,
      offer: "",
      items: [],
    }
    g.items.push({
      id: a.id,
      code: a.code,
      format: a.format,
      offer: a.offer ? { code: a.offer.code, name: a.offer.name } : null,
      rootId,
      rootCode: codeOf.get(rootId) ?? a.code,
      parentCode: a.iteratedFromId && a.iteratedFromId !== rootId ? (codeOf.get(a.iteratedFromId) ?? null) : null,
      thumbVersionId: a.approvedVersion?.thumbKey ? a.approvedVersion.id : null,
      approvedAt: a.approvedAt?.toISOString() ?? null,
      markedLaunchedAt: a.markedLaunchedAt?.toISOString() ?? null,
      relaunch: !!a.relaunchRequestedAt,
      data: buildLaunchData({ asset: a, version: a.approvedVersion!, angle: angleTag }),
    })
    // La oferta va en cada creativo: el grupo enseña las de sus creativos.
    const label = a.offer ? `${a.offer.code} · ${a.offer.name}` : "Sin oferta"
    if (!g.offer.split(", ").includes(label)) g.offer = g.offer ? `${g.offer}, ${label}` : label
    groups.set(a.conceptId, g)
  }
  const canCreate = can(user, "asset.create")
  // Primero el concepto que lleva más tiempo esperando.
  const ordered = [...groups.values()].sort((x, y) => oldest(x).localeCompare(oldest(y)))

  return (
    <div>
      <PageHeader
        title="Aprobados sin lanzar"
        description="Lanza a mano en Meta con el nombre de anuncio del paquete. La sincronización crea el vínculo sola."
      />
      <div className="p-6">
        {!assets.length ? (
          <EmptyState>Todo lo aprobado ya está lanzado.</EmptyState>
        ) : (
          <LaunchList groups={ordered} canArchive={canCreate} />
        )}
      </div>
    </div>
  )
}

const oldest = (g: LaunchGroup) => g.items.map((i) => i.approvedAt ?? "9").sort()[0] ?? "9"
