import { EmptyState, PageHeader } from "@/components/page-header"
import { ReviewList } from "@/components/review-list"
import { requirePermission } from "@/lib/session"
import { getReviewQueue } from "@/server/review-queue"

export const metadata = { title: "Revisión · Creative Loop" }

export default async function ReviewPage() {
  await requirePermission("review.decide")
  const items = await getReviewQueue()
  return (
    <div>
      <PageHeader title="Cola de revisión" description={`${items.length} versión(es) esperando · orden: prioridad y fecha límite`} />
      <div className="p-6">{items.length ? <ReviewList items={items} /> : <EmptyState>No hay nada por revisar. 🎉</EmptyState>}</div>
    </div>
  )
}
