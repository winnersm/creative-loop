// Cliente de Slack (Web API). Solo publica mensajes y lee la lista de canales.
// La app nunca lee conversaciones ni escribe en nombre de una persona.

export class SlackError extends Error {}

const API = "https://slack.com/api"

/** Los errores de Slack llegan con HTTP 200 y `ok: false`. */
async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body ?? {}),
  })
  const json = (await res.json()) as { ok: boolean; error?: string } & T
  if (!json.ok) throw new SlackError(SLACK_ERRORS[json.error ?? ""] ?? json.error ?? "Slack devolvió un error.")
  return json
}

/** Los errores que se ven en la práctica, explicados. */
const SLACK_ERRORS: Record<string, string> = {
  invalid_auth: "El token no es válido.",
  account_inactive: "El token pertenece a una app desinstalada.",
  token_revoked: "El token fue revocado.",
  not_in_channel: "El bot no está en ese canal. Escribe «/invite @Creative Loop» dentro del canal.",
  channel_not_found: "No existe ese canal, o el bot no puede verlo.",
  is_archived: "Ese canal está archivado.",
  missing_scope: "Al token le falta un permiso. Revisa chat:write, channels:read y groups:read.",
  ratelimited: "Slack está limitando los envíos. Se reintentará.",
}

export type SlackIdentity = { team: string; bot: string }

/** Comprueba el token y devuelve a qué espacio de trabajo pertenece. */
export async function checkToken(token: string): Promise<SlackIdentity> {
  const r = await call<{ team: string; user: string }>(token, "auth.test")
  return { team: r.team, bot: r.user }
}

export type SlackChannel = { id: string; name: string; private: boolean }

/** Canales que el bot puede ver, para elegirlos en un desplegable. */
export async function listChannels(token: string): Promise<SlackChannel[]> {
  const out: SlackChannel[] = []
  let cursor: string | undefined
  do {
    const r = await call<{
      channels: { id: string; name: string; is_private: boolean; is_archived: boolean }[]
      response_metadata?: { next_cursor?: string }
    }>(token, "conversations.list", {
      exclude_archived: true,
      limit: 200,
      types: "public_channel,private_channel",
      cursor,
    })
    for (const c of r.channels) if (!c.is_archived) out.push({ id: c.id, name: c.name, private: c.is_private })
    cursor = r.response_metadata?.next_cursor || undefined
  } while (cursor)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export type SlackMessage = {
  channel: string
  text: string
  /** Enlace a la pantalla de la app, si el aviso lleva a algún sitio. */
  url?: string
  urlLabel?: string
}

export async function postMessage(token: string, m: SlackMessage) {
  await call(token, "chat.postMessage", {
    channel: m.channel,
    // `text` es lo que se ve en la notificación del móvil, así que va completo.
    text: m.url ? `${m.text}\n${m.url}` : m.text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: m.text } },
      ...(m.url
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: m.urlLabel ?? "Abrir en Creative Loop" },
                  url: m.url,
                },
              ],
            },
          ]
        : []),
    ],
    unfurl_links: false,
  })
}
