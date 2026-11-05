"use client"

import { Check, Copy, Download, Rocket } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { markLaunched } from "@/server/assets"

export type LaunchData = {
  assetId: string
  assetCode: string
  versionId: string
  versionCode: string
  token: string
  adName: string
  primaryText: string
  headline: string
  cta: string
  markedLaunchedAt: string | null
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2">
        <div className={`min-h-8 flex-1 rounded-md border bg-muted/50 px-2.5 py-1.5 text-sm break-all whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>
          {value || "—"}
        </div>
        <Button
          size="icon-sm"
          variant="outline"
          disabled={!value}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success(`${label} copiado`)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}

/** F-703 · Paquete de lanzamiento: todo lo necesario para lanzar a mano en Meta. */
export function LaunchPackage({ data, trigger }: { data: LaunchData; trigger?: React.ReactElement }) {
  const { exec, pending } = useAction()
  return (
    <Dialog>
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <Rocket /> Preparar para lanzar
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Paquete de lanzamiento · {data.versionCode}</DialogTitle>
          <DialogDescription>
            Lanza el anuncio a mano en Meta con este nombre. La sincronización detectará el código y lo vinculará sola.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button variant="outline" className="w-fit" nativeButton={false} render={<a href={`/api/versions/${data.versionId}/download`} />}>
            <Download /> Descargar archivo aprobado
          </Button>
          <CopyRow label="Nombre del anuncio" value={data.adName} mono />
          <CopyRow label="Código de seguimiento" value={data.token} mono />
          <CopyRow label="Texto principal" value={data.primaryText} />
          <div className="grid grid-cols-2 gap-3">
            <CopyRow label="Titular" value={data.headline} />
            <CopyRow label="Botón de acción" value={data.cta} />
          </div>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={pending}
              checked={!!data.markedLaunchedAt}
              onChange={(e) => void exec(() => markLaunched(data.assetId, e.target.checked), e.target.checked ? "Marcado como lanzado" : undefined)}
            />
            Ya lo he lanzado (opcional; la sincronización lo confirma)
          </label>
        </div>
      </DialogContent>
    </Dialog>
  )
}
