// Extractor de guion: reenvía el archivo en streaming al servicio de transcripción.
// No guarda nada (ni en S3, ni en disco, ni en la base). Es la excepción a «los archivos
// no pasan por Next.js»: sin almacenamiento intermedio, el video tiene que viajar por aquí.
// Excluida del proxy (src/proxy.ts), que limita el cuerpo; la sesión se comprueba aquí.
import { NextResponse, type NextRequest } from "next/server"
import { can } from "@/lib/permissions"
import { getCurrentUser } from "@/lib/session"

const TRANSCRIBER_URL = process.env.TRANSCRIBER_URL ?? "http://transcriber:8000"
const MAX_MB = Number(process.env.MAX_SCRIPT_MB ?? 100)
const TIMEOUT_MS = 20 * 60 * 1000

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return fail("No autenticado", 401)
  if (!can(user, "script.extract")) return fail("No tienes permiso para extraer guiones", 403)

  const length = Number(req.headers.get("content-length") ?? 0)
  if (!length) return fail("No se recibió ningún archivo", 400)
  if (length > MAX_MB * 1024 * 1024) return fail(`El archivo supera el máximo de ${MAX_MB} MB`, 413)
  if (!req.body) return fail("No se recibió ningún archivo", 400)

  // `duplex` es obligatorio para enviar un stream; no siempre está en los tipos de fetch.
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "content-length": String(length) },
    body: req.body,
    duplex: "half",
    signal: AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]),
  }
  let res: Response
  try {
    res = await fetch(`${TRANSCRIBER_URL}/transcribe`, init)
  } catch (e) {
    if (req.signal.aborted) return fail("Cancelado", 499)
    console.error("script: transcriber no responde", e)
    return fail("El servicio de transcripción no está disponible. Inténtalo más tarde.", 503)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) return fail(data?.error ?? "No se pudo transcribir el archivo", res.status >= 400 && res.status < 600 ? res.status : 502)
  return NextResponse.json(data)
}
