"use client"

import {
  BarChart3,
  CheckSquare,
  Clapperboard,
  FileText,
  Home,
  LayoutGrid,
  Link2Off,
  Rocket,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "@/components/logo"
import type { Role } from "@/generated/prisma/enums"
import { cn } from "@/lib/utils"

type Item = { href: string; label: string; icon: typeof Home; roles: Role[] }

const ITEMS: Item[] = [
  { href: "/", label: "Inicio", icon: Home, roles: ["OWNER", "MANAGER"] },
  { href: "/tasks", label: "Mis tareas", icon: CheckSquare, roles: ["EDITOR"] },
  { href: "/boards", label: "Tablero", icon: LayoutGrid, roles: ["OWNER", "MANAGER", "EDITOR"] },
  { href: "/review", label: "Revisión", icon: Clapperboard, roles: ["OWNER", "MANAGER"] },
  { href: "/launch", label: "Lanzamiento", icon: Rocket, roles: ["OWNER", "MANAGER", "BUYER"] },
  { href: "/unassigned", label: "Códigos sin creativo", icon: Link2Off, roles: ["OWNER", "MANAGER", "BUYER"] },
  { href: "/script", label: "Extractor de guion", icon: FileText, roles: ["OWNER", "MANAGER", "EDITOR"] },
  { href: "/performance", label: "Rendimiento", icon: BarChart3, roles: ["OWNER", "MANAGER", "BUYER"] },
]

export function AppSidebar({ role, canSettings }: { role: Role; canSettings: boolean }) {
  const pathname = usePathname()
  const items = ITEMS.filter((i) => i.roles.includes(role))
  if (canSettings) items.push({ href: "/settings", label: "Ajustes", icon: Settings, roles: [] })

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  return (
    <aside className="hidden w-56 shrink-0 flex-col px-3 py-3 md:flex">
      <Link href="/" className="mb-5 flex items-center gap-2 px-2">
        <Logo className="size-7" />
        <span className="font-semibold tracking-tight">Creative Loop</span>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active(i.href)
                ? "bg-accent font-medium text-accent-foreground"
                : "text-foreground/80 hover:bg-secondary",
            )}
          >
            <i.icon className="size-4" />
            {i.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
