// Servidor que imita la Graph API de Meta (solo los GET que usa la app).
// Uso: npx tsx scripts/mock-meta.mts   →   META_GRAPH_URL=http://localhost:4555
import { createServer } from "node:http"

const PORT = Number(process.env.MOCK_META_PORT ?? 4555)
const TOKEN_AD = process.env.MOCK_AD_NAME ?? "IMMUNO_DE_CURIOSITY_20260916__cl-C001A01V3"

function days(n: number) {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10))
  return out
}

function insights() {
  const rows = []
  for (const d of days(7)) {
    rows.push({
      ad_id: "9001",
      ad_name: TOKEN_AD,
      adset_id: "8001",
      campaign_id: "7001",
      date_start: d,
      spend: "30.00",
      impressions: "5000",
      inline_link_clicks: "90",
      actions: [
        { action_type: "video_view", value: "1500" },
        { action_type: "purchase", value: "4" },
      ],
      action_values: [{ action_type: "purchase", value: "120.00" }],
      video_thruplay_watched_actions: [{ action_type: "video_view", value: "400" }],
      video_p25_watched_actions: [{ action_type: "video_view", value: "1200" }],
      video_p50_watched_actions: [{ action_type: "video_view", value: "800" }],
      video_p75_watched_actions: [{ action_type: "video_view", value: "500" }],
      video_p100_watched_actions: [{ action_type: "video_view", value: "300" }],
    })
    rows.push({
      ad_id: "9002",
      ad_name: "IMMUNO_DE_OLDHOOK_20260901",
      adset_id: "8001",
      campaign_id: "7001",
      date_start: d,
      spend: "15.00",
      impressions: "2500",
      inline_link_clicks: "20",
      actions: [{ action_type: "video_view", value: "400" }],
    })
  }
  return rows
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`)
  const json = (body: unknown, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify(body))
  }
  console.log(req.method, url.pathname)
  if (req.method !== "GET") return json({ error: { message: "solo GET" } }, 405)
  if (!url.searchParams.get("access_token")) return json({ error: { message: "sin token" } }, 400)
  if (url.pathname.endsWith("/me")) return json({ id: "1", name: "Mock BM" })
  if (url.pathname.endsWith("/me/adaccounts"))
    return json({ data: [{ id: "act_111", account_id: "111", name: "Cuenta simulada", currency: "USD" }] })
  if (url.pathname.endsWith("/act_111/insights")) return json({ data: insights() })
  json({ error: { message: `ruta no simulada: ${url.pathname}` } }, 404)
}).listen(PORT, () => console.log(`mock Meta en http://localhost:${PORT}`))
