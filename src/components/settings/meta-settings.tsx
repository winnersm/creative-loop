"use client"

import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { dateTime, timeAgo } from "@/lib/format"
import { deleteMetaConnection, forceMetaSync, saveMetaConnection, setAdAccountEnabled } from "@/server/meta"
import { Field } from "./offers-settings"

type Connection = {
  id: string
  name: string
  tokenLast4: string
  lastCheckedAt: Date | null
  lastError: string | null
  createdAt: Date
  adAccounts: { id: string; accountId: string; name: string; currency: string; enabled: boolean; lastSyncAt: Date | null }[]
}

/** F-105 · Conexión con Meta en solo lectura. */
export function MetaSettings({ connections }: { connections: Connection[] }) {
  const { exec, pending } = useAction()
  const [name, setName] = useState("")
  const [token, setToken] = useState("")

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {!connections.length && (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No hay ninguna conexión. Añade un token con permiso <code>ads_read</code>.
          </p>
        )}
        {connections.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-3 border-b px-3 py-2">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  token …{c.tokenLast4} · comprobado {c.lastCheckedAt ? timeAgo(c.lastCheckedAt) : "nunca"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => {
                  if (confirm(`¿Quitar la conexión «${c.name}»? Los datos ya sincronizados se conservan.`))
                    void exec(() => deleteMetaConnection(c.id), "Conexión eliminada")
                }}
              >
                <Trash2 /> Quitar
              </Button>
            </div>
            {c.lastError && <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">{c.lastError}</div>}
            <ul className="divide-y">
              {c.adAccounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Switch checked={a.enabled} disabled={pending} onCheckedChange={(v) => void exec(() => setAdAccountEnabled(a.id, v))} />
                  <div>
                    <div className={a.enabled ? "font-medium" : "text-muted-foreground"}>{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.accountId} · {a.currency}
                    </div>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {a.lastSyncAt ? `sincronizada ${dateTime(a.lastSyncAt)}` : a.enabled ? "pendiente de sincronizar" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {connections.length > 0 && (
          <Button variant="outline" disabled={pending} onClick={() => void exec(() => forceMetaSync(), "Sincronización en cola. Revisa Rendimiento en un minuto.")}>
            Sincronizar ahora
          </Button>
        )}
      </div>
      <form
        className="h-fit space-y-3 rounded-lg border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const n = await exec(() => saveMetaConnection(name, token), (count) => `Conectado: ${count} cuenta(s). Activa las que quieras sincronizar.`)
          if (n !== null) {
            setName("")
            setToken("")
          }
        }}
      >
        <h3 className="font-semibold">Conectar Meta (solo lectura)</h3>
        <Field label="Nombre (opcional)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business Manager principal" />
        </Field>
        <Field label="Token de acceso">
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        </Field>
        <p className="text-xs text-muted-foreground">
          Se guarda cifrado (AES-256-GCM). La app solo lee estadísticas; nunca crea ni modifica anuncios.
        </p>
        <Button type="submit" className="w-full" disabled={pending || !token.trim()}>
          Conectar
        </Button>
      </form>
    </div>
  )
}
