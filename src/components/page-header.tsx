export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b px-6 pt-5 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function Kpi({
  label,
  value,
  href,
  tone,
}: {
  label: string
  value: React.ReactNode
  href?: string
  tone?: "danger" | "warning"
}) {
  const body = (
    <div className="h-full rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-3xl font-semibold tabular-nums " +
          (tone === "danger" ? "text-destructive" : tone === "warning" ? "text-[var(--status-working)]" : "")
        }
      >
        {value}
      </div>
    </div>
  )
  return href ? <a href={href}>{body}</a> : body
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>
}
