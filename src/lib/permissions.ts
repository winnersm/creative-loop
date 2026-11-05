// Matriz de permisos (SPEC.md §1). Se evalúa SIEMPRE en el servidor.

import type { Role } from "@/generated/prisma/enums"

export type Actor = { id: string; role: Role }

export type Action =
  | "settings.manage" // ofertas, reglas, tags, Meta
  | "users.manage"
  | "sync.force"
  | "concept.create"
  | "asset.create"
  | "asset.assign"
  | "asset.viewAll"
  | "asset.viewApproved"
  | "review.decide"
  | "money.view"
  | "launch.manage"
  | "performance.override"

const MATRIX: Record<Action, Role[]> = {
  "settings.manage": ["OWNER"],
  "users.manage": ["OWNER"],
  "sync.force": ["OWNER"],
  "concept.create": ["OWNER", "MANAGER"],
  "asset.create": ["OWNER", "MANAGER"],
  "asset.assign": ["OWNER", "MANAGER"],
  "asset.viewAll": ["OWNER", "MANAGER"],
  "asset.viewApproved": ["OWNER", "MANAGER", "BUYER"],
  "review.decide": ["OWNER", "MANAGER"],
  "money.view": ["OWNER", "MANAGER", "BUYER"],
  "launch.manage": ["OWNER", "MANAGER", "BUYER"],
  "performance.override": ["OWNER"],
}

export function can(actor: Actor, action: Action): boolean {
  return MATRIX[action].includes(actor.role)
}

type AssetRef = { editorId: string | null; productionStatus: string }

const isManager = (a: Actor) => a.role === "OWNER" || a.role === "MANAGER"
const isAssignedEditor = (a: Actor, asset: AssetRef) =>
  a.role === "EDITOR" && asset.editorId === a.id

/** Ver un asset: manager todo · editor solo asignados · buyer solo aprobados. */
export function canViewAsset(actor: Actor, asset: AssetRef): boolean {
  if (isManager(actor)) return true
  if (actor.role === "EDITOR") return asset.editorId === actor.id
  if (actor.role === "BUYER") return asset.productionStatus === "APPROVED"
  return false
}

export function canUploadVersion(actor: Actor, asset: AssetRef): boolean {
  return isManager(actor) || isAssignedEditor(actor, asset)
}

/** Crear comentarios nuevos: solo manager. El editor responde en los suyos. */
export function canComment(actor: Actor): boolean {
  return isManager(actor)
}

export function canReplyOrResolve(actor: Actor, asset: AssetRef): boolean {
  return isManager(actor) || isAssignedEditor(actor, asset)
}

/** Filtro Prisma para listar assets visibles. */
export function assetVisibilityWhere(actor: Actor) {
  if (isManager(actor)) return {}
  if (actor.role === "EDITOR") return { editorId: actor.id }
  return { productionStatus: "APPROVED" as const }
}
