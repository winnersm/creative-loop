// Cliente de IA (DeepSeek, API compatible con chat completions). Solo servidor.
import { z } from "zod"

const TIMEOUT_MS = 120_000
// Los modelos de DeepSeek razonan antes de responder y ese razonamiento cuenta en max_tokens.
const DEFAULT_MAX_TOKENS = 8000

export const AI_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const

export class AiError extends Error {}

/** Clave, modelo y URL. La web los resuelve desde Ajustes (ver ai-config.ts). */
export type AiConfig = { apiKey: string; model: string; baseUrl: string }

export function envAiConfig(): AiConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  }
}

type ChatMessage = { role: "system" | "user"; content: string }

/** Llama al modelo pidiendo JSON y lo valida con el esquema. Reintenta una vez si llega vacío o inválido. */
async function chatJson<T>(
  config: AiConfig,
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  const key = config.apiKey
  if (!key) throw new AiError("La IA no está configurada: añade la clave de DeepSeek en Ajustes → IA.")

  let lastError = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature: 1,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      throw new AiError(`No se pudo contactar con DeepSeek: ${(e as Error).message}`)
    }
    const body = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[]
      error?: { message?: string }
    } | null
    if (!res.ok) {
      if (res.status === 401) throw new AiError("DeepSeek rechazó la clave. Revísala en Ajustes → IA.")
      if (res.status === 402) throw new AiError("La cuenta de DeepSeek no tiene saldo.")
      if (res.status === 429) throw new AiError("DeepSeek está limitando las peticiones. Prueba en un momento.")
      throw new AiError(`DeepSeek respondió ${res.status}: ${body?.error?.message ?? "error desconocido"}`)
    }
    // La documentación avisa de que el modo JSON puede devolver contenido vacío: se reintenta.
    const choice = body?.choices?.[0]
    const content = choice?.message?.content?.trim()
    if (choice?.finish_reason === "length") {
      lastError = "la respuesta se cortó por longitud"
    } else if (!content) {
      lastError = "respuesta vacía"
    } else {
      try {
        const parsed = schema.safeParse(JSON.parse(content))
        if (parsed.success) return parsed.data
        lastError = `formato inesperado (${parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ")})`
      } catch {
        lastError = "JSON no válido"
      }
    }
    console.warn(`[ia] intento ${attempt + 1} con ${config.model}: ${lastError}`)
  }
  throw new AiError(`La IA no devolvió una propuesta válida (${lastError}). Vuelve a intentarlo.`)
}

// ─── Propuestas de copy (F-1002 simplificado) ────────────────────────────────

export const copySuggestionsSchema = z.object({
  options: z
    .array(
      z.object({
        primaryText: z.string().trim().min(1),
        headline: z.string().trim().min(1),
        rationale: z
          .string()
          .default("")
          .transform((r) => (r.length > 200 ? `${r.slice(0, 197)}…` : r)),
      }),
    )
    .min(1),
})

export type CopySuggestion = z.infer<typeof copySuggestionsSchema>["options"][number]

export type CopyContext = {
  language: string
  geo: string
  offerName: string
  product: string
  conceptTitle: string
  hypothesis: string
  tags: { dimension: string; label: string }[]
  brief: string
  script?: string
  currentPrimaryText: string
  currentHeadline: string
  cta: string
}

const COPY_SYSTEM = `Eres redactor de anuncios de respuesta directa para Meta (Facebook e Instagram).
Escribes el texto principal y el titular de un anuncio a partir de un concepto creativo.

Reglas:
- Escribe el texto principal y el titular en el idioma indicado (código ISO), con naturalidad de hablante nativo.
- Texto principal: máximo 125 caracteres, que enganche en la primera frase y sea coherente con la hipótesis y las etiquetas.
- Titular: máximo 40 caracteres.
- Cumple las políticas de Meta: nada de promesas garantizadas, cifras de ganancias, curas o resultados de salud asegurados, ni frases que señalen atributos personales ("¿Tienes diabetes?").
- Las 3 opciones deben ser distintas entre sí en enfoque, no solo en palabras.
- "rationale" explica en español, en una frase corta, qué enfoque usa esa opción.

Responde solo con json con esta forma:
{"options": [{"primaryText": "...", "headline": "...", "rationale": "..."}]}`

