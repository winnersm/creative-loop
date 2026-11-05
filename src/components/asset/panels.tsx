"use client"

import { AlertTriangle, CheckCircle2, Languages, Loader2, Sparkles, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PerformancePill } from "@/components/board/cells"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { Metrics } from "@/lib/metrics"
import { bytes, dateTime, decimal, int, money, pct, timecode } from "@/lib/format"
import { howToFix } from "@/lib/qa-rules"
import { FORMAT, PERFORMANCE_STATUS, PRODUCTION_STATUS, statusEventText } from "@/lib/status"
import { overridePerformance, updateAsset } from "@/server/assets"
import type { AssetDetail } from "@/server/queries"
import { proposeCopy, translateAssetScript } from "@/server/ai"
import type { CopySuggestion } from "@/lib/ai"
import { cn } from "@/lib/utils"

type Asset = AssetDetail["asset"]
type Version = Asset["versions"][number]

export function QaPanel({ version, asset }: { version: Version; asset: Asset }) {
  if (version.status === "UPLOADING") return <p className="p-4 text-sm text-muted-foreground">Subida en curso…</p>
  if (version.status === "PROCESSING")
    return <p className="p-4 text-sm text-muted-foreground">Procesando (30–90 s). Esta página se actualiza sola.</p>
  if (version.status === "FAILED")
    return <p className="p-4 text-sm text-destructive">El procesamiento falló: {version.processingError}</p>
  const blocking = version.qaChecks.filter((c) => c.severity === "BLOCKING" && c.result === "FAIL").length
  const warnings = version.qaChecks.filter((c) => c.severity === "WARNING" && c.result === "FAIL").length
  const passed = version.qaChecks.filter((c) => c.result === "PASS").length
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 text-sm">
        {blocking ? (
          <span className="font-medium text-destructive">{blocking} bloqueante(s)</span>
        ) : (
          <span className="font-medium text-[var(--status-done)]">
            ✓ {passed}/{version.qaChecks.length}
          </span>
        )}
        {warnings > 0 && <span className="text-[var(--status-working)]">⚠ {warnings} aviso(s)</span>}
      </div>
      {blocking > 0 && (
        <p className="mb-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
          Esta versión no se puede enviar a revisión. Arregla lo marcado en rojo y sube una versión nueva.
        </p>
      )}
      <ul className="space-y-1.5">
        {version.qaChecks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            {c.result === "PASS" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-done)]" />
            ) : c.severity === "BLOCKING" ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-working)]" />
            )}
            <div>
              <div className="font-medium">
                {c.label}
                {c.result === "FAIL" && c.severity === "BLOCKING" && (
                  <span className="ml-1 text-[11px] font-normal text-destructive">bloqueante</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{c.detail}</div>
              {c.result === "FAIL" && (() => {
                const fix = howToFix(c.key, asset.format, asset.mediaType)
                return fix ? <div className="mt-0.5 text-xs font-medium">Qué hacer: {fix}</div> : null
              })()}
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-1 border-t pt-3 text-xs text-muted-foreground">
        <dt>Archivo</dt>
        <dd className="truncate text-foreground">{version.originalName}</dd>
        <dt>Peso</dt>
        <dd className="text-foreground">{bytes(version.sizeBytes)}</dd>
        {version.width && (
          <>
            <dt>Resolución</dt>
            <dd className="text-foreground">
              {version.width}×{version.height}
            </dd>
          </>
        )}
        {version.durationMs != null && (
          <>
            <dt>Duración</dt>
            <dd className="text-foreground">{timecode(version.durationMs)}</dd>
            <dt>FPS · códec</dt>
            <dd className="text-foreground">
              {decimal(version.fps)} · {version.videoCodec} / {version.audioCodec ?? "sin audio"}
            </dd>
          </>
        )}
        <dt>Subido por</dt>
        <dd className="text-foreground">
          {version.uploadedBy.name} · {dateTime(version.createdAt)}
        </dd>
      </dl>
    </div>
  )
}

