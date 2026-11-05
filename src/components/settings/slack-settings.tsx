"use client"

import { CheckCircle2, MessageSquare, Send, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { dateTime } from "@/lib/format"
import { ROLE_LABEL } from "@/lib/status"
import type { SlackStatus } from "@/lib/slack-events"
import type { SlackChannel } from "@/lib/slack"
import { connectSlack, disconnectSlackAction, saveSlackTechChannel, saveSlackUserChannels, slackChannels, testSlackChannel } from "@/server/settings"

export type SlackUser = { id: string; name: string; role: "OWNER" | "MANAGER" | "EDITOR" | "BUYER"; slackChannelId: string | null }

/** Conexión con Slack y el canal privado de cada persona. */
export function SlackSettings({ status, users }: { status: SlackStatus; users: SlackUser[] }) {
  const { exec, pending } = useAction()
  const [token, setToken] = useState("")
  const [channels, setChannels] = useState<SlackChannel[] | null>(null)
  const initial = Object.fromEntries(users.map((u) => [u.id, u.slackChannelId ?? ""]))
  const [routes, setRoutes] = useState<Record<string, string>>(initial)
  const [tech, setTech] = useState(status.techChannel ?? "")
  const dirty = JSON.stringify(routes) !== JSON.stringify(initial)

  async function loadChannels() {
    const list = await exec(() => slackChannels())
    if (list) setChannels(list)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-5 text-[var(--status-review)]" />
          <h3 className="font-semibold">Slack</h3>
        </div>

        {status.connected ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-[var(--status-done)]" />
            <span>
              Conectado a <strong>{status.team}</strong>
              {status.updatedAt ? ` · desde ${dateTime(status.updatedAt)}` : ""}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin conectar. Crea una app en Slack con el permiso <code>chat:write</code>, instálala y pega aquí el token del bot.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="slack-token">Token del bot</Label>
            <Input
              id="slack-token"
              className="w-80"
              type="password"
              placeholder="xoxb-…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={pending || token.trim().length < 10}
            onClick={async () => {
              const team = await exec(() => connectSlack(token), (t) => `Conectado a ${t}`)
              if (team) setToken("")
            }}
          >
            {status.connected ? "Cambiar token" : "Conectar"}
          </Button>
          {status.connected && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                if (confirm("¿Desconectar Slack? Se borran el token y los canales configurados."))
                  void exec(() => disconnectSlackAction(), "Slack desconectado")
              }}
            >
              Desconectar
            </Button>
          )}
        </div>
      </div>

      {status.connected && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Canal de cada persona</h3>
            <Button size="sm" variant="outline" disabled={pending} onClick={loadChannels}>
              {channels ? "Actualizar canales" : "Cargar canales"}
            </Button>
          </div>

          <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <span>
              Cada persona recibe en su canal lo mismo que ve en la campana de la app, ni más ni menos: su creativo asignado,
              los comentarios en su trabajo, sus versiones procesadas. Quien no tenga canal sigue solo con la campana.
            </span>
          </p>

          {!channels && <p className="text-sm text-muted-foreground">Pulsa «Cargar canales» para asignarlos.</p>}

          {channels && (
            <>
              {!channels.length && (
                <p className="text-sm text-muted-foreground">
                  El bot no ve ningún canal. Entra en cada canal de Slack y escribe <code>/invite @Creative Loop</code>.
                </p>
              )}
              <div className="grid gap-2">
                {users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
                    <span className="min-w-56 flex-1 text-sm">
                      {u.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span>
                    </span>
                    <NativeSelect
                      aria-label={`Canal de ${u.name}`}
                      className="w-64"
                      value={routes[u.id] ?? ""}
                      onChange={(e) => setRoutes({ ...routes, [u.id]: e.target.value })}
                    >
                      <option value="">Sin canal (solo la campana)</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.private ? "🔒" : "#"}
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Mandar un mensaje de prueba a este canal"
                      disabled={pending || !routes[u.id]}
                      onClick={() => void exec(() => testSlackChannel(routes[u.id]), "Mensaje de prueba enviado")}
                    >
                      <Send />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="grid gap-1">
                  <span className="text-sm font-medium">Canal técnico</span>
                  <span className="max-w-lg text-xs text-muted-foreground">
                    Errores de sincronización con Meta, versiones que fallan al procesarse y anuncios con gasto sin creativo.
                    Esto no llega al canal de nadie: solo aquí.
                  </span>
                </div>
                <NativeSelect aria-label="Canal técnico" className="w-64" value={tech} onChange={(e) => setTech(e.target.value)}>
                  <option value="">Sin canal técnico</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.private ? "🔒" : "#"}
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                {tech !== (status.techChannel ?? "") && (
                  <Button size="sm" disabled={pending} onClick={() => void exec(() => saveSlackTechChannel(tech), "Canal técnico guardado")}>
                    Guardar
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Mandar un mensaje de prueba"
                  disabled={pending || !tech}
                  onClick={() => void exec(() => testSlackChannel(tech), "Mensaje de prueba enviado")}
                >
                  <Send />
                </Button>
              </div>
              {dirty && (
                <Button size="sm" disabled={pending} onClick={() => void exec(() => saveSlackUserChannels(routes), "Canales guardados")}>
                  Guardar canales
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
