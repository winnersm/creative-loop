import "server-only"
import { ZodError } from "zod"
import { AuthError } from "@/lib/session"

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

export class UserError extends Error {}

/** Envuelve una server action: convierte errores esperados en { ok:false }. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof UserError || e instanceof AuthError) return { ok: false, error: e.message }
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" · ") }
    console.error(e)
    return { ok: false, error: "Error inesperado. Revisa los logs." }
  }
}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new UserError(message)
}
