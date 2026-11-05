import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { assetCode, conceptCode, downloadFileName, offerCode, parseToken, suggestedAdName, tokenFromVersionCode, versionCode } from "./codes"
import { assignedBody } from "./messages"
import { addRow, conversionsOf, emptyTotals, withDerived } from "./metrics"
import { assetVisibilityWhere, can, canUploadVersion, canViewAsset } from "./permissions"
import { availableTargets, checkTransition, type TransitionContext } from "./state-machine"
import { DEFAULT_RULE, evaluate } from "./winner-rules"
import { runQa, blockingFailures, howToFix, targetSize, type MediaInfo } from "./qa-rules"
import { LABEL_COLORS, statusEventText } from "./status"
import { goesToChannel, goesToSlack, isTech, SLACK_QUIET } from "./slack-events"

describe("códigos y token", () => {
  it("la descarga se llama como el token de seguimiento", () => {
    assert.equal(downloadFileName("C082-A03-V2", "Mi Video Final.MOV"), "cl-C082A03V2.mov")
    assert.equal(downloadFileName("C001-A01-V1", "sin-extension"), "cl-C001A01V1.bin")
  })

  it("genera códigos jerárquicos", () => {
    assert.equal(offerCode(12), "OF012")
    assert.equal(conceptCode(82), "C082")
    assert.equal(assetCode("C082", 3), "C082-A03")
    assert.equal(versionCode("C082-A03", 2), "C082-A03-V2")
    assert.equal(tokenFromVersionCode("C082-A03-V2"), "cl-C082A03V2")
  })

  it("parsea el token del ad name", () => {
    const t = parseToken("IMMUNO_DE_CURIOSITY_20260915__cl-C082A03V2")
    assert.deepEqual(t, { token: "cl-C082A03V2", conceptCode: "C082", assetCode: "C082-A03", versionCode: "C082-A03-V2" })
    assert.equal(parseToken("IMMUNO_DE_CURIOSITY_20260915")?.token, undefined)
    assert.equal(parseToken("xcl-C082A03V2")?.token, undefined, "requiere límite de palabra")
    assert.equal(parseToken("A cl-C10000A120V12 b")?.versionCode, "C10000-A120-V12")
  })

  it("round-trip versión → token → versión", () => {
    for (const code of ["C001-A01-V1", "C082-A03-V2", "C1234-A99-V10"])
      assert.equal(parseToken(`X__${tokenFromVersionCode(code)}`)?.versionCode, code)
  })

  it("sugiere el ad name con la convención", () => {
    const name = suggestedAdName({ product: "Immuno", geo: "de", angle: "fear_of_missing_out", date: new Date("2026-09-15T10:00:00Z"), versionCode: "C082-A03-V2" })
    assert.equal(name, "IMMUNO_DE_FEAROFMISSINGOUT_20260915__cl-C082A03V2")
    assert.ok(parseToken(name))
  })
})

describe("permisos", () => {
  const owner = { id: "o", role: "OWNER" as const }
  const manager = { id: "m", role: "MANAGER" as const }
  const editor = { id: "e", role: "EDITOR" as const }
  const buyer = { id: "b", role: "BUYER" as const }

  it("el editor nunca ve dinero", () => {
    assert.equal(can(editor, "money.view"), false)
    assert.equal(can(manager, "money.view"), true)
    assert.equal(can(buyer, "money.view"), true)
  })

  it("solo el owner configura", () => {
    assert.equal(can(owner, "settings.manage"), true)
    assert.equal(can(manager, "settings.manage"), false)
  })

  it("visibilidad de assets por rol", () => {
    const mine = { editorId: "e", productionStatus: "IN_PROGRESS" }
    const other = { editorId: "x", productionStatus: "APPROVED" }
    assert.equal(canViewAsset(editor, mine), true)
    assert.equal(canViewAsset(editor, other), false)
    assert.equal(canViewAsset(buyer, mine), false)
    assert.equal(canViewAsset(buyer, other), true)
    assert.deepEqual(assetVisibilityWhere(editor), { editorId: "e" })
    assert.equal(canUploadVersion(editor, other), false)
  })
})

