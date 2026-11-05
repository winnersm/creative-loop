"use client"

import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { money } from "@/lib/format"
import type { WinnerRuleConfig } from "@/lib/winner-rules"
import { deleteOfferRule, saveWinnerRule } from "@/server/settings"

type Rule = WinnerRuleConfig & { id: string; offerId: string | null }
type Offer = { id: string; code: string; name: string; targetCpaCents: number }

const FIELDS: { key: keyof WinnerRuleConfig; label: string; suffix: string; group: string }[] = [
  { key: "winnerMaxCpaPct", label: "CPA máximo", suffix: "% del objetivo", group: "Ganador" },
  { key: "winnerMinConversions", label: "Conversiones mínimas", suffix: "conv.", group: "Ganador" },
  { key: "winnerMinSpendMult", label: "Gasto mínimo", suffix: "× objetivo", group: "Ganador" },
  { key: "minHookRatePct", label: "Enganche mínimo (opcional)", suffix: "%", group: "Ganador" },
  { key: "loserMinSpendMult", label: "Gasto mínimo", suffix: "× objetivo", group: "Perdedor" },
  { key: "loserMinCpaPct", label: "…con CPA mayor que", suffix: "% del objetivo", group: "Perdedor" },
  { key: "loserZeroConvSpendMult", label: "o gasto sin conversiones", suffix: "× objetivo", group: "Perdedor" },
  { key: "inconclusiveDays", label: "Días en testing sin veredicto", suffix: "días", group: "Sin veredicto" },
]

/** F-106 / F-902 · Reglas de winner globales y por oferta. */
export function RulesSettings({ global, offerRules, offers }: { global: Rule; offerRules: Rule[]; offers: Offer[] }) {
  const [offerId, setOfferId] = useState("")
  const withRule = offers.filter((o) => offerRules.some((r) => r.offerId === o.id))
  const selectable = offers.filter((o) => !offerRules.some((r) => r.offerId === o.id))
  return (
    <div className="space-y-6">
      <RuleForm title="Regla general (por defecto)" rule={global} offerId={null} />
      {withRule.map((o) => (
        <RuleForm
          key={o.id}
          title={`${o.code} · ${o.name} · objetivo ${money(o.targetCpaCents)}`}
          rule={offerRules.find((r) => r.offerId === o.id)!}
          offerId={o.id}
        />
      ))}
      {offerId && (
        <RuleForm
          key={offerId}
          title={`Nueva regla para ${offers.find((o) => o.id === offerId)?.code}`}
          rule={{ ...global, id: "", offerId }}
          offerId={offerId}
          onSaved={() => setOfferId("")}
        />
      )}
      {selectable.length > 0 && !offerId && (
        <div className="flex items-center gap-2">
          <NativeSelect className="w-72" value="" onChange={(e) => setOfferId(e.target.value)}>
            <option value="">Añadir regla específica para una oferta…</option>
            {selectable.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  )
}

function RuleForm({ title, rule, offerId, onSaved }: { title: string; rule: Rule; offerId: string | null; onSaved?: () => void }) {
  const { exec, pending } = useAction()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, rule[f.key] == null ? "" : String(rule[f.key])])),
  )
  const groups = [...new Set(FIELDS.map((f) => f.group))]
  return (
    <form
      className="rounded-lg border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const input = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key] === "" ? null : values[f.key]]))
        const ok = await exec(() => saveWinnerRule(offerId, input as never), "Regla guardada")
        if (ok !== null) onSaved?.()
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        {offerId && rule.id && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => void exec(() => deleteOfferRule(offerId), "Se usará la regla general")}
          >
            <Trash2 /> Usar la general
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <div className="text-sm font-medium">{g}</div>
            {FIELDS.filter((f) => f.group === g).map((f) => (
              <label key={f.key} className="grid gap-1 text-xs text-muted-foreground">
                {f.label}
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    className="w-24"
                    value={values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                  <span>{f.suffix}</span>
                </div>
              </label>
            ))}
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" className="mt-4" disabled={pending}>
        Guardar
      </Button>
    </form>
  )
}
