// Datos iniciales. Idempotente: solo crea lo que falta.
import "dotenv/config"
import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { assetCode, conceptCode, offerCode } from "../src/lib/codes"
import { GROUP_COLORS } from "../src/lib/status"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const TAGS: { key: string; label: string; values: string[] }[] = [
  { key: "angle", label: "Ángulo", values: ["curiosity", "problem_solution", "social_proof", "authority", "fear_of_missing_out", "comparison", "story"] },
  { key: "hook_type", label: "Tipo de gancho", values: ["question", "bold_statement", "pattern_interrupt", "testimonial", "visual_shock", "news_style"] },
  { key: "format", label: "Formato creativo", values: ["ugc", "talking_head", "voiceover_broll", "slideshow", "screen_recording", "static_image", "carousel"] },
  { key: "persona", label: "Público", values: ["female_18_34", "female_35_54", "male_18_34", "male_35_54", "senior", "none"] },
  { key: "cta", label: "Botón de acción", values: ["learn_more", "sign_up", "watch_video", "get_offer"] },
  { key: "pacing", label: "Ritmo", values: ["fast", "medium", "slow"] },
]

const USERS = [
  { email: "victor@winnersmastermind.com", name: "Víctor", role: "OWNER" },
  { email: "herman@winnersmastermind.com", name: "Herman", role: "OWNER" },
  { email: "samuel@winnersmastermind.com", name: "Samuel", role: "OWNER" },
  { email: "duglas@winnersmastermind.com", name: "Duglas", role: "OWNER" },
  { email: "elkin@winnersmastermind.com", name: "Elkin", role: "MANAGER" },
  { email: "yordi@winnersmastermind.com", name: "Yordi", role: "EDITOR" },
  { email: "nelson@winnersmastermind.com", name: "Nelson", role: "EDITOR" },
  { email: "daniel@winnersmastermind.com", name: "Daniel", role: "BUYER" },
] as const

// Etiquetas visibles en español. El valor interno (en inglés) no cambia: se usa en el nombre del anuncio.
const LABELS: Record<string, string> = {
  curiosity: "Curiosidad",
  problem_solution: "Problema-solución",
  social_proof: "Prueba social",
  authority: "Autoridad",
  fear_of_missing_out: "Miedo a perdérselo",
  comparison: "Comparación",
  story: "Historia",
  question: "Pregunta",
  bold_statement: "Afirmación rotunda",
  pattern_interrupt: "Ruptura de patrón",
  testimonial: "Testimonio",
  visual_shock: "Impacto visual",
  news_style: "Estilo noticia",
  ugc: "Contenido de usuario",
  talking_head: "Persona a cámara",
  voiceover_broll: "Voz en off con recursos",
  slideshow: "Pase de fotos",
  screen_recording: "Grabación de pantalla",
  static_image: "Imagen estática",
  carousel: "Carrusel",
  female_18_34: "Mujer 18–34",
  female_35_54: "Mujer 35–54",
  male_18_34: "Hombre 18–34",
  male_35_54: "Hombre 35–54",
  senior: "Mayores de 55",
  none: "Sin persona",
  learn_more: "Más información",
  sign_up: "Registrarse",
  watch_video: "Ver video",
  get_offer: "Obtener oferta",
  fast: "Rápido",
  medium: "Medio",
  slow: "Lento",
}
const human = (v: string) => LABELS[v] ?? v.replaceAll("_", " ")

