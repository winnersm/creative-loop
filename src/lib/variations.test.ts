import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { nestRows, planMove, rootOf, variationSummary } from "./variations"

describe("variaciones anidadas", () => {
  // A02 ← A07 ← A09 (variación de variación) · A02 ← A08 · A01 suelto
  const parentOf = new Map<string, string | null>([
    ["A01", null],
    ["A02", null],
    ["A07", "A02"],
    ["A08", "A02"],
    ["A09", "A07"],
  ])

  it("la variación de una variación cuelga del original", () => {
    assert.equal(rootOf("A09", parentOf), "A02")
    assert.equal(rootOf("A07", parentOf), "A02")
    assert.equal(rootOf("A01", parentOf), "A01")
  })

  it("tolera ciclos y padres desconocidos", () => {
    const cyc = new Map<string, string | null>([
      ["X", "Y"],
      ["Y", "X"],
    ])
    assert.ok(["X", "Y"].includes(rootOf("X", cyc)))
    assert.equal(rootOf("Z", new Map([["Z", "fuera"]])), "Z")
  })

  it("cuenta variaciones y ganadoras por original", () => {
    const s = variationSummary([
      { id: "A02", parentId: null, performanceStatus: "WINNER" },
      { id: "A07", parentId: "A02", performanceStatus: "WINNER" },
      { id: "A08", parentId: "A02", performanceStatus: "TESTING" },
      { id: "A09", parentId: "A07", performanceStatus: "NOT_LAUNCHED" },
      { id: "A10", parentId: "A02", performanceStatus: "NOT_LAUNCHED", productionStatus: "ARCHIVED" },
    ])
    assert.deepEqual(s.get("A02"), { count: 3, winners: 1 })
    assert.equal(s.has("A07"), false)
  })

  it("ordena cada original seguido de sus variaciones", () => {
    const rows = ["A01", "A02", "A07", "A08", "A09"].map((id) => ({ id, rootId: rootOf(id, parentOf) }))
    assert.deepEqual(
      nestRows(rows).map((r) => `${r.item.id}${r.child ? "↳" : ""}`),
      ["A01", "A02", "A07↳", "A08↳", "A09↳"],
    )
  })

  it("sin el original en la lista, la variación sale como fila normal", () => {
    const rows = [{ id: "A07", rootId: "A02" }]
    assert.deepEqual(nestRows(rows), [{ item: rows[0], child: false }])
  })
})

describe("mover creativos entre conceptos", () => {
  const fam = [
    { id: "a1", code: "C005-A01", number: 1, parentId: null, launched: false },
    { id: "a2", code: "C005-A02", number: 2, parentId: "a1", launched: false },
    { id: "a3", code: "C005-A03", number: 3, parentId: "a2", launched: false },
    { id: "a4", code: "C005-A04", number: 4, parentId: null, launched: true },
  ]
  it("el original se lleva sus variaciones, también las de segundo nivel", () => {
    assert.deepEqual(planMove(fam, "a1"), { ok: true, ids: ["a1", "a2", "a3"] })
  })
  it("una variación sola no se mueve", () => {
    const r = planMove(fam, "a2")
    assert.ok(!r.ok && /C005-A01/.test(r.error))
  })
  it("lo lanzado no se mueve", () => {
    const r = planMove(fam, "a4")
    assert.ok(!r.ok && /lanzado/.test(r.error))
  })
  it("si una variación está lanzada, la familia no se mueve", () => {
    const r = planMove(fam.map((f) => (f.id === "a3" ? { ...f, launched: true } : f)), "a1")
    assert.ok(!r.ok && /C005-A03/.test(r.error))
  })
})
