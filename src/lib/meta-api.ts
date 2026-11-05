// Cliente de la Graph API de Meta. SOLO LECTURA: únicamente peticiones GET.

const VERSION = process.env.META_API_VERSION ?? "v24.0"
// META_GRAPH_URL permite apuntar a un servidor simulado en pruebas locales.
const BASE = `${process.env.META_GRAPH_URL ?? "https://graph.facebook.com"}/${VERSION}`

export class MetaApiError extends Error {}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET", cache: "no-store" })
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!res.ok || body.error) throw new MetaApiError(body.error?.message ?? `Meta respondió ${res.status}`)
  return body as T
}

function url(path: string, token: string, params: Record<string, string> = {}) {
  const u = new URL(`${BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set("access_token", token)
  return u.toString()
}

async function paginate<T>(first: string, max = 50): Promise<T[]> {
  const out: T[] = []
  let next: string | undefined = first
  for (let i = 0; next && i < max; i++) {
    const page: { data: T[]; paging?: { next?: string } } = await get(next)
    out.push(...page.data)
    next = page.paging?.next
  }
  return out
}

export async function getMe(token: string) {
  return get<{ id: string; name: string }>(url("me", token, { fields: "id,name" }))
}

export type MetaAdAccount = { id: string; account_id: string; name: string; currency: string }

export async function listAdAccounts(token: string) {
  return paginate<MetaAdAccount>(url("me/adaccounts", token, { fields: "account_id,name,currency", limit: "200" }))
}

type ActionStat = { action_type: string; value: string }

export type InsightRow = {
  ad_id: string
  ad_name: string
  adset_id?: string
  campaign_id?: string
  date_start: string
  spend?: string
  impressions?: string
  clicks?: string
  inline_link_clicks?: string
  actions?: ActionStat[]
  action_values?: ActionStat[]
  video_thruplay_watched_actions?: ActionStat[]
  video_p25_watched_actions?: ActionStat[]
  video_p50_watched_actions?: ActionStat[]
  video_p75_watched_actions?: ActionStat[]
  video_p100_watched_actions?: ActionStat[]
}

const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "adset_id",
  "campaign_id",
  "spend",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
].join(",")

/** Insights diarios a nivel de anuncio. `accountId` con prefijo act_. */
export async function getAdInsights(token: string, accountId: string, since: string, until: string) {
  return paginate<InsightRow>(
    url(`${accountId}/insights`, token, {
      level: "ad",
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since, until }),
      time_increment: "1",
      limit: "500",
    }),
    200,
  )
}

const sumActions = (list?: ActionStat[]) => (list ?? []).reduce((s, a) => s + Number(a.value || 0), 0)

export function actionsToMap(list?: ActionStat[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of list ?? []) out[a.action_type] = (out[a.action_type] ?? 0) + Number(a.value || 0)
  return out
}

/** Convierte una fila de Insights en los campos de PerformanceDaily. */
export function toDaily(row: InsightRow) {
  const actions = actionsToMap(row.actions)
  return {
    spendCents: Math.round(Number(row.spend ?? 0) * 100),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.inline_link_clicks ?? row.clicks ?? 0),
    videoPlays3s: actions["video_view"] ?? 0,
    thruplays: sumActions(row.video_thruplay_watched_actions),
    p25: sumActions(row.video_p25_watched_actions),
    p50: sumActions(row.video_p50_watched_actions),
    p75: sumActions(row.video_p75_watched_actions),
    p100: sumActions(row.video_p100_watched_actions),
    actions,
    actionValues: actionsToMap(row.action_values),
  }
}
