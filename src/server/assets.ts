"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { ArchiveReason, ProductionStatus } from "@/generated/prisma/enums"
import { assert, run, UserError } from "@/lib/action"
import { assetCode, versionCode } from "@/lib/codes"
import { audit, notify, reviewerIds } from "@/lib/events"
import { assignedBody } from "@/lib/messages"
import { can, canViewAsset } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { actor } from "@/lib/session"
import { checkTransition } from "@/lib/state-machine"
import { recheckLatestVersion } from "@/lib/qa-recheck"
import { ARCHIVE_REASON, ARCHIVE_REASON_CHOICES, FORMAT, PRODUCTION_STATUS } from "@/lib/status"
import { planMove } from "@/lib/variations"
import { launchedAssetWhere } from "./queries"

const FORMAT_ENUM = z.enum(["VERTICAL", "PORTRAIT", "SQUARE", "LANDSCAPE"])
const MEDIA = z.enum(["VIDEO", "IMAGE"])
const PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH"])

const rowSchema = z.object({
  format: FORMAT_ENUM,
  mediaType: MEDIA,
  editorId: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  priority: PRIORITY.default("MEDIUM"),
  brief: z.string().default(""),
  script: z.string().max(20000).default(""),
  references: z.array(z.string().trim().url("Referencia no válida.")).max(50).default([]),
  overrideValueId: z.string().nullable().optional(),
  offerId: z.string().nullable().optional(),
})

export type NewAssetRow = z.input<typeof rowSchema>

/** Oferta activa o null. Al crear o cambiar, solo se aceptan ofertas activas. */
async function resolveOffer(offerId: string | null | undefined) {
  if (!offerId) return null
  const o = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true, code: true, name: true, active: true } })
  if (!o || !o.active) throw new UserError("Oferta no válida.")
  return o
}

async function resolveOverride(valueId: string | null | undefined) {
  if (!valueId) return { overrideDimensionId: null, overrideValueId: null }
  const v = await prisma.tagValue.findUnique({ where: { id: valueId } })
  if (!v || !v.active) throw new UserError("Etiqueta no válida.")
  return { overrideDimensionId: v.dimensionId, overrideValueId: v.id }
}

/**
 * F-301 · Alta masiva de assets en un concept.
 * Con `variationOf`, todas las filas quedan colgadas de ese creativo (variaciones).
 */
export async function createAssets(conceptId: string, rows: NewAssetRow[], opts: { variationOf?: string } = {}) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para crear creativos.")
    const parsed = z.array(rowSchema).min(1, "Añade al menos una fila.").max(30).parse(rows)
    const overrides = await Promise.all(parsed.map((r) => resolveOverride(r.overrideValueId)))
    const parent = opts.variationOf
      ? await prisma.asset.findUnique({ where: { id: opts.variationOf }, select: { id: true, code: true, conceptId: true, offerId: true } })
      : null
    if (opts.variationOf) assert(parent && parent.conceptId === conceptId, "El creativo original no es de este concepto.")
    // Cada fila puede llevar su oferta; una variación sin oferta hereda la del original.
    const offers = await Promise.all(parsed.map((r) => resolveOffer(r.offerId ?? (parent?.offerId || null))))

    const created = await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.update({
        where: { id: conceptId },
        data: { assetCounter: { increment: parsed.length } },
      })
      const first = concept.assetCounter - parsed.length + 1
      const out = []
      for (const [i, r] of parsed.entries()) {
        const n = first + i
        const asset = await tx.asset.create({
          data: {
            conceptId,
            number: n,
            code: assetCode(concept.code, n),
            format: r.format,
            mediaType: r.mediaType,
            editorId: r.editorId || null,
            deadline: r.deadline ? new Date(r.deadline) : null,
            priority: r.priority,
            brief: r.brief,
            script: r.script,
            references: r.references,
            offerId: offers[i]?.id ?? null,
            iteratedFromId: parent?.id ?? null,
            ...overrides[i],
          },
        })
        await tx.statusEvent.create({
          data: { assetId: asset.id, userId: me.id, to: "BRIEF", reason: parent ? `Variación de ${parent.code}` : null },
        })
        if (asset.editorId)
          await notify(tx, [asset.editorId], {
            type: "asset.assigned",
            title: `Nuevo creativo asignado: ${asset.code}`,
            body: assignedBody(concept.title, offers[i]),
            href: `/assets/${asset.code}`,
          })
        out.push(asset.code)
      }
      return out
    })
    revalidatePath("/boards")
    return created
  })
}

