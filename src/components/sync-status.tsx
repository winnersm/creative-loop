"use client"

import { RefreshCw, Trophy } from "lucide-react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { forceMetaSync, forceWinnerEngine } from "@/server/meta"

type Run = { id: string; kind: string; status: string; startedAt: string; error: string | null; stats: Record<string, unknown> }

/** F-806 · Estado de la sincronización con botón para forzarla (propietario). */
export function SyncStatus({ runs, canForce }: { runs: Run[]; canForce: boolean }) {
  const { exec, pending } = useAction()
  const lastSync = runs.find((r) => r.kind === "meta-sync")
  const dot = !lastSync ? "bg-muted-foreground" : lastSync.status === "SUCCESS" ? "bg-[var(--status-done)]" : lastSync.status === "FAILED" ? "bg-destructive" : "bg-[var(--status-working)]"
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <span className={cn("size-2 rounded-full", dot)} />
          {lastSync ? `Sincronizado ${timeAgo(lastSync.startedAt)}` : "Sin sincronizar todavía"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          <div className="mb-2 text-sm font-semibold">Últimas ejecuciones</div>
          {!runs.length && <p className="text-sm text-muted-foreground">Nada todavía.</p>}
          <ul className="space-y-2 text-xs">
            {runs.map((r) => (
              <li key={r.id} className="border-b pb-2 last:border-0">
                <div className="flex justify-between">
                  <span className="font-medium">{r.kind}</span>
                  <span className={r.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}>
                    {r.status.toLowerCase()} · {timeAgo(r.startedAt)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {Object.entries(r.stats)
                    .filter(([, v]) => typeof v === "number")
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
                {r.error && <div className="mt-0.5 text-destructive">{r.error}</div>}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {canForce && (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void exec(() => forceMetaSync(), "Sincronización en cola")}>
            <RefreshCw /> Sincronizar ahora
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void exec(() => forceWinnerEngine(), "Evaluación encolada")}>
            <Trophy /> Evaluar ganadores
          </Button>
        </>
      )}
    </div>
  )
}
