"use server"

import { revalidatePath } from "next/cache"
import { assert, run, UserError } from "@/lib/action"
import { encrypt } from "@/lib/crypto"
import { audit } from "@/lib/events"
import { getMe, listAdAccounts, MetaApiError } from "@/lib/meta-api"
import { can } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { enqueueMetaSync, enqueueWinnerEngine } from "@/lib/queue"
import { actor } from "@/lib/session"
import { firstSpendDate } from "@/lib/performance"

/** F-105 · Conectar un token de Meta (solo lectura) y descubrir sus cuentas. */
export async function saveMetaConnection(name: string, token: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "settings.manage"), "Solo el propietario puede conectar Meta.")
    const clean = token.trim()
    assert(clean.length > 20, "Pega un token de acceso válido.")
    let accounts
    try {
      const who = await getMe(clean)
      accounts = await listAdAccounts(clean)
      name = name.trim() || who.name
    } catch (e) {
      if (e instanceof MetaApiError) throw new UserError(`Meta rechazó el token: ${e.message}`)
      throw e
    }
    const conn = await prisma.metaConnection.create({
      data: { name, tokenEncrypted: encrypt(clean), tokenLast4: clean.slice(-4), lastCheckedAt: new Date() },
    })
    for (const a of accounts) {
      await prisma.adAccount.upsert({
        where: { accountId: a.id },
        create: { connectionId: conn.id, accountId: a.id, name: a.name, currency: a.currency },
        update: { connectionId: conn.id, name: a.name, currency: a.currency },
      })
    }
    await audit(prisma, { userId: me.id, action: "meta.connect", entity: "meta_connection", entityId: conn.id, data: { accounts: accounts.length } })
    revalidatePath("/settings")
    return accounts.length
  })
}

export async function deleteMetaConnection(id: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "settings.manage"), "No tienes permiso.")
    await prisma.metaConnection.delete({ where: { id } })
    await audit(prisma, { userId: me.id, action: "meta.disconnect", entity: "meta_connection", entityId: id })
    revalidatePath("/settings")
  })
}

export async function setAdAccountEnabled(id: string, enabled: boolean) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "settings.manage"), "No tienes permiso.")
    await prisma.adAccount.update({ where: { id }, data: { enabled } })
    revalidatePath("/settings")
  })
}

/** F-806 · Forzar sync (owner). */
export async function forceMetaSync() {
  return run(async () => {
    const me = await actor()
    assert(can(me, "sync.force"), "Solo el propietario puede forzar la sincronización.")
    await enqueueMetaSync()
  })
}

export async function forceWinnerEngine() {
  return run(async () => {
    const me = await actor()
    assert(can(me, "sync.force"), "Solo el propietario puede forzar la evaluación.")
    await enqueueWinnerEngine()
  })
}

/** F-705 · Asignar a mano un anuncio sin token a una versión aprobada. */
export async function assignAd(adId: string, versionCode: string) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "launch.manage"), "No tienes permiso.")
    const version = await prisma.version.findUnique({
      where: { code: versionCode.trim().toUpperCase() },
      include: { asset: true },
    })
    assert(version, `No existe la versión ${versionCode}.`)
    assert(version.asset.productionStatus === "APPROVED", "Solo se asignan versiones de creativos aprobados.")
    const ad = await prisma.metaAd.findUniqueOrThrow({ where: { adId }, include: { deployment: true } })
    assert(!ad.deployment, "Ese anuncio ya está asignado.")
    await prisma.$transaction(async (tx) => {
      await tx.deployment.create({
        data: { adId, versionId: version.id, assetId: version.assetId, source: "MANUAL" },
      })
      await audit(tx, { userId: me.id, action: "deployment.assign", entity: "meta_ad", entityId: adId, data: { version: version.code } })
    })
    if (version.asset.performanceStatus === "NOT_LAUNCHED") {
      const since = await firstSpendDate(version.assetId)
      if (since)
        await prisma.asset.update({
          where: { id: version.assetId },
          data: { performanceStatus: "TESTING", testingSince: since, relaunchRequestedAt: null },
        })
    }
    revalidatePath("/unassigned")
    revalidatePath("/launch")
  })
}

export async function setAdIgnored(adId: string, ignored: boolean) {
  return run(async () => {
    const me = await actor()
    assert(can(me, "launch.manage"), "No tienes permiso.")
    await prisma.metaAd.update({ where: { adId }, data: { ignored } })
    await audit(prisma, { userId: me.id, action: ignored ? "meta_ad.ignore" : "meta_ad.unignore", entity: "meta_ad", entityId: adId })
    revalidatePath("/unassigned")
  })
}