export function BriefPanel({
  asset,
  tags,
  editable,
}: {
  asset: Asset
  tags: AssetDetail["tags"]
  editable: boolean
}) {
  const { exec, pending } = useAction()
  const [form, setForm] = useState({
    brief: asset.brief,
    script: asset.script,
    scriptTranslation: asset.scriptTranslation,
    primaryText: asset.primaryText,
    headline: asset.headline,
    cta: asset.cta,
  })
  const [scriptView, setScriptView] = useState<"original" | "translation">("original")
  // Las referencias se editan como texto (una URL por línea) y se guardan como lista.
  const [refs, setRefs] = useState(asset.references.join("\n"))
  const refsList = refs.split("\n").map((r) => r.trim()).filter(Boolean)
  const dirty =
    form.brief !== asset.brief ||
    form.script !== asset.script ||
    form.scriptTranslation !== asset.scriptTranslation ||
    form.primaryText !== asset.primaryText ||
    form.headline !== asset.headline ||
    form.cta !== asset.cta ||
    refsList.join("\n") !== asset.references.join("\n")
  const field = (key: keyof typeof form, label: string, rows = 2) => (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editable ? (
        <Textarea rows={rows} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{asset[key] || "—"}</p>
      )}
    </div>
  )
  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="text-xs text-muted-foreground">Hipótesis del concepto</div>
        <p className="text-sm">{asset.concept.hypothesis}</p>
      </div>
      {editable && (
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Formato del creativo</Label>
          <NativeSelect
            className="w-40"
            value={asset.format}
            disabled={pending}
            onChange={(e) =>
              void exec(
                () => updateAsset(asset.id, { format: e.target.value as typeof asset.format }),
                "Formato cambiado. El control técnico de la última versión se ha recalculado.",
              )
            }
          >
            {Object.entries(FORMAT).map(([k, f]) => (
              <option key={k} value={k}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {field("brief", "Indicaciones para el editor", 3)}
      {asset.mediaType === "VIDEO" && (
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Guion del video</Label>
            {/* Original por defecto; la traducción en su propia pestaña para no duplicar el alto. */}
            <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs" role="tablist" aria-label="Idioma del guion">
              {(["original", "translation"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={scriptView === v}
                  onClick={() => setScriptView(v)}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground",
                    scriptView === v && "bg-background font-medium text-foreground shadow-xs",
                  )}
                >
                  {v === "original" ? "Original" : translationTabLabel(asset)}
                  {v === "translation" && translationStale(asset) && (
                    <span className="size-1.5 rounded-full" style={{ background: "var(--status-working)" }} title="Desactualizada" />
                  )}
                </button>
              ))}
            </div>
          </div>
          {scriptView === "original" ? (
            <>
              {editable ? (
                <Textarea
                  rows={10}
                  value={form.script}
                  onChange={(e) => setForm({ ...form, script: e.target.value })}
                  placeholder={"0–3 s (gancho): …\n3–10 s: …\nVoz: …\nTexto en pantalla: …"}
                  className="font-mono text-[13px] leading-relaxed"
                />
              ) : (
                <p className="rounded-md bg-muted/50 p-2 font-mono text-[13px] whitespace-pre-wrap">{asset.script || "Sin guion."}</p>
              )}
              <span className="text-right text-[11px] text-muted-foreground">{form.script.length} caracteres</span>
            </>
          ) : (
            <ScriptTranslation
              asset={asset}
              editable={editable}
              value={form.scriptTranslation}
              onChange={(v) => setForm((f) => ({ ...f, scriptTranslation: v }))}
              scriptDirty={form.script !== asset.script}
            />
          )}
        </div>
      )}
      {field("primaryText", "Texto principal (copy)", 3)}
      {editable && (
        <CopyAssistant
          assetId={asset.id}
          onUse={(o) => setForm((f) => ({ ...f, primaryText: o.primaryText, headline: o.headline }))}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        {field("headline", "Titular", 1)}
        {field("cta", "Botón de acción", 1)}
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Referencias de este creativo (una URL por línea)</Label>
        {editable ? (
          <Textarea rows={2} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="https://…" />
        ) : asset.references.length > 0 ? (
          <ul className="space-y-0.5 text-sm">
            {asset.references.map((r) => (
              <li key={r}>
                <a href={r} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
                  {r}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">—</p>
        )}
      </div>
      {editable && dirty && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => void exec(() => updateAsset(asset.id, { ...form, references: refsList }), "Guardado")}
        >
          Guardar cambios
        </Button>
      )}
      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">Etiquetas (heredadas del concepto)</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.key}
              className={t.overridden ? "rounded-full bg-primary px-2 py-0.5 text-xs text-white" : "rounded-full bg-secondary px-2 py-0.5 text-xs"}
              title={t.overridden ? "Variable que prueba este creativo" : undefined}
            >
              {t.dimension}: {t.label}
            </span>
          ))}
        </div>
      </div>
      {/* Solo las del concepto: las del creativo ya están arriba, en su campo. */}
      {asset.concept.references.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Referencias del concepto</div>
          <ul className="space-y-0.5 text-sm">
            {asset.concept.references.map((r) => (
              <li key={r}>
                <a href={r} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
                  {r}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(asset.iteratedFrom || asset.iterations.length > 0) && (
        <div className="text-sm">
          {asset.iteratedFrom && (
            <p>
              Variación de <a className="text-primary hover:underline" href={`/assets/${asset.iteratedFrom.code}`}>{asset.iteratedFrom.code}</a>
            </p>
          )}
          {asset.iterations.length > 0 && (
            <p>
              Variaciones:{" "}
              {asset.iterations.map((i) => (
                <a key={i.code} className="mr-2 text-primary hover:underline" href={`/assets/${i.code}`}>
                  {i.code}
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const LANG_NAME: Record<string, string> = { es: "español", en: "inglés" }
const LANG_TAB: Record<string, string> = { es: "Español", en: "Inglés" }

const translationTabLabel = (a: Asset) => (a.scriptTranslation.trim() ? (LANG_TAB[a.scriptTranslationLang] ?? "Traducción") : "Traducción")
const translationStale = (a: Asset) => !!a.scriptTranslation.trim() && a.scriptTranslationOf !== a.script

/**
 * Guion en el otro idioma (inglés ↔ español). Cualquiera que vea el creativo puede
 * pedir la traducción; quien edita las indicaciones puede además corregirla a mano.
 */
function ScriptTranslation({
  asset,
  editable,
  value,
  onChange,
  scriptDirty,
}: {
  asset: Asset
  editable: boolean
  value: string
  onChange: (v: string) => void
  scriptDirty: boolean
}) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const has = !!asset.scriptTranslation.trim()
  const stale = translationStale(asset)

  function translate() {
    start(async () => {
      const res = await translateAssetScript(asset.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onChange(res.data.text)
      toast.success(`Guion traducido al ${LANG_NAME[res.data.lang]}`)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {stale && (
          <span className="rounded px-1.5 text-[11px]" style={{ background: "var(--status-working)", color: "var(--status-working-fg)" }}>
            El guion cambió después de traducirlo
          </span>
        )}
        <Button
          size="xs"
          variant={has && !stale ? "ghost" : "outline"}
          className="ml-auto"
          disabled={pending || !asset.script.trim() || scriptDirty}
          title={scriptDirty ? "Guarda el guion antes de traducirlo" : !asset.script.trim() ? "No hay guion" : undefined}
          onClick={translate}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Languages />}
          {has ? "Volver a traducir" : "Traducir con IA"}
        </Button>
      </div>
      {!has && !pending && (
        <p className="text-xs text-muted-foreground">
          Si el guion está en inglés se traduce al español, y si está en español, al inglés. La traducción se guarda junto al guion.
        </p>
      )}
      {pending && <p className="text-xs text-muted-foreground">Traduciendo…</p>}
      {has &&
        (editable ? (
          <Textarea rows={10} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px] leading-relaxed" />
        ) : (
          <p className="rounded-md bg-muted/50 p-2 font-mono text-[13px] whitespace-pre-wrap">{asset.scriptTranslation}</p>
        ))}
    </div>
  )
}

/** Propuestas de copy con IA. Rellena el formulario; no guarda hasta pulsar «Guardar indicaciones». */
function CopyAssistant({ assetId, onUse }: { assetId: string; onUse: (o: CopySuggestion) => void }) {
  const [pending, start] = useTransition()
  const [options, setOptions] = useState<CopySuggestion[] | null>(null)
  const [used, setUsed] = useState<number | null>(null)

  function propose() {
    start(async () => {
      const res = await proposeCopy(assetId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOptions(res.data)
      setUsed(null)
    })
  }

  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--status-testing)]" />
        <span className="text-sm font-medium">Copy con IA</span>
        <Button size="xs" variant="outline" className="ml-auto" disabled={pending} onClick={propose}>
          {pending ? "Pensando… (hasta 30 s)" : options ? "Otras 3 opciones" : "Proponer 3 opciones"}
        </Button>
      </div>
      {!options && !pending && (
        <p className="mt-1 text-xs text-muted-foreground">
          Usa la hipótesis, las etiquetas y las indicaciones. Escribe en el idioma de la oferta.
        </p>
      )}
      {options && (
        <ul className="mt-2 space-y-2">
          {options.map((o, i) => (
            <li key={i} className={cn("rounded-md border p-2 text-sm", used === i && "border-primary bg-accent/40")}>
              <p className="whitespace-pre-wrap">{o.primaryText}</p>
              <p className="mt-1 font-semibold">{o.headline}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 text-xs text-muted-foreground">
                  {o.rationale} · {o.primaryText.length}/125 · {o.headline.length}/40
                </span>
                <Button
                  size="xs"
                  variant={used === i ? "default" : "outline"}
                  onClick={() => {
                    onUse(o)
                    setUsed(i)
                  }}
                >
                  {used === i ? "Usada" : "Usar esta"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {used !== null && <p className="mt-2 text-xs text-muted-foreground">Revisa el texto y pulsa «Guardar cambios».</p>}
    </div>
  )
}

export function HistoryPanel({ asset }: { asset: Asset }) {
  if (!asset.statusEvents.length)
    return <p className="p-4 text-sm text-muted-foreground">Todavía no hay movimientos.</p>
  return (
    <ol className="p-3">
      {asset.statusEvents.map((e, i) => {
        const last = i === asset.statusEvents.length - 1
        const color = PRODUCTION_STATUS[e.to].color
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Línea vertical que une los puntos; no se dibuja bajo el último. */}
            {!last && <span className="absolute top-4 bottom-0 left-[5px] w-px bg-border" aria-hidden />}
            <span
              className="mt-1 size-2.5 shrink-0 rounded-full ring-3 ring-background"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-medium">{e.user?.name ?? "Sistema"}</span>{" "}
                {statusEventText(e.from, e.to)}
              </p>
              <p className="text-xs text-muted-foreground">{dateTime(e.createdAt)}</p>
              {e.reason && (
                <p className="mt-1 border-l-2 pl-2 text-sm text-muted-foreground">{e.reason}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function PerformancePanel({
  asset,
  metrics,
  canOverride,
}: {
  asset: Asset
  metrics: Metrics | null
  canOverride: boolean
}) {
  const { exec, pending } = useAction()
  const [status, setStatus] = useState(asset.performanceStatus)
  const [reason, setReason] = useState("")
  const offer = asset.offer
  const stats: [string, string][] = metrics
    ? [
        ["Gasto", money(metrics.spendCents)],
        ["Conversiones", decimal(metrics.conversions, 0)],
        ["CPA", money(metrics.cpaCents)],
        ["CPA objetivo", money(offer?.targetCpaCents)],
        ["Ingresos", money(metrics.revenueCents)],
        ["ROAS", metrics.roas != null ? `${decimal(metrics.roas)}x` : "—"],
        ["Enganche (3 s)", pct(metrics.hookRate)],
        ["Retención", pct(metrics.holdRate)],
        ["CTR", pct(metrics.ctr, 2)],
        ["Impresiones", int(metrics.impressions)],
      ]
    : []
  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2">
        <PerformancePill status={asset.performanceStatus} />
        {asset.testingSince && <span className="text-xs text-muted-foreground">en testing desde {dateTime(asset.testingSince)}</span>}
      </div>
      {metrics ? (
        <dl className="grid grid-cols-2 gap-2">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-md border p-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-base font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos de Meta todavía.</p>
      )}
      <div>
        <h4 className="mb-1 text-sm font-semibold">Anuncios ({asset.deployments.length})</h4>
        {asset.deployments.map((d) => (
          <div key={d.id} className="border-b py-1.5 text-xs last:border-0">
            <div className="truncate font-medium">{d.ad.name}</div>
            <div className="text-muted-foreground">
              ad {d.adId} · {d.version.code} · {d.source === "TOKEN" ? "por código de seguimiento" : "asignado a mano"}
            </div>
          </div>
        ))}
      </div>
      {asset.aiAnalysis != null && (
        <div className="rounded-md border bg-accent/30 p-2">
          <h4 className="mb-1 text-sm font-semibold">Último análisis de IA</h4>
          <p className="text-sm">{(asset.aiAnalysis as { summary?: string }).summary}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {((asset.aiAnalysis as { keyFactors?: { factor: string }[] }).keyFactors ?? []).map((f, i) => (
              <li key={i}>{f.factor}</li>
            ))}
          </ul>
          {asset.aiAnalyzedAt && <p className="mt-1 text-[11px] text-muted-foreground">{dateTime(asset.aiAnalyzedAt)}</p>}
        </div>
      )}
      {asset.evaluations.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Evaluaciones del motor de ganadores</h4>
          {asset.evaluations.map((e) => (
            <div key={e.id} className="border-b py-1.5 text-xs last:border-0">
              <span className="font-medium">{PERFORMANCE_STATUS[e.result].label}</span> · {dateTime(e.createdAt)}
              <div className="text-muted-foreground">{e.reason}</div>
            </div>
          ))}
        </div>
      )}
      {canOverride && (
        <div className="space-y-2 rounded-md border p-2">
          <h4 className="text-sm font-semibold">Forzar estado (propietario)</h4>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {Object.entries(PERFORMANCE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (queda registrado)" />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reason.trim() || status === asset.performanceStatus}
            onClick={async () => {
              const ok = await exec(() => overridePerformance(asset.id, status, reason), "Estado forzado")
              if (ok !== null) setReason("")
            }}
          >
            Forzar
          </Button>
        </div>
      )}
    </div>
  )
}
