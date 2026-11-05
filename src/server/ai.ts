"use server"

import { revalidatePath } from "next/cache"
import { assert, run, UserError } from "@/lib/action"
import { z } from "zod"
import { AI_MODELS, AiError, analyzeWinner, pingAi, suggestCopy, translateScript, type CopySuggestion, type WinnerAnalysis } from "@/lib/ai"
import { assetCode } from "@/lib/codes"
import { decimal, money, pct } from "@/lib/format"
import { managerIds, notify } from "@/lib/events"
import { metricsByAsset } from "@/lib/performance"
import { FORMAT } from "@/lib/status"
import type { Prisma } from "@/generated/prisma/client"
import { deleteAiKey, getAiConfig, saveAiKey, saveAiModel } from "@/lib/ai-config"
import { assignedBody } from "@/lib/messages"
import { audit } from "@/lib/events"
import { can, canViewAsset } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { actor } from "@/lib/session"

const asUserError = (e: unknown) => (e instanceof AiError ? new UserError(e.message) : e)

/** Propone 3 opciones de texto principal y titular para un creativo. No guarda nada. */
export async function proposeCopy(assetId: string) {
  return run<CopySuggestion[]>(async () => {
    const me = await actor()
    assert(can(me, "asset.assign"), "No tienes permiso para editar el copy.")
    const config = await getAiConfig()
    assert(config.apiKey, "La IA no está configurada: el propietario debe añadir la clave en Ajustes → IA.")

    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: {
        overrideDimension: true,
        overrideValue: true,
        offer: true,
        concept: { include: { tags: { include: { dimension: true, value: true } } } },
      },
    })
    // Idioma, GEO y producto salen de la oferta del creativo.
    const offer = asset.offer
    assert(offer, "Asigna una oferta al creativo: la IA necesita su idioma, GEO y producto.")
    const tags = asset.concept.tags
      .sort((a, b) => a.dimension.sortOrder - b.dimension.sortOrder)
      .map((t) => ({
        dimension: t.dimension.label,
        label: asset.overrideDimensionId === t.dimensionId && asset.overrideValue ? asset.overrideValue.label : t.value.label,
      }))

    try {
      const options = await suggestCopy(config, {
        language: offer.language,
        geo: offer.geo,
        offerName: offer.name,
        product: offer.product,
        conceptTitle: asset.concept.title,
        hypothesis: asset.concept.hypothesis,
        tags,
        brief: asset.brief,
        script: asset.script,
        currentPrimaryText: asset.primaryText,
        currentHeadline: asset.headline,
        cta: asset.cta,
      })
      await audit(prisma, { userId: me.id, action: "ai.copy", entity: "asset", entityId: assetId, data: { options: options.length } })
      return options
    } catch (e) {
      throw asUserError(e)
    }
  })
}

// ─── Ajustes → IA (solo propietario) ─────────────────────────────────────────

async function owner() {
  const me = await actor()
  assert(can(me, "settings.manage"), "Solo el propietario puede configurar la IA.")
  return me
}

/** Guarda la clave (si se escribe una) y el modelo. Antes de guardar la clave, la prueba. */
export async function saveAiSettings(input: { apiKey?: string; model: string }) {
  return run(async () => {
    const me = await owner()
    assert((AI_MODELS as readonly string[]).includes(input.model), "Modelo no válido.")
    const key = input.apiKey?.trim()
    if (key) {
      assert(key.length >= 20, "La clave parece incompleta.")
      const current = await getAiConfig()
      try {
        await pingAi({ ...current, apiKey: key, model: input.model })
      } catch (e) {
        throw asUserError(e)
      }
      await saveAiKey(key)
    }
    await saveAiModel(input.model)
    await audit(prisma, {
      userId: me.id,
      action: "ai.settings",
      entity: "app_setting",
      entityId: "ai.deepseek",
      data: { model: input.model, keyChanged: !!key },
    })
    revalidatePath("/settings")
  })
}

export async function removeAiKey() {
  return run(async () => {
    const me = await owner()
    await deleteAiKey()
    await audit(prisma, { userId: me.id, action: "ai.key_removed", entity: "app_setting", entityId: "ai.deepseek" })
    revalidatePath("/settings")
  })
}

export async function testAiConnection() {
  return run(async () => {
    await owner()
    try {
      await pingAi(await getAiConfig())
    } catch (e) {
      throw asUserError(e)
    }
  })
}

