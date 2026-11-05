// ffprobe / ffmpeg. Solo se usa dentro del worker.
import { spawn } from "node:child_process"
import type { MediaInfo } from "@/lib/qa-rules"

function exec(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args)
    let stdout = ""
    let stderr = ""
    p.stdout.on("data", (d) => (stdout += d))
    p.stderr.on("data", (d) => (stderr += d))
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
    p.on("error", (e) => resolve({ code: 1, stdout, stderr: String(e) }))
  })
}

type ProbeStream = {
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  side_data_list?: { rotation?: number }[]
  tags?: { rotate?: string }
}

const parseRate = (r?: string) => {
  if (!r) return null
  const [a, b] = r.split("/").map(Number)
  return b ? a / b : a || null
}

export async function probe(file: string, sizeBytes: number): Promise<MediaInfo> {
  const r = await exec("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file])
  const empty: MediaInfo = {
    ok: false,
    container: null,
    width: null,
    height: null,
    durationMs: null,
    fps: null,
    videoCodec: null,
    audioCodec: null,
    hasAudio: false,
    sizeBytes,
  }
  if (r.code !== 0) return { ...empty, error: r.stderr.trim().split("\n").pop() || "ffprobe falló" }
  const data = JSON.parse(r.stdout) as { streams: ProbeStream[]; format: { format_name?: string; duration?: string } }
  const video = data.streams.find((s) => s.codec_type === "video")
  const audio = data.streams.find((s) => s.codec_type === "audio")
  if (!video) return { ...empty, error: "No hay pista de video/imagen" }

  // Videos grabados en móvil pueden venir rotados: se usa la orientación visible.
  const rotation = Math.abs(Number(video.side_data_list?.find((s) => s.rotation != null)?.rotation ?? video.tags?.rotate ?? 0))
  const swap = rotation === 90 || rotation === 270
  const duration = Number(data.format.duration)
  return {
    ok: true,
    container: data.format.format_name ?? null,
    width: (swap ? video.height : video.width) ?? null,
    height: (swap ? video.width : video.height) ?? null,
    durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
    fps: parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate),
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: !!audio,
    sizeBytes,
  }
}

async function ffmpeg(args: string[]) {
  const r = await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args])
  if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").slice(-3).join(" ") || "ffmpeg falló")
}

// Lado corto a 720 px, sin agrandar.
const SCALE_720 = "scale='if(gte(iw,ih),-2,min(720,iw))':'if(gte(iw,ih),min(720,ih),-2)'"

/** Proxy 720p H.264 con faststart para revisar rápido. */
export async function makeVideoProxy(input: string, output: string) {
  await ffmpeg([
    "-i", input,
    "-vf", SCALE_720,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  ])
}

export async function makeVideoThumb(input: string, output: string, durationMs: number | null) {
  const at = durationMs && durationMs > 2000 ? "1" : "0"
  await ffmpeg(["-ss", at, "-i", input, "-frames:v", "1", "-vf", "scale=-2:360", "-q:v", "4", output])
}

/** Imagen: versión ligera (máx. 1600 px) y thumbnail. */
export async function makeImageProxy(input: string, output: string) {
  await ffmpeg(["-i", input, "-vf", "scale='min(1600,iw)':-2", "-q:v", "3", output])
}

export async function makeImageThumb(input: string, output: string) {
  await ffmpeg(["-i", input, "-vf", "scale=-2:360", "-q:v", "4", output])
}

export const SPRITE_COLS = 10
const SPRITE_TILE_W = 160

/** Mosaico de miniaturas repartidas por todo el video (hasta 100). */
export async function makeVideoSprite(input: string, output: string, durationMs: number, width: number, height: number) {
  const seconds = Math.max(durationMs / 1000, 0.1)
  const count = Math.max(1, Math.min(100, Math.floor(seconds)))
  const rows = Math.ceil(count / SPRITE_COLS)
  const tileH = Math.round((SPRITE_TILE_W * height) / width / 2) * 2
  await ffmpeg([
    "-i", input,
    "-vf", `fps=${(count / seconds).toFixed(6)},scale=${SPRITE_TILE_W}:${tileH},tile=${SPRITE_COLS}x${rows}`,
    "-frames:v", "1",
    "-q:v", "5",
    output,
  ])
  return { count, tileW: SPRITE_TILE_W, tileH }
}
