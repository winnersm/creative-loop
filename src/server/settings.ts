"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { assert, run, UserError } from "@/lib/action"
import { offerCode } from "@/lib/codes"
import { nextCounter } from "@/lib/counters"
import { audit } from "@/lib/events"
import { can } from "@/lib/permissions"
import { checkToken, listChannels, postMessage, SlackError } from "@/lib/slack"
import { disconnectSlack, getSlackToken, saveSlackToken, saveTechChannel } from "@/lib/slack-config"
import { prisma } from "@/lib/prisma"
import { actor } from "@/lib/session"
import { LABEL_COLORS, type LabelColor } from "@/lib/status"

async function owner() {
  const me = await actor()
  assert(can(me, "settings.manage"), "Solo el propietario puede cambiar la configuración.")
  return me
}

// ─── Ofertas (F-101, F-102) ──────────────────────────────────────────────────

const offerSchema = z.object({
  name: z.string().trim().min(2, "Pon un nombre."),
  product: z.string().trim().min(2, "Pon el producto (se usa en el ad name)."),
  geo: z.string().trim().min(2).max(5),
  language: z.string().trim().min(2).max(5),
  targetCpa: z.coerce.number().positive("El CPA objetivo debe ser mayor que 0."),
  payout: z.coerce.number().min(0),
  conversionEvent: z.string().trim().min(2, "Indica el evento de conversión de Meta."),
  gate: z.enum(["OK", "BLOCKED"]),
  gateNote: z.string().trim().optional(),
  active: z.boolean().default(true),
})

export type OfferInput = z.input<typeof offerSchema>

function offerData(d: z.output<typeof offerSchema>) {
  return {
    name: d.name,
    product: d.product.toUpperCase(),
    geo: d.geo.toUpperCase(),
    language: d.language.toLowerCase(),
    targetCpaCents: Math.round(d.targetCpa * 100),
    payoutCents: Math.round(d.payout * 100),
    conversionEvent: d.conversionEvent,
    gate: d.gate,
    gateNote: d.gateNote || null,
    active: d.active,
  }
}

export async function saveOffer(id: string | null, input: OfferInput) {
  return run(async () => {
    const me = await owner()
    const d = offerSchema.parse(input)
    await prisma.$transaction(async (tx) => {
      if (id) {
        const before = await tx.offer.findUniqueOrThrow({ where: { id } })
        const data = offerData(d)
        await tx.offer.update({ where: { id }, data })
        // GEO e idioma se leen de la oferta en cada creativo: no hay copias que sincronizar.
        if (before.geo !== data.geo || before.language !== data.language)
          await audit(tx, {
            userId: me.id,
            action: "offer.locale",
            entity: "offer",
            entityId: id,
            data: { from: `${before.geo}/${before.language}`, to: `${data.geo}/${data.language}` },
          })
        if (before.gate !== d.gate)
          await audit(tx, { userId: me.id, action: "offer.gate", entity: "offer", entityId: id, data: { from: before.gate, to: d.gate, note: d.gateNote ?? null } })
      } else {
        const n = await nextCounter(tx, "offer")
        const offer = await tx.offer.create({ data: { number: n, code: offerCode(n), ...offerData(d) } })
        await audit(tx, { userId: me.id, action: "offer.create", entity: "offer", entityId: offer.id, data: { code: offer.code } })
      }
    })
    revalidatePath("/settings")
  })
}

// ─── Tags (F-103) ────────────────────────────────────────────────────────────

export async function addTagValue(dimensionId: string, label: string) {
  return run(async () => {
    await owner()
    const clean = label.trim()
    assert(clean.length >= 2, "El valor es demasiado corto.")
    const value = clean
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
    const exists = await prisma.tagValue.findUnique({ where: { dimensionId_value: { dimensionId, value } } })
    if (exists) throw new UserError("Ese valor ya existe.")
    const max = await prisma.tagValue.aggregate({ where: { dimensionId }, _max: { sortOrder: true } })
    await prisma.tagValue.create({
      data: { dimensionId, value, label: clean, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    })
    revalidatePath("/settings")
  })
}

/** Un valor en uso no se borra: se desactiva. */
export async function setTagValueActive(valueId: string, active: boolean) {
  return run(async () => {
    const me = await owner()
    await prisma.tagValue.update({ where: { id: valueId }, data: { active } })
    await audit(prisma, { userId: me.id, action: active ? "tag.activate" : "tag.deactivate", entity: "tag_value", entityId: valueId })
    revalidatePath("/settings")
  })
}

// ─── Etiquetas de equipo (columna «Etiquetas» del tablero) ──────────────────

const labelSchema = z.object({
  name: z.string().trim().min(2, "El nombre es demasiado corto.").max(30, "Máximo 30 caracteres."),
  color: z.enum(Object.keys(LABEL_COLORS) as [LabelColor, ...LabelColor[]]),
})

export async function createAssetLabel(input: z.input<typeof labelSchema>) {
  return run(async () => {
    const me = await owner()
    const d = labelSchema.parse(input)
    const exists = await prisma.assetLabel.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } } })
    if (exists) throw new UserError("Ya existe una etiqueta con ese nombre.")
    const max = await prisma.assetLabel.aggregate({ _max: { sortOrder: true } })
    const label = await prisma.assetLabel.create({ data: { ...d, sortOrder: (max._max.sortOrder ?? 0) + 1 } })
    await audit(prisma, { userId: me.id, action: "label.create", entity: "asset_label", entityId: label.id, data: d })
    revalidatePath("/settings")
    revalidatePath("/boards")
  })
}