describe("máquina de estados", () => {
  const base: TransitionContext = {
    role: "EDITOR",
    isAssignee: true,
    latestVersion: { ready: true, submitted: false, blockingFailures: 0 },
    openComments: 0,
    openMustComments: 0,
    offerGate: "OK",
  }

  it("el editor asignado emcreativo y envía", () => {
    assert.deepEqual(checkTransition("BRIEF", "IN_PROGRESS", base), [])
    assert.deepEqual(checkTransition("IN_PROGRESS", "IN_REVIEW", base), [])
  })

  it("un editor no asignado no puede", () => {
    assert.ok(checkTransition("BRIEF", "IN_PROGRESS", { ...base, isAssignee: false }).length)
  })

  it("QA bloqueante impide enviar", () => {
    const errs = checkTransition("IN_PROGRESS", "IN_REVIEW", { ...base, latestVersion: { ready: true, submitted: false, blockingFailures: 2 } })
    assert.match(errs.join(), /bloqueante/)
  })

  it("hay que subir una versión nueva para reenviar", () => {
    const errs = checkTransition("CHANGES_REQUESTED", "IN_REVIEW", { ...base, latestVersion: { ready: true, submitted: true, blockingFailures: 0 } })
    assert.match(errs.join(), /versión nueva/)
  })

  it("el editor no puede aprobar", () => {
    assert.ok(checkTransition("IN_REVIEW", "APPROVED", base).length)
  })

  it("aprobar exige 0 must, oferta asignada y oferta OK", () => {
    const m = { ...base, role: "MANAGER" as const, isAssignee: false }
    assert.deepEqual(checkTransition("IN_REVIEW", "APPROVED", m), [])
    assert.ok(checkTransition("IN_REVIEW", "APPROVED", { ...m, openMustComments: 1, openComments: 1 }).length)
    assert.match(checkTransition("IN_REVIEW", "APPROVED", { ...m, offerGate: "BLOCKED" }).join(), /bloqueada/)
    assert.match(checkTransition("IN_REVIEW", "APPROVED", { ...m, offerGate: null }).join(), /Asigna una oferta/)
    // Sin oferta sí se puede trabajar y enviar: solo bloquea la aprobación.
    assert.deepEqual(checkTransition("IN_PROGRESS", "IN_REVIEW", { ...base, offerGate: null }), [])
  })

  it("pedir cambios exige comentario abierto; rechazar exige motivo", () => {
    const m = { ...base, role: "MANAGER" as const }
    assert.ok(checkTransition("IN_REVIEW", "CHANGES_REQUESTED", m).length)
    assert.deepEqual(checkTransition("IN_REVIEW", "CHANGES_REQUESTED", { ...m, openComments: 1 }), [])
    assert.ok(checkTransition("IN_REVIEW", "REJECTED", m).length)
    assert.deepEqual(checkTransition("IN_REVIEW", "REJECTED", { ...m, reason: "fuera de marca" }), [])
  })

  it("reabrir un aprobado no exige versión nueva pero sí motivo", () => {
    const m = { ...base, role: "MANAGER" as const, latestVersion: { ready: true, submitted: true, blockingFailures: 0 } }
    assert.ok(checkTransition("APPROVED", "IN_REVIEW", m).length)
    assert.deepEqual(checkTransition("APPROVED", "IN_REVIEW", { ...m, reason: "copy cambiado" }), [])
  })

  it("transiciones prohibidas", () => {
    assert.ok(checkTransition("BRIEF", "APPROVED", { ...base, role: "OWNER" }).length)
    assert.ok(checkTransition("ARCHIVED", "BRIEF", { ...base, role: "OWNER" }).length)
  })

  it("la UI solo ofrece destinos del rol", () => {
    assert.deepEqual(availableTargets("IN_REVIEW", "EDITOR", true), [])
    assert.deepEqual(
      availableTargets("IN_REVIEW", "MANAGER", false).map((t) => t.to).sort(),
      ["APPROVED", "ARCHIVED", "CHANGES_REQUESTED", "REJECTED"],
    )
  })
})

describe("motor de winners", () => {
  const target = 1100
  const run = (spendCents: number, conversions: number, days = 3, hookRate: number | null = 0.3) =>
    evaluate({ spendCents, conversions, hookRate, daysInTesting: days, targetCpaCents: target }, DEFAULT_RULE).status

  it("winner: CPA ≤ 80 %, ≥ 10 conv y spend ≥ 2×", () => {
    assert.equal(run(17700, 29), "WINNER") // CPA 6,10
    assert.equal(run(7000, 9), "TESTING") // CPA bueno pero pocas conversiones
    assert.equal(run(2000, 10), "TESTING") // poco spend
  })

  it("loser: sin conversiones con 2× o CPA > 130 % con 3×", () => {
    assert.equal(run(2200, 0), "LOSER")
    assert.equal(run(34000, 11), "LOSER") // CPA 30,9
    assert.equal(run(3000, 2), "TESTING") // CPA alto pero poco spend
  })

  it("inconclusive tras X días", () => {
    assert.equal(run(1000, 1, 14), "INCONCLUSIVE")
    assert.equal(run(1000, 1, 13), "TESTING")
  })

  it("gate de hook rate", () => {
    const rule = { ...DEFAULT_RULE, minHookRatePct: 25 }
    const base = { spendCents: 17700, conversions: 29, daysInTesting: 3, targetCpaCents: target }
    assert.equal(evaluate({ ...base, hookRate: 0.2 }, rule).status, "TESTING")
    assert.equal(evaluate({ ...base, hookRate: 0.3 }, rule).status, "WINNER")
  })
})