export async function suggestCopy(config: AiConfig, ctx: CopyContext): Promise<CopySuggestion[]> {
  const user = [
    `Idioma del anuncio: ${ctx.language} (GEO ${ctx.geo})`,
    `Oferta: ${ctx.offerName} (producto ${ctx.product})`,
    `Concepto: ${ctx.conceptTitle}`,
    `Hipótesis: ${ctx.hypothesis}`,
    `Etiquetas: ${ctx.tags.map((t) => `${t.dimension}: ${t.label}`).join("; ")}`,
    `Botón de acción: ${ctx.cta || "sin definir"}`,
    `Indicaciones para el editor: ${ctx.brief || "sin indicaciones"}`,
    ctx.script ? `Guion del video:\n${ctx.script}` : "Sin guion.",
    ctx.currentPrimaryText || ctx.currentHeadline
      ? `Copy actual (propón alternativas mejores): ${ctx.currentPrimaryText} | ${ctx.currentHeadline}`
      : "Todavía no hay copy.",
    "",
    "Propón 3 opciones en json.",
  ].join("\n")
  const result = await chatJson(
    config,
    [
      { role: "system", content: COPY_SYSTEM },
      { role: "user", content: user },
    ],
    copySuggestionsSchema,
  )
  return result.options.slice(0, 3)
}

/** Petición mínima para comprobar que la clave y el modelo funcionan. */
export async function pingAi(config: AiConfig): Promise<void> {
  await chatJson(
    config,
    [
      { role: "system", content: 'Responde solo con este json: {"ok": true}' },
      { role: "user", content: "ping" },
    ],
    z.object({ ok: z.literal(true) }),
    2000,
  )
}

// ─── Analizar un ganador y proponer variaciones ──────────────────────────────

export type WinnerDimension = { key: string; label: string; current: string; values: { value: string; label: string }[] }

export type WinnerContext = {
  language: string
  geo: string
  offerName: string
  conceptTitle: string
  hypothesis: string
  format: string
  durationSec: number | null
  script: string
  brief: string
  primaryText: string
  headline: string
  dimensions: WinnerDimension[]
  metrics: {
    spend: string
    conversions: number
    cpa: string
    targetCpa: string
    hookRate: string
    holdRate: string
    ctr: string
    roas: string
  } | null
  count: number
}

export const winnerAnalysisSchema = z.object({
  summary: z.string().trim().min(1),
  keyFactors: z
    .array(z.object({ factor: z.string().trim().min(1), evidence: z.string().default("") }))
    .default([]),
  risks: z.array(z.string()).default([]),
  variations: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        dimension: z.string().default(""),
        value: z.string().default(""),
        whatChanges: z.string().default(""),
        keepSame: z.string().default(""),
        script: z.string().trim().min(1),
        primaryText: z.string().default(""),
        headline: z.string().default(""),
      }),
    )
    .min(1),
})

export type WinnerAnalysis = z.infer<typeof winnerAnalysisSchema>

const WINNER_SYSTEM = `Eres estratega creativo de anuncios de respuesta directa en Meta (Reels, Stories, Feed).
Te paso un creativo que ha resultado GANADOR: su guion, su copy, su hipótesis, sus etiquetas y sus métricas.

Tu trabajo:
1. Explicar por qué probablemente funciona. Son hipótesis: apóyalas en el guion y en las métricas (enganche = reproducciones de 3 s / impresiones; retención = reproducciones completas / reproducciones de 3 s). No inventes datos.
2. Proponer variaciones para seguir escalando. Regla de experimento controlado: cada variación cambia UNA sola dimensión respecto al ganador y mantiene el resto igual.
   - "dimension" debe ser una de las claves de dimensión que te paso y "value" uno de sus valores permitidos (usa la clave "value", no la etiqueta). Si el cambio no encaja en ninguna, deja ambos vacíos.
   - Prioriza cambiar el gancho (primeros 3 segundos) si el enganche es el punto fuerte o el débil.
   - "script" es el guion completo de la variación, en el idioma del anuncio, con el mismo estilo y duración aproximada que el original.
   - "whatChanges" y "keepSame" van en español y son instrucciones claras para el editor de video.
   - "primaryText" y "headline" en el idioma del anuncio (máx. 125 y 40 caracteres); pueden repetir los del ganador si la variación no los afecta.
3. Cumple las políticas de Meta: nada de promesas garantizadas, cifras de ganancias, curas o resultados de salud asegurados, ni atributos personales.

"summary", "factor", "evidence" y "risks" van en español.

Responde solo con json con esta forma:
{"summary": "...", "keyFactors": [{"factor": "...", "evidence": "..."}], "risks": ["..."],
 "variations": [{"title": "...", "dimension": "hook_type", "value": "question", "whatChanges": "...", "keepSame": "...", "script": "...", "primaryText": "...", "headline": "..."}]}`

