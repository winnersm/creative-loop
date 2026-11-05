// Publica un aviso en el canal de Slack configurado para ese tipo de evento.
import { getSlackToken } from "@/lib/slack-config"
import { postMessage, SlackError } from "@/lib/slack"
import type { SlackPostJob } from "@/lib/queue"

const APP_URL = process.env.APP_URL ?? "http://localhost:3100"

export async function slackPost(job: SlackPostJob) {
  const token = await getSlackToken()
  if (!token) return { skipped: "sin token" }
  const channel = job.channel

  try {
    await postMessage(token, {
      channel,
      text: job.text,
      url: job.href ? new URL(job.href, APP_URL).toString() : undefined,
    })
    return { sent: channel }
  } catch (e) {
    // Un canal mal configurado no se arregla reintentando: se avisa y se deja.
    if (e instanceof SlackError && /no está en ese canal|No existe ese canal|archivado|permiso/.test(e.message)) {
      console.error(`[slack] canal ${channel}: ${e.message}`)
      return { failed: e.message }
    }
    throw e
  }
}