describe("métricas", () => {
  const offer = { conversionEvent: "purchase", payoutCents: 3000 }
  it("usa action_values y si no, payout", () => {
    assert.deepEqual(conversionsOf(row({ purchase: 2 }, { purchase: 80.5 }), offer), { conversions: 2, revenueCents: 8050 })
    assert.deepEqual(conversionsOf(row({ purchase: 2 }, {}), offer), { conversions: 2, revenueCents: 6000 })
    assert.deepEqual(conversionsOf(row({ lead: 5 }, {}), offer), { conversions: 0, revenueCents: 0 })
  })
  it("deriva CPA, hook rate y ROAS", () => {
    const t = emptyTotals()
    addRow(t, { ...row({ purchase: 4 }, {}), spendCents: 4000, impressions: 1000, videoPlays3s: 300, thruplays: 60, clicks: 20 }, offer)
    const m = withDerived(t)
    assert.equal(m.cpaCents, 1000)
    assert.equal(m.hookRate, 0.3)
    assert.equal(m.holdRate, 0.2)
    assert.equal(m.roas, 3)
    assert.equal(m.ctr, 0.02)
  })
  function row(actions: object, actionValues: object) {
    return { spendCents: 0, impressions: 0, clicks: 0, videoPlays3s: 0, thruplays: 0, actions, actionValues }
  }
})

describe("QA técnico", () => {
  const good: MediaInfo = {
    ok: true,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    width: 1080,
    height: 1920,
    durationMs: 24000,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
    sizeBytes: 50 * 1024 * 1024,
  }
  it("cada control que falla dice qué hacer", () => {
    // Un video minúsculo: el editor tiene que leer la medida a la que exportar.
    const checks = runQa({ ...good, width: 356, height: 634 }, "VERTICAL", "VIDEO")
    for (const c of checks.filter((x) => x.result === "FAIL"))
      assert.ok(howToFix(c.key, "VERTICAL", "VIDEO"), `sin instrucción para "${c.key}"`)
    assert.match(howToFix("resolution_min", "VERTICAL", "VIDEO")!, /1080×1920/)
  })
  it("la medida sugerida corresponde al formato pedido", () => {
    assert.equal(targetSize("VERTICAL"), "1080×1920")
    assert.equal(targetSize("PORTRAIT"), "1080×1350")
    assert.equal(targetSize("SQUARE"), "1080×1080")
    assert.equal(targetSize("LANDSCAPE"), "1920×1080")
  })
  it("un 9:16 correcto pasa", () => {
    assert.equal(blockingFailures(runQa(good, "VERTICAL", "VIDEO")), 0)
  })
  it("resolución o ratio incorrectos bloquean", () => {
    assert.ok(blockingFailures(runQa({ ...good, width: 1920, height: 1080 }, "VERTICAL", "VIDEO")) > 0)
    assert.ok(blockingFailures(runQa({ ...good, width: 180, height: 320 }, "VERTICAL", "VIDEO")) > 0)
  })
  it("mínimo de Meta: 500 px (≥ 30 s) o 250 px (< 30 s); por debajo de 1080 solo avisa", () => {
    const long = { ...good, width: 608, height: 1078, durationMs: 148_800 }
    const checks = runQa(long, "VERTICAL", "VIDEO")
    assert.equal(checks.find((c) => c.key === "resolution_min")?.result, "PASS")
    assert.equal(checks.find((c) => c.key === "resolution_rec")?.result, "FAIL")
    assert.equal(blockingFailures(checks), 0)
    assert.ok(blockingFailures(runQa({ ...long, width: 480, height: 852 }, "VERTICAL", "VIDEO")) > 0)
    assert.equal(blockingFailures(runQa({ ...long, width: 360, height: 640, durationMs: 20_000 }, "VERTICAL", "VIDEO")), 0)
  })
  it("archivo corrupto bloquea", () => {
    assert.equal(blockingFailures(runQa({ ...good, ok: false, error: "moov atom not found" }, "VERTICAL", "VIDEO")), 1)
  })
  it("sin audio es solo aviso", () => {
    const checks = runQa({ ...good, hasAudio: false, audioCodec: null }, "VERTICAL", "VIDEO")
    assert.equal(blockingFailures(checks), 0)
    assert.equal(checks.find((c) => c.key === "audio")?.result, "FAIL")
  })
  it("imagen 4:5", () => {
    const img = { ...good, container: "image2", videoCodec: "mjpeg", width: 1080, height: 1350, durationMs: null, sizeBytes: 500_000 }
    assert.equal(blockingFailures(runQa(img, "PORTRAIT", "IMAGE")), 0)
  })
})

