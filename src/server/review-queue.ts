import "server-only"
import { prisma } from "@/lib/prisma"

const PRIO = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

/** F-501 · Versiones en revisión ordenadas por prioridad y deadline. */
export async function getReviewQueue() {
  const assets = await prisma.asset.findMany({
    where: { productionStatus: "IN_REVIEW" },
    include: {
      editor: { select: { name: true } },
      concept: { select: { code: true, title: true, color: true } },
      offer: { select: { code: true, gate: true } },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: {
          qaChecks: { where: { result: "FAIL" }, select: { severity: true } },
          _count: { select: { comments: { where: { resolved: false } } } },
        },
      },
    },
  })
  return assets
    .map((a) => {
      const v = a.versions[0]
      return {
        id: a.id,
        code: a.code,
        format: a.format,
        mediaType: a.mediaType,
        priority: a.priority,
        deadline: a.deadline,
        editor: a.editor?.name ?? "—",
        concept: a.concept,
        offer: a.offer,
        version: v
          ? {
              id: v.id,
              code: v.code,
              number: v.number,
              hasThumb: !!v.thumbKey,
              submittedAt: v.submittedAt,
              warnings: v.qaChecks.filter((c) => c.severity === "WARNING").length,
              openComments: v._count.comments,
            }
          : null,
      }
    })
    .sort(
      (a, b) =>
        PRIO[a.priority] - PRIO[b.priority] ||
        (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) ||
        (a.version?.submittedAt?.getTime() ?? 0) - (b.version?.submittedAt?.getTime() ?? 0),
    )
}

export type ReviewItem = Awaited<ReturnType<typeof getReviewQueue>>[number]
