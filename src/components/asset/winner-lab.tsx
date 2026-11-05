"use client"

import { Lightbulb, Sparkles, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { WinnerAnalysis } from "@/lib/ai"
import { cn } from "@/lib/utils"
import { analyzeWinnerAsset, createWinnerVariations, type WinnerLabResult } from "@/server/ai"

type Variation = WinnerAnalysis["variations"][number] & { selected: boolean }

/** Analiza por qué funciona un ganador y crea variaciones controladas a partir del guion. */
export function WinnerLab({
  assetId,
  assetCode,
  hasScript,
  editors,
  defaultEditorId,
}: {
  assetId: string
  assetCode: string
  hasScript: boolean
  editors: { id: string; name: string }[]
  defaultEditorId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(3)
  const [editorId, setEditorId] = useState(defaultEditorId ?? "")
  const [deadline, setDeadline] = useState("")
  const [result, setResult] = useState<WinnerLabResult | null>(null)
  const [variations, setVariations] = useState<Variation[]>([])
  const [created, setCreated] = useState<string[] | null>(null)
  const [analyzing, startAnalyze] = useTransition()
  const [creating, startCreate] = useTransition()

  function analyze() {
    startAnalyze(async () => {
      const res = await analyzeWinnerAsset(assetId, count)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setResult(res.data)
      setVariations(res.data.analysis.variations.map((v) => ({ ...v, selected: true })))
      setCreated(null)
    })
  }

  function create() {
    const chosen = variations.filter((v) => v.selected)
    startCreate(async () => {
      const res = await createWinnerVariations(assetId, {
        variations: chosen.map((v) => ({
          title: v.title,
          dimension: v.dimension,
          value: v.value,
          whatChanges: v.whatChanges,
          keepSame: v.keepSame,
          script: v.script,
          primaryText: v.primaryText,
          headline: v.headline,
        })),
        editorId: editorId || null,
        deadline: deadline ? new Date(`${deadline}T23:59:00`).toISOString() : null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setCreated(res.data)
      toast.success(`Creadas: ${res.data.join(", ")}`)
      router.refresh()
    })
  }

  const set = (i: number, patch: Partial<Variation>) =>
    setVariations((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const selected = variations.filter((v) => v.selected).length
  const labelOf = (dim: string, value: string) => {
    const d = result?.dimensionLabels[dim]
    return d ? `${d.label} → ${d.values[value] ?? value}` : null
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="text-[var(--status-testing)]" /> Analizar y crear variaciones
      </Button>
      <Dialog open={open} onOpenChange={(o) => !analyzing && !creating && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Por qué funciona {assetCode} y cómo escalarlo</DialogTitle>
            <DialogDescription>
              La IA lee el guion, el copy, la hipótesis y las métricas. Sus conclusiones son hipótesis: revísalas antes de
              crear. Cada variación cambia una sola variable.
            </DialogDescription>
          </DialogHeader>

          {!hasScript && (
            <p className="flex items-center gap-2 rounded-md bg-[var(--status-working)]/15 p-2 text-sm">
              <TriangleAlert className="size-4 shrink-0" />
              Este creativo no tiene guion. El análisis será mucho más pobre: añádelo en la pestaña Indicaciones.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Variaciones</Label>
              <NativeSelect className="w-24" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Editor</Label>
              <NativeSelect className="w-44" value={editorId} onChange={(e) => setEditorId(e.target.value)}>
                <option value="">El mismo del ganador</option>
                {editors.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Fecha límite</Label>
              <Input type="date" className="w-40" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <Button onClick={analyze} disabled={analyzing || creating}>
              <Sparkles /> {analyzing ? "Analizando… (hasta 1–2 min)" : result ? "Volver a analizar" : "Analizar con IA"}
            </Button>
          </div>

          {result && (
            <div className="space-y-4">
              <section className="rounded-lg border bg-accent/30 p-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Lightbulb className="size-4" /> Por qué funciona (hipótesis)
                </h3>
                <p className="text-sm">{result.analysis.summary}</p>
                {result.analysis.keyFactors.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {result.analysis.keyFactors.map((f, i) => (
                      <li key={i}>
                        <b>{f.factor}</b>
                        {f.evidence && <span className="text-muted-foreground"> — {f.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {result.analysis.risks.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Riesgos: {result.analysis.risks.join(" · ")}</p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Variaciones propuestas</h3>
                {variations.map((v, i) => (
                  <div key={i} className={cn("rounded-lg border p-3", !v.selected && "opacity-50")}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.selected} onChange={(e) => set(i, { selected: e.target.checked })} />
                      <Input className="h-7 flex-1 font-medium" value={v.title} onChange={(e) => set(i, { title: e.target.value })} />
                      {labelOf(v.dimension, v.value) ? (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                          {labelOf(v.dimension, v.value)}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">Sin variable de etiqueta</span>
                      )}
                    </label>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Qué cambia</Label>
                        <Textarea rows={2} value={v.whatChanges} onChange={(e) => set(i, { whatChanges: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Mantener igual</Label>
                        <Textarea rows={2} value={v.keepSame} onChange={(e) => set(i, { keepSame: e.target.value })} />
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1">
                      <Label className="text-xs text-muted-foreground">Guion</Label>
                      <Textarea
                        rows={7}
                        className="font-mono text-[13px]"
                        value={v.script}
                        onChange={(e) => set(i, { script: e.target.value })}
                      />
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-[1fr_220px]">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Texto principal ({v.primaryText.length}/125)</Label>
                        <Input value={v.primaryText} onChange={(e) => set(i, { primaryText: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Titular ({v.headline.length}/40)</Label>
                        <Input value={v.headline} onChange={(e) => set(i, { headline: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {created && (
            <p className="rounded-md bg-[var(--status-done)]/15 p-2 text-sm">
              Creativos creados:{" "}
              {created.map((c) => (
                <Link key={c} href={`/assets/${c}`} className="mr-2 font-medium text-primary hover:underline">
                  {c}
                </Link>
              ))}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={analyzing || creating} onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            {result && !created && (
              <Button disabled={creating || selected === 0} onClick={create}>
                {creating ? "Creando…" : `Crear ${selected} creativo${selected === 1 ? "" : "s"}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
