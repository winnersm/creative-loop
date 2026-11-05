"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { PerformanceCell } from "@/components/board/cells"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import type { PerformanceStatus } from "@/generated/prisma/enums"
import { decimal, int, money, pct } from "@/lib/format"
import { PERFORMANCE_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"

export type PerfRow = {
  code: string
  concept: string
  offer: string
  editor: string
  variable: string
  status: PerformanceStatus
  /** null = creativo sin oferta. */
  targetCpaCents: number | null
  spendCents: number
  conversions: number
  cpaCents: number | null
  revenueCents: number
  roas: number | null
  hookRate: number | null
  holdRate: number | null
  ctr: number | null
  impressions: number
}

type Option = { id: string; label: string }

const num = (right = true) => ({ meta: { right } })

const columns: ColumnDef<PerfRow>[] = [
  {
    accessorKey: "code",
    header: "Creativo",
    cell: ({ row }) => (
      <div>
        <Link href={`/assets/${row.original.code}`} className="font-medium hover:underline">
          {row.original.code}
        </Link>
        <div className="max-w-56 truncate text-xs text-muted-foreground">{row.original.concept}</div>
      </div>
    ),
  },
  { accessorKey: "offer", header: "Oferta" },
  { accessorKey: "editor", header: "Editor" },
  { accessorKey: "variable", header: "Variable", cell: ({ getValue }) => <span className="text-xs">{getValue<string>()}</span> },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ getValue }) => (
      <div className="h-7 w-28 overflow-hidden rounded">
        <PerformanceCell status={getValue<PerformanceStatus>()} />
      </div>
    ),
  },
  { accessorKey: "spendCents", header: "Gasto", cell: ({ getValue }) => money(getValue<number>()), ...num() },
  { accessorKey: "conversions", header: "Conversiones", cell: ({ getValue }) => decimal(getValue<number>(), 0), ...num() },
  {
    accessorKey: "cpaCents",
    header: "CPA",
    sortUndefined: "last",
    cell: ({ row }) => {
      const { cpaCents, targetCpaCents } = row.original
      if (cpaCents == null) return "—"
      if (targetCpaCents == null) return money(cpaCents)
      const good = cpaCents <= targetCpaCents
      return <span className={good ? "font-medium text-[var(--status-done)]" : "font-medium text-destructive"}>{money(cpaCents)}</span>
    },
    ...num(),
  },
  { accessorKey: "targetCpaCents", header: "Objetivo", cell: ({ getValue }) => money(getValue<number | null>()), ...num() },
  { accessorKey: "revenueCents", header: "Ingresos", cell: ({ getValue }) => money(getValue<number>()), ...num() },
  { accessorKey: "roas", header: "ROAS", cell: ({ getValue }) => (getValue<number | null>() == null ? "—" : `${decimal(getValue<number>())}x`), ...num() },
  { accessorKey: "hookRate", header: "Enganche", cell: ({ getValue }) => pct(getValue<number | null>()), ...num() },
  { accessorKey: "holdRate", header: "Retención", cell: ({ getValue }) => pct(getValue<number | null>()), ...num() },
  { accessorKey: "ctr", header: "CTR", cell: ({ getValue }) => pct(getValue<number | null>(), 2), ...num() },
  { accessorKey: "impressions", header: "Impresiones", cell: ({ getValue }) => int(getValue<number>()), ...num() },
]

export function PerformanceTable({
  rows,
  filters,
  offers,
  editors,
  tags,
}: {
  rows: PerfRow[]
  filters: Record<"offer" | "editor" | "status" | "tag" | "from" | "to", string>
  offers: Option[]
  editors: Option[]
  tags: Option[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([{ id: "spendCents", desc: true }])
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  function set(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next}`)
  }

  const totals = rows.reduce(
    (t, r) => ({ spend: t.spend + r.spendCents, conv: t.conv + r.conversions, rev: t.rev + r.revenueCents }),
    { spend: 0, conv: 0, rev: 0 },
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.offer} onChange={(v) => set("offer", v)} placeholder="Todas las ofertas" options={offers} />
        <Select value={filters.editor} onChange={(v) => set("editor", v)} placeholder="Todos los editores" options={editors} />
        <Select
          value={filters.status}
          onChange={(v) => set("status", v)}
          placeholder="Todos los estados"
          options={Object.entries(PERFORMANCE_STATUS).map(([id, s]) => ({ id, label: s.label }))}
        />
        <Select value={filters.tag} onChange={(v) => set("tag", v)} placeholder="Cualquier etiqueta" options={tags} className="w-56" />
        <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} className="w-36" title="Desde" />
        <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} className="w-36" title="Hasta" />
        <div className="ml-auto text-sm text-muted-foreground">
          {rows.length} creativos · gasto {money(totals.spend)} · {decimal(totals.conv, 0)} conv. · CPA{" "}
          {money(totals.conv ? totals.spend / totals.conv : null)} · ROAS {totals.spend ? `${decimal(totals.rev / totals.spend)}x` : "—"}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const right = (h.column.columnDef.meta as { right?: boolean } | undefined)?.right
                  const sorted = h.column.getIsSorted()
                  return (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={cn("cursor-pointer px-3 py-2 font-medium whitespace-nowrap select-none hover:text-foreground", right ? "text-right" : "text-left")}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" && <ArrowUp className="ml-1 inline size-3" />}
                      {sorted === "desc" && <ArrowDown className="ml-1 inline size-3" />}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-row-hover">
                {r.getVisibleCells().map((c) => {
                  const right = (c.column.columnDef.meta as { right?: boolean } | undefined)?.right
                  return (
                    <td key={c.id} className={cn("px-3 py-1.5 whitespace-nowrap tabular-nums", right && "text-right")}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                  Sin creativos lanzados con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  placeholder,
  options,
  className = "w-44",
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: Option[]
  className?: string
}) {
  return (
    <NativeSelect className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}
