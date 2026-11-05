"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assert, run, UserError } from "@/lib/action"
import { conceptCode } from "@/lib/codes"
import { nextCounter } from "@/lib/counters"
import { audit, notify } from "@/lib/events"
import { can } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { actor } from "@/lib/session"
import { GROUP_COLORS } from "@/lib/status"
import { launchedAssetWhere } from "./queries"

// El concepto no lleva oferta: la oferta (producto, GEO, idioma) va en cada creativo.
const conceptSchema = z.object({
  title: z.string().trim().min(2, "Pon un título."),
  hypothesis: z.string().trim().min(10, "La hipótesis es obligatoria (una frase)."),
  references: z.array(z.string().trim().url("Referencia no válida.")).default([]),
  /** dimensionId → valueId */
  tags: z.record(z.string(), z.string()),
})

export type ConceptInput = z.input<typeof conceptSchema>

/**
 * Las etiquetas son opcionales al crear: se rellenan después, desde el concepto.
 * Devuelve las que vienen con valor (`set`) y las que quedan vacías (`clear`).
 */
async function validateTags(tags: Record<string, string>) {
  const dims = await prisma.tagDimension.findMany({ include: { values: true } })
  const set: { dimensionId: string; valueId: string }[] = []
  const clear: string[] = []
  for (const d of dims) {
    const valueId = tags[d.id]
    if (!valueId) {
      clear.push(d.id)
      continue
    }
    const v = d.values.find((x) => x.id === valueId)
    if (!v || !v.active) throw new UserError(`Valor no válido para "${d.label}".`)
    set.push({ dimensionId: d.id, valueId })
  }
  return { set, clear }
}

/** F-201 · Crear concept. */
export async function createConcept(input: ConceptInput) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "concept.create"), "No tienes permiso para crear conceptos.")
    const data = conceptSchema.parse(input)
    const tags = await validateTags(data.tags)
    const concept = await prisma.$transaction(async (tx) => {
      const n = await nextCounter(tx, "concept")
      return tx.concept.create({
        data: {
          number: n,
          code: conceptCode(n),
          title: data.title,
          hypothesis: data.hypothesis,
          references: data.references,
          color: GROUP_COLORS[(n - 1) % GROUP_COLORS.length],
          createdById: me.id,
          tags: { create: tags.set },
        },
      })
    })
    revalidatePath("/boards")
    return { id: concept.id, code: concept.code }
  })
}

/** Editar título, hipótesis, referencias y tags por defecto. La oferta se cambia en cada creativo. */
export async function updateConcept(conceptId: string, input: Partial<ConceptInput>) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "concept.create"), "No tienes permiso para editar conceptos.")
    const data = conceptSchema.partial().parse(input)
    await prisma.$transaction(async (tx) => {
      await tx.concept.update({
        where: { id: conceptId },
        data: { title: data.title, hypothesis: data.hypothesis, references: data.references },
      })
      if (data.tags) {
        const tags = await validateTags(data.tags)
        for (const t of tags.set)
          await tx.conceptTag.upsert({
            where: { conceptId_dimensionId: { conceptId, dimensionId: t.dimensionId } },
            create: { conceptId, ...t },
            update: { valueId: t.valueId },
          })
        // Una etiqueta que se vacía se borra, no se queda con el valor viejo.
        if (tags.clear.length)
          await tx.conceptTag.deleteMany({ where: { conceptId, dimensionId: { in: tags.clear } } })
      }
    })
    revalidatePath("/boards")
  })
}

const ACTIVE_STATUSES = ["BRIEF", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const

/** Qué pasará al archivar: creativos que se archivan con él y lanzados que se siguen midiendo. */
export async function previewArchiveConcept(conceptId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "concept.create"), "No tienes permiso para archivar conceptos.")
    const [toArchive, launched] = await Promise.all([
      prisma.asset.count({ where: { conceptId, productionStatus: { in: [...ACTIVE_STATUSES] }, NOT: launchedAssetWhere } }),
      prisma.asset.count({ where: { conceptId, ...launchedAssetWhere } }),
    ])
    return { toArchive, launched }
  })
}

/**
 * Archivar concepto: sale del tablero. Sus creativos sin lanzar que siguen activos
 * se archivan con él («Concepto archivado»); los lanzados no se tocan y se siguen midiendo.
 */
export async function archiveConcept(conceptId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "concept.create"), "No tienes permiso para archivar conceptos.")
    const archived = await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.findUniqueOrThrow({ where: { id: conceptId } })
      assert(!concept.archivedAt, "El concepto ya está archivado.")
      const assets = await tx.asset.findMany({
        where: { conceptId, productionStatus: { in: [...ACTIVE_STATUSES] }, NOT: launchedAssetWhere },
        select: { id: true, code: true, productionStatus: true, editorId: true },
      })
      await tx.concept.update({ where: { id: conceptId }, data: { archivedAt: new Date(), archivedById: me.id } })
      for (const a of assets) {
        await tx.asset.update({ where: { id: a.id }, data: { productionStatus: "ARCHIVED", archiveReason: "CONCEPT_ARCHIVED" } })
        await tx.statusEvent.create({
          data: { assetId: a.id, userId: me.id, from: a.productionStatus, to: "ARCHIVED", reason: "Concepto archivado" },
        })
      }
      // Cada editor se entera una vez, con la lista de sus creativos.
      const byEditor = new Map<string, string[]>()
      for (const a of assets) if (a.editorId) byEditor.set(a.editorId, [...(byEditor.get(a.editorId) ?? []), a.code])
      for (const [editorId, codes] of byEditor)
        await notify(tx, [editorId], {
          type: "concept.archived",
          title: `Concepto archivado: ${concept.title}`,
          body: `Se archivan tus creativos ${codes.join(", ")}. No hace falta seguir con ellos.`,
        })
      await audit(tx, {
        userId: me.id,
        action: "concept.archive",
        entity: "concept",
        entityId: conceptId,
        data: { code: concept.code, title: concept.title, archivedAssets: assets.map((a) => a.code) },
      })
      return assets.length
    })
    revalidatePath("/boards")
    revalidatePath("/launch")
    return archived
  })
}

/** Desarchivar: el concepto vuelve al tablero. Sus creativos siguen archivados. */
export async function unarchiveConcept(conceptId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "concept.create"), "No tienes permiso para desarchivar conceptos.")
    await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.update({ where: { id: conceptId }, data: { archivedAt: null, archivedById: null } })
      await audit(tx, { userId: me.id, action: "concept.unarchive", entity: "concept", entityId: conceptId, data: { code: concept.code, title: concept.title } })
    })
    revalidatePath("/boards")
  })
}