/** Descartar varios de una vez («Aprobados sin lanzar» → «Descartar todos»). Devuelve cuántos. */
export async function discardAssets(assetIds: string[]) {
  return run(async () => {
    const ids = z.array(z.string()).min(1).max(100).parse(assetIds)
    let done = 0
    const failed: string[] = []
    for (const id of ids) {
      const res = await transitionAsset(id, "ARCHIVED", undefined, "NOT_TESTED")
      if (res.ok) done++
      else failed.push(res.error)
    }
    if (!done && failed.length) throw new UserError(failed[0])
    return done
  })
}

/** Datos del original para precargar el alta de variaciones. */
export async function getVariationSeed(code: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para crear creativos.")
    const a = await prisma.asset.findUnique({ where: { code }, include: { concept: { select: { id: true, code: true, title: true } } } })
    assert(a && canViewAsset(me, a), "Creativo no encontrado.")
    return {
      id: a.id,
      code: a.code,
      concept: a.concept,
      format: a.format,
      mediaType: a.mediaType,
      editorId: a.editorId,
      offerId: a.offerId,
      priority: a.priority,
      script: a.script,
      references: a.references,
    }
  })
}

/** F-302 · Duplicar asset: copia sin vínculo. Para colgarla del original, «Crear variaciones». */
export async function duplicateAsset(assetId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para crear creativos.")
    const code = await prisma.$transaction(async (tx) => {
      const src = await tx.asset.findUniqueOrThrow({
        where: { id: assetId },
        include: { offer: { select: { code: true, name: true } }, labels: { select: { id: true } } },
      })
      const concept = await tx.concept.update({
        where: { id: src.conceptId },
        data: { assetCounter: { increment: 1 } },
      })
      const n = concept.assetCounter
      const asset = await tx.asset.create({
        data: {
          conceptId: src.conceptId,
          number: n,
          code: assetCode(concept.code, n),
          format: src.format,
          mediaType: src.mediaType,
          editorId: src.editorId,
          deadline: src.deadline,
          priority: src.priority,
          brief: src.brief,
          script: src.script,
          references: src.references,
          primaryText: src.primaryText,
          headline: src.headline,
          cta: src.cta,
          overrideDimensionId: src.overrideDimensionId,
          overrideValueId: src.overrideValueId,
          offerId: src.offerId,
          labels: { connect: src.labels },
        },
      })
      await tx.statusEvent.create({ data: { assetId: asset.id, userId: me.id, to: "BRIEF", reason: `Duplicado de ${src.code}` } })
      if (asset.editorId)
        await notify(tx, [asset.editorId], {
          type: "asset.assigned",
          title: `Nuevo creativo asignado: ${asset.code}`,
          body: assignedBody(concept.title, src.offer),
          href: `/assets/${asset.code}`,
        })
      return asset.code
    })
    revalidatePath("/boards")
    return code
  })
}

const patchSchema = z
  .object({
    editorId: z.string().nullable(),
    deadline: z.string().nullable(),
    priority: PRIORITY,
    format: FORMAT_ENUM,
    brief: z.string(),
    script: z.string().max(20000),
    scriptTranslation: z.string().max(20000),
    references: z.array(z.string().trim().url("Referencia no válida.")),
    primaryText: z.string(),
    headline: z.string(),
    cta: z.string(),
    overrideValueId: z.string().nullable(),
    offerId: z.string().nullable(),
    labelIds: z.array(z.string()).max(20),
  })
  .partial()

export type AssetPatch = z.input<typeof patchSchema>