export async function analyzeWinner(config: AiConfig, ctx: WinnerContext): Promise<WinnerAnalysis> {
  const m = ctx.metrics
  const user = [
    `Idioma del anuncio: ${ctx.language} (GEO ${ctx.geo})`,
    `Oferta: ${ctx.offerName}`,
    `Concepto: ${ctx.conceptTitle}`,
    `Hipótesis original: ${ctx.hypothesis}`,
    `Formato: ${ctx.format}${ctx.durationSec ? ` · duración ${Math.round(ctx.durationSec)} s` : ""}`,
    "",
    "Dimensiones (clave · etiqueta · valor actual · valores permitidos):",
    ...ctx.dimensions.map(
      (d) => `- ${d.key} · ${d.label} · actual: ${d.current} · permitidos: ${d.values.map((v) => `${v.value} (${v.label})`).join(", ")}`,
    ),
    "",
    m
      ? `Métricas: gasto ${m.spend}, ${m.conversions} conversiones, CPA ${m.cpa} (objetivo ${m.targetCpa}), ROAS ${m.roas}, enganche ${m.hookRate}, retención ${m.holdRate}, CTR ${m.ctr}`
      : "Métricas: no disponibles.",
    "",
    `Texto principal: ${ctx.primaryText || "—"}`,
    `Titular: ${ctx.headline || "—"}`,
    `Indicaciones que tuvo el editor: ${ctx.brief || "—"}`,
    "",
    "Guion del ganador:",
    ctx.script || "(sin guion: básate en el resto de la información y dilo en el resumen)",
    "",
    `Propón exactamente ${ctx.count} variaciones en json.`,
  ].join("\n")
  const result = await chatJson(
    config,
    [
      { role: "system", content: WINNER_SYSTEM },
      { role: "user", content: user },
    ],
    winnerAnalysisSchema,
    16000,
    240_000,
  )
  // Solo se aceptan dimensiones y valores que existen: si no, la variación queda sin variable.
  const valid = new Map(ctx.dimensions.map((d) => [d.key, new Set(d.values.map((v) => v.value))]))
  return {
    ...result,
    variations: result.variations.slice(0, ctx.count).map((v) =>
      valid.get(v.dimension)?.has(v.value) ? v : { ...v, dimension: "", value: "" },
    ),
  }
}

// ─── Traducir el guion de un creativo (español ↔ inglés) ─────────────────────

export const scriptTranslationSchema = z.object({
  to: z.enum(["es", "en"]),
  script: z.string().trim().min(1),
})

const SCRIPT_TRANSLATE_SYSTEM = `Traduces guiones de anuncios de video para un equipo creativo.
- Si el guion está en español, tradúcelo al inglés ("to": "en"). Si está en cualquier otro idioma, tradúcelo al español ("to": "es").
- Mantén exactamente la estructura: marcas de tiempo (0–3 s, 00:05…), etiquetas de sección (Hook, Voz, VO, Texto en pantalla, B-roll…), saltos de línea, viñetas y numeración.
- Traduce el sentido con naturalidad, como lo diría un nativo; no adaptes el mensaje ni añadas nada.
- No traduzcas nombres de marca o de producto.

Responde solo con json con esta forma:
{"to": "es", "script": "..."}`

export async function translateScript(config: AiConfig, script: string): Promise<z.infer<typeof scriptTranslationSchema>> {
  return chatJson(
    config,
    [
      { role: "system", content: SCRIPT_TRANSLATE_SYSTEM },
      { role: "user", content: `Guion:\n${script}\n\nDevuelve la traducción en json.` },
    ],
    scriptTranslationSchema,
    12000,
    180_000,
  )
}
