"use client"

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { MessageSquare } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import type { ProductionStatus } from "@/generated/prisma/enums"
import { shortDate, isOverdue } from "@/lib/format"
import { availableTargets } from "@/lib/state-machine"
import { FORMAT, PRIORITY, PRODUCTION_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { BoardAsset, BoardConcept } from "@/server/queries"
import type { BoardContext } from "./board-group"
import { PerformancePill } from "./cells"
import { variationLabel } from "@/lib/variations"
import { useAssetActions } from "./use-asset-actions"
import { UserAvatar } from "./user-avatar"

const COLUMNS: ProductionStatus[] = ["BRIEF", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"]

type Card = { asset: BoardAsset; concept: BoardConcept }

export function KanbanView({ concepts, ctx }: { concepts: BoardConcept[]; ctx: BoardContext }) {
  const cards: Card[] = concepts.flatMap((concept) => concept.assets.filter((a) => !a.context).map((asset) => ({ asset, concept })))
  const [dragging, setDragging] = useState<Card | null>(null)
  const { transition } = useAssetActions()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Destinos válidos para la tarjeta que se arrastra.
  const allowed = dragging
    ? new Set(availableTargets(dragging.asset.productionStatus, ctx.role, dragging.asset.editor?.id === ctx.userId).map((t) => t.to))
    : new Set<ProductionStatus>()

  function onStart(e: DragStartEvent) {
    setDragging(cards.find((c) => c.asset.id === e.active.id) ?? null)
  }

  function onEnd(e: DragEndEvent) {
    const card = dragging
    setDragging(null)
    if (!card || !e.over) return
    const to = e.over.id as ProductionStatus
    if (to === card.asset.productionStatus) return
    const t = availableTargets(card.asset.productionStatus, ctx.role, card.asset.editor?.id === ctx.userId).find((x) => x.to === to)
    if (!t) {
      toast.error(`No se puede pasar de «${PRODUCTION_STATUS[card.asset.productionStatus].label}» a «${PRODUCTION_STATUS[to].label}».`)
      return
    }
    void transition(card.asset.id, to, t.requiresReason, t.label)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            cards={cards.filter((c) => c.asset.productionStatus === status)}
            ctx={ctx}
            highlight={dragging ? (allowed.has(status) ? "ok" : status === dragging.asset.productionStatus ? "self" : "no") : null}
          />
        ))}
      </div>
      <DragOverlay>{dragging && <KanbanCard card={dragging} ctx={ctx} overlay />}</DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  cards,
  ctx,
  highlight,
}: {
  status: ProductionStatus
  cards: Card[]
  ctx: BoardContext
  highlight: "ok" | "no" | "self" | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const s = PRODUCTION_STATUS[status]
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg bg-surface transition-opacity",
        highlight === "no" && "opacity-40",
        highlight === "ok" && isOver && "ring-2 ring-primary",
      )}
    >
      <div className="rounded-t-lg px-3 py-2 text-sm font-medium text-white" style={{ background: s.color }}>
        {s.label} <span className="opacity-80">/ {cards.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-2">
        {cards.map((c) => (
          <KanbanCard key={c.asset.id} card={c} ctx={ctx} />
        ))}
      </div>
    </div>
  )
}

function KanbanCard({ card, ctx, overlay }: { card: Card; ctx: BoardContext; overlay?: boolean }) {
  const { asset: a, concept } = card
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id, disabled: overlay })
  const overdue = isOverdue(a.deadline, a.productionStatus)
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={() => ctx.onOpenAsset(a, concept)}
      className={cn(
        "cursor-grab rounded-md border border-l-4 bg-card p-2.5 text-sm shadow-xs active:cursor-grabbing",
        isDragging && "opacity-30",
        overlay && "rotate-2 shadow-lg",
      )}
      style={{ borderLeftColor: concept.color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-medium">{a.code}</span>
          {variationLabel(a) && <span className="truncate text-[11px] text-muted-foreground">↳ {variationLabel(a)}</span>}
        </span>
        <span className="rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[a.format].label}</span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{concept.title}</div>
      <div className="mt-2 flex items-center gap-2">
        {a.editor && <UserAvatar name={a.editor.name} size={20} />}
        <span
          className="rounded px-1.5 py-px text-[11px] font-medium text-white"
          style={{ background: PRIORITY[a.priority].color, color: PRIORITY[a.priority].fg }}
        >
          {PRIORITY[a.priority].label}
        </span>
        {a.deadline && (
          <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
            {shortDate(a.deadline)}
          </span>
        )}
        {!!a.latestVersion?.openComments && (
          <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
            <MessageSquare className="size-3" />
            {a.latestVersion.openComments}
          </span>
        )}
      </div>
      {a.performanceStatus !== "NOT_LAUNCHED" && (
        <div className="mt-2">
          <PerformancePill status={a.performanceStatus} className="h-5 text-[11px]" />
        </div>
      )}
    </div>
  )
}
