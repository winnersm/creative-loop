import { ReasonDialogHost } from "@/components/board/reason-dialog"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { UserMenu } from "@/components/shell/user-menu"
import { NotificationBell } from "@/components/shell/notification-bell"
import { devLoginEnabled, signIn, signOut } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

async function logout() {
  "use server"
  await signOut({ redirectTo: "/login" })
}

async function devSwitch(userId: string) {
  "use server"
  if (!devLoginEnabled) return
  await signIn("dev", { userId, redirectTo: "/" })
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser()
  const devUsers = devLoginEnabled
    ? await prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, role: true },
      })
    : undefined
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <AppSidebar role={user.role} canSettings={can(user, "settings.manage")} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-end gap-2 px-4">
          <NotificationBell />
          <UserMenu
            userId={user.id}
            name={user.name}
            email={user.email}
            role={user.role}
            logout={logout}
            devUsers={devUsers}
            devSwitch={devLoginEnabled ? devSwitch : undefined}
          />
        </header>
        <main className="min-h-0 flex-1 overflow-auto rounded-tl-xl border-t border-l bg-background">{children}</main>
      </div>
      <ReasonDialogHost />
    </div>
  )
}
