import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { effectiveTags, rankSimilar, sharedDimensions } from "./similar"

const tags = (o: Record<string, string>) => new Map(Object.entries(o))

describe("similares", () => {
  it("la variable del creativo pisa la etiqueta del concepto", () => {
    const m = effectiveTags(
      [
        { dimensionId: "angle", valueId: "fear" },
        { dimensionId: "hook", valueId: "question" },
      ],
      { dimensionId: "hook", valueId: "bold" },
    )
    assert.equal(m.get("hook"), "bold")
    assert.equal(m.get("angle"), "fear")
  })

  it("cuenta las dimensiones en las que coinciden", () => {
    assert.deepEqual(sharedDimensions(tags({ a: "1", b: "2", c: "3" }), tags({ a: "1", b: "9", c: "3" })), ["a", "c"])
  })

  it("ordena por etiquetas compartidas, formato y veredicto; exige un mínimo", () => {
    const target = { tags: tags({ a: "1", b: "2", c: "3" }), format: "VERTICAL" }
    const r = rankSimilar(target, [
      { item: "una-sola", tags: tags({ a: "1" }), format: "VERTICAL", verdict: "WINNER" },
      { item: "dos-cuadrado", tags: tags({ a: "1", b: "2" }), format: "SQUARE", verdict: "WINNER" },
      { item: "dos-vertical-perdedor", tags: tags({ a: "1", b: "2" }), format: "VERTICAL", verdict: "LOSER" },
      { item: "tres", tags: tags({ a: "1", b: "2", c: "3" }), format: "SQUARE", verdict: "INCONCLUSIVE" },
    ])
    assert.deepEqual(
      r.map((x) => x.item),
      ["tres", "dos-vertical-perdedor", "dos-cuadrado"],
    )
  })

  it("sin etiquetas no hay similares", () => {
    assert.deepEqual(rankSimilar({ tags: new Map(), format: "VERTICAL" }, [{ item: 1, tags: tags({ a: "1" }), format: "VERTICAL", verdict: "WINNER" }]), [])
  })
})
