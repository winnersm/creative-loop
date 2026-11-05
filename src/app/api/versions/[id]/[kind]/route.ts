// URLs firmadas: /api/versions/:id/proxy · /thumb · /sprite · /download (F-404, F-707)
import { NextResponse } from "next/server"
import { downloadFileName } from "@/lib/codes"
import { canViewAsset } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { BUCKET_DERIVED, BUCKET_ORIGINALS, signedGetUrl } from "@/lib/s3"
import { getCurrentUser } from "@/lib/session"

export async function GET(_req: Request, ctx: RouteContext<"/api/versions/[id]/[kind]">) {
  const { id, kind } = await ctx.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const version = await prisma.version.findUnique({ where: { id }, include: { asset: true } })
  if (!version || !canViewAsset(user, version.asset))
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  let url: string | null = null
  if (kind === "proxy" && version.proxyKey) url = await signedGetUrl(BUCKET_DERIVED, version.proxyKey)
  else if (kind === "thumb" && version.thumbKey) url = await signedGetUrl(BUCKET_DERIVED, version.thumbKey)
  else if (kind === "sprite" && version.spriteKey) url = await signedGetUrl(BUCKET_DERIVED, version.spriteKey)
  else if (kind === "download")
    url = await signedGetUrl(BUCKET_ORIGINALS, version.originalKey, downloadFileName(version.code, version.originalName))
  if (!url) return NextResponse.json({ error: "No disponible" }, { status: 404 })
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=600" } })
}