/** Cambiar nombre o color, o desactivar. Una etiqueta en uso no se borra: se desactiva y deja de ofrecerse. */
export async function updateAssetLabel(id: string, input: Partial<z.input<typeof labelSchema>> & { active?: boolean }) {
  return run(async () => {
    const me = await owner()
    const d = labelSchema.partial().extend({ active: z.boolean().optional() }).parse(input)
    if (d.name) {
      const clash = await prisma.assetLabel.findFirst({ where: { id: { not: id }, name: { equals: d.name, mode: "insensitive" } } })
      if (clash) throw new UserError("Ya existe una etiqueta con ese nombre.")
    }
    await prisma.assetLabel.update({ where: { id }, data: d })
    await audit(prisma, { userId: me.id, action: "label.update", entity: "asset_label", entityId: id, data: d })
    revalidatePath("/settings")
    revalidatePath("/boards")
  })
}

// ─── Usuarios (F-104) ────────────────────────────────────────────────────────

const userSchema = z.object({
  name: z.string().trim().min(2, "Pon un nombre."),
  email: z.string().trim().email("Email no válido."),
  role: z.enum(["OWNER", "MANAGER", "EDITOR", "BUYER"]),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
})

export async function createUser(input: z.input<typeof userSchema>) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "users.manage"), "No tienes permiso.")
    const d = userSchema.parse(input)
    const email = d.email.toLowerCase()
    if (await prisma.user.findUnique({ where: { email } })) throw new UserError("Ya existe un usuario con ese email.")
    const user = await prisma.user.create({
      data: { name: d.name, email, role: d.role, passwordHash: await bcrypt.hash(d.password, 10) },
    })
    await audit(prisma, { userId: me.id, action: "user.create", entity: "user", entityId: user.id, data: { email, role: d.role } })
    revalidatePath("/settings")
  })
}

export async function updateUser(
  userId: string,
  patch: {
    name?: string
    email?: string
    role?: "OWNER" | "MANAGER" | "EDITOR" | "BUYER"
    status?: "ACTIVE" | "INACTIVE"
    password?: string
  },
) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "users.manage"), "No tienes permiso.")
    assert(!(userId === me.id && (patch.status === "INACTIVE" || (patch.role && patch.role !== "OWNER"))), "No puedes quitarte el acceso a ti mismo.")
    const data: Record<string, unknown> = {}
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } })
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      assert(name.length >= 2, "El nombre es demasiado corto.")
      data.name = name
    }
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase()
      assert(z.string().email().safeParse(email).success, "Email no válido.")
      if (email !== before.email) {
        const taken = await prisma.user.findUnique({ where: { email } })
        if (taken) throw new UserError("Ya existe un usuario con ese email.")
      }
      data.email = email
    }
    if (patch.role) data.role = patch.role
    if (patch.status) data.status = patch.status
    if (patch.password) {
      assert(patch.password.length >= 8, "La contraseña debe tener al menos 8 caracteres.")
      data.passwordHash = await bcrypt.hash(patch.password, 10)
    }
    await prisma.user.update({ where: { id: userId }, data })
    await audit(prisma, {
      userId: me.id,
      action: "user.update",
      entity: "user",
      entityId: userId,
      data: {
        name: data.name && data.name !== before.name ? { from: before.name, to: data.name } : null,
        email: data.email && data.email !== before.email ? { from: before.email, to: data.email } : null,
        role: patch.role ?? null,
        status: patch.status ?? null,
        passwordReset: !!patch.password,
      } as Prisma.InputJsonValue,
    })
    revalidatePath("/settings")
  })
}

/**
 * Cada persona cambia su propia contraseña, sea cual sea su rol.
 * Pide la actual: así una sesión abierta y olvidada no basta para secuestrar
 * la cuenta. Quien no la recuerde, se la reinicia el propietario.
 */
export async function changeMyPassword(currentPassword: string, newPassword: string) {
  return run(async () => {
    const me = await actor()
    assert(newPassword.length >= 8, "La contraseña nueva debe tener al menos 8 caracteres.")
    assert(newPassword !== currentPassword, "La contraseña nueva tiene que ser distinta de la actual.")
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true } })
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) throw new UserError("La contraseña actual no es correcta.")
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } })
    await audit(prisma, {
      userId: me.id,
      action: "user.password_changed",
      entity: "user",
      entityId: me.id,
      data: {},
    })
  })
}

