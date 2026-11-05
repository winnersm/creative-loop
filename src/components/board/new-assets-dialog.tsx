"use client"

import { Copy, Plus, Trash2 } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { FORMAT, MEDIA_TYPE, PRIORITY } from "@/lib/status"
import { createAssets, getVariationSeed, type NewAssetRow } from "@/server/assets"
import type { DimensionOption } from "./cells"
import { useAction } from "./use-asset-actions"

type Row = Required<Pick<NewAssetRow, "format" | "mediaType" | "priority" | "brief" | "script">> & {
  offerId: string
  editorId: string
  deadline: string
  overrideValueId: string
  /** Texto del textarea: una URL por línea. Se trocea al enviar. */
  references: string
}

const blank = (offerId = ""): Row => ({
  offerId,
  format: "VERTICAL",
  mediaType: "VIDEO",
  editorId: "",
  deadline: "",
  priority: "MEDIUM",
  brief: "",
  script: "",
  overrideValueId: "",
  references: "",
})

type Seed = { id: string; code: string; concept: { id: string; code: string; title: string }; row: Row }

/**
 * F-301 · Alta masiva: una fila por creativo.
 * Con `variationOf` (código de un creativo) cada fila es una variación que cuelga de él.
 */
export function NewAssetsDialog({
  concept,
  variationOf,
  onOpenChange,
  editors,
  dimensions,
  offers,
  defaultOfferId = "",
}: {
  concept: { id: string; code: string; title: string } | null
  variationOf?: string | null
  onOpenChange: (open: boolean) => void
  editors: { id: string; name: string }[]
  dimensions: DimensionOption[]
  offers: { id: string; code: string; name: string }[]
  /** Oferta con la que arrancan las filas nuevas (la del filtro del tablero, si hay). */
  defaultOfferId?: string
}) {
  const { exec, pending } = useAction()
  const [rows, setRows] = useState<Row[]>(() => [blank(defaultOfferId)])
  const [seed, setSeed] = useState<Seed | null>(null)
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  // Variaciones: se precarga la fila con los datos del original.
  useEffect(() => {
    if (!variationOf) return
    let alive = true
    void getVariationSeed(variationOf).then((res) => {
      if (!alive || !res.ok) return
      const d = res.data
      const row: Row = {
        ...blank(),
        offerId: d.offerId ?? "",
        format: d.format,
        mediaType: d.mediaType,
        editorId: d.editorId ?? "",
        priority: d.priority,
        brief: `Variación de ${d.code}: `,
        script: d.script,
        references: d.references.join("\n"),
      }
      setSeed({ id: d.id, code: d.code, concept: d.concept, row })
      setRows([row])
    })
    return () => {
      alive = false
    }
  }, [variationOf])

  const target = variationOf ? seed?.concept : concept
  const open = !!concept || !!variationOf

  function close() {
    setRows([blank(defaultOfferId)])
    setSeed(null)
    onOpenChange(false)
  }

  async function submit() {
    if (!target || (variationOf && !seed)) return
    const res = await exec(
      () =>
        createAssets(
          target.id,
          rows.map((r) => ({
            ...r,
            offerId: r.offerId || null,
            editorId: r.editorId || null,
            deadline: r.deadline ? new Date(`${r.deadline}T23:59:00`).toISOString() : null,
            overrideValueId: r.overrideValueId || null,
            references: r.references.split("\n").map((u) => u.trim()).filter(Boolean),
          })),
          seed ? { variationOf: seed.id } : {},
        ),
      (codes) => `Creados: ${codes.join(", ")}`,
    )
    if (res) close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {variationOf ? `Crear variaciones de ${variationOf}` : `Añadir creativos a «${concept?.title ?? ""}»`}
          </DialogTitle>
          <DialogDescription>
            {variationOf
              ? `Cada fila es una variación y una tarea para el editor. Colgarán de ${variationOf} en el tablero. Cambia una sola cosa por variación: elígela en «Variable».`
              : "Cada fila es un creativo y una tarea para el editor. Heredan las etiquetas del concepto; «Variable» es la única dimensión que cambia."}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-1 pb-1 font-normal">Oferta</th>
                <th className="px-1 pb-1 font-normal">Formato</th>
                <th className="px-1 pb-1 font-normal">Tipo</th>
                <th className="px-1 pb-1 font-normal">Editor</th>
                <th className="px-1 pb-1 font-normal">Fecha límite</th>
                <th className="px-1 pb-1 font-normal">Prioridad</th>
                <th className="px-1 pb-1 font-normal">Variable</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                <tr className="align-top">
                  <td className="p-1">
                    <NativeSelect className="w-44" aria-label="Oferta" value={r.offerId} onChange={(e) => set(i, { offerId: e.target.value })}>
                      <option value="">Sin oferta</option>
                      {offers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code} · {o.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <NativeSelect className="w-20" value={r.format} onChange={(e) => set(i, { format: e.target.value as Row["format"] })}>
                      {Object.entries(FORMAT).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <NativeSelect className="w-24" value={r.mediaType} onChange={(e) => set(i, { mediaType: e.target.value as Row["mediaType"] })}>
                      {Object.entries(MEDIA_TYPE).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <NativeSelect className="w-36" value={r.editorId} onChange={(e) => set(i, { editorId: e.target.value })}>
                      <option value="">Sin asignar</option>
                      {editors.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <Input type="date" className="w-36" value={r.deadline} onChange={(e) => set(i, { deadline: e.target.value })} />
                  </td>
                  <td className="p-1">
                    <NativeSelect className="w-24" value={r.priority} onChange={(e) => set(i, { priority: e.target.value as Row["priority"] })}>
                      {Object.entries(PRIORITY).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <NativeSelect className="w-44" value={r.overrideValueId} onChange={(e) => set(i, { overrideValueId: e.target.value })}>
                      <option value="">— (igual que el concepto)</option>
                      {dimensions.map((d) => (
                        <optgroup key={d.id} label={d.label}>
                          {d.values
                            .filter((v) => v.active)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {d.label}: {v.label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="p-1 whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" title="Duplicar fila" onClick={() => setRows([...rows.slice(0, i + 1), { ...r }, ...rows.slice(i + 1)])}>
                      <Copy />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Quitar fila"
                      disabled={rows.length === 1}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
                <tr className="border-b last:border-0">
                  <td className="px-1 pb-3" colSpan={7}>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Indicaciones para el editor
                        <textarea
                          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          rows={3}
                          value={r.brief}
                          onChange={(e) => set(i, { brief: e.target.value })}
                          placeholder="Qué debe hacer el creativo…"
                        />
                      </label>
                      {r.mediaType === "VIDEO" && (
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          Guion del video
                          <textarea
                            className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            rows={3}
                            value={r.script}
                            onChange={(e) => set(i, { script: e.target.value })}
                            placeholder={"0–3 s (gancho): …\n3–10 s: …"}
                          />
                        </label>
                      )}
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Referencias de este creativo (una URL por línea)
                        <textarea
                          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          rows={3}
                          value={r.references}
                          onChange={(e) => set(i, { references: e.target.value })}
                          placeholder="https://…"
                        />
                      </label>
                    </div>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, seed ? { ...seed.row } : blank(rows.at(-1)?.offerId ?? defaultOfferId)])}>
          <Plus /> Añadir fila
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || (!!variationOf && !seed)}>
            {variationOf
              ? `Crear ${rows.length} variaci${rows.length === 1 ? "ón" : "ones"}`
              : `Crear ${rows.length} creativo${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
