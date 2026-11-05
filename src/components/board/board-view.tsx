"use client"

import { Columns3, LayoutList, Plus, Search } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import type { Role } from "@/generated/prisma/enums"
import { PRODUCTION_ORDER, PRODUCTION_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { BoardConcept, Lookups } from "@/server/queries"
import { AssetDrawer } from "./asset-drawer"
import { BoardGroup, type BoardContext } from "./board-group"
import { KanbanView } from "./kanban-view"
import { MoveAssetDialog } from "./move-asset-dialog"
import { NewAssetsDialog } from "./new-assets-dialog"
import { NewConceptDialog } from "./new-concept-dialog"

export function BoardView({
  concepts,
  lookups,
  user,
  canEdit,
  moneyVisible,
  title,
}: {
  concepts: BoardConcept[]
  lookups: Lookups
  user: { id: string; role: Role }
  canEdit: boolean
  moneyVisible: boolean
  title: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const view = params.get("view") === "kanban" ? "kanban" : "table"
  const [q, setQ] = useState(params.get("q") ?? "")
  const [selected, setSelected] = useState<{ assetId: string; conceptId: string } | null>(null)
  const [addTo, setAddTo] = useState<{ id: string; code: string; title: string } | null>(null)
  const [variationOf, setVariationOf] = useState<string | null>(null)
  const [newConcept, setNewConcept] = useState(false)
  const [editConcept, setEditConcept] = useState<BoardConcept | null>(null)
  const [moving, setMoving] = useState<{ asset: BoardConcept["assets"][number]; conceptId: string } | null>(null)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next.toString()}`)
  }

  const dimensions = useMemo(
    () => lookups.dimensions.map((d) => ({ id: d.id, label: d.label, values: d.values })),
    [lookups.dimensions],
  )
  const editors = lookups.editors.filter((e) => e.role === "EDITOR" || e.role === "MANAGER")

  const ctx: BoardContext = {
    userId: user.id,
    role: user.role,
    canEdit,
    moneyVisible,
    editors,
    dimensions,
    offers: lookups.offers,
    labels: lookups.labels,
    onOpenAsset: (asset, concept) => setSelected({ assetId: asset.id, conceptId: concept.id }),
    onAddAssets: (concept) => setAddTo(concept),
    onAddVariations: (asset) => setVariationOf(asset.code),
    onEditConcept: (concept) => setEditConcept(concept),
    onMoveAsset: (asset, concept) => setMoving({ asset, conceptId: concept.id }),
  }

  // «Crear variaciones» desde la página del creativo llega con ?vary=C003-A02.
  const vary = params.get("vary")
  useEffect(() => {
    if (!vary) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abre el diálogo una vez y limpia la URL
    setVariationOf(vary)
    const next = new URLSearchParams(params)
    next.delete("vary")
    router.replace(`${pathname}?${next.toString()}`)
  }, [vary, params, pathname, router])

  // El drawer lee siempre los datos frescos del board.
  const selectedConcept = selected && concepts.find((c) => c.id === selected.conceptId)
  const selectedAsset = selectedConcept?.assets.find((a) => a.id === selected!.assetId)
  const drawerItem = selectedConcept && selectedAsset ? { asset: selectedAsset, concept: selectedConcept } : null
  const total = concepts.reduce((n, c) => n + c.assets.filter((a) => !a.context).length, 0)

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {concepts.length} conceptos · {total} creativos
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setNewConcept(true)}>
              <Plus /> Nuevo concepto
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {[
            { key: "table", label: "Tabla principal", icon: LayoutList },
            { key: "kanban", label: "Por estado", icon: Columns3 },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setParam("view", t.key === "table" ? null : t.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm",
                view === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setParam("q", q.trim() || null)
          }}
          className="relative"
        >
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, título…" className="w-56 pl-8" />
        </form>
        <NativeSelect className="w-52" value={params.get("offer") ?? ""} onChange={(e) => setParam("offer", e.target.value || null)}>
          <option value="">Todas las ofertas</option>
          {lookups.offers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} · {o.name}
            </option>
          ))}
        </NativeSelect>
        {user.role !== "EDITOR" && (
          <NativeSelect className="w-44" value={params.get("editor") ?? ""} onChange={(e) => setParam("editor", e.target.value || null)}>
            <option value="">Todas las personas</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect className="w-44" value={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value || null)}>
          <option value="">Todos los estados</option>
          {PRODUCTION_ORDER.map((s) => (
            <option key={s} value={s}>
              {PRODUCTION_STATUS[s].label}
            </option>
          ))}
        </NativeSelect>
        <label className="ml-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={params.get("archived") === "1"}
            onChange={(e) => setParam("archived", e.target.checked ? "1" : null)}
          />
          Archivados
        </label>
      </div>

      <div className="flex-1 px-6 pb-10">
        {!concepts.length && (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No hay nada con estos filtros.
          </div>
        )}
        {view === "table" ? concepts.map((c) => <BoardGroup key={c.id} concept={c} ctx={ctx} />) : <KanbanView concepts={concepts} ctx={ctx} />}
      </div>

      <AssetDrawer item={drawerItem} onClose={() => setSelected(null)} ctx={ctx} />
      <NewAssetsDialog
        key={`add-${addTo?.id ?? "none"}`}
        concept={addTo}
        onOpenChange={(o) => !o && setAddTo(null)}
        editors={editors}
        dimensions={dimensions}
        offers={lookups.offers}
        defaultOfferId={params.get("offer") ?? ""}
      />
      {canEdit && (
        <NewAssetsDialog
          key={variationOf ?? "none"}
          concept={null}
          variationOf={variationOf}
          onOpenChange={(o) => !o && setVariationOf(null)}
          editors={editors}
          dimensions={dimensions}
          offers={lookups.offers}
        />
      )}
      {canEdit && <MoveAssetDialog item={moving} concepts={lookups.concepts} onClose={() => setMoving(null)} />}
      {canEdit && editConcept && (
        <NewConceptDialog
          key={editConcept.id}
          open
          onOpenChange={(o) => !o && setEditConcept(null)}
          lookups={lookups}
          editing={editConcept}
        />
      )}
      {canEdit && (
        <NewConceptDialog
          open={newConcept}
          onOpenChange={setNewConcept}
          lookups={lookups}
          // Tras crear el concept se abre directamente el alta de sus assets.
          onCreated={(c) => setAddTo(c)}
        />
      )}
    </div>
  )
}
