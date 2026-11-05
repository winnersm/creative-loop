"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { createConcept, updateConcept } from "@/server/concepts"
import type { Lookups } from "@/server/queries"
import { useAction } from "./use-asset-actions"

export function NewConceptDialog({
  open,
  onOpenChange,
  lookups,
  onCreated,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lookups: Pick<Lookups, "dimensions">
  onCreated?: (concept: { id: string; code: string; title: string }) => void
  /** Si viene, el diálogo edita ese concepto en lugar de crear uno. */
  editing?: {
    id: string
    code: string
    title: string
    hypothesis: string
    references: string[]
    tags: { dimensionId: string; valueId: string }[]
  } | null
}) {
  const { exec, pending } = useAction()
  const [title, setTitle] = useState(editing?.title ?? "")
  const [hypothesis, setHypothesis] = useState(editing?.hypothesis ?? "")
  const [refs, setRefs] = useState(editing?.references.join("\n") ?? "")
  const [tags, setTags] = useState<Record<string, string>>(
    Object.fromEntries((editing?.tags ?? []).map((t) => [t.dimensionId, t.valueId])),
  )

  async function submit() {
    if (editing) {
      const ok = await exec(
        () =>
          updateConcept(editing.id, {
            title,
            hypothesis,
            references: refs.split("\n").map((r) => r.trim()).filter(Boolean),
            tags,
          }),
        "Concepto actualizado",
      )
      if (ok !== null) onOpenChange(false)
      return
    }
    const res = await exec(
      () =>
        createConcept({
          title,
          hypothesis,
          references: refs.split("\n").map((r) => r.trim()).filter(Boolean),
          tags,
        }),
      () => `Concepto «${title}» creado`,
    )
    if (res) {
      const created = { id: res.id, code: res.code, title }
      setTitle("")
      setHypothesis("")
      setRefs("")
      setTags({})
      onOpenChange(false)
      onCreated?.(created)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar concepto «${editing.title}»` : "Nuevo concepto"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Los creativos heredan las etiquetas nuevas, salvo la variable que prueba cada uno."
              : "Una hipótesis creativa: ángulo + mensaje central. La oferta se elige en cada creativo."}
          </DialogDescription>
        </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descubrimiento accidental" />
            </div>
            <div className="grid gap-1.5">
              <Label>Hipótesis</Label>
              <Textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                rows={2}
                placeholder="Si abrimos con X, sube Y porque Z."
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Etiquetas por defecto <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                Se pueden rellenar más tarde. Cuantas más pongas, mejor compara el análisis de ganadores.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {lookups.dimensions.map((d) => (
                  <div key={d.id} className="grid gap-1">
                    <span className="text-xs text-muted-foreground">{d.label}</span>
                    <NativeSelect aria-label={d.label} value={tags[d.id] ?? ""} onChange={(e) => setTags({ ...tags, [d.id]: e.target.value })}>
                      <option value="">Sin definir</option>
                      {d.values
                        .filter((v) => v.active)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                    </NativeSelect>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Referencias (una URL por línea)</Label>
              <Textarea value={refs} onChange={(e) => setRefs(e.target.value)} rows={2} placeholder="https://…" />
            </div>
          </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {editing ? "Guardar cambios" : "Crear concepto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
