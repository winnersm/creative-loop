"use client"

import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { relaunchAsset } from "@/server/assets"

/** F-905 · Relanzar un inconclusive. */
export function RelaunchButton({ assetId, children }: { assetId: string; children: React.ReactNode }) {
  const { exec, pending } = useAction()
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => void exec(() => relaunchAsset(assetId), "Devuelto a aprobados sin lanzar")}>
      {children}
    </Button>
  )
}
