"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assert, run } from "@/lib/action"
import { managerIds, notify } from "@/lib/events"
import { canComment, canReplyOrResolve, canViewAsset } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { actor } from "@/lib/session"
import { timecode } from "@/lib/format"
import { COMMENT_SEVERITY } from "@/lib/status"

const commentSchema = z.object({
  timeMs: z.number().int().min(0).nullable(),
  x: z.number().min(0).max(1).nullable(),
  y: z.number().min(0).max(1).nullable(),
  body: z.string().trim().min(1, "Escribe el comentario."),
  severity: z.enum(["MUST", "SHOULD", "NIT"]),
})

async function loadVersion(versionId: string) {
  return prisma.version.findUniqueOrThrow({
    where: { id: versionId },
    include: { asset: { select: { id: true, code: true, editorId: true, productionStatus: true } } },
  })
}

/** F-503 · Comentario por timestamp (video) o punto (imagen). */
export async function addComment(versionId: string, input: z.input<typeof commentSchema>) {
  return run(async () => {
    const me = await actor()
    assert(canComment(me), "Solo el responsable creativo puede abrir comentarios.")
    const d = commentSchema.parse(input)
    const v = await loadVersion(versionId)
    const comment = await prisma.comment.create({ data: { ...d, versionId, authorId: me.id } })
    await notify(prisma, [v.asset.editorId], {
      type: "comment.new",
      title: `Comentario ${COMMENT_SEVERITY[d.severity].label.toLowerCase()} en ${v.code}`,
      body: `${d.timeMs != null ? timecode(d.timeMs) + " · " : ""}${d.body}`,
      href: `/assets/${v.asset.code}?v=${v.number}`,
    })
    revalidatePath(`/assets/${v.asset.code}`)
    return comment.id
  })
}

export async function replyComment(commentId: string, body: string) {
  return run(async () => {
    const me = await actor()
    const text = body.trim()
    assert(text, "Escribe la respuesta.")
    const c = await prisma.comment.findUniqueOrThrow({ where: { id: commentId }, select: { authorId: true, versionId: true } })
    const v = await loadVersion(c.versionId)
    assert(canReplyOrResolve(me, v.asset), "No puedes responder en este creativo.")
    await prisma.commentReply.create({ data: { commentId, authorId: me.id, body: text } })
    const to = me.role === "EDITOR" ? [c.authorId, ...(await managerIds(prisma))] : [v.asset.editorId, c.authorId]
    await notify(prisma, to.filter((id) => id !== me.id), {
      type: "comment.reply",
      title: `${me.name} respondió en ${v.code}`,
      body: text,
      href: `/assets/${v.asset.code}?v=${v.number}`,
    })
    revalidatePath(`/assets/${v.asset.code}`)
  })
}

export async function setCommentResolved(commentId: string, resolved: boolean) {
  return run(async () => {
    const me = await actor()
    const c = await prisma.comment.findUniqueOrThrow({ where: { id: commentId }, select: { versionId: true } })
    const v = await loadVersion(c.versionId)
    assert(canViewAsset(me, v.asset) && canReplyOrResolve(me, v.asset), "No puedes resolver en este creativo.")
    await prisma.comment.update({
      where: { id: commentId },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
    })
    revalidatePath(`/assets/${v.asset.code}`)
  })
}

export async function deleteComment(commentId: string) {
  return run(async () => {
    const me = await actor()
    const c = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } })
    assert(c.authorId === me.id, "Solo el autor puede borrar su comentario.")
    const v = await loadVersion(c.versionId)
    await prisma.comment.delete({ where: { id: commentId } })
    revalidatePath(`/assets/${v.asset.code}`)
  })
}
