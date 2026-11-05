import Link from "next/link"
import { AiSettings } from "@/components/settings/ai-settings"
import { AssetLabelsSettings } from "@/components/settings/asset-labels-settings"
import { SlackSettings } from "@/components/settings/slack-settings"
import { AuditTable } from "@/components/settings/audit-table"
import { AI_MODELS } from "@/lib/ai"
import { getAiStatus } from "@/lib/ai-config"
import { getSlackStatus } from "@/lib/slack-config"
import { MetaSettings } from "@/components/settings/meta-settings"
import { OffersSettings } from "@/components/settings/offers-settings"
import { RulesSettings } from "@/components/settings/rules-settings"
import { TagsSettings } from "@/components/settings/tags-settings"
import { UsersSettings } from "@/components/settings/users-settings"
import { PageHeader } from "@/components/page-header"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/session"
import { cn } from "@/lib/utils"
import { DEFAULT_RULE } from "@/lib/winner-rules"

export const metadata = { title: "Ajustes · Creative Loop" }

const TABS = [
  { key: "offers", label: "Ofertas" },
  { key: "tags", label: "Etiquetas" },
  { key: "users", label: "Usuarios" },
  { key: "meta", label: "Meta" },
  { key: "rules", label: "Reglas de ganador" },
  { key: "ai", label: "IA" },
  { key: "slack", label: "Slack" },
  { key: "audit", label: "Auditoría" },
] as const

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const me = await requirePermission("settings.manage")
  const sp = await searchParams
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "offers"

  return (
    <div>
      <PageHeader title="Ajustes" description="Solo el propietario puede cambiar la configuración." />
      <div className="flex gap-1 border-b px-6">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm",
              tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="p-6">
        {tab === "offers" && <OffersSettings offers={await prisma.offer.findMany({ orderBy: { number: "asc" } })} />}
        {tab === "tags" && (
          <AssetLabelsSettings
            labels={await prisma.assetLabel.findMany({
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              include: { _count: { select: { assets: true } } },
            })}
          />
        )}
        {tab === "tags" && <h2 className="mt-8 mb-3 font-semibold">Etiquetas del concepto</h2>}
        {tab === "tags" && (
          <TagsSettings
            dimensions={await prisma.tagDimension.findMany({
              orderBy: { sortOrder: "asc" },
              include: {
                values: {
                  orderBy: { sortOrder: "asc" },
                  include: { _count: { select: { conceptTags: true, overrides: true } } },
                },
              },
            })}
          />
        )}
        {tab === "users" && (
          <UsersSettings
            meId={me.id}
            users={await prisma.user.findMany({
              orderBy: [{ status: "asc" }, { role: "asc" }, { name: "asc" }],
              select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true },
            })}
          />
        )}
        {tab === "meta" && (
          <MetaSettings
            connections={await prisma.metaConnection.findMany({
              orderBy: { createdAt: "asc" },
              omit: { tokenEncrypted: true },
              include: { adAccounts: { orderBy: { name: "asc" } } },
            })}
          />
        )}
        {tab === "rules" && (
          <RulesSettings
            global={(await prisma.winnerRule.findFirst({ where: { offerId: null } })) ?? { ...DEFAULT_RULE, id: "", offerId: null }}
            offerRules={await prisma.winnerRule.findMany({ where: { offerId: { not: null } } })}
            offers={await prisma.offer.findMany({ orderBy: { number: "asc" }, select: { id: true, code: true, name: true, targetCpaCents: true } })}
          />
        )}
        {tab === "ai" && <AiSettings status={await getAiStatus()} models={AI_MODELS} />}
        {tab === "slack" && (
          <SlackSettings
            status={await getSlackStatus()}
            users={await prisma.user.findMany({
              where: { status: "ACTIVE" },
              orderBy: [{ role: "asc" }, { name: "asc" }],
              select: { id: true, name: true, role: true, slackChannelId: true },
            })}
          />
        )}
        {tab === "audit" && (
          <AuditTable
            rows={await prisma.auditLog.findMany({
              orderBy: { createdAt: "desc" },
              take: 200,
              include: { user: { select: { name: true } } },
            })}
          />
        )}
      </div>
    </div>
  )
}
