// Tipos de aviso que la app sabe mandar a Slack. Sin dependencias de servidor:
// lo usan tanto la pantalla de Ajustes como el worker.

/**
 * `money` marca los avisos que hablan de rendimiento. Un canal de Slack no
 * respeta la matriz de permisos, así que esos no deberían ir a un canal donde
 * haya editores.
 */
export const SLACK_EVENTS = [
  { type: "asset.assigned", label: "Creativo asignado a un editor", money: false },
  { type: "review.submitted", label: "Enviado a revisión", money: false },
  { type: "version.processed", label: "Versión procesada (control técnico)", money: false },
  { type: "comment.new", label: "Comentario nuevo", money: false },
  { type: "comment.reply", label: "Respuesta a un comentario", money: false },
  { type: "asset.variations", label: "Variaciones creadas con IA", money: false },
  { type: "performance.change", label: "Cambio de rendimiento (ganador / perdedor)", money: true },
  { type: "sync.unassigned", label: "Anuncios con un código que no corresponde a ningún creativo", money: true },
  { type: "sync.error", label: "Error al sincronizar con Meta", money: false },
] as const

export type SlackEventType = (typeof SLACK_EVENTS)[number]["type"]
/** tipo de aviso → id del canal. Sin entrada = no se manda a Slack. */
export type SlackRoutes = Record<string, string>

export type SlackStatus = {
  connected: boolean
  team: string | null
  updatedAt: Date | null
  /** Canal de avisos técnicos. */
  techChannel: string | null
}

/**
 * Avisos que se quedan dentro de la app y no salen a Slack.
 *
 * El criterio es si hace falta interrumpir a alguien fuera de la herramienta:
 * - `version.uploaded`: acabas de pulsar «subir», ya lo sabes.
 * - los comentarios llegan en ráfaga durante una revisión; lo accionable es el
 *   resumen que llega con «cambios pedidos».
 */
export const SLACK_QUIET: string[] = ["version.uploaded", "comment.new", "comment.reply"]

export const goesToSlack = (type: string) => !SLACK_QUIET.includes(type)

/**
 * Lo único que un editor recibe en su canal. Todo lo demás le sigue llegando
 * a la campana de la app: Slack es para lo que le obliga a moverse.
 */
export const EDITOR_SLACK: string[] = [
  "asset.assigned",
  "review.submitted",
  "review.changes_requested",
  "review.approved",
]

/** ¿Este aviso sale al canal de esta persona? */
export function goesToChannel(type: string, role: string) {
  if (!goesToSlack(type)) return false
  return role === "EDITOR" ? EDITOR_SLACK.includes(type) : true
}

/**
 * Avisos técnicos: van al canal de técnica y a ningún canal personal.
 * Un fallo de ffmpeg o de la sincronización con Meta no es asunto del editor
 * ni del comprador de medios; lo arregla quien mantiene la herramienta.
 */
export const TECH_EVENTS: string[] = ["sync.error", "sync.unassigned", "version.processed", "version.failed"]

export const isTech = (type: string) => TECH_EVENTS.includes(type)
