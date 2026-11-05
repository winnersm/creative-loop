// Formatos de descarga del extractor de guion (TXT, SRT, VTT y JSON).
// Lógica pura: se usa en el navegador sobre el resultado del servicio de transcripción.

export type ScriptSegment = { id: number; start: number; end: number; text: string }

export type ScriptResult = {
  language: string
  languageProbability: number
  durationSeconds: number
  text: string
  wordCount: number
  segments: ScriptSegment[]
}

export type ScriptFormat = "txt" | "srt" | "vtt" | "json"

const pad = (n: number, w = 2) => String(n).padStart(w, "0")

function split(seconds: number) {
  // Se redondea a milisegundos antes de partir, para que 59,9996 s no dé «00:00:60,000».
  const total = Math.round(Math.max(0, seconds) * 1000)
  return {
    h: Math.floor(total / 3_600_000),
    m: Math.floor((total % 3_600_000) / 60_000),
    s: Math.floor((total % 60_000) / 1000),
    ms: total % 1000,
  }
}

/** MM:SS, o HH:MM:SS si pasa de la hora. */
export function clock(seconds: number): string {
  const { h, m, s } = split(seconds)
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const stamp = (seconds: number, sep: "," | ".") => {
  const { h, m, s, ms } = split(seconds)
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`
}

export function toTxt(r: ScriptResult, filename: string): string {
  return [
    "=== GUION EXTRAÍDO DE VIDEO ===",
    `Archivo: ${filename}`,
    `Idioma detectado: ${r.language} (confianza: ${(r.languageProbability * 100).toFixed(1)}%)`,
    `Duración: ${r.durationSeconds} segundos`,
    `Total palabras: ${r.wordCount}`,
    "=".repeat(32),
    "",
    "--- TEXTO COMPLETO ---",
    r.text,
    "",
    "--- DESGLOSE CON MARCAS DE TIEMPO ---",
    ...r.segments.map((s) => `[${clock(s.start)} -> ${clock(s.end)}] ${s.text}`),
  ].join("\n")
}

export function toSrt(segments: ScriptSegment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${stamp(s.start, ",")} --> ${stamp(s.end, ",")}\n${s.text}\n`)
    .join("\n")
}

export function toVtt(segments: ScriptSegment[]): string {
  return ["WEBVTT\n", ...segments.map((s) => `${stamp(s.start, ".")} --> ${stamp(s.end, ".")}\n${s.text}\n`)].join("\n")
}

export function toJson(r: ScriptResult, filename: string): string {
  return JSON.stringify({ filename, ...r }, null, 2)
}

export const FORMATS: Record<ScriptFormat, { label: string; mime: string }> = {
  txt: { label: "TXT", mime: "text/plain" },
  srt: { label: "SRT", mime: "application/x-subrip" },
  vtt: { label: "VTT", mime: "text/vtt" },
  json: { label: "JSON", mime: "application/json" },
}

export function render(format: ScriptFormat, r: ScriptResult, filename: string): string {
  switch (format) {
    case "txt":
      return toTxt(r, filename)
    case "srt":
      return toSrt(r.segments)
    case "vtt":
      return toVtt(r.segments)
    case "json":
      return toJson(r, filename)
  }
}

/** «mi video.final.mp4» → «mi video.final.srt». */
export function downloadName(filename: string, format: ScriptFormat): string {
  const base = filename.replace(/\.[^./\\]+$/, "") || "guion"
  return `${base}.${format}`
}