describe("historial en palabras", () => {
  it("la creación no tiene estado de origen", () => {
    assert.equal(statusEventText(null, "BRIEF"), "creó el creativo")
  })
  it("distingue empezar de retomar tras cambios", () => {
    assert.equal(statusEventText("BRIEF", "IN_PROGRESS"), "empezó a editar")
    assert.equal(statusEventText("CHANGES_REQUESTED", "IN_PROGRESS"), "retomó los cambios")
  })
  it("reabrir un aprobado no se lee igual que enviar a revisión", () => {
    assert.equal(statusEventText("IN_PROGRESS", "IN_REVIEW"), "envió a revisión")
    assert.equal(statusEventText("APPROVED", "IN_REVIEW"), "reabrió la revisión")
    assert.equal(statusEventText("CHANGES_REQUESTED", "IN_REVIEW"), "volvió a enviar a revisión")
  })
  it("una edición sin cambio de estado se describe aparte", () => {
    assert.equal(statusEventText("IN_PROGRESS", "IN_PROGRESS"), "actualizó el creativo")
  })
})

describe("qué sale a Slack", () => {
  it("lo accionable sale", () => {
    for (const t of ["asset.assigned", "review.submitted", "review.changes_requested", "performance.change", "sync.error"])
      assert.ok(goesToSlack(t), `${t} debería salir a Slack`)
  })
  it("lo que ya sabes o llega en ráfaga se queda en la app", () => {
    for (const t of SLACK_QUIET) assert.equal(goesToSlack(t), false)
    assert.ok(SLACK_QUIET.includes("version.uploaded"))
    assert.ok(SLACK_QUIET.includes("comment.new"))
  })
})

describe("qué recibe un editor en su canal", () => {
  it("solo los cuatro avisos que le obligan a moverse", () => {
    for (const t of ["asset.assigned", "review.submitted", "review.changes_requested", "review.approved"])
      assert.ok(goesToChannel(t, "EDITOR"), `${t} debería llegarle al editor`)
  })
  it("el resto se queda en la campana", () => {
    for (const t of ["version.processed", "performance.change", "asset.variations", "sync.error"])
      assert.equal(goesToChannel(t, "EDITOR"), false, `${t} no debería llegarle al editor`)
  })
  it("los demás roles sí los reciben", () => {
    assert.ok(goesToChannel("performance.change", "BUYER"))
    assert.ok(goesToChannel("version.processed", "MANAGER"))
  })
})

describe("avisos técnicos", () => {
  it("lo técnico se reconoce como tal", () => {
    for (const t of ["sync.error", "sync.unassigned", "version.processed", "version.failed"])
      assert.ok(isTech(t), `${t} debería ser técnico`)
  })
  it("el trabajo del día no es técnico", () => {
    for (const t of ["asset.assigned", "review.submitted", "review.approved", "performance.change"])
      assert.equal(isTech(t), false, `${t} no debería ir al canal técnico`)
  })
})

describe("aviso de creativo asignado", () => {
  it("lleva el concepto y la oferta al lado", () => {
    assert.equal(assignedBody("Vince group", { code: "OF012", name: "Inmuno DE" }), "Vince group · OF012 Inmuno DE")
  })
  it("sin oferta lo dice", () => {
    assert.equal(assignedBody("Vince group", null), "Vince group · sin oferta")
  })
})

describe("colores de etiquetas", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  it("todas cumplen 4.5:1 (WCAG AA)", () => {
    for (const [k, c] of Object.entries(LABEL_COLORS)) {
      const [a, b] = [lum(c.bg), lum(c.fg)].sort((x, y) => y - x)
      assert.ok((a + 0.05) / (b + 0.05) >= 4.5, `${k}: contraste insuficiente`)
    }
  })
})
