"use client"

import { Check, CornerDownRight, RotateCcw, Trash2 } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { UserAvatar } from "@/components/board/user-avatar"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { CommentSeverity } from "@/generated/prisma/enums"
import { timeAgo, timecode } from "@/lib/format"
import { COMMENT_SEVERITY } from "@/lib/status"
import { cn } from "@/lib/utils"
import { addComment, deleteComment, replyComment, setCommentResolved } from "@/server/comments"
import type { AssetDetail } from "@/server/queries"

type Comment = AssetDetail["asset"]["versions"][number]["comments"][number]

export type ComposerHandle = { focus: () => void }

export const CommentPanel = forwardRef<
  ComposerHandle,
  {
    versionId: string
    isVideo: boolean
    comments: Comment[]
    userId: string
    canCreate: boolean
    canReply: boolean
    anchor: { timeMs: number | null; x: number | null; y: number | null }
    activeId: string | null
    onSelect: (c: Comment) => void
    onPosted: () => void
  }
>(function CommentPanel({ versionId, isVideo, comments, userId, canCreate, canReply, anchor, activeId, onSelect, onPosted }, ref) {
  const { exec, pending } = useAction()
  const [body, setBody] = useState("")
  const [severity, setSeverity] = useState<CommentSeverity>("SHOULD")
  const [filter, setFilter] = useState<"open" | "all">("open")
  const input = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }))

  const hasAnchor = isVideo ? anchor.timeMs != null : anchor.x != null
  const shown = comments.filter((c) => filter === "all" || !c.resolved)
  const open = comments.filter((c) => !c.resolved).length

  async function submit() {
    if (!body.trim()) return
    const ok = await exec(() =>
      addComment(versionId, {
        body,
        severity,
        timeMs: isVideo ? anchor.timeMs : null,
        x: isVideo ? null : anchor.x,
        y: isVideo ? null : anchor.y,
      }),
    )
    if (ok) {
      setBody("")
      onPosted()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {canCreate && (
        <div className="border-b p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isVideo
                ? `Comentario en ${timecode(anchor.timeMs ?? 0)}`
                : hasAnchor
                  ? "Comentario en el punto marcado"
                  : "Haz clic en la imagen para marcar un punto (opcional)"}
            </span>
            {isVideo && <span className="rounded bg-secondary px-1.5 font-mono">C</span>}
          </div>
          <Textarea
            ref={input}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit()
            }}
            rows={2}
            placeholder="Qué hay que cambiar…  (⌘/Ctrl + Intro para enviar)"
          />
          <div className="mt-2 flex items-center gap-1">
            {(Object.keys(COMMENT_SEVERITY) as CommentSeverity[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium",
                  severity === s ? "text-white" : "bg-secondary text-muted-foreground",
                )}
                style={severity === s ? { background: COMMENT_SEVERITY[s].color } : undefined}
                title={s === "MUST" ? "Bloquea la aprobación" : undefined}
              >
                {COMMENT_SEVERITY[s].label}
              </button>
            ))}
            <Button size="sm" className="ml-auto" disabled={pending || !body.trim()} onClick={submit}>
              Comentar
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">{open} abiertos</span>
        <span className="text-muted-foreground">de {comments.length}</span>
        <div className="ml-auto flex rounded-md bg-secondary p-0.5 text-xs">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("rounded px-2 py-0.5", filter === f && "bg-background shadow-xs")}
            >
              {f === "open" ? "Abiertos" : "Todos"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!shown.length && <p className="p-4 text-sm text-muted-foreground">No hay comentarios {filter === "open" ? "abiertos" : ""}.</p>}
        {shown.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            n={comments.indexOf(c) + 1}
            isVideo={isVideo}
            active={activeId === c.id}
            userId={userId}
            canReply={canReply}
            onSelect={() => onSelect(c)}
          />
        ))}
      </div>
    </div>
  )
})

function CommentItem({
  c,
  n,
  isVideo,
  active,
  userId,
  canReply,
  onSelect,
}: {
  c: Comment
  n: number
  isVideo: boolean
  active: boolean
  userId: string
  canReply: boolean
  onSelect: () => void
}) {
  const { exec, pending } = useAction()
  const [reply, setReply] = useState("")
  const [replying, setReplying] = useState(false)
  const sev = COMMENT_SEVERITY[c.severity]

  return (
    <div
      className={cn("border-b px-3 py-3 text-sm", active && "bg-accent/50", c.resolved && "opacity-60")}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <button
          className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-xs hover:bg-primary hover:text-white"
          title="Ir a este punto"
        >
          {isVideo ? timecode(c.timeMs) : c.x != null ? `#${n}` : "general"}
        </button>
        <span className="rounded px-1.5 py-px text-[11px] font-medium text-white" style={{ background: sev.color }}>
          {sev.label}
        </span>
        <UserAvatar name={c.author.name} size={18} />
        <span className="font-medium">{c.author.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
      </div>
      <p className={cn("mt-1.5 whitespace-pre-wrap", c.resolved && "line-through")}>{c.body}</p>
      {c.replies.map((r) => (
        <div key={r.id} className="mt-2 flex gap-1.5 pl-2 text-[13px]">
          <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">{r.author.name}:</span> <span className="whitespace-pre-wrap">{r.body}</span>
          </div>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {canReply && (
          <>
            <Button size="xs" variant="ghost" onClick={() => setReplying(!replying)}>
              Responder
            </Button>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => void exec(() => setCommentResolved(c.id, !c.resolved))}>
              {c.resolved ? <RotateCcw /> : <Check />}
              {c.resolved ? "Reabrir" : "Resolver"}
            </Button>
          </>
        )}
        {c.author.id === userId && (
          <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => void exec(() => deleteComment(c.id))}>
            <Trash2 />
          </Button>
        )}
      </div>
      {replying && (
        <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Textarea autoFocus rows={1} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ej.: hecho en V3" />
          <Button
            size="sm"
            disabled={!reply.trim() || pending}
            onClick={async () => {
              const ok = await exec(() => replyComment(c.id, reply))
              if (ok !== null) {
                setReply("")
                setReplying(false)
              }
            }}
          >
            Enviar
          </Button>
        </div>
      )}
    </div>
  )
}
