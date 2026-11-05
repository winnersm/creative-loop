"use client"

import Link from "next/link"
import { PerformancePill } from "@/components/board/cells"
import { money } from "@/lib/format"
import { FORMAT } from "@/lib/status"
import type { AssetDetail } from "@/server/queries"

/** Creativos ya juzgados de la misma oferta con etiquetas en común, y cómo les fue. */
export function SimilarPanel({ similar, moneyVisible }: { similar: AssetDetail["similar"]; moneyVisible: boolean }) {
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        Creativos de esta oferta que ya tienen veredicto y comparten etiquetas con este. Antes de producir, mira si esa combinación ya ganó o ya
        perdió.
      </p>
      {!similar.length ? (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          Todavía no hay creativos juzgados parecidos. Cuantas más etiquetas tenga el concepto, mejor funciona esta comparación.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {similar.map((s) => (
            <li key={s.id} className="flex gap-3 p-2.5">
              {s.thumbVersionId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/versions/${s.thumbVersionId}/thumb`} alt="" className="h-14 w-10 shrink-0 rounded-sm bg-muted object-cover" />
              ) : (
                <div className="h-14 w-10 shrink-0 rounded-sm bg-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {s.link ? (
                    <Link href={`/assets/${s.code}`} className="text-sm font-medium hover:underline">
                      {s.code}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{s.code}</span>
                  )}
                  <span className="rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[s.format].label}</span>
                  <PerformancePill status={s.performanceStatus} className="h-5 text-[11px]" />
                  {moneyVisible && s.cpaCents != null && <span className="text-xs text-muted-foreground">CPA {money(s.cpaCents)}</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.conceptTitle}</div>
                <div className="flex flex-wrap gap-1">
                  {s.shared.map((t) => (
                    <span key={t} className="rounded-full bg-accent px-2 py-px text-[11px] text-accent-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
