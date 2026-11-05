"use client"

import { ExternalLink, GitBranch } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { money, pct, shortDate } from "@/lib/format"
import { FORMAT, MEDIA_TYPE, PRIORITY } from "@/lib/status"
import type { BoardAsset, BoardConcept } from "@/server/queries"
import type { BoardContext } from "./board-group"
import { PerformancePill, StatusCell } from "./cells"
import { UserAvatar } from "./user-avatar"

/** Panel lateral del creativo. */
export function AssetDrawer({
  item,
  onClose,
  ctx,
}: {
  item: { asset: BoardAsset; concept: BoardConcept } | null
  onClose: () => void
  ctx: BoardContext
}) {
  const a = item?.asset
  const c = item?.concept
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        {a && c && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="text-xl">{a.code}</SheetTitle>
              <SheetDescription>
                {c.title} · {a.offer ? `${a.offer.code} · ${a.offer.name}` : "sin oferta"}
              </SheetDescription>
              <div className="mt-2 flex gap-2">
                <Button nativeButton={false} render={<Link href={`/assets/${a.code}`} />}>
                  <ExternalLink /> Abrir creativo
                </Button>
                {ctx.canEdit && (
                  <Button variant="outline" onClick={() => ctx.onAddVariations(a)}>
                    <GitBranch /> Crear variaciones
                  </Button>
                )}
              </div>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {a.latestVersion?.hasThumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/versions/${a.latestVersion.id}/thumb`}
                  alt=""
                  className="mx-auto max-h-56 rounded-md bg-muted object-contain"
                />
              )}
              <dl className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="h-8 w-44 overflow-hidden rounded">
                  <StatusCell assetId={a.id} status={a.productionStatus} role={ctx.role} isAssignee={a.editor?.id === ctx.userId} />
                </dd>
                <dt className="text-muted-foreground">Rendimiento</dt>
                <dd>
                  <PerformancePill status={a.performanceStatus} />
                </dd>
                <dt className="text-muted-foreground">Editor</dt>
                <dd className="flex items-center gap-2">
                  {a.editor ? (
                    <>
                      <UserAvatar name={a.editor.name} size={22} /> {a.editor.name}
                    </>
                  ) : (
                    "Sin asignar"
                  )}
                </dd>
                <dt className="text-muted-foreground">Creativo</dt>
                <dd>
                  {MEDIA_TYPE[a.mediaType]} · {FORMAT[a.format].label}
                </dd>
                <dt className="text-muted-foreground">Fecha límite</dt>
                <dd>{shortDate(a.deadline)}</dd>
                <dt className="text-muted-foreground">Prioridad</dt>
                <dd>{PRIORITY[a.priority].label}</dd>
                <dt className="text-muted-foreground">Variable</dt>
                <dd>{a.override ? `${a.override.dimension}: ${a.override.label}` : "—"}</dd>
                <dt className="text-muted-foreground">Última versión</dt>
                <dd>
                  {a.latestVersion
                    ? `V${a.latestVersion.number} · ${a.latestVersion.openComments} comentario(s) abierto(s)`
                    : "Sin versiones"}
                </dd>
                {ctx.moneyVisible && a.metrics && (
                  <>
                    <dt className="text-muted-foreground">Gasto / CPA</dt>
                    <dd>
                      {money(a.metrics.spendCents)} · {money(a.metrics.cpaCents)} · {a.metrics.conversions} conv.
                    </dd>
                    <dt className="text-muted-foreground">Enganche (3 s)</dt>
                    <dd>{pct(a.metrics.hookRate)}</dd>
                  </>
                )}
              </dl>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Hipótesis del concepto</h3>
                <p className="text-sm text-muted-foreground">{c.hypothesis}</p>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">Indicaciones</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.brief || "Sin indicaciones."}</p>
              </div>
              <div>
                <h3 className="mb-1.5 text-sm font-semibold">Etiquetas</h3>
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span key={t.dimensionKey} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {t.dimension}: {t.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
