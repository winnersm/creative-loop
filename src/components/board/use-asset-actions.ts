"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import type { ProductionStatus } from "@/generated/prisma/enums"
import type { ActionResult } from "@/lib/action"
import { PRODUCTION_STATUS } from "@/lib/status"
import { transitionAsset, updateAsset, type AssetPatch } from "@/server/assets"
import { askArchive, askReason } from "./reason-dialog"

/** Ejecuta una server action, muestra el error y refresca la página. */
export function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  function exec<T>(fn: () => Promise<ActionResult<T>>, success?: string | ((data: T) => string)) {
    return new Promise<T | null>((resolve) =>
      start(async () => {
        const res = await fn()
        if (!res.ok) {
          toast.error(res.error)
          resolve(null)
          return
        }
        if (success) toast.success(typeof success === "function" ? success(res.data) : success)
        router.refresh()
        resolve(res.data)
      }),
    )
  }
  return { exec, pending }
}

export function useAssetActions() {
  const { exec, pending } = useAction()

  async function transition(assetId: string, to: ProductionStatus, requiresReason: boolean, label?: string) {
    let reason: string | undefined
    if (to === "ARCHIVED") return archive(assetId)
    if (requiresReason) {
      const r = await askReason(`${label ?? PRODUCTION_STATUS[to].label}: motivo`, { confirm: label ?? "Confirmar" })
      if (r === null) return false
      reason = r
    }
    const ok = await exec(() => transitionAsset(assetId, to, reason), `Estado: ${PRODUCTION_STATUS[to].label}`)
    return ok !== null
  }

  /** Archivar con motivo de la lista cerrada. */
  async function archive(assetId: string, code?: string) {
    const a = await askArchive(code ? `Archivar ${code}` : "Archivar creativo", {
      description: "Sale del tablero. Si ya se lanzó, su rendimiento se sigue midiendo.",
    })
    if (!a) return false
    const ok = await exec(() => transitionAsset(assetId, "ARCHIVED", a.note || undefined, a.archiveReason), "Creativo archivado")
    return ok !== null
  }

  /** Descartar: archivar con «Descartado sin testear». Solo para lo que nunca se lanzó. */
  async function discard(assetId: string, code?: string) {
    const a = await askArchive(code ? `Descartar ${code}` : "Descartar creativo", {
      description: "Se archiva como «Descartado sin testear». Cuenta como producción que no llegó a lanzarse.",
      confirm: "Descartar",
      preset: "NOT_TESTED",
    })
    if (!a) return false
    const ok = await exec(() => transitionAsset(assetId, "ARCHIVED", a.note || undefined, "NOT_TESTED"), "Creativo descartado")
    return ok !== null
  }

  function update(assetId: string, patch: AssetPatch) {
    return exec(() => updateAsset(assetId, patch))
  }

  return { transition, archive, discard, update, exec, pending }
}
