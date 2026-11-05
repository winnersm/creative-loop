"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAssetActions } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Role } from "@/generated/prisma/enums"
import type { Metrics } from "@/lib/metrics"
import { cn } from "@/lib/utils"
import type { AssetDetail } from "@/server/queries"
import { SimilarPanel } from "./similar-panel"
import { CommentPanel, type ComposerHandle } from "./comment-panel"
import { ImageViewer } from "./image-viewer"
import { BriefPanel, HistoryPanel, PerformancePanel, QaPanel } from "./panels"
import { ReviewPlayer, type PlayerHandle } from "./review-player"
import { VersionUploader } from "./version-uploader"

type Props = {
  detail: AssetDetail
  versionNumber: number | null
  user: { id: string; role: Role }
  perms: {
    canComment: boolean
    canReply: boolean
    canUpload: boolean
    canEditBrief: boolean
    canDecide: boolean
    canOverride: boolean
  }
  metrics: Metrics | null
}

export function AssetWorkspace({ detail, versionNumber, user, perms, metrics }: Props) {
  const router = useRouter()
  const { asset, tags, moneyVisible } = detail
  const versions = asset.versions
  const version = versions.find((v) => v.number === versionNumber) ?? versions[0] ?? null
  const latest = versions[0] ?? null
  const isVideo = asset.mediaType === "VIDEO"
  const player = useRef<PlayerHandle>(null)
  const composer = useRef<ComposerHandle>(null)
  const [timeMs, setTimeMs] = useState(0)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [tab, setTab] = useState<string>("comments")
  const { transition, pending } = useAssetActions()

  // Mientras se procesa una versión, refrescar cada 4 s.
  const processing = versions.some((v) => v.status === "PROCESSING")
  useEffect(() => {
    if (!processing) return
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [processing, router])

  const onCommentKey = useCallback((ms: number) => {
    setTimeMs(ms)
    setTab("comments")
    setTimeout(() => composer.current?.focus(), 0)
  }, [])
  const onTime = useCallback((ms: number) => setTimeMs(ms), [])

  const inReviewNow = asset.productionStatus === "IN_REVIEW" && version?.id === latest?.id
  const openComments = version?.comments.filter((c) => !c.resolved) ?? []
  const openMust = openComments.filter((c) => c.severity === "MUST").length

  const uploadBlocked = !perms.canUpload
    ? "Solo el editor asignado o el responsable pueden subir versiones."
    : asset.productionStatus === "BRIEF"
      ? "Pulsa «Empezar» para poder subir la primera versión."
      : !["IN_PROGRESS", "CHANGES_REQUESTED"].includes(asset.productionStatus)
        ? "Solo se suben versiones mientras se edita o cuando piden cambios."
        : null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Zona de revisión */}
      <div className="review-surface flex min-h-[60vh] flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-sm">
          <span className="opacity-70">Versión</span>
          <div className="flex gap-1">
            {versions.map((v) => (
              <Link
                key={v.id}
                href={`?v=${v.number}`}
                scroll={false}
                className={cn(
                  "rounded px-2 py-0.5 text-xs",
                  v.id === version?.id ? "bg-white text-black" : "bg-white/10 hover:bg-white/20",
                )}
              >
                V{v.number}
                {v.submittedAt ? "" : v.status === "READY" ? " ·" : ""}
              </Link>
            ))}
          </div>
          {version && version.status === "READY" && (
            <Button size="xs" variant="ghost" className="ml-auto text-white hover:bg-white/10 hover:text-white" nativeButton={false} render={<a href={`/api/versions/${version.id}/download`} />}>
              <Download /> Original
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {!version ? (
            <div className="flex h-full items-center justify-center p-8 text-sm opacity-60">Todavía no hay versiones.</div>
          ) : version.status !== "READY" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm opacity-80">
              {version.status === "FAILED" ? (
                <span className="text-red-300">El procesamiento falló: {version.processingError}</span>
              ) : (
                <>
                  <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {version.status === "UPLOADING" ? "Subida en curso…" : "Procesando: control técnico, vista previa y miniaturas…"}
                </>
              )}
            </div>
          ) : !version.proxyKey ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-red-300">
              No se pudo generar la vista previa. Revisa el control técnico.
            </div>
          ) : isVideo ? (
            <ReviewPlayer
              key={version.id}
              ref={player}
              src={`/api/versions/${version.id}/proxy`}
              sprite={
                version.spriteKey && version.spriteCount && version.spriteTileW && version.spriteTileH
                  ? {
                      url: `/api/versions/${version.id}/sprite`,
                      count: version.spriteCount,
                      tileW: version.spriteTileW,
                      tileH: version.spriteTileH,
                      cols: 10,
                    }
                  : null
              }
              fps={version.fps}
              durationMs={version.durationMs}
              markers={version.comments
                .filter((c) => c.timeMs != null)
                .map((c) => ({ id: c.id, timeMs: c.timeMs!, severity: c.severity, resolved: c.resolved }))}
              activeMarker={active}
              onTime={onTime}
              onCommentKey={perms.canComment ? onCommentKey : undefined}
              onMarkerClick={(id) => {
                setActive(id)
                setTab("comments")
              }}
            />
          ) : (
            <ImageViewer
              key={version.id}
              src={`/api/versions/${version.id}/proxy`}
              pins={version.comments
                .map((c, i) => ({ c, n: i + 1 }))
                .filter(({ c }) => c.x != null && c.y != null)
                .map(({ c, n }) => ({ id: c.id, x: c.x!, y: c.y!, severity: c.severity, resolved: c.resolved, n }))}
              pending={point}
              activePin={active}
              onPick={
                perms.canComment
                  ? (p) => {
                      setPoint(p)
                      setTab("comments")
                      setTimeout(() => composer.current?.focus(), 0)
                    }
                  : undefined
              }
              onPinClick={(id) => {
                setActive(id)
                setTab("comments")
              }}
            />
          )}
        </div>

        {inReviewNow && perms.canDecide && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/5 px-3 py-2.5">
            <span className="mr-auto text-sm">
              Decisión sobre <b>{version?.code}</b>
              <span className="ml-2 opacity-70">
                {openComments.length} abiertos · {openMust} obligatorios
              </span>
            </span>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              disabled={pending}
              onClick={() => void transition(asset.id, "REJECTED", true, "Rechazar")}
            >
              Rechazar
            </Button>
            <Button
              className="bg-[var(--status-stuck)] text-white hover:bg-[var(--status-stuck)]/85"
              disabled={pending}
              onClick={() => void transition(asset.id, "CHANGES_REQUESTED", false)}
            >
              Pedir cambios
            </Button>
            <Button
              className="bg-[var(--status-done)] text-white hover:bg-[var(--status-done)]/85"
              disabled={pending}
              title={openMust ? "Quedan comentarios obligatorios abiertos" : undefined}
              onClick={() => void transition(asset.id, "APPROVED", false)}
            >
              Aprobar
            </Button>
          </div>
        )}
        <div className="border-t border-white/10 p-3 text-foreground [&_*]:border-white/15">
          <div className="rounded-lg bg-background p-1">
            <VersionUploader
              assetId={asset.id}
              accept={isVideo ? "video/*" : "image/jpeg,image/png,image/webp"}
              disabledReason={uploadBlocked}
            />
          </div>
        </div>
      </div>

      {/* Panel lateral */}
      <aside className="flex min-h-0 flex-col border-l bg-background">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList variant="line" className="w-full flex-wrap justify-start gap-0 border-b px-2 group-data-horizontal/tabs:h-auto">
            <TabsTrigger className="h-8 flex-none" value="comments">Comentarios</TabsTrigger>
            <TabsTrigger className="h-8 flex-none" value="qa">Control</TabsTrigger>
            <TabsTrigger className="h-8 flex-none" value="brief">Indicaciones</TabsTrigger>
            <TabsTrigger className="h-8 flex-none" value="history">Historial</TabsTrigger>
            <TabsTrigger className="h-8 flex-none" value="similar">Similares{detail.similar.length ? ` (${detail.similar.length})` : ""}</TabsTrigger>
            {moneyVisible && <TabsTrigger className="h-8 flex-none" value="perf">Rendimiento</TabsTrigger>}
          </TabsList>
          <TabsContent value="comments" className="min-h-0 flex-1">
            {version ? (
              <CommentPanel
                ref={composer}
                versionId={version.id}
                isVideo={isVideo}
                comments={version.comments}
                userId={user.id}
                canCreate={perms.canComment && version.status === "READY"}
                canReply={perms.canReply}
                anchor={{ timeMs: isVideo ? timeMs : null, x: point?.x ?? null, y: point?.y ?? null }}
                activeId={active}
                onSelect={(c) => {
                  setActive(c.id)
                  if (c.timeMs != null) player.current?.seek(c.timeMs)
                }}
                onPosted={() => setPoint(null)}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Sin versiones todavía.</p>
            )}
          </TabsContent>
          <TabsContent value="qa" className="min-h-0 flex-1 overflow-y-auto">
            {version ? <QaPanel version={version} asset={asset} /> : <p className="p-4 text-sm text-muted-foreground">Sin versiones.</p>}
          </TabsContent>
          <TabsContent value="brief" className="min-h-0 flex-1 overflow-y-auto">
            <BriefPanel asset={asset} tags={tags} editable={perms.canEditBrief} />
          </TabsContent>
          <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
            <HistoryPanel asset={asset} />
          </TabsContent>
          <TabsContent value="similar" className="min-h-0 flex-1 overflow-y-auto">
            <SimilarPanel similar={detail.similar} moneyVisible={moneyVisible} />
          </TabsContent>
          {moneyVisible && (
            <TabsContent value="perf" className="min-h-0 flex-1 overflow-y-auto">
              <PerformancePanel asset={asset} metrics={metrics} canOverride={perms.canOverride} />
            </TabsContent>
          )}
        </Tabs>
      </aside>
    </div>
  )
}