// ─── Analizar ganador y crear variaciones ────────────────────────────────────

export type WinnerLabResult = {
  analysis: WinnerAnalysis
  dimensionLabels: Record<string, { label: string; values: Record<string, string> }>
}

/** La IA explica por qué funciona el creativo y propone variaciones. Guarda el análisis; no crea nada. */
export async function analyzeWinnerAsset(assetId: string, count: number) {
  return run<WinnerLabResult>(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para crear variaciones.")
    const n = z.number().int().min(1).max(5).parse(count)
    const config = await getAiConfig()
    assert(config.apiKey, "La IA no está configurada: el propietario debe añadir la clave en Ajustes → IA.")

    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: {
        overrideValue: true,
        offer: true,
        concept: { include: { tags: { include: { dimension: true, value: true } } } },
        versions: { where: { status: "READY" }, orderBy: { number: "desc" }, take: 1 },
      },
    })
    assert(
      ["WINNER", "TESTING"].includes(asset.performanceStatus),
      "El análisis está pensado para creativos ganadores (o en prueba con datos).",
    )
    const dims = await prisma.tagDimension.findMany({
      orderBy: { sortOrder: "asc" },
      include: { values: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
    })
    const current = (dimensionId: string) => {
      if (asset.overrideDimensionId === dimensionId && asset.overrideValue) return asset.overrideValue.value
      return asset.concept.tags.find((t) => t.dimensionId === dimensionId)?.value.value ?? "—"
    }
    const m = (await metricsByAsset([asset.id])).get(asset.id)
    const offer = asset.offer
    assert(offer, "Asigna una oferta al creativo: el análisis necesita su idioma, GEO y CPA objetivo.")

    let analysis: WinnerAnalysis
    try {
      analysis = await analyzeWinner(config, {
        language: offer.language,
        geo: offer.geo,
        offerName: offer.name,
        conceptTitle: asset.concept.title,
        hypothesis: asset.concept.hypothesis,
        format: FORMAT[asset.format].label,
        durationSec: asset.versions[0]?.durationMs ? asset.versions[0].durationMs / 1000 : null,
        script: asset.script,
        brief: asset.brief,
        primaryText: asset.primaryText,
        headline: asset.headline,
        dimensions: dims.map((d) => ({
          key: d.key,
          label: d.label,
          current: current(d.id),
          values: d.values.map((v) => ({ value: v.value, label: v.label })),
        })),
        metrics: m
          ? {
              spend: money(m.spendCents),
              conversions: m.conversions,
              cpa: money(m.cpaCents),
              targetCpa: money(offer.targetCpaCents),
              hookRate: pct(m.hookRate),
              holdRate: pct(m.holdRate),
              ctr: pct(m.ctr, 2),
              roas: m.roas != null ? `${decimal(m.roas)}x` : "—",
            }
          : null,
        count: n,
      })
    } catch (e) {
      throw asUserError(e)
    }

    await prisma.asset.update({
      where: { id: assetId },
      data: { aiAnalysis: analysis as unknown as Prisma.InputJsonValue, aiAnalyzedAt: new Date() },
    })
    await audit(prisma, { userId: me.id, action: "ai.winner", entity: "asset", entityId: assetId, data: { variations: analysis.variations.length } })

    return {
      analysis,
      dimensionLabels: Object.fromEntries(
        dims.map((d) => [d.key, { label: d.label, values: Object.fromEntries(d.values.map((v) => [v.value, v.label])) }]),
      ),
    }
  })
}

const variationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dimension: z.string(),
  value: z.string(),
  whatChanges: z.string().max(4000),
  keepSame: z.string().max(4000),
  script: z.string().trim().min(1).max(20000),
  primaryText: z.string().max(2000),
  headline: z.string().max(500),
})

