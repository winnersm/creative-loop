import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  activeSegment,
  clock,
  downloadName,
  filterSegments,
  languageName,
  render,
  type ScriptResult,
  splitMatches,
  toSrt,
  toVtt,
} from "./script-export"

const result: ScriptResult = {
  language: "es",
  languageProbability: 0.987,
  durationSeconds: 75.5,
  text: "Hola a todos. Esto es una prueba.",
  wordCount: 7,
  segments: [
    { id: 1, start: 0, end: 2.5, text: "Hola a todos." },
    { id: 2, start: 3661.25, end: 3663, text: "Esto es una prueba." },
  ],
}

describe("extractor de guion", () => {
  it("formatea el reloj en MM:SS y HH:MM:SS", () => {
    assert.equal(clock(5), "00:05")
    assert.equal(clock(75.4), "01:15")
    assert.equal(clock(3661), "01:01:01")
  })

  it("SRT usa coma y numera desde 1", () => {
    assert.equal(
      toSrt(result.segments),
      "1\n00:00:00,000 --> 00:00:02,500\nHola a todos.\n\n2\n01:01:01,250 --> 01:01:03,000\nEsto es una prueba.\n",
    )
  })

  it("VTT empieza por WEBVTT y usa punto", () => {
    const vtt = toVtt(result.segments)
    assert.ok(vtt.startsWith("WEBVTT\n"))
    assert.ok(vtt.includes("00:00:00.000 --> 00:00:02.500"))
  })

  it("no produce 60 segundos al redondear", () => {
    assert.equal(toSrt([{ id: 1, start: 59.9996, end: 60, text: "x" }]), "1\n00:01:00,000 --> 00:01:00,000\nx\n")
  })

  it("TXT lleva metadatos, texto y desglose", () => {
    const txt = render("txt", result, "video.mp4")
    assert.ok(txt.includes("Archivo: video.mp4"))
    assert.ok(txt.includes("confianza: 98.7%"))
    assert.ok(txt.includes("[00:00 -> 00:02] Hola a todos."))
    assert.ok(txt.includes("[01:01:01 -> 01:01:03] Esto es una prueba."))
  })

  it("JSON conserva el resultado y el nombre del archivo", () => {
    const json = JSON.parse(render("json", result, "video.mp4"))
    assert.equal(json.filename, "video.mp4")
    assert.equal(json.segments.length, 2)
  })

  it("encuentra la frase que suena y ninguna en los silencios", () => {
    assert.equal(activeSegment(result.segments, 1)?.id, 1)
    assert.equal(activeSegment(result.segments, 2.5), null)
    assert.equal(activeSegment(result.segments, 3662)?.id, 2)
  })

  it("escribe el idioma en español", () => {
    assert.equal(languageName("es"), "Español")
    assert.equal(languageName("en"), "Inglés")
    assert.equal(languageName("no es un código"), "no es un código")
  })

  it("busca sin distinguir mayúsculas ni acentos", () => {
    const segs = [
      { id: 1, start: 0, end: 1, text: "El Guión final" },
      { id: 2, start: 1, end: 2, text: "Otra frase" },
    ]
    assert.deepEqual(filterSegments(segs, " guion ").map((s) => s.id), [1])
    assert.equal(filterSegments(segs, "").length, 2)
  })

  it("resalta cada coincidencia conservando el texto original", () => {
    assert.deepEqual(splitMatches("El Guión y el guion", "guion"), [
      { text: "El ", match: false },
      { text: "Guión", match: true },
      { text: " y el ", match: false },
      { text: "guion", match: true },
    ])
    assert.deepEqual(splitMatches("hola", ""), [{ text: "hola", match: false }])
    assert.deepEqual(splitMatches("hola", "xyz"), [{ text: "hola", match: false }])
  })

  it("cambia la extensión del archivo descargado", () => {
    assert.equal(downloadName("mi video.final.mp4", "srt"), "mi video.final.srt")
    assert.equal(downloadName("sin-extension", "txt"), "sin-extension.txt")
    assert.equal(downloadName(".mp4", "txt"), "guion.txt")
  })
})
