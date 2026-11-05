"use client"

import { Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { Pill } from "@/components/board/cells"
import { useAction } from "@/components/board/use-asset-actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import type { Offer } from "@/generated/prisma/client"
import { money } from "@/lib/format"
import { saveOffer, type OfferInput } from "@/server/settings"

const empty: OfferInput = {
  name: "",
  product: "",
  geo: "",
  language: "",
  targetCpa: 0,
  payout: 0,
  conversionEvent: "purchase",
  gate: "OK",
  gateNote: "",
  active: true,
}

export function OffersSettings({ offers }: { offers: Offer[] }) {
  const [editing, setEditing] = useState<{ id: string | null; form: OfferInput } | null>(null)
  const { exec, pending } = useAction()

  const open = (o?: Offer) =>
    setEditing({
      id: o?.id ?? null,
      form: o
        ? {
            name: o.name,
            product: o.product,
            geo: o.geo,
            language: o.language,
            targetCpa: o.targetCpaCents / 100,
            payout: o.payoutCents / 100,
            conversionEvent: o.conversionEvent,
            gate: o.gate,
            gateNote: o.gateNote ?? "",
            active: o.active,
          }
        : empty,
    })

  const f = editing?.form
  const set = (patch: Partial<OfferInput>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } })

  return (
    <div className="space-y-3">
      <Button onClick={() => open()}>
        <Plus /> Nueva oferta
      </Button>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground">
            <tr>
              {["Código", "Nombre", "Producto", "GEO · idioma", "CPA objetivo", "Pago por conversión", "Evento", "Cumplimiento", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className={`border-t ${o.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-medium">{o.code}</td>
                <td className="px-3 py-2">{o.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{o.product}</td>
                <td className="px-3 py-2">
                  {o.geo} · {o.language}
                </td>
                <td className="px-3 py-2 tabular-nums">{money(o.targetCpaCents)}</td>
                <td className="px-3 py-2 tabular-nums">{money(o.payoutCents)}</td>
                <td className="px-3 py-2 font-mono text-xs">{o.conversionEvent}</td>
                <td className="px-3 py-2">
                  {o.gate === "OK" ? (
                    <Pill label="OK" color="var(--status-done)" />
                  ) : (
                    <Pill label="Bloqueada" color="var(--status-stuck)" />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="icon-sm" variant="ghost" title="Editar oferta" aria-label="Editar oferta" onClick={() => open(o)}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar oferta" : "Nueva oferta"}</DialogTitle>
          </DialogHeader>
          {f && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" className="col-span-2">
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Producto (nombre del anuncio)">
                <Input value={f.product} onChange={(e) => set({ product: e.target.value })} placeholder="IMMUNO" />
              </Field>
              <Field label="Evento de conversión (Meta)">
                <Input value={f.conversionEvent} onChange={(e) => set({ conversionEvent: e.target.value })} placeholder="purchase" />
              </Field>
              <Field label="GEO">
                <Input value={f.geo} onChange={(e) => set({ geo: e.target.value })} placeholder="DE" />
              </Field>
              <Field label="Idioma">
                <Input value={f.language} onChange={(e) => set({ language: e.target.value })} placeholder="de" />
              </Field>
              <Field label="CPA objetivo (USD)">
                <Input type="number" step="0.01" value={String(f.targetCpa)} onChange={(e) => set({ targetCpa: e.target.value })} />
              </Field>
              <Field label="Pago por conversión (USD)">
                <Input type="number" step="0.01" value={String(f.payout)} onChange={(e) => set({ payout: e.target.value })} />
              </Field>
              <Field label="Bloqueo por cumplimiento">
                <NativeSelect value={f.gate} onChange={(e) => set({ gate: e.target.value as "OK" | "BLOCKED" })}>
                  <option value="OK">OK</option>
                  <option value="BLOCKED">Bloqueada (no se aprueba nada)</option>
                </NativeSelect>
              </Field>
              <Field label="Nota de cumplimiento">
                <Input value={f.gateNote ?? ""} onChange={(e) => set({ gateNote: e.target.value })} />
              </Field>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Activa
              </label>
              <p className="col-span-2 text-xs text-muted-foreground">
                El evento es el <code>action_type</code> de Meta que cuenta como conversión (p. ej. <code>purchase</code>,{" "}
                <code>lead</code> u <code>offsite_conversion.fb_pixel_custom</code>). Si Meta no da valor, los ingresos = conversiones × pago por conversión.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                if (!editing) return
                const ok = await exec(() => saveOffer(editing.id, editing.form), "Oferta guardada")
                if (ok !== null) setEditing(null)
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
