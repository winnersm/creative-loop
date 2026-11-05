// Textos de avisos compartidos por el servidor y el worker. Sin dependencias de servidor.

type OfferRef = { code: string; name: string } | null | undefined

/** «OF012 Inmuno DE», o «sin oferta». */
export function offerLabel(offer: OfferRef) {
  return offer ? `${offer.code} ${offer.name}` : "sin oferta"
}

/**
 * Cuerpo del aviso de creativo asignado: el concepto y, al lado, la oferta.
 * Así el editor sabe para qué oferta trabaja sin abrir la app.
 */
export function assignedBody(conceptTitle: string, offer: OfferRef) {
  return `${conceptTitle} · ${offerLabel(offer)}`
}
