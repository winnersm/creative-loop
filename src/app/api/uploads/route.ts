// Subida multipart directa del navegador a S3 (F-401).
// Un solo endpoint con "op" para mantener juntas las comprobaciones de permisos.
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { versionCode } from "@/lib/codes"
import { notify } from "@/lib/events"
import { canUploadVersion } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { enqueueProcessVersion } from "@/lib/queue"
import {
  abortMultipart,
  BUCKET_ORIGINALS,
  completeMultipart,
  createMultipart,
  deleteObject,
  listParts,
  objectSize,
  originalKey,
  signPart,
} from "@/lib/s3"
import { getCurrentUser } from "@/lib/session"

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 4096) * 1024 * 1024

const VIDEO_MIME = /^video\//
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/

const body = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    assetId: z.string(),
    filename: z.string().min(1),
    type: z.string(),
    size: z.number().int().positive(),
  }),
  z.object({ op: z.literal("sign"), versionId: z.string(), partNumber: z.number().int().min(1).max(10000) }),
  z.object({ op: z.literal("list"), versionId: z.string() }),
  z.object({ op: z.literal("complete"), versionId: z.string() }),
  z.object({ op: z.literal("abort"), versionId: z.string() }),
])

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return fail("No autenticado", 401)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail("Petición no válida")
  const input = parsed.data

  if (input.op === "create") {
    const asset = await prisma.asset.findUnique({ where: { id: input.assetId } })
    if (!asset) return fail("Creativo no encontrado", 404)
    if (!canUploadVersion(user, asset)) return fail("No puedes subir versiones a este creativo", 403)
    if (!["IN_PROGRESS", "CHANGES_REQUESTED"].includes(asset.productionStatus))
      return fail("Pulsa «Empezar» antes de subir, o espera a que pidan cambios.")
    if (input.size > MAX_BYTES) return fail(`El archivo supera el máximo de ${process.env.MAX_UPLOAD_MB ?? 4096} MB.`)
    const typeOk = asset.mediaType === "VIDEO" ? VIDEO_MIME.test(input.type) : IMAGE_MIME.test(input.type)
    if (!typeOk)
      return fail(asset.mediaType === "VIDEO" ? "Este creativo espera un video." : "Este creativo espera una imagen JPG, PNG o WebP.")

    // Reanudar: mismo archivo con una subida a medias → se continúa esa versión.
    const pending = await prisma.version.findMany({ where: { assetId: asset.id, status: "UPLOADING" } })
    for (const p of pending) {
      if (p.uploadId && p.originalName === input.filename && Number(p.sizeBytes) === input.size && p.uploadedById === user.id)
        return NextResponse.json({ versionId: p.id, uploadId: p.uploadId, key: p.originalKey, resumed: true })
      if (p.uploadId) await abortMultipart(p.originalKey, p.uploadId).catch(() => {})
      await prisma.version.delete({ where: { id: p.id } })
    }

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: { versionCounter: { increment: 1 } },
    })
    const n = updated.versionCounter
    const code = versionCode(asset.code, n)
    const key = originalKey(asset.code, code, input.filename)
    const uploadId = await createMultipart(key, input.type)
    const version = await prisma.version.create({
      data: {
        assetId: asset.id,
        number: n,
        code,
        originalKey: key,
        originalName: input.filename,
        mimeType: input.type,
        sizeBytes: BigInt(input.size),
        uploadId,
        uploadedById: user.id,
      },
    })
    return NextResponse.json({ versionId: version.id, uploadId, key })
  }

  const version = await prisma.version.findUnique({ where: { id: input.versionId }, include: { asset: true } })
  if (!version) return fail("Versión no encontrada", 404)
  if (!canUploadVersion(user, version.asset)) return fail("Sin permiso", 403)
  if (version.status !== "UPLOADING" || !version.uploadId) return fail("La subida ya terminó")

  switch (input.op) {
    case "sign":
      return NextResponse.json({ url: await signPart(version.originalKey, version.uploadId, input.partNumber) })
    case "list":
      return NextResponse.json({ parts: await listParts(version.originalKey, version.uploadId) })
    case "abort":
      await abortMultipart(version.originalKey, version.uploadId).catch(() => {})
      await prisma.version.delete({ where: { id: version.id } })
      return NextResponse.json({ ok: true })
    case "complete": {
      // Los ETag se leen de S3: el navegador no necesita acceso a esa cabecera (CORS).
      const parts = await listParts(version.originalKey, version.uploadId)
      if (!parts.length) return fail("No se ha subido ninguna parte")
      // Si el almacenamiento da el tamaño de cada parte (MinIO), se comprueba
      // antes de ensamblar. Supabase no lo da: ahí se comprueba el objeto final.
      const sizes = parts.map((p) => p.Size)
      if (sizes.every((s) => s !== null)) {
        const expected = sizes.reduce((n, s) => n + s!, 0)
        if (expected !== Number(version.sizeBytes)) return fail("La subida está incompleta")
      }
      await completeMultipart(version.originalKey, version.uploadId, parts)
      const finalSize = await objectSize(BUCKET_ORIGINALS, version.originalKey)
      if (finalSize !== null && finalSize !== Number(version.sizeBytes)) {
        // Quedó a medias: se borra el objeto y la versión para poder reintentar.
        await deleteObject(BUCKET_ORIGINALS, version.originalKey).catch(() => {})
        await prisma.version.delete({ where: { id: version.id } })
        return fail("La subida está incompleta. Vuelve a subir el archivo.")
      }
      await prisma.version.update({
        where: { id: version.id },
        data: { status: "PROCESSING", uploadId: null },
      })
      await enqueueProcessVersion(version.id)
      await notify(prisma, [user.id], {
        type: "version.uploaded",
        title: `${version.code} subido, procesando…`,
        href: `/assets/${version.asset.code}?v=${version.number}`,
      })
      return NextResponse.json({ ok: true, versionId: version.id, number: version.number })
    }
  }
}
