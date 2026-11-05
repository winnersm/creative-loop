// Códigos jerárquicos (F-701) y token de trazabilidad (F-702).
// OF012 → C082 → C082-A03 → C082-A03-V2 · token: cl-C082A03V2

const pad = (n: number, width: number) => String(n).padStart(width, "0")

export const offerCode = (n: number) => `OF${pad(n, 3)}`
export const conceptCode = (n: number) => `C${pad(n, 3)}`
export const assetCode = (concept: string, n: number) => `${concept}-A${pad(n, 2)}`
export const versionCode = (asset: string, n: number) => `${asset}-V${n}`

/** "C082-A03-V2" → "cl-C082A03V2" */
export function tokenFromVersionCode(code: string): string {
  return `cl-${code.replaceAll("-", "")}`
}

// El SPEC propone \bcl-…\b, pero "_" es carácter de palabra y "…__cl-C082A03V2" no casaría.
// Se usa un límite que admite "_" y rechaza letras o dígitos pegados.
const TOKEN_RE = /(?<![A-Za-z0-9])cl-(C\d{3,5})(A\d{2,3})(V\d{1,2})(?![A-Za-z0-9])/

export type ParsedToken = {
  token: string
  conceptCode: string
  assetCode: string
  versionCode: string
}

/** Busca el token en un ad name. Devuelve null si no hay. */
export function parseToken(adName: string): ParsedToken | null {
  const m = TOKEN_RE.exec(adName)
  if (!m) return null
  const [token, c, a, v] = m
  const concept = c
  const asset = `${concept}-${a}`
  return { token, conceptCode: concept, assetCode: asset, versionCode: `${asset}-${v}` }
}

/**
 * Nombre de descarga = token de seguimiento: cl-C082A03V2.mp4.
 * Así el archivo que se sube a Meta ya lleva el mismo id que el ad name.
 */
export function downloadFileName(versionCode: string, originalName: string): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "bin"
  return `${tokenFromVersionCode(versionCode)}.${ext}`
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")

/** Ad name sugerido: [PRODUCTO]_[GEO]_[ANGULO]_[FECHA]__cl-… */
export function suggestedAdName(opts: {
  product: string
  geo: string
  angle: string
  date: Date
  versionCode: string
}): string {
  const d = opts.date
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`
  return `${slug(opts.product)}_${slug(opts.geo)}_${slug(opts.angle)}_${ymd}__${tokenFromVersionCode(opts.versionCode)}`
}
