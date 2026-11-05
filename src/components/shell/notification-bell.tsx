"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

type Item = { id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string }

export function NotificationBell() {
  const qc = useQueryClient()
  const { data } = useQuery<{ items: Item[]; unread: number }>({
    queryKey: ["notifications"],
    queryFn: () => fetch("/api/notifications").then((r) => r.json()),
    refetchInterval: 20_000,
  })

  async function markAll() {
    await fetch("/api/notifications", { method: "POST" })
    qc.invalidateQueries({ queryKey: ["notifications"] })
  }

  const unread = data?.unread ?? 0
  return (
    <Popover onOpenChange={(open) => !open && unread > 0 && markAll()}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones" />}>
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Notificaciones</div>
        <div className="max-h-96 overflow-y-auto">
          {!data?.items.length && <p className="p-4 text-sm text-muted-foreground">Nada por aquí.</p>}
          {data?.items.map((n) => {
            const content = (
              <div className={cn("border-b px-3 py-2.5 text-sm last:border-0 hover:bg-row-hover", !n.readAt && "bg-accent/40")}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{n.body}</p>}
              </div>
            )
            return n.href ? (
              <Link key={n.id} href={n.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
