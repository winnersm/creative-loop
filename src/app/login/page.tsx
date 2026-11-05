import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { devLoginEnabled, signIn } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ROLE_LABEL } from "@/lib/status"
import { UserAvatar } from "@/components/board/user-avatar"
import { getCurrentUser } from "@/lib/session"
import { Logo } from "@/components/logo"

async function login(formData: FormData) {
  "use server"
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    })
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=1")
    throw e
  }
}

async function devLogin(formData: FormData) {
  "use server"
  if (!devLoginEnabled) return
  await signIn("dev", { userId: String(formData.get("userId") ?? ""), redirectTo: "/" })
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/")
  const { error } = await searchParams
  const devUsers = devLoginEnabled
    ? await prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, role: true },
      })
    : []
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold">Creative Loop</span>
        </div>
        <h1 className="mb-1 text-2xl font-semibold">Iniciar sesión</h1>
        <p className="mb-6 text-sm text-muted-foreground">Encargo, producción, revisión y rendimiento.</p>
        <form action={login} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
          </div>
          {error && <p className="text-sm text-destructive">Email o contraseña incorrectos.</p>}
          <Button type="submit" className="h-10 w-full">
            Entrar
          </Button>
        </form>
        {devUsers.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs text-muted-foreground">Acceso rápido para probar roles (solo desarrollo)</p>
            <div className="grid gap-1">
              {devUsers.map((u) => (
                <form key={u.id} action={devLogin}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-row-hover">
                    <UserAvatar name={u.name} size={22} />
                    <span className="flex-1">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
