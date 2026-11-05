"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { addTagValue, setTagValueActive } from "@/server/settings"

type Dimension = {
  id: string
  key: string
  label: string
  values: { id: string; value: string; label: string; active: boolean; _count: { conceptTags: number; overrides: number } }[]
}

/** F-103 · Vocabulario cerrado. Un valor en uso no se borra: se desactiva. */
export function TagsSettings({ dimensions }: { dimensions: Dimension[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {dimensions.map((d) => (
        <DimensionCard key={d.id} d={d} />
      ))}
    </div>
  )
}

function DimensionCard({ d }: { d: Dimension }) {
  const { exec, pending } = useAction()
  const [label, setLabel] = useState("")
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <div className="font-semibold">{d.label}</div>
        <div className="font-mono text-xs text-muted-foreground">{d.key}</div>
      </div>
      <ul className="divide-y">
        {d.values.map((v) => {
          const uses = v._count.conceptTags + v._count.overrides
          return (
            <li key={v.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className={v.active ? "" : "text-muted-foreground line-through"}>{v.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{v.value}</span>
              <span className="ml-auto text-xs text-muted-foreground">{uses ? `${uses} uso(s)` : ""}</span>
              <Switch
                checked={v.active}
                disabled={pending}
                onCheckedChange={(checked) => void exec(() => setTagValueActive(v.id, checked))}
              />
            </li>
          )
        })}
      </ul>
      <form
        className="flex gap-2 border-t p-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await exec(() => addTagValue(d.id, label), "Valor añadido")
          if (ok !== null) setLabel("")
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nuevo valor" />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !label.trim()}>
          <Plus />
        </Button>
      </form>
    </div>
  )
}