async function main() {
  // Tags
  for (const [i, dim] of TAGS.entries()) {
    const d = await prisma.tagDimension.upsert({
      where: { key: dim.key },
      create: { key: dim.key, label: dim.label, sortOrder: i },
      update: { label: dim.label },
    })
    for (const [j, value] of dim.values.entries()) {
      await prisma.tagValue.upsert({
        where: { dimensionId_value: { dimensionId: d.id, value } },
        create: { dimensionId: d.id, value, label: human(value), sortOrder: j },
        update: { label: human(value) },
      })
    }
  }

  // Regla global de winners
  const global = await prisma.winnerRule.findFirst({ where: { offerId: null } })
  if (!global) await prisma.winnerRule.create({ data: {} })

  // Usuarios
  if ((await prisma.user.count()) > 0) {
    console.log("seed: usuarios ya existen, no se crean datos de ejemplo")
    return
  }
  // En producción no hay contraseña por defecto: sin SEED_PASSWORD no se crean usuarios.
  if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
    throw new Error("seed: define SEED_PASSWORD para crear los usuarios en producción")
  }
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? "creative123", 10)
  const users: Record<string, string> = {}
  for (const u of USERS) {
    const row = await prisma.user.create({ data: { ...u, passwordHash } })
    users[u.email] = row.id
  }

  // En producción solo se crean los usuarios: SEED_DEMO=false
  if (process.env.SEED_DEMO === "false") {
    console.log("seed: usuarios creados, sin datos de ejemplo (SEED_DEMO=false)")
    return
  }

  // Oferta y concept de ejemplo
  const offer = await prisma.$transaction(async (tx) => {
    const c = await tx.counter.upsert({ where: { key: "offer" }, create: { key: "offer", value: 1 }, update: { value: { increment: 1 } } })
    return tx.offer.create({
      data: {
        number: c.value,
        code: offerCode(c.value),
        name: "Immuno Boost Alemania",
        product: "IMMUNO",
        geo: "DE",
        language: "de",
        targetCpaCents: 1100,
        payoutCents: 3000,
        conversionEvent: "purchase",
      },
    })
  })

  const values = await prisma.tagValue.findMany({ include: { dimension: true } })
  const val = (dim: string, v: string) => values.find((x) => x.dimension.key === dim && x.value === v)!
  const defaults = [
    val("angle", "curiosity"),
    val("hook_type", "question"),
    val("format", "ugc"),
    val("persona", "female_35_54"),
    val("cta", "learn_more"),
    val("pacing", "fast"),
  ]

  await prisma.$transaction(async (tx) => {
    const c = await tx.counter.upsert({ where: { key: "concept" }, create: { key: "concept", value: 1 }, update: { value: { increment: 1 } } })
    const code = conceptCode(c.value)
    const concept = await tx.concept.create({
      data: {
        number: c.value,
        code,
        title: "Descubrimiento accidental",
        hypothesis: "Si abrimos con una pregunta sobre un hábito diario, sube el hook rate frente a un bold statement.",
        color: GROUP_COLORS[0],
        createdById: users["elkin@winnersmastermind.com"],
        tags: { create: defaults.map((v) => ({ dimensionId: v.dimensionId, valueId: v.id })) },
        assetCounter: 3,
      },
    })
    const editors = ["yordi@winnersmastermind.com", "nelson@winnersmastermind.com", "yordi@winnersmastermind.com"]
    const in3days = new Date(Date.now() + 3 * 86400_000)
    for (let n = 1; n <= 3; n++) {
      const asset = await tx.asset.create({
        data: {
          conceptId: concept.id,
          number: n,
          code: assetCode(code, n),
          offerId: offer.id,
          format: n === 3 ? "PORTRAIT" : "VERTICAL",
          mediaType: "VIDEO",
          editorId: users[editors[n - 1]],
          deadline: in3days,
          priority: n === 1 ? "HIGH" : "MEDIUM",
          brief: "Video de usuario de 20–30 s. Abrir con la pregunta en los primeros 2 s, subtítulos siempre visibles.",
          primaryText: "Hast du dich jemals gefragt, warum du ständig müde bist?",
          headline: "Das steckt dahinter",
          cta: "Más información",
          ...(n === 2 ? { overrideDimensionId: val("hook_type", "bold_statement").dimensionId, overrideValueId: val("hook_type", "bold_statement").id } : {}),
        },
      })
      await tx.statusEvent.create({ data: { assetId: asset.id, userId: users["elkin@winnersmastermind.com"], to: "BRIEF" } })
    }
  })

  console.log("seed: datos de ejemplo creados")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
