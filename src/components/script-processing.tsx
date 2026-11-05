"use client"

import { useEffect, useState } from "react"
import { clock } from "@/lib/script-export"

// Alturas fijas con forma de frase hablada (% del alto de la onda).
const BARS = [28, 46, 72, 54, 88, 62, 100, 76, 44, 66, 92, 58, 34, 70, 96, 64, 84, 48, 74, 100, 56, 80, 42, 60, 36]
const LINES = [94, 80, 88, 66, 42]

/** Del azul de la app al violeta y al rosa de la paleta de estados, a lo largo de la onda. */
function barColor(i: number) {
  const t = i / (BARS.length - 1)
  const [from, to, mix] =
    t < 0.5 ? ["--primary", "--status-testing", t * 2] : ["--status-testing", "--status-stuck", (t - 0.5) * 2]
  return `color-mix(in oklch, var(${from}), var(${to}) ${Math.round(Number(mix) * 100)}%)`
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{clock(seconds)}</span>
}

/** progress entre 0 y 1 mientras se sube; null mientras se transcribe. */
export function ScriptProcessing({ progress }: { progress: number | null }) {
  const transcribing = progress === null
  return (
    <div className="script-enter m-auto flex w-full max-w-sm flex-col items-center gap-6 p-6">
      <div className="w-full">
        <div aria-hidden data-active={transcribing} className="script-wave flex h-28 items-center justify-between">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="script-bar w-1.5 rounded-full"
              data-lit={progress === null || i / BARS.length < progress}
              style={{ height: `${h}%`, background: barColor(i), animationDelay: `${-1100 + i * 70}ms` }}
            />
          ))}
        </div>
        <div aria-hidden className="script-lines mt-5 space-y-2.5">
          {LINES.map((w, i) => (
            <span
              key={i}
              className="script-line block h-2 rounded-full"
              style={{ width: `${w}%`, background: barColor(i * 6), animationDelay: `${i * 450}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="text-center">
        <p role="status" className="font-medium">
          {transcribing ? "Escuchando el video" : "Subiendo el video"}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {transcribing ? (
            <>
              Convirtiendo la voz en texto · <Elapsed />
            </>
          ) : (
            "No cierres esta pantalla"
          )}
        </p>
      </div>
    </div>
  )
}
