// Colas BullMQ compartidas por la web (encola) y el worker (procesa).
import { Queue } from "bullmq"

export const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  maxRetriesPerRequest: null,
}

export const QUEUE_MEDIA = "media"
export const QUEUE_SYNC = "sync"
export const QUEUE_NOTIFY = "notify"

export const JOBS = {
  PROCESS_VERSION: "process-version",
  META_SYNC: "meta-sync",
  WINNER_ENGINE: "winner-engine",
  SLACK_POST: "slack-post",
} as const

const globalForQueues = globalThis as unknown as { queues?: { media: Queue; sync: Queue; notify: Queue } }

function queues() {
  if (!globalForQueues.queues) {
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    }
    globalForQueues.queues = {
      media: new Queue(QUEUE_MEDIA, { connection, defaultJobOptions }),
      sync: new Queue(QUEUE_SYNC, { connection, defaultJobOptions: { ...defaultJobOptions, attempts: 1 } }),
      // Slack puede fallar o limitar; se reintenta con calma y sin bloquear la app.
      notify: new Queue(QUEUE_NOTIFY, {
        connection,
        defaultJobOptions: { ...defaultJobOptions, attempts: 5, backoff: { type: "exponential", delay: 10_000 } },
      }),
    }
  }
  return globalForQueues.queues
}

export function enqueueProcessVersion(versionId: string) {
  return queues().media.add(JOBS.PROCESS_VERSION, { versionId }, { jobId: `process-${versionId}` })
}

export function enqueueMetaSync() {
  return queues().sync.add(JOBS.META_SYNC, { manual: true })
}

export function enqueueWinnerEngine() {
  return queues().sync.add(JOBS.WINNER_ENGINE, { manual: true })
}

export type SlackPostJob = { channel: string; text: string; href?: string }

/**
 * Encola un aviso para Slack. Va con unos segundos de retraso a propósito:
 * `notify()` se llama dentro de transacciones, y así no se anuncia en Slack
 * algo que luego se deshace.
 */
export function enqueueSlackPost(job: SlackPostJob) {
  return queues().notify.add(JOBS.SLACK_POST, job, { delay: 5000 })
}
