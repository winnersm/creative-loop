"use client"

import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeMyPassword } from "@/server/settings"

/** Cambiar la contraseña propia. Disponible para cualquier rol. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { exec, pending } = useAction()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")

  const tooShort = next.length > 0 && next.length < 8
  const mismatch = repeat.length > 0 && next !== repeat
  const ready = current.length > 0 && next.length >= 8 && next === repeat

  function close() {
    setCurrent("")
    setNext("")
    setRepeat("")
    onOpenChange(false)
  }

  async function submit() {
    const ok = await exec(() => changeMyPassword(current, next), "Contraseña cambiada")
    if (ok !== null) close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>Mínimo 8 caracteres. Si no recuerdas la actual, pídele al propietario que te la reinicie.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input id="actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <Input id="nueva" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            {tooShort && <p className="text-xs text-destructive">Necesita al menos 8 caracteres.</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="repetir">Repite la contraseña nueva</Label>
            <Input id="repetir" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            {mismatch && <p className="text-xs text-destructive">Las dos no coinciden.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={pending || !ready} onClick={submit}>
            Cambiar contraseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
