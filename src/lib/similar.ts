// Similares: creativos ya juzgados de la misma oferta que comparten etiquetas.
// Sirve para ver, antes de producir, si esa combinación ya ganó o ya perdió.
// Lógica pura, sin base de datos.

type Tag = { dimensionId: string; valueId: string }

/** Etiquetas efectivas: las del concepto, con la variable propia del creativo encima. */
export function effectiveTags(conceptTags: Tag[], override: Tag | null): Map<string, string> {
  const m = new Map(conceptTags.map((t) => [t.dimensionId, t.valueId]))
  if (override) m.set(override.dimensionId, override.valueId)
  return m
}

/** Dimensiones en las que coinciden. */
export function sharedDimensions(a: Map<string, string>, b: Map<string, string>): string[] {
  return [...a].filter(([dim, val]) => b.get(dim) === val).map(([dim]) => dim)
}

const VERDICT_ORDER: Record<string, number> = { WINNER: 0, LOSER: 1, INCONCLUSIVE: 2 }

/**
 * Los `limit` más parecidos. Cuentan las etiquetas compartidas; el mismo formato
 * solo desempata. Hacen falta al menos 2 etiquetas en común (1 si el creativo tiene
 * una sola), para no llamar «similar» a cualquiera de la oferta.
 */
export function rankSimilar<T>(
  target: { tags: Map<string, string>; format: string },
  candidates: { item: T; tags: Map<string, string>; format: string; verdict: string }[],
  limit = 5,
): { item: T; shared: string[]; sameFormat: boolean }[] {
  const min = Math.min(2, target.tags.size)
  if (min === 0) return []
  return candidates
    .map((c) => ({ c, shared: sharedDimensions(target.tags, c.tags), sameFormat: c.format === target.format }))
    .filter((x) => x.shared.length >= min)
    .sort(
      (x, y) =>
        y.shared.length - x.shared.length ||
        Number(y.sameFormat) - Number(x.sameFormat) ||
        (VERDICT_ORDER[x.c.verdict] ?? 9) - (VERDICT_ORDER[y.c.verdict] ?? 9),
    )
    .slice(0, limit)
    .map((x) => ({ item: x.c.item, shared: x.shared, sameFormat: x.sameFormat }))
}
