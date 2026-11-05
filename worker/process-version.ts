// Job process-version: descarga → ffprobe → control técnico → vista previa → miniaturas → aviso.
import { createWriteStream } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"
import { managerIds, notify } from "@/lib/events"
import { prisma } from "@/lib/prisma"
import { blockingFailures, runQa } from "@/lib/qa-rules"
import { BUCKET_DERIVED, BUCKET_ORIGINALS, getObjectStream, putObject } from "@/lib/s3"
import { makeImageProxy, makeImageThumb, makeVideoProxy, makeVideoSprite, makeVideoThumb, probe } from "./media"

export async function processVersion(versionId: string) {
  const version = await prisma.version.findUnique({ where: { id: versionId }, include: { asset: true } })
  if (!version) return { skipped: "no existe" }
  const { asset } = version
  const dir = await mkdtemp(join(tmpdir(), "cl-"))
  const ext = version.originalKey.split(".").pop()
  const input = join(dir, `original.${ext}`)
  const isVideo = asset.mediaType === "VIDEO"

  try {
    await pipeline(await getObjectStream(BUCKET_ORIGINALS, version.originalKey), createWriteStream(input))

    const info = await probe(input, Number(version.sizeBytes))
    const checks = runQa(info, asset.format, asset.mediaType)

    let proxyKey: string | null = null
    let thumbKey: string | null = null
    let processingError: string | null = null
    let sprite: { key: string; count: number; tileW: number; tileH: number } | null = null

    if (info.ok) {
      const base = `${asset.code}/${version.code}`
      try {
        if (isVideo) {
          const proxy = join(dir, "proxy.mp4")
          const thumb = join(dir, "thumb.jpg")
          await makeVideoProxy(input, proxy)
          await makeVideoThumb(proxy, thumb, info.durationMs)
          await putObject(BUCKET_DERIVED, `${base}/proxy.mp4`, await readFile(proxy), "video/mp4")
          await putObject(BUCKET_DERIVED, `${base}/thumb.jpg`, await readFile(thumb), "image/jpeg")
          proxyKey = `${base}/proxy.mp4`
          // El mosaico es opcional: si falla, la versión sigue siendo válida.
          if (info.durationMs && info.width && info.height) {
            try {
              const spritePath = join(dir, "sprite.jpg")
              const r = await makeVideoSprite(proxy, spritePath, info.durationMs, info.width, info.height)
              await putObject(BUCKET_DERIVED, `${base}/sprite.jpg`, await readFile(spritePath), "image/jpeg")
              sprite = { key: `${base}/sprite.jpg`, ...r }
            } catch (e) {
              console.warn(`sprite ${version.code}: ${(e as Error).message}`)
            }
          }
        } else {
          const proxy = join(dir, "proxy.jpg")
          const thumb = join(dir, "thumb.jpg")
          await makeImageProxy(input, proxy)
          await makeImageThumb(input, thumb)
          await putObject(BUCKET_DERIVED, `${base}/proxy.jpg`, await readFile(proxy), "image/jpeg")
          await putObject(BUCKET_DERIVED, `${base}/thumb.jpg`, await readFile(thumb), "image/jpeg")
          proxyKey = `${base}/proxy.jpg`
        }
        thumbKey = `${base}/thumb.jpg`
      } catch (e) {
        // Si no se puede transcodificar, el archivo está dañado: fallo bloqueante.
        processingError = (e as Error).message
        checks.push({
          key: "decode",
          label: "Decodificación completa",
          severity: "BLOCKING",
          result: "FAIL",
          detail: processingError.slice(0, 300),
        })
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.qaCheck.deleteMany({ where: { versionId } })
      await tx.qaCheck.createMany({ data: checks.map((c) => ({ ...c, versionId })) })
      await tx.version.update({
        where: { id: versionId },
        data: {
          status: "READY",
          proxyKey,
          thumbKey,
          spriteKey: sprite?.key ?? null,
          spriteCount: sprite?.count ?? null,
          spriteTileW: sprite?.tileW ?? null,
          spriteTileH: sprite?.tileH ?? null,
          width: info.width,
          height: info.height,
          durationMs: info.durationMs,
          fps: info.fps,
          videoCodec: info.videoCodec,
          audioCodec: info.audioCodec,
          container: info.container,
          hasAudio: info.hasAudio,
          processingError,
          processedAt: new Date(),
        },
      })
      const blocking = blockingFailures(checks)
      const warnings = checks.filter((c) => c.severity === "WARNING" && c.result === "FAIL").length
      await notify(tx, [version.uploadedById], {
        type: "version.processed",
        title: blocking ? `${version.code}: ${blocking} fallo(s) técnico(s)` : `${version.code} listo`,
        body: blocking
          ? "Corrige los fallos bloqueantes y sube otra versión."
          : warnings
            ? `${warnings} aviso(s). Ya puedes enviarlo a revisión.`
            : "Control técnico correcto. Ya puedes enviarlo a revisión.",
        href: `/assets/${asset.code}?v=${version.number}`,
        // Si el control técnico salió limpio, el editor ya lo ve en la app.
        slack: blocking > 0,
      })
    })
    return { checks: checks.length, blocking: blockingFailures(checks) }
  } catch (e) {
    await prisma.version.update({
      where: { id: versionId },
      data: { status: "FAILED", processingError: (e as Error).message.slice(0, 500) },
    })
    // Hasta ahora una versión podía quedarse en «falló» sin que nadie se
    // enterara. Va al canal técnico, que es quien puede hacer algo.
    const v = await prisma.version.findUnique({ where: { id: versionId }, include: { asset: true } })
    if (v)
      await notify(prisma, await managerIds(prisma), {
        type: "version.failed",
        title: `${v.code}: el procesamiento falló`,
        body: (e as Error).message.slice(0, 300),
        href: `/assets/${v.asset.code}?v=${v.number}`,
      })
    throw e
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
