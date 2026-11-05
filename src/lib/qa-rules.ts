// QA técnico (F-402). Lógica pura: recibe los metadatos de ffprobe y devuelve checks.

import type { AssetFormat, MediaType } from "@/generated/prisma/enums"
import { FORMAT } from "@/lib/status"

export type MediaInfo = {
  ok: boolean
  error?: string
  container: string | null
  width: number | null
  height: number | null
  durationMs: number | null
  fps: number | null
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  sizeBytes: number
}

export type Check = {
  key: string
  label: string
  severity: "BLOCKING" | "WARNING"
  result: "PASS" | "FAIL"
  detail: string
}

const VIDEO_CONTAINERS = ["mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm"]
const VIDEO_CODECS = ["h264", "hevc", "vp9", "av1"]
const IMAGE_CODECS = ["mjpeg", "png", "webp"]

const MB = 1024 * 1024
const GB = 1024 * MB

export function runQa(info: MediaInfo, format: AssetFormat, mediaType: MediaType): Check[] {
  const checks: Check[] = []
  const add = (
    key: string,
    label: string,
    severity: Check["severity"],
    pass: boolean,
    detail: string,
  ) => checks.push({ key, label, severity, result: pass ? "PASS" : "FAIL", detail })

  add("readable", "Archivo legible", "BLOCKING", info.ok, info.ok ? "OK" : info.error ?? "No se pudo leer")
  if (!info.ok) return checks

  const isVideo = mediaType === "VIDEO"
  const codec = info.videoCodec ?? ""

  if (isVideo) {
    const containerOk = (info.container ?? "").split(",").some((c) => VIDEO_CONTAINERS.includes(c))
    add("container", "Contenedor", "BLOCKING", containerOk, info.container ?? "desconocido")
    add(
      "codec",
      "Códec de video",
      "BLOCKING",
      VIDEO_CODECS.includes(codec),
      codec ? `${codec}${VIDEO_CODECS.includes(codec) ? "" : " (usa H.264 o HEVC)"}` : "sin pista de video",
    )
  } else {
    add("codec", "Formato de imagen", "BLOCKING", IMAGE_CODECS.includes(codec), codec || "desconocido")
  }

  const w = info.width ?? 0
  const h = info.height ?? 0
  const expected = FORMAT[format].ratio
  const actual = h > 0 ? w / h : 0
  const ratioOk = actual > 0 && Math.abs(actual - expected) / expected <= 0.02
  add(
    "aspect",
    "Aspect ratio",
    "BLOCKING",
    ratioOk,
    `${w}×${h} (${actual.toFixed(3)}) · pedido ${FORMAT[format].label}`,
  )

  const short = Math.min(w, h)
  // Mínimos de Meta: video 500 px de ancho (250 px si dura menos de 30 s); imagen 600 px.
  const minBlocking = isVideo ? ((info.durationMs ?? 0) < 30_000 ? 250 : 500) : 600
  add(
    "resolution_min",
    "Resolución mínima de Meta",
    "BLOCKING",
    short >= minBlocking,
    `lado corto ${short}px · mínimo ${minBlocking}px`,
  )
  add("resolution_rec", "Resolución recomendada", "WARNING", short >= 1080, `lado corto ${short}px · recomendado 1080px`)

  if (isVideo) {
    const s = (info.durationMs ?? 0) / 1000
    add("duration", "Duración", "BLOCKING", s >= 1 && s <= 240 * 60, `${s.toFixed(1)} s · rango 1 s–240 min`)
    if (format === "VERTICAL")
      add("duration_reels", "Duración para Reels", "WARNING", s <= 90, `${s.toFixed(1)} s · recomendado ≤ 90 s`)
    const fps = info.fps ?? 0
    add("fps", "FPS", "WARNING", fps >= 23 && fps <= 60, `${fps ? fps.toFixed(2) : "?"} fps · rango 23–60`)
    add("audio", "Pista de audio", "WARNING", info.hasAudio, info.hasAudio ? info.audioCodec ?? "sí" : "sin audio")
    add("size", "Peso", "BLOCKING", info.sizeBytes <= 4 * GB, `${(info.sizeBytes / MB).toFixed(1)} MB · máximo 4 GB`)
  } else {
    add("size", "Peso", "BLOCKING", info.sizeBytes <= 30 * MB, `${(info.sizeBytes / MB).toFixed(1)} MB · máximo 30 MB`)
  }

  return checks
}

export const blockingFailures = (checks: Pick<Check, "severity" | "result">[]) =>
  checks.filter((c) => c.severity === "BLOCKING" && c.result === "FAIL").length

/** Medidas que debería tener el archivo para el formato pedido. */
export function targetSize(format: AssetFormat) {
  const r = FORMAT[format].ratio
  const [w, h] = r > 1 ? [1920, Math.round(1920 / r)] : [1080, Math.round(1080 / r)]
  return `${w}×${h}`
}

/**
 * Qué tiene que hacer el editor para arreglar un control que falla.
 * Se calcula a partir de la clave, así que también sirve para versiones
 * antiguas: no hace falta guardarlo en la base.
 */
export function howToFix(key: string, format: AssetFormat, mediaType: MediaType): string | null {
  const size = targetSize(format)
  const isVideo = mediaType === "VIDEO"
  switch (key) {
    case "readable":
      return "El archivo llegó dañado o incompleto. Vuelve a exportarlo y súbelo otra vez."
    case "container":
      return "Exporta en MP4."
    case "codec":
      return isVideo ? "Exporta el video con el códec H.264." : "Guarda la imagen en JPG, PNG o WebP."
    case "aspect":
      return `Reencuadra y exporta en ${FORMAT[format].label}, por ejemplo ${size}.`
    case "resolution_min":
    case "resolution_rec":
      return `Vuelve a exportar a mayor resolución: ${size}.`
    case "duration":
      return "La duración tiene que estar entre 1 segundo y 4 horas."
    case "duration_reels":
      return "Recorta el video a 90 segundos o menos."
    case "fps":
      return "Exporta a 30 fps."
    case "audio":
      return "El video no lleva pista de audio. Si debería llevarla, vuelve a exportarlo con sonido."
    case "size":
      return isVideo ? "Comprime el video: el máximo son 4 GB." : "Comprime la imagen: el máximo son 30 MB."
    default:
      return null
  }
}
