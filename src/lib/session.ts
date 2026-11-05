import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import { auth } from "@/lib/auth"
import { can, type Action } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

/** Usuario actual leído de la base (refleja cambios de rol o desactivación al instante). */
export const getCurrentUser = cache(async () => {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true },
  })
  if (!user || user.status !== "ACTIVE") return null
  return user
})

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

/** Para páginas: redirige a /login si no hay sesión. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

/** Para páginas: redirige a / si no tiene permiso. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user, action)) redirect("/")
  return user
}

export class AuthError extends Error {}

/** Para server actions y rutas API: lanza en vez de redirigir. */
export async function actor(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthError("No autenticado")
  return user
}
