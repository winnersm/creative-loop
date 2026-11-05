// Máquina de estados de producción (SPEC.md §3.1). Lógica pura, sin base de datos.

import type { ProductionStatus, Role } from "@/generated/prisma/enums"

type Who = "editor" | "manager"

type Transition = {
  from: ProductionStatus[]
  to: ProductionStatus
  who: Who
  requiresReason?: boolean
  label: string
}

const ACTIVE: ProductionStatus[] = [
  "BRIEF",
  "IN_PROGRESS",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
]

export const TRANSITIONS: Transition[] = [
  { from: ["BRIEF"], to: "IN_PROGRESS", who: "editor", label: "Empezar" },
  { from: ["IN_PROGRESS", "CHANGES_REQUESTED"], to: "IN_REVIEW", who: "editor", label: "Enviar a revisión" },
  { from: ["IN_REVIEW"], to: "CHANGES_REQUESTED", who: "manager", label: "Pedir cambios" },
  { from: ["IN_REVIEW"], to: "APPROVED", who: "manager", label: "Aprobar" },
  { from: ["IN_REVIEW"], to: "REJECTED", who: "manager", requiresReason: true, label: "Rechazar" },
  { from: ["APPROVED"], to: "IN_REVIEW", who: "manager", requiresReason: true, label: "Reabrir" },
  { from: ACTIVE, to: "ARCHIVED", who: "manager", label: "Archivar" },
]

export type TransitionContext = {
  role: Role
  /** El usuario es el editor asignado al asset. */
  isAssignee: boolean
  reason?: string | null
  /** Última versión del asset. */
  latestVersion?: {
    ready: boolean
    submitted: boolean
    blockingFailures: number
    /** Detalle de los fallos bloqueantes, para explicar el error. */
    blockingDetails?: string[]
  } | null
  /** Comentarios abiertos en la versión en revisión. */
  openComments: number
  openMustComments: number
  /** Gate de la oferta del creativo. null = el creativo no tiene oferta. */
  offerGate: "OK" | "BLOCKED" | null
}

export function findTransition(from: ProductionStatus, to: ProductionStatus): Transition | null {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from)) ?? null
}

function allowedByRole(t: Transition, ctx: TransitionContext): boolean {
  const manager = ctx.role === "OWNER" || ctx.role === "MANAGER"
  if (t.who === "manager") return manager
  return manager || (ctx.role === "EDITOR" && ctx.isAssignee)
}

/**
 * Devuelve la lista de motivos que impiden la transición.
 * Vacía = se puede.
 */
export function checkTransition(
  from: ProductionStatus,
  to: ProductionStatus,
  ctx: TransitionContext,
): string[] {
  const t = findTransition(from, to)
  if (!t) return [`No se puede pasar de ${from} a ${to}.`]
  const errors: string[] = []
  if (!allowedByRole(t, ctx)) errors.push("No tienes permiso para este cambio.")
  if (t.requiresReason && !ctx.reason?.trim()) errors.push("Hace falta un motivo.")

  if (to === "IN_REVIEW" && from !== "APPROVED") {
    const v = ctx.latestVersion
    if (!v) errors.push("Sube una versión antes de enviar a revisión.")
    else if (!v.ready) errors.push("La versión todavía se está procesando o falló.")
    else if (v.submitted) errors.push("Sube una versión nueva antes de volver a enviar.")
    else if (v.blockingFailures > 0)
      errors.push(
        `La versión tiene ${v.blockingFailures} fallo(s) técnico(s) bloqueante(s)` +
          (v.blockingDetails?.length ? `: ${v.blockingDetails.join(" · ")}.` : ".") +
          " Sube una versión corregida o revisa el formato del creativo.",
      )
  }
  if (to === "CHANGES_REQUESTED" && ctx.openComments === 0)
    errors.push("Deja al menos un comentario abierto para pedir cambios.")
  if (to === "APPROVED") {
    if (ctx.openMustComments > 0)
      errors.push(`Quedan ${ctx.openMustComments} comentario(s) obligatorio(s) abiertos.`)
    // El ad name necesita producto y GEO, que salen de la oferta del creativo.
    if (ctx.offerGate === null) errors.push("Asigna una oferta al creativo antes de aprobarlo.")
    else if (ctx.offerGate === "BLOCKED") errors.push("La oferta está bloqueada por cumplimiento normativo.")
  }
  return errors
}

/** Destinos que la UI puede ofrecer (sin evaluar condiciones de datos). */
export function availableTargets(
  from: ProductionStatus,
  role: Role,
  isAssignee: boolean,
): { to: ProductionStatus; label: string; requiresReason: boolean }[] {
  const ctx = { role, isAssignee } as TransitionContext
  return TRANSITIONS.filter((t) => t.from.includes(from) && allowedByRole(t, ctx)).map((t) => ({
    to: t.to,
    label: t.label,
    requiresReason: !!t.requiresReason,
  }))
}
