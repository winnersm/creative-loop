"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { moveAsset } from "@/server/assets"
import { useAction } from "./use-asset-actions"

/**
 * Pasar un creativo (con sus variaciones) a otro concepto.
 * Recibe un código nuevo del concepto de destino; el servidor valida que nada esté lanzado.
 */
export function MoveAssetDialog({
  item,
  concepts,
  onClose,
}: {
  item: { asset: { id: string; code: string; variations: { count: number } | null }; conceptId: string } | null
  concepts: { id: string; code: string; title: string }[]
  onClose: () => void
}) {
  const { exec, pending } = useAction()
  const options = concepts.filter((c) => c.id !== item?.conceptId)
  const [target, setTarget] = useState("")
  const n = item?.asset.variations?.count ?? 0

  async function submit() {
    if (!item || !target) return
    const res = await exec(
      () => moveAsset(item.asset.id, target),
      (moved) => `Movido: ${moved.map((m) => `${m.from} → ${m.to}`).join(", ")}`,
    )
    if (res) {
      setTarget("")
      onClose()
    }
  }

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (!o) {
          setTarget("")
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {item?.asset.code} a otro concepto</DialogTitle>
          <DialogDescription>
            Recibe un código nuevo del concepto de destino (el código lleva el concepto dentro).
            {n > 0 && ` Sus ${n} variaci${n === 1 ? "ón se mueve" : "ones se mueven"} con él.`} Las versiones, comentarios e historial se conservan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="move-target">Concepto de destino</Label>
          <NativeSelect id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Elige un concepto…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !target}>
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
