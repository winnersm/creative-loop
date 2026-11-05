// Etiquetas y colores de estado. Única fuente para tabla, kanban y badges.
// Los colores son tokens CSS definidos en globals.css.

import type {
  ArchiveReason,
  AssetFormat,
  CommentSeverity,
  MediaType,
  PerformanceStatus,
  Priority,
  ProductionStatus,
  Role,
} from "@/generated/prisma/enums"

type Style = { label: string; color: string; fg: string }

export const PRODUCTION_STATUS: Record<ProductionStatus, Style> = {
  BRIEF: { label: "Por empezar", color: "var(--status-brief)", fg: "var(--status-brief-fg)" },
  IN_PROGRESS: { label: "Editando", color: "var(--status-working)", fg: "var(--status-working-fg)" },
  IN_REVIEW: { label: "En revisión", color: "var(--status-review)", fg: "var(--status-review-fg)" },
  CHANGES_REQUESTED: { label: "Cambios pedidos", color: "var(--status-stuck)", fg: "var(--status-stuck-fg)" },
  APPROVED: { label: "Aprobado", color: "var(--status-done)", fg: "var(--status-done-fg)" },
  REJECTED: { label: "Rechazado", color: "var(--status-rejected)", fg: "var(--status-rejected-fg)" },
  ARCHIVED: { label: "Archivado", color: "var(--status-muted)", fg: "var(--status-muted-fg)" },
}

export const PRODUCTION_ORDER: ProductionStatus[] = [
  "BRIEF",
  "IN_PROGRESS",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]

export const PERFORMANCE_STATUS: Record<PerformanceStatus, Style> = {
  NOT_LAUNCHED: { label: "Sin lanzar", color: "var(--status-empty)", fg: "var(--status-empty-fg)" },
  TESTING: { label: "En prueba", color: "var(--status-testing)", fg: "var(--status-testing-fg)" },
  WINNER: { label: "Ganador", color: "var(--status-done)", fg: "var(--status-done-fg)" },
  LOSER: { label: "Perdedor", color: "var(--status-stuck)", fg: "var(--status-stuck-fg)" },
  INCONCLUSIVE: { label: "Sin veredicto", color: "var(--status-muted)", fg: "var(--status-muted-fg)" },
}

export const PRIORITY: Record<Priority, Style> = {
  HIGH: { label: "Alta", color: "var(--prio-high)", fg: "var(--prio-high-fg)" },
  MEDIUM: { label: "Media", color: "var(--prio-med)", fg: "var(--prio-med-fg)" },
  LOW: { label: "Baja", color: "var(--prio-low)", fg: "var(--prio-low-fg)" },
}

export const FORMAT: Record<AssetFormat, { label: string; ratio: number }> = {
  VERTICAL: { label: "9:16", ratio: 9 / 16 },
  PORTRAIT: { label: "4:5", ratio: 4 / 5 },
  SQUARE: { label: "1:1", ratio: 1 },
  LANDSCAPE: { label: "16:9", ratio: 16 / 9 },
}

export const ARCHIVE_REASON: Record<ArchiveReason, string> = {
  NOT_TESTED: "Descartado sin testear",
  CYCLE_DONE: "Ya cumplió su ciclo",
  OFFER_CLOSED: "Oferta cerrada",
  DUPLICATE: "Duplicado",
  CONCEPT_ARCHIVED: "Concepto archivado",
  OTHER: "Otro",
}

/** Motivos que puede elegir una persona. «Concepto archivado» lo pone el sistema. */
export const ARCHIVE_REASON_CHOICES: ArchiveReason[] = ["NOT_TESTED", "CYCLE_DONE", "OFFER_CLOSED", "DUPLICATE", "OTHER"]

export const MEDIA_TYPE: Record<MediaType, string> = {
  VIDEO: "Video",
  IMAGE: "Imagen",
}

export const COMMENT_SEVERITY: Record<CommentSeverity, Style> = {
  MUST: { label: "Obligatorio", color: "var(--status-stuck)", fg: "var(--status-stuck-fg)" },
  SHOULD: { label: "Recomendado", color: "var(--status-working)", fg: "var(--status-working-fg)" },
  NIT: { label: "Detalle", color: "var(--status-muted)", fg: "var(--status-muted-fg)" },
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Propietario",
  MANAGER: "Responsable creativo",
  EDITOR: "Editor",
  BUYER: "Comprador de medios",
}

/** Colores rotativos de los grupos (conceptos). */
/** Color de cada grupo de conceptos. Mismo registro que los estados (tonos
 *  600–700), con hues distintos para que se distingan de un vistazo. */
/**
 * Colores de las etiquetas de equipo (`AssetLabel.color`). Fondo claro y texto oscuro
 * de la misma familia: contraste ≥ 7:1 en todos (comprobado en core.test.ts).
 */
export const LABEL_COLORS = {
  gray: { label: "Gris", bg: "#e2e8f0", fg: "#1e293b" },
  red: { label: "Rojo", bg: "#fecaca", fg: "#7f1d1d" },
  orange: { label: "Naranja", bg: "#fed7aa", fg: "#7c2d12" },
  yellow: { label: "Amarillo", bg: "#fef08a", fg: "#713f12" },
  green: { label: "Verde", bg: "#bbf7d0", fg: "#14532d" },
  teal: { label: "Turquesa", bg: "#99f6e4", fg: "#134e4a" },
  blue: { label: "Azul", bg: "#bfdbfe", fg: "#1e3a8a" },
  purple: { label: "Morado", bg: "#e9d5ff", fg: "#581c87" },
  pink: { label: "Rosa", bg: "#fbcfe8", fg: "#831843" },
} as const

export type LabelColor = keyof typeof LABEL_COLORS

export const labelStyle = (color: string) => LABEL_COLORS[color as LabelColor] ?? LABEL_COLORS.gray

export const GROUP_COLORS = [
  "#0e7490",
  "#7e22ce",
  "#1d4ed8",
  "#c2410c",
  "#be185d",
  "#047857",
  "#4338ca",
  "#b91c1c",
  "#0891b2",
  "#a16207",
]

/**
 * El historial en palabras: "Nelson envió a revisión" se lee mejor que dos
 * etiquetas y una flecha. Devuelve la frase sin el nombre de quien la hizo.
 */
export function statusEventText(from: ProductionStatus | null, to: ProductionStatus): string {
  if (!from) return "creó el creativo"
  if (from === to) return "actualizó el creativo"
  switch (to) {
    case "IN_PROGRESS":
      return from === "CHANGES_REQUESTED" ? "retomó los cambios" : "empezó a editar"
    case "IN_REVIEW":
      if (from === "APPROVED") return "reabrió la revisión"
      return from === "CHANGES_REQUESTED" ? "volvió a enviar a revisión" : "envió a revisión"
    case "CHANGES_REQUESTED":
      return "pidió cambios"
    case "APPROVED":
      return "aprobó el creativo"
    case "REJECTED":
      return "rechazó el creativo"
    case "ARCHIVED":
      return "archivó el creativo"
    case "BRIEF":
      return "devolvió el creativo a «Por empezar»"
  }
}
