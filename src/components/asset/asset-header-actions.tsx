"use client"

import { Copy, GitBranch, Play, Send } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAssetActions } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import type { ProductionStatus, Role } from "@/generated/prisma/enums"
import { duplicateAsset } from "@/server/assets"

/** Botones principales del editor: Empezar y Enviar a revisión. */
export function AssetHeaderActions({
  assetId,
  assetCode,
  status,
  role,
  isAssignee,
  canDuplicate,
  submitBlocker,
}: {
  assetId: string
  assetCode: string
  status: ProductionStatus
  role: Role
  isAssignee: boolean
  canDuplicate: boolean
  submitBlocker: string | null
}) {
  const router = useRouter()
  const { transition, exec, pending } = useAssetActions()
  const canWork = isAssignee || role === "OWNER" || role === "MANAGER"
  return (
    <>
      {canWork && status === "BRIEF" && (
        <Button disabled={pending} onClick={() => void transition(assetId, "IN_PROGRESS", false)}>
          <Play /> Empezar
        </Button>
      )}
      {canWork && (status === "IN_PROGRESS" || status === "CHANGES_REQUESTED") && (
        <div className="flex items-center gap-2">
          {submitBlocker && <span className="text-xs text-muted-foreground">{submitBlocker}</span>}
          <Button disabled={pending || !!submitBlocker} onClick={() => void transition(assetId, "IN_REVIEW", false)}>
            <Send /> Enviar a revisión
          </Button>
        </div>
      )}
      {canDuplicate && (
        <Button variant="outline" nativeButton={false} render={<Link href={`/boards?vary=${assetCode}`} />}>
          <GitBranch /> Crear variaciones
        </Button>
      )}
      {canDuplicate && (
        <Button
          variant="outline"
          disabled={pending}
          title="Copia sin vínculo con este creativo"
          onClick={async () => {
            const code = await exec(() => duplicateAsset(assetId), (c) => `Creado ${c} (copia sin vínculo)`)
            if (code) router.push(`/assets/${code}`)
          }}
        >
          <Copy /> Duplicar
        </Button>
      )}
    </>
  )
}
