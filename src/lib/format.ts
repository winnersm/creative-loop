// Formato de números y fechas para la interfaz (es).

// Zona horaria fija: servidor (UTC en Docker) y navegador deben pintar lo mismo.
export const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ ?? "Europe/Madrid"

export function money(cents: number | null | undefined, digits = 2): string {
  if (cents == null) return "—"
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100)
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—"
  return `${(v * 100).toFixed(digits).replace(".", ",")} %`
}

export function int(v: number | null | undefined): string {
  if (v == null) return "—"
  return new Intl.NumberFormat("es-ES").format(Math.round(v))
}

export function decimal(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—"
  return v.toFixed(digits).replace(".", ",")
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d))
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TZ,
  }).format(new Date(d))
}

export function timeAgo(d: Date | string): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return "ahora"
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

/** mm:ss.d */
export function timecode(ms: number | null | undefined): string {
  if (ms == null) return "—"
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("")
}

export function bytes(n: number | bigint): string {
  const v = Number(n)
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function isOverdue(deadline: Date | string | null | undefined, status: string): boolean {
  if (!deadline) return false
  if (["APPROVED", "REJECTED", "ARCHIVED"].includes(status)) return false
  return new Date(deadline).getTime() < Date.now()
}
