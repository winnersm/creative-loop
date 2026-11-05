// Métricas unidas (F-803). Lógica pura sobre filas de PerformanceDaily.

export type DailyRow = {
  spendCents: number
  impressions: number
  clicks: number
  videoPlays3s: number
  thruplays: number
  actions: unknown
  actionValues: unknown
}

export type OfferEconomics = {
  conversionEvent: string
  payoutCents: number
}

export type Totals = {
  spendCents: number
  impressions: number
  clicks: number
  videoPlays3s: number
  thruplays: number
  conversions: number
  revenueCents: number
}

export const emptyTotals = (): Totals => ({
  spendCents: 0,
  impressions: 0,
  clicks: 0,
  videoPlays3s: 0,
  thruplays: 0,
  conversions: 0,
  revenueCents: 0,
})

const num = (obj: unknown, key: string): number => {
  if (!obj || typeof obj !== "object") return 0
  const v = (obj as Record<string, unknown>)[key]
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Conversiones y revenue de un día según el evento de la oferta (F-802). */
export function conversionsOf(row: DailyRow, offer: OfferEconomics) {
  const conversions = num(row.actions, offer.conversionEvent)
  const value = num(row.actionValues, offer.conversionEvent)
  // Meta da el valor en unidades de moneda. Sin valor → conversiones × payout.
  const revenueCents = value > 0 ? Math.round(value * 100) : Math.round(conversions * offer.payoutCents)
  return { conversions, revenueCents }
}

export function addRow(t: Totals, row: DailyRow, offer: OfferEconomics | null): Totals {
  t.spendCents += row.spendCents
  t.impressions += row.impressions
  t.clicks += row.clicks
  t.videoPlays3s += row.videoPlays3s
  t.thruplays += row.thruplays
  if (offer) {
    const c = conversionsOf(row, offer)
    t.conversions += c.conversions
    t.revenueCents += c.revenueCents
  }
  return t
}

export function mergeTotals(a: Totals, b: Totals): Totals {
  return {
    spendCents: a.spendCents + b.spendCents,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    videoPlays3s: a.videoPlays3s + b.videoPlays3s,
    thruplays: a.thruplays + b.thruplays,
    conversions: a.conversions + b.conversions,
    revenueCents: a.revenueCents + b.revenueCents,
  }
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export function derived(t: Totals) {
  return {
    ctr: ratio(t.clicks, t.impressions),
    cpmCents: t.impressions > 0 ? (t.spendCents / t.impressions) * 1000 : null,
    hookRate: ratio(t.videoPlays3s, t.impressions),
    holdRate: ratio(t.thruplays, t.videoPlays3s),
    cpaCents: t.conversions > 0 ? t.spendCents / t.conversions : null,
    roas: ratio(t.revenueCents, t.spendCents),
  }
}

export type Metrics = Totals & ReturnType<typeof derived>

export const withDerived = (t: Totals): Metrics => ({ ...t, ...derived(t) })
