import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import type { ProductionStatus } from "@/generated/prisma/enums"
import { assetVisibilityWhere, can, canViewAsset } from "@/lib/permissions"
import { metricsByAsset } from "@/lib/performance"
import { prisma } from "@/lib/prisma"
import { effectiveTags, rankSimilar } from "@/lib/similar"
import { rootOf, variationSummary } from "@/lib/variations"
import type { CurrentUser } from "@/lib/session"

export type BoardFilters = {
  offerId?: string
  editorId?: string
  status?: ProductionStatus
  q?: string
  showArchived?: boolean
}

export async function getLookups() {
  const [offers, editors, dimensions, labels, concepts] = await Promise.all([
    // Solo campos públicos: estas listas llegan al navegador de cualquier rol (sin CPA objetivo ni payout).
    prisma.offer.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: { id: true, code: true, name: true, gate: true, geo: true, language: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["EDITOR", "MANAGER", "OWNER"] }, status: "ACTIVE" },
      orderBy: [{ role: "desc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.tagDimension.findMany({
      orderBy: { sortOrder: "asc" },
      include: { values: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.assetLabel.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } }),
    // Destinos de «Mover a otro concepto»: todos los activos, no solo los que pasan el filtro.
    prisma.concept.findMany({ where: { archivedAt: null }, orderBy: { number: "desc" }, select: { id: true, code: true, title: true, color: true } }),
  ])
  return { offers, editors, dimensions, labels, concepts }
}

export type Lookups = Awaited<ReturnType<typeof getLookups>>

const assetInclude = {
  editor: { select: { id: true, name: true } },
  offer: { select: { id: true, code: true, name: true, gate: true } },
  labels: { select: { id: true, name: true, color: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
  overrideDimension: { select: { id: true, key: true, label: true } },
  overrideValue: { select: { id: true, label: true, value: true } },
  versions: {
    orderBy: { number: "desc" },
    take: 1,
    select: {
      id: true,
      number: true,
      status: true,
      thumbKey: true,
      submittedAt: true,
      _count: { select: { comments: { where: { resolved: false } } } },
    },
  },
  _count: { select: { deployments: true } },
} satisfies Prisma.AssetInclude

/**
 * Creativo ya lanzado en Meta: marcado a mano, con anuncio detectado o ya
 * juzgado por el motor. Uno así no cambia de oferta ni de concepto.
 */
export const launchedAssetWhere = {
  OR: [{ markedLaunchedAt: { not: null } }, { deployments: { some: {} } }, { performanceStatus: { not: "NOT_LAUNCHED" } }],
} satisfies Prisma.AssetWhereInput

export async function getBoard(user: CurrentUser, f: BoardFilters) {
  const visible = assetVisibilityWhere(user)
  const assetWhere: Prisma.AssetWhereInput = {
    ...visible,
    ...(f.editorId ? { editorId: f.editorId } : {}),
    ...(f.offerId ? { offerId: f.offerId } : {}),
    ...(f.status ? { productionStatus: f.status } : f.showArchived ? {} : { productionStatus: { not: "ARCHIVED" } }),
    ...(f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { brief: { contains: f.q, mode: "insensitive" } }] } : {}),
  }
  const conceptWhere: Prisma.ConceptWhereInput = {
    // Conceptos archivados solo con «Archivados».
    ...(f.showArchived ? {} : { archivedAt: null }),
  }
  const isManager = can(user, "asset.viewAll")
  // Editor/buyer: solo concepts con algún asset visible. Manager: también los vacíos (para añadir assets).
  if (!isManager || f.offerId || f.editorId || f.status || f.q) {
    const qConcept = f.q
      ? [{ code: { contains: f.q, mode: "insensitive" as const } }, { title: { contains: f.q, mode: "insensitive" as const } }]
      : []
    conceptWhere.OR = [{ assets: { some: assetWhere } }, ...(isManager ? qConcept : [])]
  }

  const concepts = await prisma.concept.findMany({
    where: conceptWhere,
    orderBy: { number: "desc" },
    include: {
      tags: { include: { value: true, dimension: true } },
      assets: { where: assetWhere, orderBy: { number: "asc" }, include: assetInclude },
    },
  })

  // Variaciones: el linaje se lee sin filtros para saber de qué original cuelga cada creativo.
  const lineage = await prisma.asset.findMany({
    where: { conceptId: { in: concepts.map((c) => c.id) } },
    select: { id: true, code: true, iteratedFromId: true, performanceStatus: true, productionStatus: true },
  })
  const parentOf = new Map(lineage.map((l) => [l.id, l.iteratedFromId]))
  const codeOf = new Map(lineage.map((l) => [l.id, l.code]))
  const summary = variationSummary(
    lineage.map((l) => ({ id: l.id, parentId: l.iteratedFromId, performanceStatus: l.performanceStatus, productionStatus: l.productionStatus })),
  )

  // Manager: si un filtro deja fuera al original de una variación visible, se trae como contexto (atenuado).
  const visibleIds = new Set(concepts.flatMap((c) => c.assets.map((a) => a.id)))
  const missingRoots = isManager
    ? [...new Set(concepts.flatMap((c) => c.assets.map((a) => rootOf(a.id, parentOf))))].filter((id) => !visibleIds.has(id))
    : []
  const contextRoots = missingRoots.length
    ? await prisma.asset.findMany({ where: { id: { in: missingRoots } }, include: assetInclude })
    : []

  const moneyVisible = can(user, "money.view")
  const metrics = moneyVisible
    ? await metricsByAsset([...visibleIds, ...contextRoots.map((a) => a.id)])
    : new Map()

  type Row = (typeof concepts)[number]["assets"][number]
  const toRow = (a: Row, context: boolean) => {
    const v = a.versions[0]
    const m = metrics.get(a.id)
    const rootId = rootOf(a.id, parentOf)
    return {
      id: a.id,
      code: a.code,
      format: a.format,
      mediaType: a.mediaType,
      priority: a.priority,
      deadline: a.deadline?.toISOString() ?? null,
      productionStatus: a.productionStatus,
      archiveReason: a.archiveReason,
      performanceStatus: a.performanceStatus,
      editor: a.editor,
      offer: a.offer,
      labels: a.labels,
      notes: a.notes,
      brief: a.brief,
      override: a.overrideValue && a.overrideDimension
        ? { valueId: a.overrideValue.id, label: a.overrideValue.label, dimension: a.overrideDimension.label }
        : null,
      latestVersion: v
        ? { id: v.id, number: v.number, status: v.status, hasThumb: !!v.thumbKey, openComments: v._count.comments, submitted: !!v.submittedAt }
        : null,
      deployments: a._count.deployments,
      metrics: m ? { spendCents: m.spendCents, cpaCents: m.cpaCents, hookRate: m.hookRate, conversions: m.conversions } : null,
      /** Original del que cuelga (él mismo si no es variación). */
      rootId,
      rootCode: codeOf.get(rootId) ?? a.code,
      /** Padre directo, solo si no es el original («de A07»). */
      parentCode: a.iteratedFromId && a.iteratedFromId !== rootId ? (codeOf.get(a.iteratedFromId) ?? null) : null,
      variations: summary.get(a.id) ?? null,
      /** Fila de contexto: no cumple el filtro, se muestra atenuada encima de sus variaciones. */
      context,
    }
  }

  return concepts.map((c) => {
    const ctxRows = contextRoots.filter((r) => r.conceptId === c.id).map((r) => toRow(r, true))
    const rows = [...c.assets.map((a) => toRow(a, false)), ...ctxRows]
    rows.sort((x, y) => (codeOf.get(x.id) ?? "").localeCompare(codeOf.get(y.id) ?? "", "es", { numeric: true }))
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      hypothesis: c.hypothesis,
      references: c.references,
      archivedAt: c.archivedAt?.toISOString() ?? null,
      color: c.color,
      /** Ofertas de sus creativos (sin repetir), para la cabecera del grupo. */
      offers: distinctOffers(rows.filter((r) => !r.context).map((r) => r.offer)),
      tags: c.tags
        .sort((a, b) => a.dimension.sortOrder - b.dimension.sortOrder)
        .map((t) => ({
          dimensionId: t.dimensionId,
          valueId: t.valueId,
          dimension: t.dimension.label,
          dimensionKey: t.dimension.key,
          label: t.value.label,
          value: t.value.value,
        })),
      assets: rows,
    }
  })
}

