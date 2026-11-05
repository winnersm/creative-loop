"use client"

import { Archive, ChevronDown, Rocket, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { type LaunchData, LaunchPackage } from "@/components/asset/launch-package"
import { PerformancePill } from "@/components/board/cells"
import { askConfirm } from "@/components/board/reason-dialog"
import { useAction, useAssetActions } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { timeAgo } from "@/lib/format"
import { FORMAT } from "@/lib/status"
import { cn } from "@/lib/utils"
import { nestRows, variationLabel } from "@/lib/variations"
import { discardAssets } from "@/server/assets"
import type { AssetFormat } from "@/generated/prisma/enums"

export type LaunchItem = {
  id: string
  code: string
  format: AssetFormat
  /** Oferta del creativo: con ella se monta el anuncio (producto, GEO, CPA objetivo). */
  offer: { code: string; name: string } | null
  rootId: string
  rootCode: string
  parentCode: string | null
  thumbVersionId: string | null
  approvedAt: string | null
  markedLaunchedAt: string | null
  /** Inconcluso devuelto a la lista: ya se lanzó, no se puede descartar. */
  relaunch: boolean
  data: LaunchData
}

export type LaunchGroup = {
  id: string
  code: string
  title: string
  color: string
  offer: string
  items: LaunchItem[]
}

/** F-706 · Aprobados sin lanzar, agrupados por concepto y con las variaciones anidadas. */
export function LaunchList({ groups, canArchive }: { groups: LaunchGroup[]; canArchive: boolean }) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Group key={g.id} group={g} canArchive={canArchive} />
      ))}
    </div>
  )
}

function Group({ group: g, canArchive }: { group: LaunchGroup; canArchive: boolean }) {
  const [open, setOpen] = useState(true)
  const { exec } = useAction()
  const rows = nestRows(g.items)
  // Lo que ya se lanzó (marcado o a relanzar) no se descarta: se archiva con otro motivo.
  const discardable = g.items.filter((i) => !i.relaunch && !i.markedLaunchedAt)
  const oldest = g.items.map((i) => i.approvedAt).filter((d): d is string => !!d).sort()[0]

  async function discardAll() {
    const ok = await askConfirm(`¿Descartar ${discardable.length} creativo${discardable.length === 1 ? "" : "s"} de «${g.title}»?`, {
      description: `Se archivan como «Descartado sin testear»: ${discardable.map((i) => i.code).join(", ")}.`,
      confirm: "Descartar todos",
      destructive: true,
    })
    if (ok) await exec(() => discardAssets(discardable.map((i) => i.id)), (n) => `${n} descartado${n === 1 ? "" : "s"}`)
  }

  return (
    <section>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-base font-semibold hover:bg-row-hover"
          style={{ color: g.color }}
          title={g.code}
        >
          <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
          {g.title}
        </button>
        <span className="text-xs text-muted-foreground">
          {g.offer} · {g.items.length} esperando{oldest ? ` · el más antiguo ${timeAgo(oldest)}` : ""}
        </span>
        {canArchive && discardable.length > 1 && (
          <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => void discardAll()}>
            <Trash2 /> Descartar todos
          </Button>
        )}
      </div>
      {open && (
        <div className="overflow-hidden rounded-lg border border-l-[5px]" style={{ borderLeftColor: g.color }}>
          {rows.map(({ item, child }) => (
            <Row key={item.id} item={item} child={child} canArchive={canArchive} />
          ))}
        </div>
      )}
    </section>
  )
}

function Row({ item: a, child, canArchive }: { item: LaunchItem; child: boolean; canArchive: boolean }) {
  const { discard, archive } = useAssetActions()
  const label = variationLabel(a)
  return (
    <div className={cn("flex items-center gap-3 border-b bg-card px-3 py-2.5 text-sm last:border-b-0", child && "bg-surface pl-9")}>
      {child && <span className="-ml-4 text-muted-foreground">↳</span>}
      {a.thumbVersionId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/versions/${a.thumbVersionId}/thumb`} alt="" className="h-12 w-8 rounded-sm object-cover" />
      ) : (
        <div className="h-12 w-8 rounded-sm bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/assets/${a.code}`} className="font-medium hover:underline">
            {a.data.versionCode}
          </Link>
          <span className="rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[a.format].label}</span>
          {a.offer ? (
            <span
              className="rounded-full bg-accent px-2 text-[11px] font-medium whitespace-nowrap text-accent-foreground"
              title={`Oferta: ${a.offer.code} · ${a.offer.name}`}
            >
              {a.offer.code} · {a.offer.name}
            </span>
          ) : (
            <span className="rounded-full bg-destructive/10 px-2 text-[11px] font-medium text-destructive">Sin oferta</span>
          )}
          {(!child || a.parentCode) && label && <span className="text-[11px] text-muted-foreground">↳ {label}</span>}
          {a.relaunch && <PerformancePill status="INCONCLUSIVE" className="h-5 text-[11px]" />}
          {a.relaunch && <span className="text-xs text-muted-foreground">relanzar con más presupuesto</span>}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">{a.data.adName}</div>
      </div>
      <span className="w-28 text-right text-xs text-muted-foreground">
        {a.markedLaunchedAt ? "marcado lanzado" : a.approvedAt ? `esperando ${timeAgo(a.approvedAt).replace("hace ", "")}` : ""}
      </span>
      {canArchive &&
        (a.relaunch || a.markedLaunchedAt ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void archive(a.id, a.code)}>
            <Archive /> Archivar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void discard(a.id, a.code)}>
            <Trash2 /> Descartar
          </Button>
        ))}
      <LaunchPackage
        data={a.data}
        trigger={
          <Button size="sm">
            <Rocket /> Paquete
          </Button>
        }
      />
    </div>
  )
}