// ─── Slack (F-1402) ──────────────────────────────────────────────────────────

/** Guarda el token del bot, comprobándolo antes contra Slack. */
export async function connectSlack(token: string) {
  return run(async () => {
    await owner()
    const t = token.trim()
    assert(t.startsWith("xoxb-"), "Es el token del bot, el que empieza por «xoxb-».")
    let identity
    try {
      identity = await checkToken(t)
    } catch (e) {
      throw new UserError(e instanceof SlackError ? e.message : "No se pudo hablar con Slack.")
    }
    await saveSlackToken(t, identity.team)
    await audit(prisma, { userId: (await actor()).id, action: "slack.connected", entity: "settings", data: { team: identity.team } })
    revalidatePath("/settings")
    return identity.team
  })
}

export async function disconnectSlackAction() {
  return run(async () => {
    const me = await owner()
    await disconnectSlack()
    await audit(prisma, { userId: me.id, action: "slack.disconnected", entity: "settings" })
    revalidatePath("/settings")
  })
}

/** Canales que el bot puede ver, para el desplegable de Ajustes. */
export async function slackChannels() {
  return run(async () => {
    await owner()
    const token = await getSlackToken()
    if (!token) throw new UserError("Conecta Slack primero.")
    try {
      return await listChannels(token)
    } catch (e) {
      throw new UserError(e instanceof SlackError ? e.message : "No se pudieron leer los canales.")
    }
  })
}

/** Asigna a cada persona su canal privado. Vacío = no recibe nada en Slack. */
export async function saveSlackUserChannels(map: Record<string, string>) {
  return run(async () => {
    const me = await owner()
    await prisma.$transaction(
      Object.entries(map).map(([userId, channel]) =>
        prisma.user.update({ where: { id: userId }, data: { slackChannelId: channel || null } }),
      ),
    )
    await audit(prisma, {
      userId: me.id,
      action: "slack.channels",
      entity: "settings",
      data: { usuarios: Object.values(map).filter(Boolean).length },
    })
    revalidatePath("/settings")
  })
}

/** Canal donde van los avisos técnicos. Vacío = no se mandan a Slack. */
export async function saveSlackTechChannel(channel: string) {
  return run(async () => {
    const me = await owner()
    await saveTechChannel(channel)
    await audit(prisma, { userId: me.id, action: "slack.tech_channel", entity: "settings", data: { canal: channel || null } })
    revalidatePath("/settings")
  })
}

/** Manda un mensaje de prueba al canal elegido. */
export async function testSlackChannel(channel: string) {
  return run(async () => {
    const me = await owner()
    const token = await getSlackToken()
    if (!token) throw new UserError("Conecta Slack primero.")
    try {
      await postMessage(token, {
        channel,
        text: `*Prueba de Creative Loop*\nSi lees esto, el canal está bien conectado. La envió ${me.name}.`,
        url: process.env.APP_URL,
        urlLabel: "Abrir Creative Loop",
      })
    } catch (e) {
      throw new UserError(e instanceof SlackError ? e.message : "No se pudo enviar el mensaje.")
    }
  })
}

// ─── Reglas de winner (F-106, F-902) ─────────────────────────────────────────

const ruleSchema = z.object({
  winnerMaxCpaPct: z.coerce.number().int().min(1).max(200),
  winnerMinConversions: z.coerce.number().int().min(0),
  winnerMinSpendMult: z.coerce.number().min(0),
  loserMinSpendMult: z.coerce.number().min(0),
  loserMinCpaPct: z.coerce.number().int().min(100),
  loserZeroConvSpendMult: z.coerce.number().min(0),
  inconclusiveDays: z.coerce.number().int().min(1),
  minHookRatePct: z.coerce.number().min(0).max(100).nullable(),
})

export type RuleInput = z.input<typeof ruleSchema>

export async function saveWinnerRule(offerId: string | null, input: RuleInput) {
  return run(async () => {
    const me = await owner()
    const d = ruleSchema.parse(input)
    const existing = await prisma.winnerRule.findFirst({ where: { offerId } })
    if (existing) await prisma.winnerRule.update({ where: { id: existing.id }, data: d })
    else await prisma.winnerRule.create({ data: { ...d, offerId } })
    await audit(prisma, { userId: me.id, action: "winner_rule.save", entity: "winner_rule", entityId: offerId ?? "global", data: d })
    revalidatePath("/settings")
  })
}

export async function deleteOfferRule(offerId: string) {
  return run(async () => {
    const me = await owner()
    await prisma.winnerRule.deleteMany({ where: { offerId } })
    await audit(prisma, { userId: me.id, action: "winner_rule.delete", entity: "winner_rule", entityId: offerId })
    revalidatePath("/settings")
  })
}
