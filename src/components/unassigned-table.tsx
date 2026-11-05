"use client"

import { EyeOff, Link2 } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { int, money, timeAgo } from "@/lib/format"
import { assignAd, setAdIgnored } from "@/server/meta"

type Ad = {
  adId: string
  name: string
  account: string
  /** Código que lleva el nombre y no existe. */
  code: string
  campaignId: string | null
  spendCents: number
  impressions: number
  lastSeenAt: string
}

export function UnassignedTable({ ads, versions }: { ads: Ad[]; versions: { code: string; title: string }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <datalist id="approved-versions">
        {versions.map((v) => (
          <option key={v.code} value={v.code}>
            {v.title}
          </option>
        ))}
      </datalist>
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Anuncio</th>
            <th className="px-3 py-2 text-right font-medium">Gasto (7 d)</th>
            <th className="px-3 py-2 text-right font-medium">Impresiones</th>
            <th className="px-3 py-2 font-medium">Visto</th>
            <th className="px-3 py-2 font-medium">Versión correcta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ads.map((a) => (
            <Row key={a.adId} ad={a} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ ad }: { ad: Ad }) {
  const { exec, pending } = useAction()
  const [code, setCode] = useState("")
  return (
    <tr className="border-t">
      <td className="max-w-md px-3 py-2">
        <div className="truncate font-medium" title={ad.name}>
          {ad.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {ad.account} · ad {ad.adId} · el código <span className="font-mono">{ad.code}</span> no existe
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{money(ad.spendCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{int(ad.impressions)}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{timeAgo(ad.lastSeenAt)}</td>
      <td className="px-3 py-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void exec(() => assignAd(ad.adId, code), "Anuncio vinculado")
          }}
        >
          <Input list="approved-versions" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Elige la versión…" className="w-44 font-mono" />
          <Button size="sm" type="submit" disabled={!code.trim() || pending}>
            <Link2 /> Asignar
          </Button>
        </form>
      </td>
      <td className="px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          title="No corresponde a ningún creativo (se oculta)"
          onClick={() => void exec(() => setAdIgnored(ad.adId, true), "Anuncio ignorado")}
        >
          <EyeOff /> Ignorar
        </Button>
      </td>
    </tr>
  )
}