/** Edición en línea (F-307 reasignar / deadline, brief, copy, variable). */
export async function updateAsset(assetId: string, patch: AssetPatch) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "asset.assign"), "No tienes permiso para editar este creativo.")
    const p = patchSchema.parse(patch)
    const before = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: { concept: { select: { title: true } }, offer: { select: { code: true, name: true } } },
    })
    const data: Record<string, unknown> = {}
    if (p.editorId !== undefined) data.editorId = p.editorId || null
    if (p.deadline !== undefined) data.deadline = p.deadline ? new Date(p.deadline) : null
    for (const k of ["priority", "format", "brief", "script", "scriptTranslation", "references", "primaryText", "headline", "cta"] as const)
      if (p[k] !== undefined) data[k] = p[k]
    if (p.overrideValueId !== undefined) Object.assign(data, await resolveOverride(p.overrideValueId))

    // Oferta: fija una vez lanzado (con ella se juzgó: CPA objetivo y evento de conversión).
    const offerChanged = p.offerId !== undefined && (p.offerId || null) !== before.offerId
    const newOffer = offerChanged ? await resolveOffer(p.offerId) : null
    if (offerChanged) {
      const launched = await prisma.asset.count({ where: { id: assetId, ...launchedAssetWhere } })
      assert(launched === 0, "La oferta no se puede cambiar: el creativo ya está lanzado.")
      assert(newOffer || before.productionStatus !== "APPROVED", "Un creativo aprobado necesita oferta.")
      data.offerId = newOffer?.id ?? null
    }

    if (p.labelIds !== undefined) {
      const ids = [...new Set(p.labelIds)]
      const ok = await prisma.assetLabel.count({ where: { id: { in: ids }, active: true } })
      assert(ok === ids.length, "Etiqueta no válida.")
      data.labels = { set: ids.map((id) => ({ id })) }
    }

    const formatChanged = p.format !== undefined && p.format !== before.format

    await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data })
      if (offerChanged)
        await audit(tx, {
          userId: me.id,
          action: "asset.offer",
          entity: "asset",
          entityId: assetId,
          data: { code: before.code, from: before.offer?.code ?? null, to: newOffer?.code ?? null },
        })
      if (formatChanged) await recheckLatestVersion(tx, assetId, p.format!, before.mediaType)
      const reassigned = p.editorId !== undefined && p.editorId !== before.editorId
      if (formatChanged)
        await tx.statusEvent.create({
          data: {
            assetId,
            userId: me.id,
            from: before.productionStatus,
            to: before.productionStatus,
            reason: `Formato ${FORMAT[before.format].label} → ${FORMAT[p.format!].label}`,
          },
        })
      const redated =
        p.deadline !== undefined && (p.deadline ? new Date(p.deadline).getTime() : null) !== (before.deadline?.getTime() ?? null)
      if (reassigned || redated) {
        await tx.statusEvent.create({
          data: {
            assetId,
            userId: me.id,
            from: before.productionStatus,
            to: before.productionStatus,
            reason: [
              reassigned ? "Reasignado" : null,
              redated ? `Fecha límite → ${p.deadline ? p.deadline.slice(0, 10) : "sin fecha"}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        })
      }
      if (reassigned && p.editorId)
        await notify(tx, [p.editorId], {
          type: "asset.assigned",
          title: `Nuevo creativo asignado: ${before.code}`,
          // Si en el mismo cambio se le pone oferta, el aviso ya lleva la nueva.
          body: assignedBody(before.concept.title, offerChanged ? newOffer : before.offer),
          href: `/assets/${before.code}`,
        })
    })
    revalidatePath("/boards")
    revalidatePath(`/assets/${before.code}`)
  })
}

/**
 * Evalúa y aplica una transición de producción (F-304).
 * Archivar exige `archiveReason`; «Otro» además una nota en `reason`.
 */
export async function transitionAsset(assetId: string, to: ProductionStatus, reason?: string, archiveReason?: ArchiveReason) {
  return run(async () => {
    const me = await actor()
    if (to === "ARCHIVED") {
      assert(archiveReason && ARCHIVE_REASON_CHOICES.includes(archiveReason), "Elige por qué se archiva.")
      assert(archiveReason !== "OTHER" || reason?.trim(), "Con «Otro», explica el motivo.")
      if (archiveReason === "NOT_TESTED") {
        const launched = await prisma.asset.count({ where: { id: assetId, ...launchedAssetWhere } })
        assert(launched === 0, "Este creativo ya se lanzó: no se puede descartar sin testear. Archívalo con otro motivo.")
      }
    }
    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: {
        concept: { select: { title: true } },
        offer: { select: { gate: true } },
        versions: {
          orderBy: { number: "desc" },
          take: 1,
          include: {
            qaChecks: true,
            comments: { where: { resolved: false }, select: { severity: true } },
          },
        },
      },
    })
    assert(canViewAsset(me, asset), "No tienes acceso a este creativo.")
    const latest = asset.versions[0] ?? null
    const from = asset.productionStatus
    const errors = checkTransition(from, to, {
      role: me.role,
      isAssignee: asset.editorId === me.id,
      reason,
      latestVersion: latest && {
        ready: latest.status === "READY",
        submitted: !!latest.submittedAt,
        blockingFailures: latest.qaChecks.filter((c) => c.severity === "BLOCKING" && c.result === "FAIL").length,
        blockingDetails: latest.qaChecks
          .filter((c) => c.severity === "BLOCKING" && c.result === "FAIL")
          .map((c) => `${c.label} (${c.detail})`),
      },
      openComments: latest?.comments.length ?? 0,
      openMustComments: latest?.comments.filter((c) => c.severity === "MUST").length ?? 0,
      offerGate: asset.offer?.gate ?? null,
    })
    if (errors.length) throw new UserError(errors.join(" "))

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { productionStatus: to }
      if (to === "ARCHIVED") data.archiveReason = archiveReason
      if (to === "IN_PROGRESS" && !asset.startedAt) data.startedAt = now
      if (to === "APPROVED") {
        data.approvedVersionId = latest!.id
        data.approvedAt = now
      }
      // Solo reabrir quita la versión aprobada; archivar la conserva (rendimiento, laboratorio de ganadores).
      if (from === "APPROVED" && to === "IN_REVIEW") {
        data.approvedVersionId = null
        data.approvedAt = null
      }
      await tx.asset.update({ where: { id: assetId }, data })
      if (to === "IN_REVIEW" && from !== "APPROVED")
        await tx.version.update({ where: { id: latest!.id }, data: { submittedAt: now } })
      const eventReason =
        to === "ARCHIVED" && archiveReason
          ? [ARCHIVE_REASON[archiveReason], reason?.trim()].filter(Boolean).join(": ")
          : reason?.trim() || null
      await tx.statusEvent.create({ data: { assetId, userId: me.id, from, to, reason: eventReason } })

      const href = `/assets/${asset.code}`
      const label = PRODUCTION_STATUS[to].label
      if (to === "IN_REVIEW") {
        await notify(tx, await reviewerIds(tx), {
          type: "review.submitted",
          title: `${latest?.code ?? asset.code} listo para revisar`,
          body: asset.concept.title,
          href,
        })
      } else if (["CHANGES_REQUESTED", "APPROVED", "REJECTED"].includes(to)) {
        await notify(tx, [asset.editorId], {
          type: `review.${to.toLowerCase()}`,
          title: `${asset.code}: ${label}`,
          body: reason ?? "",
          href,
        })
      }
      if (["APPROVED", "REJECTED", "ARCHIVED"].includes(to) || from === "APPROVED")
        await audit(tx, {
          userId: me.id,
          action: `asset.${to.toLowerCase()}`,
          entity: "asset",
          entityId: assetId,
          data: { code: asset.code, from, to, reason: eventReason, archiveReason: archiveReason ?? null, version: latest?.code ?? null },
        })
    })
    revalidatePath("/boards")
    revalidatePath("/review")
    revalidatePath(`/assets/${asset.code}`)
  })
}

/**
 * Notas del creativo (texto libre del equipo). Las edita quien gestiona el tablero
 * y también el editor asignado: no llevan dinero.
 */
export async function updateAssetNotes(assetId: string, notes: string) {
  return run(async () => {
    const me = await actor()
    const text = z.string().max(5000, "Las notas no pueden pasar de 5000 caracteres.").parse(notes)
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { code: true, editorId: true } })
    assert(can(me, "asset.assign") || (me.role === "EDITOR" && asset.editorId === me.id), "No tienes permiso para editar las notas.")
    await prisma.asset.update({ where: { id: assetId }, data: { notes: text } })
    revalidatePath("/boards")
    revalidatePath(`/assets/${asset.code}`)
  })
}

/**
 * Pasar un creativo a otro concepto. Se lleva sus variaciones y recibe códigos
 * nuevos del concepto de destino (el código lleva el concepto dentro: C005-A01 → C007-A04).
 * Solo si nada de la familia está lanzado: su token ya estaría en un anuncio de Meta.
 */
export async function moveAsset(assetId: string, targetConceptId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para mover creativos.")
    const moved = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { conceptId: true } })
      assert(asset.conceptId !== targetConceptId, "El creativo ya está en ese concepto.")
      const target = await tx.concept.findUnique({ where: { id: targetConceptId }, select: { id: true, code: true, title: true, archivedAt: true } })
      assert(target, "Concepto no encontrado.")
      assert(!target.archivedAt, "No se puede mover a un concepto archivado.")
      const source = await tx.concept.findUniqueOrThrow({ where: { id: asset.conceptId }, select: { code: true, title: true } })

      const family = await tx.asset.findMany({
        where: { conceptId: asset.conceptId },
        select: { id: true, code: true, number: true, iteratedFromId: true },
      })
      const launchedIds = new Set(
        (await tx.asset.findMany({ where: { conceptId: asset.conceptId, ...launchedAssetWhere }, select: { id: true } })).map((a) => a.id),
      )
      const plan = planMove(
        family.map((f) => ({ id: f.id, code: f.code, number: f.number, parentId: f.iteratedFromId, launched: launchedIds.has(f.id) })),
        assetId,
      )
      if (!plan.ok) throw new UserError(plan.error)

      const counter = await tx.concept.update({ where: { id: target.id }, data: { assetCounter: { increment: plan.ids.length } } })
      const first = counter.assetCounter - plan.ids.length + 1
      const out: { from: string; to: string }[] = []
      for (const [i, id] of plan.ids.entries()) {
        const a = family.find((f) => f.id === id)!
        const n = first + i
        const code = assetCode(target.code, n)
        const cur = await tx.asset.update({
          where: { id },
          data: { conceptId: target.id, number: n, code },
          select: { productionStatus: true, versions: { select: { id: true, number: true } } },
        })
        for (const v of cur.versions) await tx.version.update({ where: { id: v.id }, data: { code: versionCode(code, v.number) } })
        // Los avisos viejos siguen llevando al creativo.
        await tx.notification.updateMany({ where: { href: `/assets/${a.code}` }, data: { href: `/assets/${code}` } })
        await tx.statusEvent.create({
          data: {
            assetId: id,
            userId: me.id,
            from: cur.productionStatus,
            to: cur.productionStatus,
            reason: `Movido de ${a.code} («${source.title}») a «${target.title}»`,
          },
        })
        out.push({ from: a.code, to: code })
      }
      await audit(tx, {
        userId: me.id,
        action: "asset.move",
        entity: "asset",
        entityId: assetId,
        data: { from: source.code, to: target.code, codes: out },
      })
      return out
    })
    revalidatePath("/boards")
    for (const m of moved) {
      revalidatePath(`/assets/${m.from}`)
      revalidatePath(`/assets/${m.to}`)
    }
    return moved
  })
}

/** F-703 · Marcar como lanzado (opcional; el sync lo confirma). */
export async function markLaunched(assetId: string, launched: boolean) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "launch.manage"), "No tienes permiso.")
    await prisma.asset.update({
      where: { id: assetId },
      data: launched
        ? { markedLaunchedAt: new Date(), relaunchRequestedAt: null }
        : { markedLaunchedAt: null },
    })
    revalidatePath("/launch")
  })
}

/** F-904 · Forzar el estado de rendimiento (propietario, con motivo). */
export async function overridePerformance(
  assetId: string,
  status: "TESTING" | "WINNER" | "LOSER" | "INCONCLUSIVE" | "NOT_LAUNCHED",
  reason: string,
) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "performance.override"), "Solo el propietario puede forzar el estado.")
    assert(reason.trim(), "Hace falta un motivo.")
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })
    await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data: { performanceStatus: status } })
      await tx.winnerEvaluation.create({
        data: {
          assetId,
          previous: asset.performanceStatus,
          result: status,
          reason: `Forzado por ${me.name}: ${reason}`,
          metrics: { override: true },
        },
      })
      await audit(tx, {
        userId: me.id,
        action: "performance.override",
        entity: "asset",
        entityId: assetId,
        data: { from: asset.performanceStatus, to: status, reason },
      })
    })
    revalidatePath(`/assets/${asset.code}`)
    revalidatePath("/performance")
  })
}

/** F-905 · Relanzar inconclusive: vuelve a aprobados sin lanzar. */
export async function relaunchAsset(assetId: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "review.decide"), "No tienes permiso.")
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })
    assert(asset.performanceStatus === "INCONCLUSIVE", "Solo se relanzan creativos sin veredicto.")
    await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: assetId },
        data: {
          performanceStatus: "TESTING",
          testingSince: new Date(),
          markedLaunchedAt: null,
          relaunchRequestedAt: new Date(),
        },
      })
      await tx.winnerEvaluation.create({
        data: { assetId, previous: "INCONCLUSIVE", result: "TESTING", reason: `Relanzado por ${me.name}`, metrics: {} },
      })
    })
    revalidatePath("/")
    revalidatePath("/launch")
  })
}
