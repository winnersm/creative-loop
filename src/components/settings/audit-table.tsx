import { dateTime } from "@/lib/format"

type Row = {
  id: string
  action: string
  entity: string
  entityId: string | null
  data: unknown
  createdAt: Date
  user: { name: string } | null
}

const ACTION_LABEL: Record<string, string> = {
  "asset.approved": "Creativo aprobado",
  "asset.rejected": "Creativo rechazado",
  "asset.archived": "Creativo archivado",
  "asset.in_review": "Creativo reabierto",
  "ai.copy": "Copy propuesto con IA",
  "ai.winner": "Ganador analizado con IA",
  "ai.variations": "Variaciones creadas con IA",
  "ai.script_translate": "Guion traducido con IA",
  "ai.settings": "Configuración de IA guardada",
  "ai.key_removed": "Clave de IA eliminada",
  "concept.offer": "Oferta de concepto cambiada",
  "concept.archive": "Concepto archivado",
  "concept.unarchive": "Concepto desarchivado",
  "deployment.assign": "Anuncio asignado a mano",
  "meta.connect": "Meta conectado",
  "meta.disconnect": "Meta desconectado",
  "meta_ad.ignore": "Anuncio ignorado",
  "meta_ad.unignore": "Anuncio recuperado",
  "offer.create": "Oferta creada",
  "offer.gate": "Bloqueo de oferta cambiado",
  "offer.locale": "País o idioma de oferta cambiado",
  "performance.override": "Rendimiento forzado",
  "tag.activate": "Etiqueta activada",
  "tag.deactivate": "Etiqueta desactivada",
  "user.create": "Usuario creado",
  "user.update": "Usuario modificado",
  "user.password_changed": "Contraseña cambiada por su dueño",
  "winner_rule.save": "Regla de ganador guardada",
  "winner_rule.delete": "Regla de ganador eliminada",
}

/** F-1501 · Registro de acciones sensibles. */
export function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Cuándo</th>
            <th className="px-3 py-2 font-medium">Quién</th>
            <th className="px-3 py-2 font-medium">Acción</th>
            <th className="px-3 py-2 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground">{dateTime(r.createdAt)}</td>
              <td className="px-3 py-1.5">{r.user?.name ?? "Sistema"}</td>
              <td className="px-3 py-1.5 text-sm">{ACTION_LABEL[r.action] ?? r.action}</td>
              <td className="px-3 py-1.5 font-mono text-xs break-all text-muted-foreground">
                {JSON.stringify(r.data) === "{}" ? r.entityId : JSON.stringify(r.data)}
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                Sin registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
