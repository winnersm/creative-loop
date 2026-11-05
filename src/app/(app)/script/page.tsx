import { PageHeader } from "@/components/page-header"
import { ScriptExtractor } from "@/components/script-extractor"
import { requirePermission } from "@/lib/session"

export const metadata = { title: "Extractor de guion · Creative Loop" }

/** Herramienta independiente: sube un video, descarga el guion. No guarda nada. */
export default async function ScriptPage() {
  await requirePermission("script.extract")
  return (
    <div>
      <PageHeader
        title="Extractor de guion"
        description="Sube un video y descarga lo que se dice, con marcas de tiempo. El archivo se borra al terminar y no queda nada guardado."
      />
      <div className="p-6">
        <ScriptExtractor
          maxMb={Number(process.env.MAX_SCRIPT_MB ?? 500)}
          maxMinutes={Number(process.env.MAX_SCRIPT_MINUTES ?? 30)}
        />
      </div>
    </div>
  )
}
