"use client"

import { KeyRound, LogOut, Moon, Sun, UserRoundCog } from "lucide-react"
import { useTheme } from "next-themes"
import { useState, useTransition } from "react"
import { UserAvatar } from "@/components/board/user-avatar"
import { ChangePasswordDialog } from "./change-password-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Role } from "@/generated/prisma/enums"
import { ROLE_LABEL } from "@/lib/status"

export type SwitchableUser = { id: string; name: string; role: Role }

export function UserMenu({
  userId,
  name,
  email,
  role,
  logout,
  devUsers,
  devSwitch,
}: {
  userId: string
  name: string
  email: string
  role: Role
  logout: () => Promise<void>
  /** Solo en desarrollo con ENABLE_DEV_LOGIN=true. */
  devUsers?: SwitchableUser[]
  devSwitch?: (userId: string) => Promise<void>
}) {
  const { theme, setTheme } = useTheme()
  const [pending, start] = useTransition()
  const [passwordOpen, setPasswordOpen] = useState(false)
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de usuario"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserAvatar name={name} size={30} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-foreground">
            <div className="font-medium">{name}</div>
            <div className="text-xs font-normal text-muted-foreground">{email}</div>
            <div className="text-xs font-normal text-muted-foreground">{ROLE_LABEL[role]}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {devUsers && devSwitch && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5">
                <UserRoundCog className="size-3.5" /> Entrar como… (solo desarrollo)
              </DropdownMenuLabel>
              {devUsers
                .filter((u) => u.id !== userId)
                .map((u) => (
                  <DropdownMenuItem key={u.id} disabled={pending} onClick={() => start(() => devSwitch(u.id))}>
                    <UserAvatar name={u.name} size={20} />
                    <span className="flex-1">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
          <KeyRound />
          Cambiar mi contraseña
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending} onClick={() => start(() => logout())}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  )
}
