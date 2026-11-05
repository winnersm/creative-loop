"use client"

import { Pause, Play, UploadCloud, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { bytes } from "@/lib/format"
import { cn } from "@/lib/utils"

const PART_SIZE = 10 * 1024 * 1024 // 10 MB (S3 exige ≥ 5 MB salvo la última)
const PARALLEL = 3
const MAX_RETRIES = 8

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string; size: number; loaded: number; paused: boolean; offline: boolean }
  | { kind: "done" }

async function api<T>(body: object): Promise<T> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function waitOnline() {
  if (navigator.onLine) return Promise.resolve()
  return new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true }))
}

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)))
    xhr.onerror = () => reject(new Error("red"))
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"))
    signal.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

/** F-401 · Subida multipart reanudable directa al bucket. */
export function VersionUploader({
  assetId,
  accept,
  disabledReason,
}: {
  assetId: string
  accept: string
  disabledReason?: string | null
}) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: "idle" })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pausedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const versionRef = useRef<string | null>(null)

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.kind === "uploading") e.preventDefault()
    }
    const offline = () => setState((s) => (s.kind === "uploading" ? { ...s, offline: true } : s))
    const online = () => setState((s) => (s.kind === "uploading" ? { ...s, offline: false } : s))
    window.addEventListener("beforeunload", warn)
    window.addEventListener("offline", offline)
    window.addEventListener("online", online)
    return () => {
      window.removeEventListener("beforeunload", warn)
      window.removeEventListener("offline", offline)
      window.removeEventListener("online", online)
    }
  }, [state.kind])

  async function upload(file: File) {
    if (state.kind === "uploading") return
    pausedRef.current = false
    const controller = new AbortController()
    abortRef.current = controller
    setState({ kind: "uploading", name: file.name, size: file.size, loaded: 0, paused: false, offline: !navigator.onLine })

    try {
      const { versionId, resumed } = await api<{ versionId: string; resumed?: boolean }>({
        op: "create",
        assetId,
        filename: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      })
      versionRef.current = versionId
      const total = Math.max(1, Math.ceil(file.size / PART_SIZE))
      const done = new Map<number, number>() // parte → bytes
      if (resumed) {
        const { parts } = await api<{ parts: { PartNumber: number; Size: number | null }[] }>({ op: "list", versionId })
        // Supabase no devuelve el tamaño de la parte: se calcula, que es exacto.
        for (const p of parts)
          done.set(p.PartNumber, p.Size ?? Math.min(PART_SIZE, file.size - (p.PartNumber - 1) * PART_SIZE))
        toast.info(`Reanudando: ${parts.length} de ${total} partes ya estaban subidas.`)
      }
      const inFlight = new Map<number, number>()
      const report = () => {
        let loaded = 0
        for (const v of done.values()) loaded += v
        for (const v of inFlight.values()) loaded += v
        setState((s) => (s.kind === "uploading" ? { ...s, loaded } : s))
      }
      report()

      const queue = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !done.has(n))
      async function workerLoop() {
        while (queue.length) {
          const n = queue.shift()!
          const blob = file.slice((n - 1) * PART_SIZE, Math.min(n * PART_SIZE, file.size))
          for (let attempt = 0; ; attempt++) {
            while (pausedRef.current) await sleep(300)
            await waitOnline()
            if (controller.signal.aborted) throw new DOMException("aborted", "AbortError")
            try {
              const { url } = await api<{ url: string }>({ op: "sign", versionId, partNumber: n })
              await putPart(url, blob, (l) => {
                inFlight.set(n, l)
                report()
              }, controller.signal)
              inFlight.delete(n)
              done.set(n, blob.size)
              report()
              break
            } catch (e) {
              inFlight.delete(n)
              if ((e as Error).name === "AbortError") throw e
              if (attempt >= MAX_RETRIES) throw e
              await sleep(Math.min(30_000, 1000 * 2 ** attempt))
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length || 1) }, workerLoop))
      await api({ op: "complete", versionId })
      versionRef.current = null
      setState({ kind: "done" })
      toast.success("Subida completa. Procesando (30–90 s)…")
      router.refresh()
      setTimeout(() => setState({ kind: "idle" }), 1500)
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.info("Subida cancelada.")
      } else {
        toast.error(`La subida falló: ${(e as Error).message}. Vuelve a elegir el mismo archivo para reanudar.`)
      }
      setState({ kind: "idle" })
    }
  }

  async function cancel() {
    abortRef.current?.abort()
    const id = versionRef.current
    versionRef.current = null
    if (id) await api({ op: "abort", versionId: id }).catch(() => {})
    router.refresh()
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current
    setState((s) => (s.kind === "uploading" ? { ...s, paused: pausedRef.current } : s))
  }

  if (disabledReason)
    return <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{disabledReason}</div>

  if (state.kind === "uploading") {
    const pct = Math.min(100, Math.round((state.loaded / state.size) * 100))
    return (
      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-medium">{state.name}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {bytes(state.loaded)} / {bytes(state.size)} · {pct}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {state.offline ? "Sin conexión: se reanudará sola al volver." : state.paused ? "En pausa" : "Subiendo…"}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={togglePause}>
              {state.paused ? <Play /> : <Pause />} {state.paused ? "Seguir" : "Pausar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              <X /> Cancelar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) void upload(f)
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-center text-sm transition-colors",
        dragOver ? "border-primary bg-accent" : "hover:border-primary/60 hover:bg-row-hover",
      )}
    >
      <UploadCloud className="size-6 text-primary" />
      <span className="font-medium">{state.kind === "done" ? "¡Subido!" : "Arrastra aquí la nueva versión"}</span>
      <span className="text-xs text-muted-foreground">o haz clic para elegir el archivo · se reanuda si se corta</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void upload(f)
        }}
      />
    </div>
  )
}
