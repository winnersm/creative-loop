import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

const COLORS = ["#fdab3d", "#00c875", "#579bfc", "#a25ddc", "#ff158a", "#037f4c", "#e2445c", "#784bd1"]

function colorFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function UserAvatar({ name, size = 26, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  )
}
