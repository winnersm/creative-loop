"use client"

import { COMMENT_SEVERITY } from "@/lib/status"
import { cn } from "@/lib/utils"

export type ImagePin = { id: string; x: number; y: number; severity: keyof typeof COMMENT_SEVERITY; resolved: boolean; n: number }

/** F-508 · Revisión de imágenes: comentarios anclados a un punto. */
export function ImageViewer({
  src,
  pins,
  pending,
  activePin,
  onPick,
  onPinClick,
}: {
  src: string
  pins: ImagePin[]
  pending: { x: number; y: number } | null
  activePin?: string | null
  onPick?: (p: { x: number; y: number }) => void
  onPinClick?: (id: string) => void
}) {
  return (
    <div className="flex h-full items-center justify-center bg-black p-4">
      <div className="relative inline-block max-h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className={cn("block max-h-[max(280px,calc(100vh-380px))] max-w-full select-none", onPick && "cursor-crosshair")}
          draggable={false}
          onClick={(e) => {
            if (!onPick) return
            const r = e.currentTarget.getBoundingClientRect()
            onPick({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
          }}
        />
        {pins.map((p) => (
          <button
            key={p.id}
            onClick={() => onPinClick?.(p.id)}
            className={cn(
              "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow",
              p.resolved && "opacity-50",
              activePin === p.id && "scale-125 ring-2 ring-white",
            )}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: COMMENT_SEVERITY[p.severity].color }}
          >
            {p.n}
          </button>
        ))}
        {pending && (
          <span
            className="absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-white bg-[#0073ea]"
            style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}
