export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0073ea" />
      <circle cx="11" cy="16" r="4" fill="#00c875" />
      <circle cx="21" cy="16" r="4" fill="#fdab3d" />
      <path d="M11 12a4 4 0 0 1 10 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}
