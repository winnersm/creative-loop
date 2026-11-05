// Worker de Creative Loop: procesa media y ejecuta los jobs programados.
import "dotenv/config"
import { Queue, Worker } from "bullmq"
import { connection, JOBS, QUEUE_MEDIA, QUEUE_NOTIFY, QUEUE_SYNC } from "@/lib/queue"
import { metaSync } from "./meta-sync"
import { processVersion } from "./process-version"
import { slackPost } from "./slack-post"
import { winnerEngine } from "./winner-engine"

const TZ = process.env.SCHEDULE_TZ ?? "Europe/Madrid"

async function main() {
  // ffmpeg con concurrencia 1: no competir con el resto del servidor.
  const media = new Worker(
    QUEUE_MEDIA,
    async (job) => {
      if (job.name === JOBS.PROCESS_VERSION) return processVersion(job.data.versionId)
      throw new Error(`Job desconocido: ${job.name}`)
    },
    { connection, concurrency: 1 },
  )

  const sync = new Worker(
    QUEUE_SYNC,
    async (job) => {
      if (job.name === JOBS.META_SYNC) return metaSync()
      if (job.name === JOBS.WINNER_ENGINE) return winnerEngine()
      throw new Error(`Job desconocido: ${job.name}`)
    },
    { connection, concurrency: 1 },
  )

  // Avisos a Slack: van aparte para que un fallo suyo no toque media ni sync.
  const notifier = new Worker(
    QUEUE_NOTIFY,
    async (job) => {
      if (job.name === JOBS.SLACK_POST) return slackPost(job.data)
      throw new Error(`Job desconocido: ${job.name}`)
    },
    { connection, concurrency: 2 },
  )

  // Jobs programados (F-801: cada 6 h · F-903: diario 08:00).
  const syncQueue = new Queue(QUEUE_SYNC, { connection })
  await syncQueue.upsertJobScheduler("meta-sync-6h", { pattern: "0 */6 * * *", tz: TZ }, { name: JOBS.META_SYNC })
  await syncQueue.upsertJobScheduler("winner-engine-daily", { pattern: "0 8 * * *", tz: TZ }, { name: JOBS.WINNER_ENGINE })

  for (const w of [media, sync, notifier]) {
    w.on("completed", (job, result) => console.log(`✓ ${job.name} ${job.id}`, JSON.stringify(result)))
    w.on("failed", (job, err) => console.error(`✗ ${job?.name} ${job?.id}: ${err.message}`))
  }
  console.log(`worker listo (zona horaria ${TZ})`)

  const shutdown = async () => {
    await Promise.all([media.close(), sync.close(), syncQueue.close()])
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
