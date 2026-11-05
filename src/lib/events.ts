// Auditoría (F-1501) y notificaciones: in-app (F-1401) y Slack (F-1402).
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { enqueueSlackPost } from "@/lib/queue"
import { getTechChannel } from "@/lib/slack-config"
import { goesToChannel, goesToSlack, isTech } from "@/lib/slack-events"

type Db = Prisma.TransactionClient | typeof prisma

export function audit(
  db: Db,
  entry: { userId?: string | null; action: string; entity: string; entityId?: string | null; data?: Prisma.InputJsonValue },
) {
  return db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      data: entry.data ?? {},
    },
  })
}

export type NotifyInput = {
  type: string
  title: string
  body?: string
  href?: string
  /** Fuerza o impide el envío a Slack para este aviso concreto. */
  slack?: boolean
}

export async function notify(db: Db, userIds: (string | null | undefined)[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))]
  if (!ids.length) return
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? "", href: n.href })),
  })
  // A Slack solo lo que merece interrumpir fuera de la app.
  if (!(n.slack ?? goesToSlack(n.type))) return

  const text = n.body ? `*${n.title}*\n${n.body}` : `*${n.title}*`

  // Lo técnico va a su canal y no molesta a nadie en el suyo.
  if (isTech(n.type)) {
    try {
      const tech = await getTechChannel()
      if (tech) await enqueueSlackPost({ channel: tech, text, href: n.href ?? undefined })
    } catch (e) {
      console.error("[slack] aviso técnico no encolado:", (e as Error).message)
    }
    return
  }

  // El mismo aviso al canal privado de cada persona, si lo tiene configurado.
  // Al repartir por destinatario, Slack hereda los permisos de la app: nadie
  // recibe en su canal nada que no viera ya en la campana.
  try {
    const withChannel = await db.user.findMany({
      where: { id: { in: ids }, slackChannelId: { not: null }, status: "ACTIVE" },
      select: { slackChannelId: true, role: true },
    })
    for (const u of withChannel.filter((u) => goesToChannel(n.type, u.role)))
      await enqueueSlackPost({
        channel: u.slackChannelId!,
        text,
        href: n.href ?? undefined,
      })
  } catch (e) {
    console.error("[slack] no se pudo encolar el aviso:", (e as Error).message)
  }
}

/** Managers y owners activos (destinatarios de avisos de revisión). */
/**
 * Quién revisa. Los propietarios solo entran si no hay ningún responsable
 * creativo activo: con cuatro dueños, avisarlos a todos convierte cada envío
 * a revisión en cinco notificaciones.
 */
export async function reviewerIds(db: Db): Promise<string[]> {
  const managers = await db.user.findMany({ where: { role: "MANAGER", status: "ACTIVE" }, select: { id: true } })
  if (managers.length) return managers.map((r) => r.id)
  return managerIds(db)
}

export async function managerIds(db: Db): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { role: { in: ["OWNER", "MANAGER"] }, status: "ACTIVE" },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
