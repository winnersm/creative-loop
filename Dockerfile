# Creative Loop
# - dev:  imagen para desarrollo local (docker-compose.yml). El código se monta como volumen.
# - prod: imagen para el servidor (Hetzner). El código se copia y se compila.

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dev
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Producción ──────────────────────────────────────────────────────────────
# Se instalan también las dependencias de desarrollo: hacen falta para compilar
# y en marcha para el worker (tsx).
FROM base AS prod
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next inlinea las variables NEXT_PUBLIC_* al compilar, así que llegan por build arg.
ARG NEXT_PUBLIC_APP_TZ=Europe/Madrid
ENV NEXT_PUBLIC_APP_TZ=$NEXT_PUBLIC_APP_TZ
COPY package.json package-lock.json ./
# --include=dev: con NODE_ENV=production npm las omitiría, y Tailwind y tsx
# hacen falta para compilar y para el worker.
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["npm", "start"]
