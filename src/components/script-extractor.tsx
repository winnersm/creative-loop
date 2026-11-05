"use client"

import { AlignLeft, Copy, Download, FileText, ListVideo, Search, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ScriptProcessing } from "@/components/script-processing"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  activeSegment,
  clock,
  downloadName,
  filterSegments,
  FORMATS,
  languageName,
  render,
  type ScriptFormat,
  type ScriptResult,
  type ScriptSegment,
  splitMatches,
} from "@/lib/script-export"

type Phase =
  | { name: "idle" }
  | { name: "uploading"; progress: number }
  | { name: "transcribing" }
  | { name: "done"; result: ScriptResult }
  | { name: "error"; message: string }

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

/** Sube el archivo a /api/script y espera el resultado. XHR porque fetch no informa del progreso de subida. */
function send(file: File, onProgress: (p: number) => void, onUploaded: () => void) {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<ScriptResult>((resolve, reject) => {
    xhr.open("POST", "/api/script")
    xhr.setRequestHeader("content-type", "application/octet-stream")
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.upload.onload = onUploaded
    xhr.onerror = () => reject(new Error("Se perdió la conexión. Inténtalo de nuevo."))
    xhr.onabort = () => reject(new DOMException("Cancelado", "AbortError"))
    xhr.onload = () => {
      let data: (ScriptResult & { error?: string }) | null = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data)
      // 524: Cloudflare se cansó de esperar la respuesta; llega como HTML, sin JSON.
      else if (xhr.status === 524) reject(new Error("El video tarda demasiado en procesarse. Prueba con uno más corto."))
      else reject(new Error(data?.error ?? "No se pudo extraer el guion."))
    }
    xhr.send(file)
  })
  return { promise, cancel: () => xhr.abort() }
}

