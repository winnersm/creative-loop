"use client"

import { CheckCircle2, Sparkles, Trash2 } from "lucide-react"
import { useState } from "react"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { dateTime } from "@/lib/format"
import { removeAiKey, saveAiSettings, testAiConnection } from "@/server/ai"
import { Field } from "./offers-settings"

type Status = { source: "app" | "env" | "none"; last4: string | null; model: string; updatedAt: Date | null }

const MODEL_LABEL: Record<string, string> = {
  "deepseek-flash": "DeepSeek Flash (rápido y barato)",
  "deepseek-v4-pro": "DeepSeek V4 Pro (más calidad)",
}

/** Clave y modelo de IA, guardados cifrados desde la app. */
export function AiSettings({ status, models }: { status: Status; models: readonly string[] }) {
  const { exec, pending } = useAction()
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(status.model)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="h-fit space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-[var(--status-testing)]" />
          <h3 className="font-semibold">DeepSeek</h3>
        </div>
        {status.source === "none" ? (
          <p className="text-sm text-muted-foreground">Sin configurar. Las funciones de IA están desactivadas.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-[var(--status-done)]" />
            <span>
              Clave …{status.last4}
              {status.source === "app"
                ? ` · guardada en la app${status.updatedAt ? ` (${dateTime(status.updatedAt)})` : ""}`
                : " · leída del archivo .env"}
            </span>
            <span className="text-muted-foreground">· modelo {MODEL_LABEL[status.model] ?? status.model}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {status.source !== "none" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void exec(() => testAiConnection(), "Conexión correcta con DeepSeek")}>
              Probar conexión
            </Button>
          )}
          {status.source === "app" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                if (confirm("¿Quitar la clave de DeepSeek? Las funciones de IA dejarán de funcionar."))
                  void exec(() => removeAiKey(), "Clave eliminada")
              }}
            >
              <Trash2 /> Quitar clave
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Uso actual: propuestas de texto principal y titular en la pestaña Indicaciones de cada creativo. DeepSeek recibe
          la oferta, la hipótesis, las etiquetas y las indicaciones de esa creativo.
        </p>
      </div>

      <form
        className="h-fit space-y-3 rounded-lg border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const ok = await exec(
            () => saveAiSettings({ apiKey: apiKey || undefined, model }),
            apiKey ? "Clave comprobada y guardada" : "Modelo guardado",
          )
          if (ok !== null) setApiKey("")
        }}
      >
        <h3 className="font-semibold">{status.source === "app" ? "Cambiar configuración" : "Conectar DeepSeek"}</h3>
        <Field label={status.source === "none" ? "Clave de API" : "Nueva clave de API (opcional)"}>
          <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        </Field>
        <Field label="Modelo">
          <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m] ?? m}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <p className="text-xs text-muted-foreground">
          La clave se prueba antes de guardarse y se almacena cifrada (AES-256-GCM). Tiene prioridad sobre el archivo .env.
        </p>
        <Button type="submit" className="w-full" disabled={pending || (status.source === "none" && !apiKey.trim())}>
          {pending ? "Comprobando…" : "Guardar"}
        </Button>
      </form>
    </div>
  )
}
