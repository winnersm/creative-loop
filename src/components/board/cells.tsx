"use client"

import { es } from "date-fns/locale"
import { CalendarIcon, Check, StickyNote, UserPlus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import type { PerformanceStatus, Priority, ProductionStatus, Role } from "@/generated/prisma/enums"
import { isOverdue, shortDate } from "@/lib/format"
import { availableTargets } from "@/lib/state-machine"
import { labelStyle, PERFORMANCE_STATUS, PRIORITY, PRODUCTION_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { updateAssetNotes } from "@/server/assets"
import { useAction, useAssetActions } from "./use-asset-actions"
import { UserAvatar } from "./user-avatar"

const cellBtn = "block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/** Etiqueta de color de solo lectura. */
export function Pill({ label, color, fg, className }: { label: string; color: string; fg?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center rounded px-2 text-xs font-medium whitespace-nowrap", className)}
      style={{ background: color, color: fg ?? "#ffffff" }}
    >
      {label}
    </span>
  )
}

export function ProductionPill({ status, className }: { status: ProductionStatus; className?: string }) {
  const s = PRODUCTION_STATUS[status]
  return <Pill label={s.label} color={s.color} fg={s.fg} className={className} />
}

export function PerformancePill({ status, className }: { status: PerformanceStatus; className?: string }) {
  const s = PERFORMANCE_STATUS[status]
  return <Pill label={status === "WINNER" ? `🏆 ${s.label}` : s.label} color={s.color} fg={s.fg} className={className} />
}

/** Celda de estado llena. El menú solo ofrece transiciones válidas para el rol. */
export function StatusCell({
  assetId,
  status,
  role,
  isAssignee,
}: {
  assetId: string
  status: ProductionStatus
  role: Role
  isAssignee: boolean
}) {
  const { transition, pending } = useAssetActions()
  const s = PRODUCTION_STATUS[status]
  const targets = availableTargets(status, role, isAssignee)
  const face = (
    <div className={cn("status-cell", pending && "opacity-60")} style={{ background: s.color, color: s.fg }}>
      {s.label}
    </div>
  )
  if (!targets.length) return face
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cellBtn}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-2">
        <DropdownMenuGroup className="grid gap-1.5">
          <DropdownMenuLabel className="pb-0">Cambiar a</DropdownMenuLabel>
          {targets.map((t) => (
            <DropdownMenuItem
              key={t.to}
              className="p-0"
              onClick={() => void transition(assetId, t.to, t.requiresReason, t.label)}
            >
              <div
                className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium"
                style={{ background: PRODUCTION_STATUS[t.to].color, color: PRODUCTION_STATUS[t.to].fg }}
              >
                {t.label}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PerformanceCell({ status }: { status: PerformanceStatus }) {
  const s = PERFORMANCE_STATUS[status]
  return (
    <div className="status-cell" style={{ background: s.color, color: s.fg }}>
      {status === "WINNER" ? `🏆 ${s.label}` : s.label}
    </div>
  )
}

export function PriorityCell({
  assetId,
  priority,
  editable,
}: {
  assetId: string
  priority: Priority
  editable: boolean
}) {
  const { update, pending } = useAssetActions()
  const s = PRIORITY[priority]
  const face = (
    <div className={cn("status-cell", pending && "opacity-60")} style={{ background: s.color, color: s.fg }}>
      {s.label}
    </div>
  )
  if (!editable) return face
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cellBtn}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="grid w-40 gap-1.5 p-2">
        {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
          <DropdownMenuItem key={p} className="p-0" onClick={() => void update(assetId, { priority: p })}>
            <div
              className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium"
              style={{ background: PRIORITY[p].color, color: PRIORITY[p].fg }}
            >
              {PRIORITY[p].label}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PeopleCell({
  assetId,
  editor,
  editors,
  editable,
}: {
  assetId: string
  editor: { id: string; name: string } | null
  editors: { id: string; name: string }[]
  editable: boolean
}) {
  const { update } = useAssetActions()
  const face = (
    <div className="flex h-full items-center justify-center">
      {editor ? (
        <UserAvatar name={editor.name} size={26} />
      ) : (
        <span className="flex size-6.5 items-center justify-center rounded-full border border-dashed text-muted-foreground">
          <UserPlus className="size-3.5" />
        </span>
      )}
    </div>
  )
  if (!editable) return face
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(cellBtn, "hover:bg-row-hover")}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
          {editors.map((e) => (
            <DropdownMenuItem key={e.id} onClick={() => void update(assetId, { editorId: e.id })}>
              <UserAvatar name={e.name} size={20} />
              <span className="flex-1">{e.name}</span>
              {editor?.id === e.id && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {editor && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void update(assetId, { editorId: null })}>
              <X /> Quitar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DateCell({
  assetId,
  deadline,
  status,
  editable,
}: {
  assetId: string
  deadline: string | null
  status: ProductionStatus
  editable: boolean
}) {
  const { update } = useAssetActions()
  const overdue = isOverdue(deadline, status)
  const face = (
    <div
      className={cn(
        "flex h-full items-center justify-center gap-1 text-[13px]",
        overdue && "font-medium text-destructive",
        !deadline && "text-muted-foreground",
      )}
    >
      {deadline ? shortDate(deadline) : editable ? <CalendarIcon className="size-3.5 opacity-50" /> : "—"}
      {overdue && <span title="Atrasado">!</span>}
    </div>
  )
  if (!editable) return face
  return (
    <Popover>
      <PopoverTrigger className={cn(cellBtn, "hover:bg-row-hover")}>{face}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <Calendar
          mode="single"
          locale={es}
          selected={deadline ? new Date(deadline) : undefined}
          onSelect={(d) => void update(assetId, { deadline: d ? endOfDay(d).toISOString() : null })}
        />
        {deadline && (
          <button
            className="w-full border-t py-2 text-sm text-muted-foreground hover:bg-row-hover"
            onClick={() => void update(assetId, { deadline: null })}
          >
            Quitar fecha
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 0, 0)
  return x
}

export type DimensionOption = { id: string; label: string; values: { id: string; label: string; active: boolean }[] }

/** Variable que prueba el asset (única dimensión sobrescrita). */
export function VariableCell({
  assetId,
  override,
  dimensions,
  editable,
}: {
  assetId: string
  override: { valueId: string; label: string; dimension: string } | null
  dimensions: DimensionOption[]
  editable: boolean
}) {
  const { update } = useAssetActions()
  const face = (
    <div className="flex h-full items-center justify-center px-1">
      {override ? (
        <span className="truncate rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground" title={`${override.dimension}: ${override.label}`}>
          {override.dimension}: {override.label}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  )
  if (!editable) return face
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(cellBtn, "hover:bg-row-hover")}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-64">
        {override && (
          <>
            <DropdownMenuItem onClick={() => void update(assetId, { overrideValueId: null })}>
              <X /> Sin variable (igual que el concepto)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {dimensions.map((d) => (
          <DropdownMenuGroup key={d.id}>
            <DropdownMenuLabel>{d.label}</DropdownMenuLabel>
            {d.values
              .filter((v) => v.active)
              .map((v) => (
                <DropdownMenuItem key={v.id} onClick={() => void update(assetId, { overrideValueId: v.id })}>
                  <span className="flex-1">{v.label}</span>
                  {override?.valueId === v.id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type OfferOption = { id: string; code: string; name: string; gate: "OK" | "BLOCKED" }

/**
 * Oferta del creativo. Se fija al lanzarlo: con ella se juzga (CPA objetivo, evento de conversión).
 */
export function OfferCell({
  assetId,
  offer,
  offers,
  editable,
  locked,
}: {
  assetId: string
  offer: OfferOption | null
  offers: OfferOption[]
  editable: boolean
  /** Ya lanzado: la oferta no cambia. */
  locked: boolean
}) {
  const { update } = useAssetActions()
  const face = (
    <div className="flex h-full items-center justify-center px-1" title={offer ? `${offer.code} · ${offer.name}` : "Sin oferta"}>
      {offer ? (
        <span className={cn("truncate text-[13px]", offer.gate === "BLOCKED" && "font-medium text-destructive")}>
          {offer.code}
          <span className="text-muted-foreground"> · {offer.name}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{editable ? "Asignar" : "—"}</span>
      )}
    </div>
  )
  if (!editable || locked) return <div title={locked ? "Fija: el creativo ya está lanzado" : undefined} className="h-full">{face}</div>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(cellBtn, "hover:bg-row-hover")}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Oferta</DropdownMenuLabel>
          {offers.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => void update(assetId, { offerId: o.id })}>
              <span className="flex-1">
                {o.code} · {o.name}
              </span>
              {o.gate === "BLOCKED" && <span className="text-xs text-destructive">bloqueada</span>}
              {offer?.id === o.id && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {offer && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void update(assetId, { offerId: null })}>
              <X /> Quitar oferta
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type LabelOption = { id: string; name: string; color: string }

export function LabelChip({ label, className }: { label: LabelOption; className?: string }) {
  const c = labelStyle(label.color)
  return (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap", className)}
      style={{ background: c.bg, color: c.fg }}
    >
      {label.name}
    </span>
  )
}

/** Etiquetas de equipo: selección múltiple de la lista que mantiene el propietario. */
export function LabelsCell({
  assetId,
  labels,
  options,
  editable,
}: {
  assetId: string
  labels: LabelOption[]
  options: LabelOption[]
  editable: boolean
}) {
  const { update } = useAssetActions()
  const face = (
    <div className="flex h-full items-center gap-1 overflow-hidden px-1.5" title={labels.map((l) => l.name).join(", ") || undefined}>
      {labels.length ? (
        labels.map((l) => <LabelChip key={l.id} label={l} />)
      ) : (
        <span className="w-full text-center text-xs text-muted-foreground">—</span>
      )}
    </div>
  )
  if (!editable) return face
  const ids = new Set(labels.map((l) => l.id))
  function toggle(id: string) {
    const next = new Set(ids)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    void update(assetId, { labelIds: [...next] })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(cellBtn, "hover:bg-row-hover")}>{face}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
          {options.length ? (
            options.map((o) => (
              <DropdownMenuItem key={o.id} closeOnClick={false} onClick={() => toggle(o.id)}>
                <span className="flex-1">
                  <LabelChip label={o} />
                </span>
                {ids.has(o.id) && <Check className="size-4" />}
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">El propietario las crea en Ajustes → Etiquetas.</p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Notas del equipo en texto libre. Se ven recortadas; clic para leer y editar. */
export function NotesCell({ assetId, notes, editable }: { assetId: string; notes: string; editable: boolean }) {
  const { exec, pending } = useAction()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(notes)
  const face = (
    <div className="flex h-full items-center gap-1 px-2 text-left text-[13px]">
      {notes ? (
        <span className="truncate">{notes}</span>
      ) : (
        <span className="w-full text-center text-muted-foreground">{editable ? <StickyNote className="mx-auto size-3.5 opacity-50" /> : "—"}</span>
      )}
    </div>
  )
  async function save() {
    const ok = await exec(() => updateAssetNotes(assetId, value), "Notas guardadas")
    if (ok !== null) setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(notes)
        setOpen(o)
      }}
    >
      <PopoverTrigger className={cn(cellBtn, "hover:bg-row-hover")} title={notes || (editable ? "Añadir notas" : undefined)}>
        {face}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        {editable ? (
          <div className="grid gap-2">
            <Textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Notas para el equipo…"
              aria-label="Notas"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save()
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={pending || value === notes} onClick={() => void save()}>
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{notes || "Sin notas."}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
