import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AssetHeaderActions } from "@/components/asset/asset-header-actions"
import { AssetWorkspace } from "@/components/asset/asset-workspace"
import { LaunchPackage } from "@/components/asset/launch-package"
import { WinnerLab } from "@/components/asset/winner-lab"
import { prisma } from "@/lib/prisma"
import { PerformancePill, StatusCell } from "@/components/board/cells"
import { UserAvatar } from "@/components/board/user-avatar"
import { isOverdue, shortDate } from "@/lib/format"
import { can, canComment, canReplyOrResolve, canUploadVersion } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { FORMAT, MEDIA_TYPE, PRIORITY } from "@/lib/status"
import { buildLaunchData } from "@/server/launch"
import { getAssetDetail } from "@/server/queries"

export async function generateMetadata({ params }: PageProps<"/assets/[code]">) {
  const { code } = await params
  return { title: `${code} · Creative Loop` }
}

export default async function AssetPage({ params, searchParams }: PageProps<"/assets/[code]">) {
  const user = await requireUser()
  const { code } = await params
  const sp = await searchParams
  const detail = await getAssetDetail(user, decodeURIComponent(code))
  if (!detail) notFound()
  const { asset, tags } = detail
  const v = Number(Array.isArray(sp.v) ? sp.v[0] : sp.v)
  const latest = asset.versions[0] ?? null

  const angle = tags.find((t) => t.key === "angle")?.value ?? "creative"
  const launch =
    asset.productionStatus === "APPROVED" && asset.approvedVersion && can(user, "launch.manage")
      ? buildLaunchData({ asset, version: asset.approvedVersion, angle })
      : null

  const isAssignee = asset.editorId === user.id
  const showWinnerLab =
    can(user, "asset.create") && ["WINNER", "TESTING"].includes(asset.performanceStatus) && asset.mediaType === "VIDEO"
  const editors = showWinnerLab
    ? await prisma.user.findMany({
        where: { role: { in: ["EDITOR", "MANAGER"] }, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : []
  const overdue = isOverdue(asset.deadline, asset.productionStatus)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-5 py-3">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          {asset.offer ? (
            <Link href={`/boards?offer=${asset.offer.id}`} className="hover:text-foreground">
              {asset.offer.code} · {asset.offer.name}
            </Link>
          ) : (
            <span>Sin oferta</span>
          )}
          <ChevronRight className="size-3" />
          <Link href={`/boards?q=${asset.concept.code}`} className="hover:text-foreground">
            {asset.concept.title}
          </Link>
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{asset.code}</h1>
          <div className="h-8 w-40 overflow-hidden rounded">
            <StatusCell assetId={asset.id} status={asset.productionStatus} role={user.role} isAssignee={isAssignee} />
          </div>
          <PerformancePill status={asset.performanceStatus} className="h-8 px-3 text-[13px]" />
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {MEDIA_TYPE[asset.mediaType]} · {FORMAT[asset.format].label}
            </span>
            <span className="flex items-center gap-1.5">
              {asset.editor ? <UserAvatar name={asset.editor.name} size={22} /> : null}
              {asset.editor?.name ?? "Sin editor"}
            </span>
            <span className={overdue ? "font-medium text-destructive" : undefined}>
              Fecha límite {shortDate(asset.deadline)}
              {overdue ? " · atrasado" : ""}
            </span>
            <span>Prioridad {PRIORITY[asset.priority].label.toLowerCase()}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AssetHeaderActions
              assetId={asset.id}
              assetCode={asset.code}
              status={asset.productionStatus}
              role={user.role}
              isAssignee={isAssignee}
              canDuplicate={can(user, "asset.create")}
              submitBlocker={
                !latest || latest.submittedAt
                  ? "Sube una versión nueva"
                  : latest.status !== "READY"
                    ? "Espera a que termine el procesamiento"
                    : latest.qaChecks.some((c) => c.severity === "BLOCKING" && c.result === "FAIL")
                      ? "La última versión tiene fallos técnicos bloqueantes"
                      : null
              }
            />
            {showWinnerLab && (
              <WinnerLab
                assetId={asset.id}
                assetCode={asset.code}
                hasScript={!!asset.script.trim()}
                editors={editors}
                defaultEditorId={asset.editorId}
              />
            )}
            {launch && <LaunchPackage data={launch} />}
          </div>
        </div>
      </div>
      <AssetWorkspace
        detail={detail}
        versionNumber={Number.isFinite(v) ? v : null}
        user={{ id: user.id, role: user.role }}
        metrics={detail.metrics}
        perms={{
          canComment: canComment(user),
          canReply: canReplyOrResolve(user, asset),
          canUpload: canUploadVersion(user, asset),
          canEditBrief: can(user, "asset.assign"),
          canDecide: can(user, "review.decide"),
          canOverride: can(user, "performance.override"),
        }}
      />
    </div>
  )
}
