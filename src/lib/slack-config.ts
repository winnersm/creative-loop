// Configuración de Slack guardada desde Ajustes: token cifrado y a qué canal
// va cada tipo de aviso.
//
// Sin "server-only": el worker también lo importa y es Node puro, sin entorno
// de React. Lo que necesita la interfaz (los tipos de aviso) vive aparte, en
// slack-events.ts, para que ningún componente de cliente tenga que entrar aquí.
import { decrypt, encrypt } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"
import type { SlackStatus } from "@/lib/slack-events"

const TOKEN = "slack.botToken"
const TECH = "slack.techChannel"

/** Canal donde van los avisos técnicos. */
export async function getTechChannel(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: TECH } })
  return row?.value || null
}

export async function saveTechChannel(channel: string) {
  if (!channel) {
    await prisma.appSetting.deleteMany({ where: { key: TECH } })
    return
  }
  await prisma.appSetting.upsert({
    where: { key: TECH },
    create: { key: TECH, value: channel },
    update: { value: channel },
  })
}

export async function getSlackToken(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: TOKEN } })
  return row ? decrypt(row.value) : null
}

export async function getSlackStatus(): Promise<SlackStatus> {
  const [token, team, tech] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: TOKEN } }),
    prisma.appSetting.findUnique({ where: { key: "slack.team" } }),
    prisma.appSetting.findUnique({ where: { key: TECH } }),
  ])
  return {
    connected: !!token,
    team: team?.value ?? null,
    updatedAt: token?.updatedAt ?? null,
    techChannel: tech?.value ?? null,
  }
}

export async function saveSlackToken(token: string, team: string) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: TOKEN },
      create: { key: TOKEN, value: encrypt(token), encrypted: true },
      update: { value: encrypt(token), encrypted: true },
    }),
    prisma.appSetting.upsert({
      where: { key: "slack.team" },
      create: { key: "slack.team", value: team },
      update: { value: team },
    }),
  ])
}

export async function disconnectSlack() {
  await prisma.appSetting.deleteMany({ where: { key: { in: [TOKEN, "slack.team", TECH] } } })
}
