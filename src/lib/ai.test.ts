import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { after, before, describe, it } from "node:test"

// Servidor que imita /chat/completions de DeepSeek.
let server: Server
let replies: { status: number; content: string | null; finish?: string }[] = []
let lastBody: Record<string, unknown> = {}
let config: { apiKey: string; model: string; baseUrl: string }

before(async () => {
  server = createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      lastBody = JSON.parse(raw)
      const r = replies.shift() ?? { status: 500, content: null }
      res.writeHead(r.status, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify(
          r.status === 200 ? { choices: [{ message: { content: r.content }, finish_reason: r.finish ?? "stop" }] } : { error: { message: "fallo simulado" } },
        ),
      )
    })
  })
  await new Promise<void>((ok) => server.listen(0, ok))
  const port = (server.address() as { port: number }).port
  config = { apiKey: "clave-de-prueba", model: "deepseek-flash", baseUrl: `http://127.0.0.1:${port}` }
})

after(() => server.close())

const ctx = {
  language: "de",
  geo: "DE",
  offerName: "GlycoReset",
  product: "GLYCO",
  conceptTitle: "Descubrimiento accidental",
  hypothesis: "Una pregunta sube el enganche",
  tags: [{ dimension: "Ángulo", label: "Curiosidad" }],
  brief: "",
  currentPrimaryText: "",
  currentHeadline: "",
  cta: "Más información",
}

const valid = JSON.stringify({
  options: [
    { primaryText: "Hast du dich je gefragt…", headline: "Das steckt dahinter", rationale: "Pregunta" },
    { primaryText: "Morgens müde?", headline: "Ein kleiner Trick", rationale: "Problema" },
    { primaryText: "Tausende probieren es", headline: "Jetzt entdecken", rationale: "Prueba social" },
  ],
})

describe("IA · propuestas de copy", () => {
  it("devuelve 3 opciones y pide JSON al modelo", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [{ status: 200, content: valid }]
    const options = await suggestCopy(config, ctx)
    assert.equal(options.length, 3)
    assert.equal(options[0].headline, "Das steckt dahinter")
    assert.deepEqual(lastBody.response_format, { type: "json_object" })
    assert.equal(lastBody.model, "deepseek-flash")
    const messages = lastBody.messages as { content: string }[]
    assert.match(messages[0].content, /json/)
    assert.match(messages[1].content, /Idioma del anuncio: de/)
  })

  it("reintenta si la respuesta llega vacía", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [
      { status: 200, content: "" },
      { status: 200, content: valid },
    ]
    assert.equal((await suggestCopy(config, ctx)).length, 3)
  })

  it("reintenta si el razonamiento agota los tokens y pide margen suficiente", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [
      { status: 200, content: "", finish: "length" },
      { status: 200, content: valid },
    ]
    assert.equal((await suggestCopy(config, ctx)).length, 3)
    assert.ok((lastBody.max_tokens as number) >= 8000)
  })

  it("explica que la respuesta se cortó si pasa dos veces", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [
      { status: 200, content: "", finish: "length" },
      { status: 200, content: "", finish: "length" },
    ]
    await assert.rejects(suggestCopy(config, ctx), /se cortó por longitud/)
  })

  it("recorta la explicación larga en vez de rechazar la propuesta", async () => {
    const { suggestCopy } = await import("./ai")
    const long = JSON.stringify({ options: [{ primaryText: "Text", headline: "Titel", rationale: "x".repeat(500) }] })
    replies = [{ status: 200, content: long }]
    const [o] = await suggestCopy(config, ctx)
    assert.equal(o.rationale.length, 198)
  })

  it("falla con un mensaje claro si sigue vacía o el formato no vale", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [
      { status: 200, content: "" },
      { status: 200, content: '{"otra":"cosa"}' },
    ]
    await assert.rejects(suggestCopy(config, ctx), /no devolvió una propuesta válida/)
  })

  it("sin clave avisa de que falta configurarla", async () => {
    const { suggestCopy } = await import("./ai")
    await assert.rejects(suggestCopy({ ...config, apiKey: "" }, ctx), /Ajustes → IA/)
  })

  it("la prueba de conexión acepta {ok:true}", async () => {
    const { pingAi } = await import("./ai")
    replies = [{ status: 200, content: '{"ok": true}' }]
    await pingAi(config)
    assert.equal(lastBody.max_tokens, 2000)
  })

  it("traduce los errores de la API", async () => {
    const { suggestCopy } = await import("./ai")
    replies = [{ status: 401, content: null }]
    await assert.rejects(suggestCopy(config, ctx), /rechazó la clave/)
    replies = [{ status: 402, content: null }]
    await assert.rejects(suggestCopy(config, ctx), /no tiene saldo/)
  })

  it("analiza un ganador y descarta variables que no existen", async () => {
    const { analyzeWinner } = await import("./ai")
    const reply = {
      summary: "Funciona por el gancho de pregunta.",
      keyFactors: [{ factor: "Gancho en 2 s", evidence: "enganche 30 %" }],
      risks: [],
      variations: [
        { title: "Gancho afirmación", dimension: "hook_type", value: "bold_statement", whatChanges: "Primera frase", keepSame: "Resto", script: "0-3 s: …", primaryText: "Text", headline: "Titel" },
        { title: "Inventada", dimension: "hook_type", value: "no_existe", whatChanges: "", keepSame: "", script: "…" },
        { title: "Sobra", dimension: "", value: "", whatChanges: "", keepSame: "", script: "…" },
      ],
    }
    replies = [{ status: 200, content: JSON.stringify(reply) }]
    const r = await analyzeWinner(config, {
      language: "de",
      geo: "DE",
      offerName: "GlycoReset",
      conceptTitle: "Descubrimiento",
      hypothesis: "h",
      format: "9:16",
      durationSec: 24,
      script: "0-3 s: Hast du…",
      brief: "",
      primaryText: "",
      headline: "",
      dimensions: [
        { key: "hook_type", label: "Tipo de gancho", current: "question", values: [{ value: "question", label: "Pregunta" }, { value: "bold_statement", label: "Afirmación rotunda" }] },
      ],
      metrics: null,
      count: 2,
    })
    assert.equal(r.variations.length, 2, "recorta al número pedido")
    assert.equal(r.variations[0].value, "bold_statement")
    assert.equal(r.variations[1].dimension, "", "valor inventado → sin variable")
    const prompt = (lastBody.messages as { content: string }[])[1].content
    assert.match(prompt, /Guion del ganador:\n0-3 s: Hast du/)
    assert.match(prompt, /exactamente 2 variaciones/)
    assert.ok((lastBody.max_tokens as number) >= 16000)
  })
})
