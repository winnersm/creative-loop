"use client"

import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { timecode } from "@/lib/format"
import { COMMENT_SEVERITY } from "@/lib/status"
import { cn } from "@/lib/utils"

export type PlayerMarker = { id: string; timeMs: number; severity: keyof typeof COMMENT_SEVERITY; resolved: boolean }

export type PlayerSprite = { url: string; count: number; tileW: number; tileH: number; cols: number }

export type PlayerHandle = {
  seek: (ms: number) => void
  pause: () => void
  currentMs: () => number
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))

/** F-502 · Reproductor de revisión con marcadores y atajos. */
export const ReviewPlayer = forwardRef<
  PlayerHandle,
  {
    src: string
    sprite?: PlayerSprite | null
    fps: number | null
    durationMs: number | null
    markers: PlayerMarker[]
    activeMarker?: string | null
    onTime?: (ms: number) => void
    onCommentKey?: (ms: number) => void
    onMarkerClick?: (id: string) => void
  }
>(function ReviewPlayer({ src, sprite, fps, durationMs, markers, activeMarker, onTime, onCommentKey, onMarkerClick }, ref) {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000)
  const [hover, setHover] = useState<number | null>(null) // 0–1 sobre el timeline
  const frame = 1 / (fps && fps > 0 ? fps : 30)

  const update = useCallback(() => {
    const v = video.current
    if (!v) return
    setTime(v.currentTime)
    onTime?.(Math.round(v.currentTime * 1000))
  }, [onTime])

  // requestVideoFrameCallback da el tiempo exacto de cada frame mientras se reproduce.
  useEffect(() => {
    const v = video.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void }) | null
    if (!v?.requestVideoFrameCallback) return
    let handle = 0
    const tick = () => {
      update()
      handle = v.requestVideoFrameCallback!(tick)
    }
    handle = v.requestVideoFrameCallback(tick)
    return () => v.cancelVideoFrameCallback?.(handle)
  }, [update, src])

  const seek = useCallback((ms: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(ms / 1000, v.duration || ms / 1000))
    setTime(v.currentTime)
  }, [])

  useImperativeHandle(ref, () => ({
    seek,
    pause: () => video.current?.pause(),
    currentMs: () => Math.round((video.current?.currentTime ?? 0) * 1000),
  }))

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const step = useCallback(
    (dir: 1 | -1) => {
      const v = video.current
      if (!v) return
      v.pause()
      v.currentTime = Math.max(0, v.currentTime + dir * frame)
      update()
    },
    [frame, update],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const v = video.current
      if (!v) return
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault()
          toggle()
          break
        case "ArrowLeft":
          e.preventDefault()
          if (e.shiftKey) step(-1)
          else seek(v.currentTime * 1000 - 1000)
          break
        case "ArrowRight":
          e.preventDefault()
          if (e.shiftKey) step(1)
          else seek(v.currentTime * 1000 + 1000)
          break
        case ",":
          step(-1)
          break
        case ".":
          step(1)
          break
        case "m":
          setMuted((m) => !m)
          break
        case "c":
        case "C":
          if (onCommentKey) {
            e.preventDefault()
            v.pause()
            onCommentKey(Math.round(v.currentTime * 1000))
          }
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle, step, seek, onCommentKey])

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate
  }, [rate])

  const pct = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          ref={video}
          src={src}
          crossOrigin="anonymous"
          muted={muted}
          playsInline
          preload="auto"
          className="max-h-full max-w-full"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={update}
          onSeeked={update}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      </div>
      <div className="space-y-2 px-3 py-2">
        <div
          className="relative h-6 cursor-pointer"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - r.left) / r.width) * duration * 1000)
          }}
        >
          {hover !== null && duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-7 z-10 -translate-x-1/2 overflow-hidden rounded border border-white/30 bg-black shadow-lg"
              style={{ left: `clamp(${(sprite?.tileW ?? 60) / 2}px, ${hover * 100}%, calc(100% - ${(sprite?.tileW ?? 60) / 2}px))` }}
            >
              {sprite && (
                <div
                  style={{
                    width: sprite.tileW,
                    height: sprite.tileH,
                    backgroundImage: `url(${sprite.url})`,
                    backgroundPosition: (() => {
                      const i = Math.min(sprite.count - 1, Math.floor(hover * sprite.count))
                      return `-${(i % sprite.cols) * sprite.tileW}px -${Math.floor(i / sprite.cols) * sprite.tileH}px`
                    })(),
                  }}
                />
              )}
              <div className="px-1.5 py-0.5 text-center font-mono text-[10px]">{timecode(hover * duration * 1000)}</div>
            </div>
          )}
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-white/15" />
          <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#579bfc]" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0073ea]"
            style={{ left: `${pct}%` }}
          />
          {duration > 0 &&
            markers.map((m) => (
              <button
                key={m.id}
                title={`${timecode(m.timeMs)} · ${COMMENT_SEVERITY[m.severity].label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  seek(m.timeMs)
                  onMarkerClick?.(m.id)
                }}
                className={cn(
                  "absolute -top-1 size-3 -translate-x-1/2 rotate-45 border border-black/40 transition-transform hover:scale-125",
                  m.resolved && "opacity-40",
                  activeMarker === m.id && "scale-150",
                )}
                style={{ left: `${(m.timeMs / 1000 / duration) * 100}%`, background: COMMENT_SEVERITY[m.severity].color }}
              />
            ))}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <CtrlBtn title="Frame anterior (,)" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
            <span className="text-[10px]">1f</span>
          </CtrlBtn>
          <CtrlBtn title="Reproducir / pausa (espacio)" onClick={toggle}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </CtrlBtn>
          <CtrlBtn title="Frame siguiente (.)" onClick={() => step(1)}>
            <span className="text-[10px]">1f</span>
            <ChevronRight className="size-4" />
          </CtrlBtn>
          <span className="ml-2 font-mono text-xs tabular-nums opacity-80">
            {timecode(time * 1000)} / {timecode(duration * 1000)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {[0.5, 1, 1.5, 2].map((r) => (
              <CtrlBtn key={r} active={rate === r} onClick={() => setRate(r)}>
                {r}x
              </CtrlBtn>
            ))}
            <CtrlBtn title="Silenciar (m)" onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </CtrlBtn>
          </div>
        </div>
        <p className="text-[11px] opacity-50">
          Atajos: espacio play · ←/→ 1 s · , / . frame a frame · C comentar aquí · M silencio
        </p>
      </div>
    </div>
  )
})

function CtrlBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-0.5 rounded px-2 text-xs hover:bg-white/10",
        active && "bg-white/15 font-medium",
      )}
    >
      {children}
    </button>
  )
}
