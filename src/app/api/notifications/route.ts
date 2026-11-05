import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ])
  return NextResponse.json({ items, unread })
}

/** Marca todas como leídas. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } })
  return NextResponse.json({ ok: true })
}