/** Crea las variaciones elegidas como creativos nuevas del mismo concepto, enlazadas al ganador. */
export async function createWinnerVariations(
  assetId: string,
  input: { variations: z.input<typeof variationSchema>[]; editorId: string | null; deadline: string | null },
) {
  return run<string[]>(async () => {
    const me = await actor()
    assert(can(me, "asset.create"), "No tienes permiso para crear creativos.")
    const variations = z.array(variationSchema).min(1, "Elige al menos una variación.").max(5).parse(input.variations)
    const src = await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: { offer: { select: { code: true, name: true } }, labels: { select: { id: true } } },
    })
    const dims = await prisma.tagDimension.findMany({ include: { values: { where: { active: true } } } })

    const codes = await prisma.$transaction(async (tx) => {
      const concept = await tx.concept.update({
        where: { id: src.conceptId },
        data: { assetCounter: { increment: variations.length } },
      })
      const first = concept.assetCounter - variations.length + 1
      const out: string[] = []
      for (const [i, v] of variations.entries()) {
        const dim = dims.find((d) => d.key === v.dimension)
        const val = dim?.values.find((x) => x.value === v.value)
        // Una creativo solo sobrescribe una etiqueta. Si el ganador ya sobrescribe otra, se conserva
        // la suya (para no cambiar dos cosas a la vez) y la variable nueva queda en las instrucciones.
        const canOverride = !!(dim && val) && (!src.overrideDimensionId || src.overrideDimensionId === dim!.id)
        const n = first + i
        const brief = [
          `Variación de ${src.code}: ${v.title}`,
          dim && val && !canOverride && `Variable que se prueba: ${dim.label} → ${val.label}`,
          v.whatChanges && `Qué cambia: ${v.whatChanges}`,
          v.keepSame && `Mantener igual: ${v.keepSame}`,
        ]
          .filter(Boolean)
          .join("\n")
        const asset = await tx.asset.create({
          data: {
            conceptId: src.conceptId,
            number: n,
            code: assetCode(concept.code, n),
            format: src.format,
            mediaType: src.mediaType,
            editorId: input.editorId || src.editorId,
            deadline: input.deadline ? new Date(input.deadline) : null,
            priority: src.priority,
            brief,
            script: v.script,
            primaryText: v.primaryText || src.primaryText,
            headline: v.headline || src.headline,
            cta: src.cta,
            overrideDimensionId: canOverride ? dim!.id : src.overrideDimensionId,
            overrideValueId: canOverride ? val!.id : src.overrideValueId,
            offerId: src.offerId,
            iteratedFromId: src.id,
          },
        })
        await tx.statusEvent.create({
          data: { assetId: asset.id, userId: me.id, to: "BRIEF", reason: `Variación con IA de ${src.code}` },
        })
        if (asset.editorId)
          await notify(tx, [asset.editorId], {
            type: "asset.assigned",
            title: `Nuevo creativo asignado: ${asset.code}`,
            body: assignedBody(`${concept.title} · ${v.title}`, src.offer),
            href: `/assets/${asset.code}`,
          })
        out.push(asset.code)
      }
      await notify(tx, (await managerIds(tx)).filter((id) => id !== me.id), {
        type: "asset.variations",
        title: `${out.length} variación(es) de ${src.code}`,
        body: out.join(", "),
        href: `/assets/${src.code}`,
      })
      return out
    })
    await audit(prisma, { userId: me.id, action: "ai.variations", entity: "asset", entityId: assetId, data: { created: codes } })
    revalidatePath("/boards")
    revalidatePath(`/assets/${src.code}`)
    return codes
  })
}

// ─── Guion en español e inglés ───────────────────────────────────────────────

/**
 * Traduce el guion guardado (inglés → español, o español → inglés) y guarda la
 * traducción junto a él. Lo puede pedir cualquiera que vea el creativo, también
 * el editor: es una ayuda de lectura, no cambia el guion.
 */
export async function translateAssetScript(assetId: string) {
  return run(async () => {
    const me = await actor()
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })
    assert(canViewAsset(me, asset), "No tienes acceso a este creativo.")
    assert(asset.script.trim(), "El creativo no tiene guion que traducir.")
    const config = await getAiConfig()
    assert(config.apiKey, "La IA no está configurada: el propietario debe añadir la clave en Ajustes → IA.")
    let t: { to: "es" | "en"; script: string }
    try {
      t = await translateScript(config, asset.script)
    } catch (e) {
      throw asUserError(e)
    }
    await prisma.asset.update({
      where: { id: assetId },
      data: { scriptTranslation: t.script, scriptTranslationLang: t.to, scriptTranslationOf: asset.script },
    })
    await audit(prisma, { userId: me.id, action: "ai.script_translate", entity: "asset", entityId: assetId, data: { code: asset.code, to: t.to } })
    revalidatePath(`/assets/${asset.code}`)
    return { lang: t.to, text: t.script }
  })
}
