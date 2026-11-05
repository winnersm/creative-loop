// Configuración de IA guardada desde Ajustes (cifrada). Si no hay, se usa el .env.
import "server-only"
import { AI_MODELS, envAiConfig, type AiConfig } from "@/lib/ai"
import { decrypt, encrypt } from "@/lib/crypto"
import { prisma } from "@/lib/prisma"

const KEY = "ai.deepseek.apiKey"
const MODEL = "ai.deepseek.model"

export type AiStatus = {
  source: "app" | "env" | "none"
  last4: string | null
  model: string
  updatedAt: Date | null
}

export async function getAiConfig(): Promise<AiConfig> {
  const env = envAiConfig()
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [KEY, MODEL] } } })
  const key = rows.find((r) => r.key === KEY)
  const model = rows.find((r) => r.key === MODEL)
  return {
    apiKey: key ? decrypt(key.value) : env.apiKey,
    model: model?.value || env.model,
    baseUrl: env.baseUrl,
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  const env = envAiConfig()
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [KEY, MODEL] } } })
  const key = rows.find((r) => r.key === KEY)
  const model = rows.find((r) => r.key === MODEL)?.value || env.model
  if (key) {
    const plain = decrypt(key.value)
    return { source: "app", last4: plain.slice(-4), model, updatedAt: key.updatedAt }
  }
  if (env.apiKey) return { source: "env", last4: env.apiKey.slice(-4), model, updatedAt: null }
  return { source: "none", last4: null, model, updatedAt: null }
}

export async function saveAiKey(apiKey: string) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: encrypt(apiKey), encrypted: true },
    update: { value: encrypt(apiKey), encrypted: true },
  })
}

export async function deleteAiKey() {
  await prisma.appSetting.deleteMany({ where: { key: KEY } })
}

export async function saveAiModel(model: string) {
  if (!(AI_MODELS as readonly string[]).includes(model)) throw new Error("Modelo no válido")
  await prisma.appSetting.upsert({ where: { key: MODEL }, create: { key: MODEL, value: model }, update: { value: model } })
}
