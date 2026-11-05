// Variaciones anidadas: cada creativo cuelga del original de su cadena.
// Un solo nivel visible: la variación de una variación también cuelga del original.
// Lógica pura, sin base de datos.

/** Sube por `parentOf` hasta el creativo sin padre. Tolera ciclos y padres que no están. */
export function rootOf(id: string, parentOf: Map<string, string | null>): string {
  let cur = id
  const seen = new Set<string>()
  for (;;) {
    seen.add(cur)
    const p = parentOf.get(cur)
    if (!p || seen.has(p) || !parentOf.has(p)) return cur
    cur = p
  }
}

/**
 * Por original: cuántas variaciones tiene y cuántas son ganadoras.
 * No cuentan las archivadas que nunca se lanzaron (descartadas).
 */
export function variationSummary(
  lineage: { id: string; parentId: string | null; performanceStatus: string; productionStatus?: string }[],
): Map<string, { count: number; winners: number }> {
  const parentOf = new Map(lineage.map((l) => [l.id, l.parentId]))
  const out = new Map<string, { count: number; winners: number }>()
  for (const l of lineage) {
    const root = rootOf(l.id, parentOf)
    if (root === l.id) continue
    if (l.productionStatus === "ARCHIVED" && l.performanceStatus === "NOT_LAUNCHED") continue
    const s = out.get(root) ?? { count: 0, winners: 0 }
    s.count++
    if (l.performanceStatus === "WINNER") s.winners++
    out.set(root, s)
  }
  return out
}

/**
 * Ordena las filas: cada original seguido de sus variaciones.
 * Una variación cuyo original no está en la lista sale como fila normal.
 */
export function nestRows<T extends { id: string; rootId: string }>(items: T[]): { item: T; child: boolean }[] {
  const ids = new Set(items.map((i) => i.id))
  const children = new Map<string, T[]>()
  for (const i of items) {
    if (i.rootId === i.id || !ids.has(i.rootId)) continue
    children.set(i.rootId, [...(children.get(i.rootId) ?? []), i])
  }
  const out: { item: T; child: boolean }[] = []
  for (const i of items) {
    if (i.rootId !== i.id && ids.has(i.rootId)) continue
    out.push({ item: i, child: false })
    for (const c of children.get(i.id) ?? []) out.push({ item: c, child: true })
  }
  return out
}

/** "C003-A02" → "A02": dentro de un concepto basta con la parte del creativo. */
export const shortCode = (code: string) => code.split("-").pop() ?? code

/** Etiqueta de una variación: «de A02», o «de A07» si sale de otra variación. */
export function variationLabel(a: { id: string; rootId: string; rootCode: string; parentCode: string | null }): string | null {
  if (a.rootId === a.id) return null
  return `de ${shortCode(a.parentCode ?? a.rootCode)}`
}

/**
 * Qué se mueve al pasar un creativo a otro concepto: él y todas sus variaciones
 * (directas o de segundo nivel), en orden de número.
 *
 * - Solo se mueve un original: una variación va siempre con el suyo.
 * - Nada de la familia puede estar lanzado: su token del ad name lleva el código
 *   del concepto y ya está en Meta. Cambiarle el código rompería la trazabilidad.
 */
export function planMove(
  family: { id: string; code: string; number: number; parentId: string | null; launched: boolean }[],
  assetId: string,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const byId = new Map(family.map((f) => [f.id, f]))
  const target = byId.get(assetId)
  if (!target) return { ok: false, error: "Creativo no encontrado." }
  if (target.parentId && byId.has(target.parentId)) {
    const root = byId.get(rootOf(assetId, new Map(family.map((f) => [f.id, f.parentId]))))
    return { ok: false, error: `Es una variación: mueve su original (${root?.code ?? "el original"}) y se moverá con él.` }
  }
  // Descendientes: todo lo que sube hasta este creativo.
  const parentOf = new Map(family.map((f) => [f.id, f.parentId]))
  const moving = family.filter((f) => rootOf(f.id, parentOf) === assetId).sort((a, b) => a.number - b.number)
  const launched = moving.filter((f) => f.launched)
  if (launched.length)
    return {
      ok: false,
      error: `No se puede mover: ${launched.map((f) => f.code).join(", ")} ya está${launched.length === 1 ? "" : "n"} lanzado${launched.length === 1 ? "" : "s"} y su código va en el anuncio de Meta.`,
    }
  return { ok: true, ids: moving.map((f) => f.id) }
}
