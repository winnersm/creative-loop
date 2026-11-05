import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  logging: {
    // En desarrollo Next escribe los argumentos de cada server action en el log.
    // Se desactiva porque algunas reciben secretos (clave de IA, token de Meta).
    serverFunctions: false,
  },
}

export default nextConfig
