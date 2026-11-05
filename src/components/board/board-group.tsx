"use client"

import { Archive, ArchiveRestore, ArrowRightLeft, ChevronDown, ChevronRight, Copy, ExternalLink, Film, GitBranch, Image as ImageIcon, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Role } from "@/generated/prisma/enums"
import { money, pct } from "@/lib/format"
import { ARCHIVE_REASON, FORMAT, PRODUCTION_ORDER, PRODUCTION_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { nestRows, variationLabel } from "@/lib/variations"
import { duplicateAsset } from "@/server/assets"
import { archiveConcept, previewArchiveConcept, unarchiveConcept, updateConcept } from "@/server/concepts"
import type { BoardAsset, BoardConcept } from "@/server/queries"
import {
  DateCell,
  type DimensionOption,
  type LabelOption,
  LabelsCell,
  NotesCell,
  OfferCell,
  type OfferOption,
  PeopleCell,
  PerformanceCell,
  PriorityCell,
  StatusCell,
  VariableCell,
} from "./cells"
import { askConfirm } from "./reason-dialog"
import { useAction, useAssetActions } from "./use-asset-actions"

export type BoardContext = {
  userId: string
  role: Role
  canEdit: boolean
  moneyVisible: boolean
  editors: { id: string; name: string }[]
  dimensions: DimensionOption[]
  offers: OfferOption[]
  labels: LabelOption[]
  onOpenAsset: (asset: BoardAsset, concept: BoardConcept) => void
  onAddAssets: (concept: BoardConcept) => void
  onAddVariations: (asset: BoardAsset) => void
  onEditConcept: (concept: BoardConcept) => void
  onMoveAsset: (asset: BoardAsset, concept: BoardConcept) => void
}

export function gridTemplate(moneyVisible: boolean) {
  // creativo (con su menú) · oferta · editor · estado · fecha · prioridad · variable · etiquetas · notas · rendimiento · [enganche · cpa]
  const base = "minmax(250px,1.6fr) minmax(130px,0.8fr) 84px 150px 96px 104px minmax(130px,1fr) minmax(120px,0.9fr) minmax(140px,1fr) 124px"
  return moneyVisible ? `${base} 80px 90px` : base
}

const HEADERS = ["Creativo", "Oferta", "Editor", "Estado", "Fecha límite", "Prioridad", "Variable", "Etiquetas", "Notas", "Rendimiento"]

const COLLAPSED_KEY = "cl.collapsed-variations"

/** Originales con las variaciones plegadas. Preferencia de cada persona, en su navegador. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el cliente
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
    } catch {}
  }, [])
  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }
  return { collapsed, toggle }
}

export function BoardGroup({ concept, ctx }: { concept: BoardConcept; ctx: BoardContext }) {
  const [open, setOpen] = useState(true)
  const { collapsed, toggle } = useCollapsed()
  const template = gridTemplate(ctx.moneyVisible)
  const real = concept.assets.filter((a) => !a.context)
  const counts = PRODUCTION_ORDER.map((s) => ({ s, n: real.filter((a) => a.productionStatus === s).length })).filter(
    (x) => x.n > 0,
  )
  const rows = nestRows(concept.assets)
  const withChildren = new Set(rows.filter((r) => r.child).map((r) => r.item.rootId))

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <div className="flex items-center text-[17px] font-semibold" style={{ color: concept.color }}>
          <button
            onClick={() => setOpen(!open)}
            className="rounded p-1 hover:bg-row-hover"
            title={open ? "Plegar concepto" : "Desplegar concepto"}
          >
            <ChevronDown className={cn("size-4.5 transition-transform", !open && "-rotate-90")} />
          </button>
          {ctx.canEdit ? (
            <ConceptTitle concept={concept} />
          ) : (
            <button onClick={() => setOpen(!open)} className="rounded px-1 py-0.5 hover:bg-row-hover" title={concept.code}>
              {concept.title}
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground" title={concept.offers.map((o) => `${o.code} · ${o.name}`).join("\n") || undefined}>
          {concept.offers.length ? `${concept.offers.map((o) => o.code).join(", ")} · ` : ""}
          {real.length} creativo{real.length === 1 ? "" : "s"}
        </span>
        {concept.archivedAt && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">Archivado</span>
        )}
        {ctx.canEdit && (
          <button
            onClick={() => ctx.onEditConcept(concept)}
            title="Editar concepto"
            className="rounded p-1 opacity-80 hover:bg-row-hover hover:opacity-100"
            style={{ color: concept.color }}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {ctx.canEdit && <ConceptMenu concept={concept} />}
        {concept.offers.some((o) => o.gate === "BLOCKED") && (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Oferta bloqueada</span>
        )}
      </div>
      {open && (
        <>
          <p className="mb-2 ml-7 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Hipótesis:</span> {concept.hypothesis}
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {concept.tags.map((t) => (
                <span key={t.dimensionKey} className="rounded-full bg-secondary px-2 py-px text-[11px] text-secondary-foreground" title={t.dimension}>
                  {t.label}
                </span>
              ))}
            </span>
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-fit overflow-hidden rounded-md border-l-[6px]" style={{ borderLeftColor: concept.color }}>
              <div
                className="grid border-y border-r bg-background text-[13px] text-muted-foreground"
                style={{ gridTemplateColumns: template }}
              >
                {HEADERS.map((h, i) => (
                  <div key={h} className={cn("border-r px-3 py-2", i > 0 && "text-center")}>
                    {h}
                  </div>
                ))}
                {ctx.moneyVisible && (
                  <>
                    <div className="border-r px-2 py-2 text-center">Enganche</div>
                    <div className="border-r px-2 py-2 text-center">CPA</div>
                  </>
                )}
              </div>
              {rows.map(({ item: a, child }) =>
                child && collapsed.has(a.rootId) ? null : (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    concept={concept}
                    ctx={ctx}
                    template={template}
                    child={child}
                    fold={withChildren.has(a.id) ? { collapsed: collapsed.has(a.id), toggle: () => toggle(a.id) } : null}
                  />
                ),
              )}
              {ctx.canEdit && (
                <button
                  onClick={() => ctx.onAddAssets(concept)}
                  className="flex h-9 w-full items-center gap-2 border-r border-b px-3 text-[13px] font-medium text-accent-foreground hover:bg-accent"
                >
                  <Plus className="size-4" /> Añadir creativo
                </button>
              )}
              {real.length > 0 && (
                <div className="grid border-r border-b bg-background" style={{ gridTemplateColumns: template }}>
                  <div />
                  <div />
                  <div />
                  <div className="flex h-8 items-center px-2">
                    <div className="flex h-5 w-full overflow-hidden rounded-sm">
                      {counts.map(({ s, n }) => (
                        <div
                          key={s}
                          title={`${PRODUCTION_STATUS[s].label}: ${n}`}
                          style={{ flex: n, background: PRODUCTION_STATUS[s].color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** Nombre del concepto editable en línea: clic, Enter guarda, Esc cancela. */
function ConceptTitle({ concept }: { concept: BoardConcept }) {
  const { exec, pending } = useAction()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(concept.title)

  async function save() {
    const title = value.trim()
    if (!title || title === concept.title) {
      setValue(concept.title)
      setEditing(false)
      return
    }
    const ok = await exec(() => updateConcept(concept.id, { title }), "Nombre cambiado")
    if (ok === null) setValue(concept.title)
    setEditing(false)
  }

  if (!editing)
    return (
      <button
        onClick={() => {
          setValue(concept.title)
          setEditing(true)
        }}
        className="rounded px-1 py-0.5 hover:bg-row-hover hover:outline hover:outline-1 hover:outline-border"
        title={`${concept.code} · clic para cambiar el nombre`}
      >
        {concept.title}
      </button>
    )
  return (
    <input
      autoFocus
      disabled={pending}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setValue(concept.title)
          setEditing(false)
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      aria-label="Nombre del concepto"
      className="min-w-64 rounded border border-ring bg-background px-1 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ width: `${Math.max(value.length, 16)}ch` }}
    />
  )
}

/** Menú del concepto: archivar / desarchivar. */
function ConceptMenu({ concept }: { concept: BoardConcept }) {
  const { exec } = useAction()
  async function archiveIt() {
    const preview = await exec(() => previewArchiveConcept(concept.id))
    if (!preview) return
    const lines = [
      preview.toArchive
        ? `Se archivarán ${preview.toArchive} creativo${preview.toArchive === 1 ? "" : "s"} sin lanzar que siguen en curso. Sus editores reciben un aviso.`
        : "No hay creativos en curso sin lanzar.",
      preview.launched
        ? `${preview.launched} creativo${preview.launched === 1 ? "" : "s"} ya lanzado${preview.launched === 1 ? "" : "s"}: no se tocan y se siguen midiendo en Rendimiento.`
        : null,
      "Puedes desarchivar el concepto más tarde; sus creativos seguirán archivados.",
    ].filter(Boolean)
    const ok = await askConfirm(`¿Archivar «${concept.title}»?`, { description: lines.join("\n"), confirm: "Archivar concepto" })
    if (ok) await exec(() => archiveConcept(concept.id), "Concepto archivado")
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded p-1 opacity-80 hover:bg-row-hover hover:opacity-100"
        style={{ color: concept.color }}
        title="Más acciones del concepto"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {concept.archivedAt ? (
          <DropdownMenuItem onClick={() => void exec(() => unarchiveConcept(concept.id), "Concepto desarchivado")}>
            <ArchiveRestore /> Desarchivar concepto
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void archiveIt()}>
            <Archive /> Archivar concepto…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AssetRow({
  asset: a,
  concept,
  ctx,
  template,
  child,
  fold,
}: {
  asset: BoardAsset
  concept: BoardConcept
  ctx: BoardContext
  template: string
  /** Variación colgada de un original visible. */
  child: boolean
  /** Original con variaciones visibles: se pueden plegar. */
  fold: { collapsed: boolean; toggle: () => void } | null
}) {
  const launched = a.deployments > 0 || a.performanceStatus !== "NOT_LAUNCHED"
  const archived = a.productionStatus === "ARCHIVED"
  const Icon = a.mediaType === "VIDEO" ? Film : ImageIcon
  const label = variationLabel(a)
  return (
    <div
      className={cn(
        "group grid h-10 border-r border-b bg-background text-sm hover:bg-row-hover",
        child && "bg-surface",
        a.context && "opacity-55",
      )}
      style={{ gridTemplateColumns: template }}
      title={a.context ? "No cumple el filtro: se muestra porque tiene variaciones que sí lo cumplen" : undefined}
    >
      <div className={cn("flex min-w-0 items-center border-r", child ? "pl-7" : "pl-1")}>
        {fold ? (
          <button
            onClick={fold.toggle}
            title={fold.collapsed ? "Mostrar variaciones" : "Ocultar variaciones"}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {fold.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : child ? (
          <span className="px-0.5 text-muted-foreground">↳</span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
      <button
        onClick={() => ctx.onOpenAsset(a, concept)}
        className="flex h-full min-w-0 shrink items-center gap-2 pr-1 pl-2 text-left"
      >
        {a.latestVersion?.hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/versions/${a.latestVersion.id}/thumb`} alt="" className="h-7 w-5 shrink-0 rounded-sm bg-muted object-cover" />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-medium whitespace-nowrap">{a.code}</span>
        <span className="shrink-0 rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[a.format].label}</span>
        {a.latestVersion && <span className="text-[11px] text-muted-foreground">V{a.latestVersion.number}</span>}
        {!!a.latestVersion?.openComments && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground" title="Comentarios abiertos">
            <MessageSquare className="size-3" />
            {a.latestVersion.openComments}
          </span>
        )}
        {/* Solo cuando sale de otra variación: si cuelga del original, la sangría ya lo dice. */}
        {child && a.parentCode && <span className="text-[11px] text-muted-foreground">{label}</span>}
        {!child && label && <span className="truncate text-[11px] text-muted-foreground">↳ {label}</span>}
        {a.variations && (
          <span
            className="min-w-0 truncate rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground"
            title="Variaciones de este creativo"
          >
            {a.variations.count} variaci{a.variations.count === 1 ? "ón" : "ones"}
            {a.variations.winners > 0 && ` · ${a.variations.winners} ganadora${a.variations.winners === 1 ? "" : "s"}`}
          </span>
        )}
      </button>
      <AssetMenu asset={a} concept={concept} ctx={ctx} launched={launched} archived={archived} />
      {/* El resto de la celda también abre el creativo. */}
      <button onClick={() => ctx.onOpenAsset(a, concept)} className="h-full flex-1" tabIndex={-1} aria-hidden />
      </div>
      <div className="min-w-0 border-r">
        <OfferCell assetId={a.id} offer={a.offer} offers={ctx.offers} editable={ctx.canEdit} locked={launched} />
      </div>
      <div className="border-r">
        <PeopleCell assetId={a.id} editor={a.editor} editors={ctx.editors} editable={ctx.canEdit} />
      </div>
      <div
        className="border-r border-background p-px"
        title={archived && a.archiveReason ? `Motivo: ${ARCHIVE_REASON[a.archiveReason]}` : undefined}
      >
        <StatusCell assetId={a.id} status={a.productionStatus} role={ctx.role} isAssignee={a.editor?.id === ctx.userId} />
      </div>
      <div className="border-r">
        <DateCell assetId={a.id} deadline={a.deadline} status={a.productionStatus} editable={ctx.canEdit} />
      </div>
      <div className="border-r border-background p-px">
        <PriorityCell assetId={a.id} priority={a.priority} editable={ctx.canEdit} />
      </div>
      <div className="min-w-0 border-r">
        <VariableCell assetId={a.id} override={a.override} dimensions={ctx.dimensions} editable={ctx.canEdit} />
      </div>
      <div className="min-w-0 border-r">
        <LabelsCell assetId={a.id} labels={a.labels} options={ctx.labels} editable={ctx.canEdit} />
      </div>
      <div className="min-w-0 border-r">
        <NotesCell
          key={a.notes}
          assetId={a.id}
          notes={a.notes}
          editable={ctx.canEdit || (ctx.role === "EDITOR" && a.editor?.id === ctx.userId)}
        />
      </div>
      <div className="border-r border-background p-px">
        <PerformanceCell status={a.performanceStatus} />
      </div>
      {ctx.moneyVisible && (
        <>
          <div className="flex items-center justify-center border-r text-[13px] tabular-nums">{pct(a.metrics?.hookRate ?? null, 0)}</div>
          <div className="flex items-center justify-center border-r text-[13px] tabular-nums">{money(a.metrics?.cpaCents ?? null)}</div>
        </>
      )}
    </div>
  )
}

/** Menú del creativo, junto a su código: siempre visible. */
function AssetMenu({
  asset: a,
  concept,
  ctx,
  launched,
  archived,
}: {
  asset: BoardAsset
  concept: BoardConcept
  ctx: BoardContext
  launched: boolean
  archived: boolean
}) {
  const { exec, archive, discard } = useAssetActions()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="shrink-0 rounded p-0.5 text-foreground/80 hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground"
        title={`Acciones de ${a.code}`}
        aria-label={`Acciones de ${a.code}`}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem render={<Link href={`/assets/${a.code}`} />}>
          <ExternalLink /> Abrir
        </DropdownMenuItem>
        {ctx.canEdit && (
          <DropdownMenuItem onClick={() => ctx.onAddVariations(a)}>
            <GitBranch /> Crear variaciones
          </DropdownMenuItem>
        )}
        {ctx.canEdit && (
          <DropdownMenuItem onClick={() => void exec(() => duplicateAsset(a.id), (code) => `Creado ${code} (copia sin vínculo)`)}>
            <Copy /> Duplicar
          </DropdownMenuItem>
        )}
        {ctx.canEdit && (
          <DropdownMenuItem
            disabled={launched || !!a.parentCode || (a.rootId !== a.id)}
            onClick={() => ctx.onMoveAsset(a, concept)}
            title={
              launched
                ? "Ya está lanzado: su código va en el anuncio de Meta"
                : a.rootId !== a.id
                  ? `Es una variación: mueve su original (${a.rootCode})`
                  : undefined
            }
          >
            <ArrowRightLeft /> Mover a otro concepto…
          </DropdownMenuItem>
        )}
        {ctx.canEdit && !archived && !launched && (
          <DropdownMenuItem onClick={() => void discard(a.id, a.code)}>
            <Trash2 /> Descartar
          </DropdownMenuItem>
        )}
        {ctx.canEdit && !archived && (
          <DropdownMenuItem onClick={() => void archive(a.id, a.code)}>
            <Archive /> Archivar…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
