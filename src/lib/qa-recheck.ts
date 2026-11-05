// Recalcula el control técnico con los metadatos ya guardados (sin reprocesar el archivo).
// Se usa al cambiar el formato de un creativo o al cambiar las reglas del control.
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import type { AssetFormat, MediaType } from "@/generated/prisma/enums"
import { runQa } from "@/lib/qa-rules"

type Db = Prisma.TransactionClient | PrismaClient

type StoredVersion = {
  id: string
  width: number | null
  height: number | null
  durationMs: number | null
  fps: number | null
  container: string | null
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean | null
  sizeBytes: bigint
}

async function recheck(db: Db, v: StoredVersion, format: AssetFormat, mediaType: MediaType) {
  const checks = runQa(
    {
      ok: v.width != null,
      container: v.container,
      width: v.width,
      height: v.height,
      durationMs: v.durationMs,
      fps: v.fps,
      videoCodec: v.videoCodec,
      audioCodec: v.audioCodec,
      hasAudio: !!v.hasAudio,
      sizeBytes: Number(v.sizeBytes),
    },
    format,
    mediaType,
  )
  // "decode" solo lo produce el procesamiento real: se conserva.
  await db.qaCheck.deleteMany({ where: { versionId: v.id, key: { not: "decode" } } })
  await db.qaCheck.createMany({ data: checks.map((c) => ({ ...c, versionId: v.id })) })
}

/** Última versión lista y aún no enviada de un creativo. */
export async function recheckLatestVersion(db: Db, assetId: string, format: AssetFormat, mediaType: MediaType) {
  const v = await db.version.findFirst({ where: { assetId, status: "READY" }, orderBy: { number: "desc" } })
  if (!v || v.submittedAt) return false
  await recheck(db, v, format, mediaType)
  return true
}

/** Todas las versiones listas que aún no se han enviado a revisión. */
export async function recheckPendingVersions(db: Db) {
  const versions = await db.version.findMany({
    where: { status: "READY", submittedAt: null },
    include: { asset: { select: { format: true, mediaType: true } } },
  })
  for (const v of versions) await recheck(db, v, v.asset.format, v.asset.mediaType)
  return versions.length
}
