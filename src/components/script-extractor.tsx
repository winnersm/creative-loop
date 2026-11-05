"use client"

import { Copy, Download, FileText, Loader2, Upload, X } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  clock,
  downloadName,
  FORMATS,
  render,
  type ScriptFormat,
  type ScriptResult,
} from "@/lib/script-export"

type Phase =
  | { name: "idle" }
  | { name: "uploading"; progress: number }
  | { name: "transcribing" }
  | { name: "done"; result: ScriptResult }

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

/** Sube el archivo a /api/script y espera el resultado. XHR porque fetch no informa del progreso de subida. */
function send(file: File, onProgress: (p: number) => void, onUploaded: () => void) {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<ScriptResult>((resolve, reject) => {
    xhr.open("POST", "/api/script")
    xhr.setRequestHeader("content-type", "application/octet-stream")
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.upload.onload = onUploaded
    xhr.onerror = () => reject(new Error("Se perdió la conexión"))
    xhr.onabort = () => reject(new Error("Cancelado"))
    xhr.onload = () => {
      let data: (ScriptResult & { error?: string }) | null = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data)
      else reject(new Error(data?.error ?? "No se pudo extraer el guion"))
    }
    xhr.send(file)
  })
  return { promise, cancel: () => xhr.abort() }
}

export function ScriptExtractor({ maxMb, maxMinutes }: { maxMb: number; maxMinutes: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: "idle" })
  const [dragging, setDragging] = useState(false)
  const cancelRef = useRef<(() => void) | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const busy = phase.name === "uploading" || phase.name === "transcribing"

  function pick(f: File | undefined) {
    if (!f) return
    if (!/^(video|audio)\//.test(f.type) && !/\.(mp4|mov|mkv|avi|webm|m4v|mp3|wav|m4a)$/i.test(f.name)) {
      toast.error("Elige un archivo de video o audio")
      return
    }
    if (f.size > maxMb * 1024 * 1024) {
      toast.error(`El archivo pesa ${mb(f.size)} MB y el máximo es ${maxMb} MB`)
      return
    }
    setFile(f)
    setPhase({ name: "idle" })
  }

  async function start() {
    if (!file) return
    setPhase({ name: "uploading", progress: 0 })
    const job = send(
      file,
      (progress) => setPhase({ name: "uploading", progress }),
      () => setPhase({ name: "transcribing" }),
    )
    cancelRef.current = job.cancel
    try {
      setPhase({ name: "done", result: await job.promise })
    } catch (e) {
      setPhase({ name: "idle" })
      const msg = e instanceof Error ? e.message : "No se pudo extraer el guion"
      if (msg !== "Cancelado") toast.error(msg)
    } finally {
      cancelRef.current = null
    }
  }

  function download(format: ScriptFormat, result: ScriptResult) {
    const blob = new Blob([render(format, result, file?.name ?? "video")], {
      type: `${FORMATS[format].mime};charset=utf-8`,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = downloadName(file?.name ?? "guion", format)
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success("Texto copiado")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!busy) pick(e.dataTransfer.files[0])
        }}
        className={
          "rounded-lg border border-dashed p-8 text-center transition-colors " +
          (dragging ? "border-primary bg-accent/40" : "")
        }
      >
        <input
          ref={input}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ""
          }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3 text-sm">
            <FileText className="size-5 text-muted-foreground" />
            <span className="font-medium">{file.name}</span>
            <span className="tabular-nums text-muted-foreground">{mb(file.size)} MB</span>
            {!busy && (
              <Button size="icon-xs" variant="ghost" aria-label="Quitar archivo" onClick={() => setFile(null)}>
                <X />
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto size-6 text-muted-foreground" />
            <p className="text-sm">Arrastra un video aquí o</p>
            <Button variant="outline" onClick={() => input.current?.click()}>
              Elegir archivo
            </Button>
            <p className="text-xs text-muted-foreground">
              Hasta {maxMb} MB y {maxMinutes} minutos. Se transcribe de uno en uno.
            </p>
          </div>
        )}
      </div>

      {file && (
        <div className="flex items-center gap-3">
          {!busy && <Button onClick={() => void start()}>Extraer guion</Button>}
          {phase.name === "uploading" && (
            <>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round(phase.progress * 100)}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                Subiendo {Math.round(phase.progress * 100)} %
              </span>
            </>
          )}
          {phase.name === "transcribing" && (
            <span className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Transcribiendo… puede tardar uno o dos minutos.
            </span>
          )}
          {busy && (
            <Button variant="outline" onClick={() => cancelRef.current?.()}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      {phase.name === "done" && (
        <Result
          result={phase.result}
          onDownload={(f) => download(f, phase.result)}
          onCopy={() => void copy(phase.result.text)}
        />
      )}
    </div>
  )
}

function Result({
  result,
  onDownload,
  onCopy,
}: {
  result: ScriptResult
  onDownload: (f: ScriptFormat) => void
  onCopy: () => void
}) {
  if (!result.segments.length)
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No se detectó voz en el archivo.</p>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Idioma: <b className="text-foreground">{result.language}</b> ({Math.round(result.languageProbability * 100)} %)
          {" · "}Duración: <b className="tabular-nums text-foreground">{clock(result.durationSeconds)}</b>
          {" · "}
          {result.wordCount} palabras
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy /> Copiar texto
          </Button>
          {(Object.keys(FORMATS) as ScriptFormat[]).map((f) => (
            <Button key={f} size="sm" variant="outline" onClick={() => onDownload(f)}>
              <Download /> {FORMATS[f].label}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">{result.text}</div>
      <ul className="divide-y rounded-lg border text-sm">
        {result.segments.map((s) => (
          <li key={s.id} className="flex gap-3 px-4 py-2">
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
              {clock(s.start)} – {clock(s.end)}
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Esto solo existe en esta pantalla: si la cierras, se pierde. Descarga lo que necesites.
      </p>
    </div>
  )
}
