"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { LabelChip } from "@/components/board/cells"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { LABEL_COLORS, type LabelColor } from "@/lib/status"
import { createAssetLabel, updateAssetLabel } from "@/server/settings"

type Label = { id: string; name: string; color: string; active: boolean; _count: { assets: number } }

/** Etiquetas de equipo de la columna «Etiquetas» del tablero. Lista cerrada: solo el propietario la cambia. */
export function AssetLabelsSettings({ labels }: { labels: Label[] }) {
  const { exec, pending } = useAction()
  const [name, setName] = useState("")
  const [color, setColor] = useState<LabelColor>("blue")
  return (
    <div className="max-w-xl rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <div className="font-semibold">Etiquetas de equipo</div>
        <p className="text-xs text-muted-foreground">
          Columna «Etiquetas» del tablero: UGC, urgente, para test… Una etiqueta en uso no se borra: se desactiva.
        </p>
      </div>
      <ul className="divide-y">
        {labels.map((l) => (
          <li key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <LabelChip label={l} className={l.active ? "" : "opacity-50 line-through"} />
            <NativeSelect
              aria-label={`Color de ${l.name}`}
              className="w-32"
              value={l.color}
              disabled={pending}
              onChange={(e) => void exec(() => updateAssetLabel(l.id, { color: e.target.value as LabelColor }))}
            >
              {Object.entries(LABEL_COLORS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
            <span className="ml-auto text-xs text-muted-foreground">{l._count.assets ? `${l._count.assets} creativo(s)` : ""}</span>
            <Switch
              aria-label={l.active ? `Desactivar ${l.name}` : `Activar ${l.name}`}
              checked={l.active}
              disabled={pending}
              onCheckedChange={(active) => void exec(() => updateAssetLabel(l.id, { active }))}
            />
          </li>
        ))}
        {!labels.length && <li className="px-3 py-2 text-sm text-muted-foreground">Todavía no hay etiquetas.</li>}
      </ul>
      <form
        className="flex gap-2 border-t p-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await exec(() => createAssetLabel({ name, color }), "Etiqueta creada")
          if (ok !== null) setName("")
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta…" maxLength={30} aria-label="Nombre de la etiqueta" />
        <NativeSelect aria-label="Color" className="w-32" value={color} onChange={(e) => setColor(e.target.value as LabelColor)}>
          {Object.entries(LABEL_COLORS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending || name.trim().length < 2}>
          <Plus /> Añadir
        </Button>
      </form>
    </div>
  )
}
