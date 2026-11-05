// Motor de winners (M9). Evaluación pura de las reglas.

import type { PerformanceStatus } from "@/generated/prisma/enums"
import { money } from "@/lib/format"

export type WinnerRuleConfig = {
  winnerMaxCpaPct: number
  winnerMinConversions: number
  winnerMinSpendMult: number
  loserMinSpendMult: number
  loserMinCpaPct: number
  loserZeroConvSpendMult: number
  inconclusiveDays: number
  minHookRatePct: number | null
}

export const DEFAULT_RULE: WinnerRuleConfig = {
  winnerMaxCpaPct: 80,
  winnerMinConversions: 10,
  winnerMinSpendMult: 2,
  loserMinSpendMult: 3,
  loserMinCpaPct: 130,
  loserZeroConvSpendMult: 2,
  inconclusiveDays: 14,
  minHookRatePct: null,
}

export type EvalInput = {
  spendCents: number
  conversions: number
  /** 0–1, null si no hay datos de video. */
  hookRate: number | null
  daysInTesting: number
  targetCpaCents: number
}

export type EvalResult = { status: PerformanceStatus; reason: string }


/** Evalúa un asset en testing. Devuelve TESTING si todavía no hay veredicto. */
export function evaluate(input: EvalInput, rule: WinnerRuleConfig): EvalResult {
  const { spendCents, conversions, hookRate, daysInTesting, targetCpaCents } = input
  const cpa = conversions > 0 ? spendCents / conversions : null
  const target = targetCpaCents

  // Loser
  if (conversions === 0 && spendCents >= target * rule.loserZeroConvSpendMult) {
    return {
      status: "LOSER",
      reason: `${money(spendCents)} de gasto sin conversiones (límite ${rule.loserZeroConvSpendMult}× objetivo).`,
    }
  }
  if (
    cpa !== null &&
    spendCents >= target * rule.loserMinSpendMult &&
    cpa > (target * rule.loserMinCpaPct) / 100
  ) {
    return {
      status: "LOSER",
      reason: `CPA ${money(cpa)} > ${rule.loserMinCpaPct}% del objetivo ${money(target)} con ${money(spendCents)} de gasto.`,
    }
  }

  // Winner
  const hookOk =
    rule.minHookRatePct == null || (hookRate !== null && hookRate * 100 >= rule.minHookRatePct)
  if (
    cpa !== null &&
    cpa <= (target * rule.winnerMaxCpaPct) / 100 &&
    conversions >= rule.winnerMinConversions &&
    spendCents >= target * rule.winnerMinSpendMult
  ) {
    if (hookOk) {
      return {
        status: "WINNER",
        reason: `CPA ${money(cpa)} ≤ ${rule.winnerMaxCpaPct}% del objetivo ${money(target)} · ${conversions} conversiones.`,
      }
    }
  }

  // Inconclusive
  if (daysInTesting >= rule.inconclusiveDays) {
    return {
      status: "INCONCLUSIVE",
      reason: `${daysInTesting} días en prueba sin veredicto (${money(spendCents)} de gasto).`,
    }
  }

  return { status: "TESTING", reason: "Sin veredicto todavía." }
}
