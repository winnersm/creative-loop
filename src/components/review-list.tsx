import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react"
import Link from "next/link"
import { Pill } from "@/components/board/cells"
import { UserAvatar } from "@/components/board/user-avatar"
import { isOverdue, shortDate, timeAgo } from "@/lib/format"
import { FORMAT, PRIORITY } from "@/lib/status"
import type { ReviewItem } from "@/server/review-queue"
import { Button } from "@/components/ui/button"

export function ReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {items.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 border-b border-l-[5px] bg-card px-3 py-2 text-sm last:border-b-0 hover:bg-row-hover"
          style={{ borderLeftColor: r.concept.color }}
        >
          {r.version?.hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/versions/${r.version.id}/thumb`} alt="" className="h-12 w-8 rounded-sm bg-muted object-cover" />
          ) : (
            <div className="h-12 w-8 rounded-sm bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.version?.code ?? r.code}</span>
              <span className="rounded bg-secondary px-1 text-[11px] text-muted-foreground">{FORMAT[r.format].label}</span>
              <Pill label={PRIORITY[r.priority].label} color={PRIORITY[r.priority].color} fg={PRIORITY[r.priority].fg} className="h-5 text-[11px]" />
              {!r.offer && <span className="text-xs text-destructive">sin oferta</span>}
              {r.offer?.gate === "BLOCKED" && <span className="text-xs text-destructive">oferta bloqueada</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {r.concept.title}
            </div>
          </div>
          <span className="hidden items-center gap-1.5 md:flex">
            <UserAvatar name={r.editor} size={22} />
            {r.editor}
          </span>
          <span className="w-24 text-xs">
            {r.version?.warnings ? (
              <span className="flex items-center gap-1 text-[var(--status-working)]">
                <AlertTriangle className="size-3.5" /> {r.version.warnings} aviso(s)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[var(--status-done)]">
                <CheckCircle2 className="size-3.5" /> QA ok
              </span>
            )}
          </span>
          {!!r.version?.openComments && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="size-3.5" /> {r.version.openComments}
            </span>
          )}
          <span className={`w-20 text-xs ${isOverdue(r.deadline, "IN_REVIEW") ? "font-medium text-destructive" : "text-muted-foreground"}`}>
            {r.deadline ? shortDate(r.deadline) : "sin fecha"}
          </span>
          <span className="w-20 text-xs text-muted-foreground">{r.version?.submittedAt ? timeAgo(r.version.submittedAt) : ""}</span>
          <Button size="sm" nativeButton={false} render={<Link href={`/assets/${r.code}${r.version ? `?v=${r.version.number}` : ""}`} />}>
            Revisar
          </Button>
        </div>
      ))}
    </div>
  )
}
