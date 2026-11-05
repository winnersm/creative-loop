import { BoardView } from "@/components/board/board-view"
import type { ProductionStatus } from "@/generated/prisma/enums"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { PRODUCTION_ORDER } from "@/lib/status"
import { getBoard, getLookups } from "@/server/queries"

export const metadata = { title: "Tablero · Creative Loop" }

export default async function BoardsPage({ searchParams }: PageProps<"/boards">) {
  const user = await requireUser()
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const status = one(sp.status)
  const [concepts, lookups] = await Promise.all([
    getBoard(user, {
      offerId: one(sp.offer),
      editorId: one(sp.editor),
      status: PRODUCTION_ORDER.includes(status as ProductionStatus) ? (status as ProductionStatus) : undefined,
      q: one(sp.q),
      showArchived: one(sp.archived) === "1",
    }),
    getLookups(),
  ])
  return (
    <BoardView
      concepts={concepts}
      lookups={lookups}
      user={{ id: user.id, role: user.role }}
      canEdit={can(user, "asset.create")}
      moneyVisible={can(user, "money.view")}
      title={user.role === "EDITOR" ? "Mis creativos" : "Creativos"}
    />
  )
}