export function ScriptExtractor({ maxMb }: { maxMb: number }) {
  const [media, setMedia] = useState<{ file: File; url: string } | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: "idle" })
  const [dragging, setDragging] = useState(false)
  const [playable, setPlayable] = useState(true)
  const [active, setActive] = useState<number | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)

  const busy = phase.name === "uploading" || phase.name === "transcribing"
  const result = phase.name === "done" ? phase.result : null

  // El video se reproduce desde el archivo local: no se pide nada al servidor.
  useEffect(() => {
    if (!media) return
    return () => URL.revokeObjectURL(media.url)
  }, [media])

  function pick(f: File | undefined) {
    if (!f) return
    if (!/^(video|audio)\//.test(f.type) && !/\.(mp4|mov|mkv|avi|webm|m4v|mp3|wav|m4a)$/i.test(f.name)) {
      toast.error("Elige un archivo de video")
      return
    }
    if (f.size > maxMb * 1024 * 1024) {
      toast.error(`El archivo pesa ${mb(f.size)} MB y el máximo es ${maxMb} MB`)
      return
    }
    setMedia({ file: f, url: URL.createObjectURL(f) })
    setPhase({ name: "idle" })
    setPlayable(true)
    setActive(null)
  }

  async function start() {
    if (!media) return
    setPhase({ name: "uploading", progress: 0 })
    const job = send(
      media.file,
      (progress) => setPhase({ name: "uploading", progress }),
      () => setPhase({ name: "transcribing" }),
    )
    cancelRef.current = job.cancel
    try {
      setPhase({ name: "done", result: await job.promise })
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setPhase({ name: "idle" })
      else setPhase({ name: "error", message: e instanceof Error ? e.message : "No se pudo extraer el guion." })
    } finally {
      cancelRef.current = null
    }
  }

  function seek(s: ScriptSegment) {
    const v = video.current
    if (!v) return
    v.currentTime = s.start
    void v.play().catch(() => {})
  }

  function download(format: ScriptFormat, r: ScriptResult) {
    const name = media?.file.name ?? "guion"
    const blob = new Blob([render(format, r, name)], { type: `${FORMATS[format].mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = downloadName(name, format)
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success("Texto copiado")
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <input
        ref={input}
        type="file"
        accept="video/*,audio/*"
        aria-label="Elegir archivo de video"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      <section className="space-y-3 lg:sticky lg:top-6">
        {media ? (
          <>
            <div className="relative overflow-hidden rounded-lg border bg-black">
              <video
                key={media.url}
                ref={video}
                src={media.url}
                controls
                playsInline
                preload="metadata"
                className="mx-auto max-h-[55dvh] w-full object-contain"
                onError={() => setPlayable(false)}
                onTimeUpdate={(e) => {
                  if (result) setActive(activeSegment(result.segments, e.currentTarget.currentTime)?.id ?? null)
                }}
              />
              {phase.name === "transcribing" && <div aria-hidden className="script-scan" />}
            </div>
            {!playable && (
              <p className="text-xs text-muted-foreground">
                Tu navegador no puede reproducir este formato, pero el guion se extrae igual.
              </p>
            )}
            <div className="flex items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium" title={media.file.name}>
                {media.file.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{mb(media.file.size)} MB</span>
              {!busy && (
                <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>
                  Cambiar
                </Button>
              )}
            </div>
            <Actions phase={phase} onStart={() => void start()} onCancel={() => cancelRef.current?.()} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pick(e.dataTransfer.files[0])
            }}
            className={
              "flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors outline-none hover:border-primary hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50 " +
              (dragging ? "border-primary bg-accent/40" : "")
            }
          >
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">Arrastra un video o haz clic para elegirlo</span>
            <span className="text-xs text-muted-foreground">Máximo {maxMb} MB de video</span>
          </button>
        )}
      </section>

      <section className="flex min-h-80 flex-col rounded-lg border bg-card lg:h-[calc(100dvh-13rem)]">
        {result ? (
          <Result
            key={media?.url}
            result={result}
            active={active}
            canSeek={playable}
            onSeek={seek}
            onDownload={(f) => download(f, result)}
            onCopy={() => void copy(result.text)}
          />
        ) : busy ? (
          <ScriptProcessing progress={phase.name === "uploading" ? phase.progress : null} />
        ) : phase.name === "error" ? (
          <Message title="No se pudo extraer el guion" alert>
            {phase.message}
          </Message>
        ) : (
          <Message title="Aquí aparecerá el guion">
            {media ? "Pulsa «Extraer guion» para empezar." : "Elige un video para empezar."}
          </Message>
        )}
      </section>
    </div>
  )
}

function Actions({ phase, onStart, onCancel }: { phase: Phase; onStart: () => void; onCancel: () => void }) {
  if (phase.name === "done") return null
  if (phase.name === "idle" || phase.name === "error")
    return (
      <Button size="lg" className="w-full" onClick={onStart}>
        {phase.name === "error" ? "Reintentar" : "Extraer guion"}
      </Button>
    )
  return (
    <div className="flex items-center gap-3">
      {phase.name === "uploading" && (
        <>
          <div
            role="progressbar"
            aria-label="Subiendo el video"
            aria-valuenow={Math.round(phase.progress * 100)}
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{Math.round(phase.progress * 100)} %</span>
        </>
      )}
      <Button size="sm" variant="outline" className={phase.name === "uploading" ? "" : "w-full"} onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

function Message({ title, alert, children }: { title: string; alert?: boolean; children: React.ReactNode }) {
  return (
    <div role={alert ? "alert" : undefined} className="m-auto max-w-sm p-6 text-center">
      <p className={"font-medium " + (alert ? "text-destructive" : "")}>{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function Marked({ text, query }: { text: string; query: string }) {
  return splitMatches(text, query).map((p, i) =>
    p.match ? (
      <mark key={i} className="rounded-sm bg-accent text-accent-foreground">
        {p.text}
      </mark>
    ) : (
      p.text
    ),
  )
}

function Result({
  result,
  active,
  canSeek,
  onSeek,
  onDownload,
  onCopy,
}: {
  result: ScriptResult
  active: number | null
  canSeek: boolean
  onSeek: (s: ScriptSegment) => void
  onDownload: (f: ScriptFormat) => void
  onCopy: () => void
}) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"segments" | "text">("segments")
  const list = useRef<HTMLDivElement>(null)
  const segments = filterSegments(result.segments, query)

  // Mantiene a la vista la frase que suena, moviendo solo la lista y no la página.
  useEffect(() => {
    const box = list.current
    const row = box?.querySelector<HTMLElement>(`[data-segment="${active}"]`)
    if (!box || !row) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: reduce ? "auto" : "smooth" })
  }, [active])

  if (!result.segments.length) return <Message title="No se detectó voz">El archivo no tiene voz que transcribir.</Message>

  const stats = [
    ["Idioma", languageName(result.language)],
    ["Confianza", `${Math.round(result.languageProbability * 100)} %`],
    ["Duración", clock(result.durationSeconds)],
    ["Palabras", String(result.wordCount)],
  ]

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b p-4 sm:grid-cols-4">
        {stats.map(([label, value], i) => (
          <div key={label} className="script-enter" style={{ "--i": i } as React.CSSProperties}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el guion"
            aria-label="Buscar en el guion"
            className="pl-8"
          />
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          <Button
            size="sm"
            variant={view === "segments" ? "outline" : "ghost"}
            aria-pressed={view === "segments"}
            onClick={() => setView("segments")}
          >
            <ListVideo /> Frases
          </Button>
          <Button
            size="sm"
            variant={view === "text" ? "outline" : "ghost"}
            aria-pressed={view === "text"}
            onClick={() => setView("text")}
          >
            <AlignLeft /> Texto
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy /> Copiar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ size: "sm" })}>
            <Download /> Descargar
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {(Object.keys(FORMATS) as ScriptFormat[]).map((f) => (
              <DropdownMenuItem key={f} onClick={() => onDownload(f)}>
                {FORMATS[f].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={list}
        className="script-enter relative min-h-0 flex-1 overflow-y-auto"
        style={{ "--i": 4 } as React.CSSProperties}
      >
        {view === "text" ? (
          <p className="p-5 text-sm leading-relaxed whitespace-pre-wrap">
            <Marked text={result.text} query={query} />
          </p>
        ) : segments.length ? (
          <ul className="p-2">
            {segments.map((s) => (
              <li key={s.id} data-segment={s.id}>
                <button
                  type="button"
                  disabled={!canSeek}
                  aria-current={s.id === active ? "true" : undefined}
                  title={canSeek ? `Ir a ${clock(s.start)}` : undefined}
                  onClick={() => onSeek(s)}
                  className={
                    "flex w-full gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default " +
                    (s.id === active ? "bg-accent text-accent-foreground" : "enabled:hover:bg-row-hover")
                  }
                >
                  <span className="shrink-0 pt-px text-xs tabular-nums opacity-70">{clock(s.start)}</span>
                  <span>
                    <Marked text={s.text} query={query} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Message title="Sin resultados">Ninguna frase contiene «{query.trim()}».</Message>
        )}
      </div>
    </>
  )
}
