import "server-only"
import type { LaunchData } from "@/components/asset/launch-package"
import { suggestedAdName, tokenFromVersionCode } from "@/lib/codes"

/** Datos del paquete de lanzamiento (F-702, F-703). */
export function buildLaunchData(input: {
  asset: {
    id: string
    code: string
    primaryText: string
    headline: string
    cta: string
    markedLaunchedAt: Date | null
    /** Aprobar exige oferta; si aun así faltara, el ad name lo deja a la vista. */
    offer: { product: string; geo: string } | null
  }
  version: { id: string; code: string }
  angle: string
}): LaunchData {
  const { asset, version } = input
  return {
    assetId: asset.id,
    assetCode: asset.code,
    versionId: version.id,
    versionCode: version.code,
    token: tokenFromVersionCode(version.code),
    adName: suggestedAdName({
      product: asset.offer?.product ?? "SIN OFERTA",
      geo: asset.offer?.geo ?? "XX",
      angle: input.angle,
      date: new Date(),
      versionCode: version.code,
    }),
    primaryText: asset.primaryText,
    headline: asset.headline,
    cta: asset.cta,
    markedLaunchedAt: asset.markedLaunchedAt?.toISOString() ?? null,
  }
}