function distinctOffers<T extends { id: string; code: string } | null>(offers: T[]) {
  const seen = new Map<string, NonNullable<T>>()
  for (const o of offers) if (o && !seen.has(o.id)) seen.set(o.id, o)
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export type BoardConcept = Awaited<ReturnType<typeof getBoard>>[number]
export type BoardAsset = BoardConcept["assets"][number]

/** Detalle de un asset con permisos aplicados. null = no existe o no visible. */
export async function getAssetDetail(user: CurrentUser, code: string) {
  const asset = await prisma.asset.findUnique({
    where: { code },
    include: {
      editor: { select: { id: true, name: true } },
      offer: true,
      labels: { select: { id: true, name: true, color: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      concept: {
        include: {
          tags: { include: { value: true, dimension: true } },
        },
      },
      overrideDimension: true,
      overrideValue: true,
      iteratedFrom: { select: { code: true } },
      iterations: { select: { code: true, productionStatus: true } },
      approvedVersion: { select: { id: true, code: true, number: true } },
      versions: {
        orderBy: { number: "desc" },
        include: {
          uploadedBy: { select: { name: true } },
          qaChecks: { orderBy: [{ severity: "asc" }, { key: "asc" }] },
          comments: {
            orderBy: [{ timeMs: "asc" }, { createdAt: "asc" }],
            include: {
              author: { select: { id: true, name: true } },
              replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      statusEvents: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      deployments: { include: { ad: true, version: { select: { code: true } } } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })
  if (!asset || !canViewAsset(user, asset)) return null
  const moneyVisible = can(user, "money.view")
  const metrics = moneyVisible ? (await metricsByAsset([asset.id])).get(asset.id) ?? null : null

  const tags = asset.concept.tags
    .sort((a, b) => a.dimension.sortOrder - b.dimension.sortOrder)
    .map((t) => {
      const overridden = asset.overrideDimensionId === t.dimensionId && asset.overrideValue
      return {
        dimension: t.dimension.label,
        key: t.dimension.key,
        label: overridden ? asset.overrideValue!.label : t.value.label,
        value: overridden ? asset.overrideValue!.value : t.value.value,
        overridden: !!overridden,
      }
    })

  const similar = await getSimilar(user, asset, moneyVisible)

  return {
    asset: {
      ...asset,
      // Sin permiso de dinero no salen el CPA objetivo ni el payout.
      offer: asset.offer ? redactOffer(asset.offer, moneyVisible) : null,
      // El análisis de IA menciona métricas: solo para quien ve dinero.
      aiAnalysis: moneyVisible ? asset.aiAnalysis : null,
      // Sin permiso de dinero: ni deployments ni evaluaciones (sus motivos llevan cifras).
      deployments: moneyVisible ? asset.deployments : [],
      evaluations: moneyVisible
        ? asset.evaluations.map((e) => ({ id: e.id, result: e.result, previous: e.previous, reason: e.reason, createdAt: e.createdAt }))
        : [],
      versions: asset.versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })),
    },
    tags,
    metrics,
    moneyVisible,
    similar,
  }
}

/**
 * Similares (ya juzgados, misma oferta, etiquetas en común). Quien no puede abrir
 * un creativo lo ve sin enlace ni miniatura; el CPA solo con permiso de dinero.
 */
async function getSimilar(
  user: CurrentUser,
  asset: {
    id: string
    format: string
    overrideDimensionId: string | null
    overrideValueId: string | null
    offerId: string | null
    concept: { tags: { dimensionId: string; valueId: string; dimension: { label: string; sortOrder: number }; value: { label: string } }[] }
    overrideDimension?: { label: string } | null
    overrideValue?: { label: string } | null
  },
  moneyVisible: boolean,
) {
  const override =
    asset.overrideDimensionId && asset.overrideValueId ? { dimensionId: asset.overrideDimensionId, valueId: asset.overrideValueId } : null
  // Sin oferta no hay con qué comparar: los similares son de la misma oferta.
  if (!asset.offerId) return []
  const target = { tags: effectiveTags(asset.concept.tags, override), format: asset.format }
  // Etiqueta legible de cada dimensión del creativo («Ángulo: Miedo»).
  const labelOf = new Map(asset.concept.tags.map((t) => [t.dimensionId, `${t.dimension.label}: ${t.value.label}`]))
  if (override && asset.overrideDimension && asset.overrideValue)
    labelOf.set(override.dimensionId, `${asset.overrideDimension.label}: ${asset.overrideValue.label}`)

  const candidates = await prisma.asset.findMany({
    where: {
      id: { not: asset.id },
      offerId: asset.offerId,
      performanceStatus: { in: ["WINNER", "LOSER", "INCONCLUSIVE"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      code: true,
      format: true,
      editorId: true,
      productionStatus: true,
      performanceStatus: true,
      overrideDimensionId: true,
      overrideValueId: true,
      approvedVersion: { select: { id: true, thumbKey: true } },
      concept: { select: { title: true, tags: { select: { dimensionId: true, valueId: true } } } },
    },
  })
  const ranked = rankSimilar(
    target,
    candidates.map((c) => ({
      item: c,
      tags: effectiveTags(
        c.concept.tags,
        c.overrideDimensionId && c.overrideValueId ? { dimensionId: c.overrideDimensionId, valueId: c.overrideValueId } : null,
      ),
      format: c.format,
      verdict: c.performanceStatus,
    })),
  )
  const metrics = moneyVisible ? await metricsByAsset(ranked.map((r) => r.item.id)) : new Map()
  return ranked.map(({ item: c, shared, sameFormat }) => {
    const visible = canViewAsset(user, c)
    return {
      id: c.id,
      code: c.code,
      conceptTitle: c.concept.title,
      format: c.format,
      performanceStatus: c.performanceStatus,
      shared: shared.map((d) => labelOf.get(d) ?? d),
      sameFormat,
      link: visible,
      thumbVersionId: visible && c.approvedVersion?.thumbKey ? c.approvedVersion.id : null,
      cpaCents: moneyVisible ? (metrics.get(c.id)?.cpaCents ?? null) : null,
    }
  })
}

function redactOffer<T extends { targetCpaCents: number; payoutCents: number }>(offer: T, moneyVisible: boolean) {
  const { targetCpaCents, payoutCents, ...rest } = offer
  return moneyVisible ? { ...rest, targetCpaCents, payoutCents } : { ...rest, targetCpaCents: null, payoutCents: null }
}

export type AssetDetail = NonNullable<Awaited<ReturnType<typeof getAssetDetail>>>
