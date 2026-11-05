# Creative Loop — Stack, arquitectura, diseño y MVP

**Versión:** 0.3
**Fecha:** 2026-09-16
**Base:** `FEATURES.md` v0.2 · `SPEC.md` v1.0
**Estado:** MVP-A y MVP-B implementados y funcionando en local (ver §8).

**Cambios v0.3 (al implementar):**
- Subida reanudable propia en lugar de Uppy (su versión actual cambió la API multipart).
- Meta se lee con `fetch` directo a la Graph API (solo GET), sin el SDK.
- MinIO se descarga de `quay.io` (ya no está en Docker Hub).
- Regex del token corregida (§8.2).

**Cambios v0.2:**
- App **propia** en esta carpeta, con el mismo stack (frameworks y librerías) que la app de Meta en producción.
- Desarrollo **100 % local con Docker**. El despliegue se decide después.
- Diseño inspirado en **Monday** (§3).

---

## 1. Enfoque

- Creative Loop es una **app independiente** que vive en `Creative Loops/`.
- Usa el mismo stack que la app de Meta (Next.js 16 + Prisma 7 + Postgres + Redis/BullMQ + Docker). **Solo el stack:** no se copia su código, su estructura ni sus archivos.
- Todo corre en local con `docker compose up`, incluido el almacenamiento de archivos (MinIO, compatible con S3).
- **Envío a producción: pendiente.** Opciones cuando llegue el momento: el servidor Hetzner con Traefik o integrarla como módulo de `winners-platform`. El código se escribe para que ambas sean posibles: la configuración va por variables de entorno y el almacenamiento usa la API S3.

---

## 2. Stack

### 2.1 Stack base (el mismo que la app de Meta)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) + React 19 + TypeScript |
| UI | shadcn/ui + Tailwind CSS 4, lucide-react, sonner, next-themes |
| Formularios | react-hook-form + zod 4 |
| Tablas y datos | TanStack Table 8 + TanStack Query 5 |
| Estado de cliente | zustand |
| Auth | NextAuth v5 (credenciales + JWT) con bcryptjs |
| ORM y base | Prisma 7 (`@prisma/adapter-pg`) + PostgreSQL 16 |
| Cola y cron | Redis 7 + BullMQ 5 (jobs repetibles) |
| Worker | Proceso aparte en `worker/` (`tsx watch` en local) |
| Meta | Graph API con `fetch` (solo GET), **solo lectura** (`ads_read`) |
| Cifrado de tokens | AES-256-GCM con `node:crypto` |
| Gestor de paquetes | npm |
| Contenedores | Dockerfile multi-stage + Docker Compose |

### 2.2 Añadido para Creative Loop

| Necesidad | Elección | Por qué |
|---|---|---|
| Almacenamiento (local) | **MinIO** en Docker | API S3 idéntica a R2 y AWS. Pasar a producción solo cambia variables de entorno. |
| Almacenamiento (producción) | Cloudflare R2 (propuesto) | Sin coste por descarga. Se confirma al decidir el envío. |
| Cliente S3 | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | URLs firmadas para subir y reproducir. |
| Upload reanudable | Subidor propio (`version-uploader.tsx`): multipart S3 en partes de 10 MB, 3 en paralelo, reintentos, pausa sin conexión y reanudación | Subida directa del navegador al bucket. Uppy 5/6 cambió su API multipart y no aportaba. |
| Procesamiento de media | **ffmpeg / ffprobe** dentro de la imagen del worker | QA técnico, proxy 720p y thumbnails (sprite pendiente). |
| Reproductor | `<video>` nativo con controles propios + `requestVideoFrameCallback` | Frame a frame y marcadores sin librerías pesadas. |
| Drag and drop | `@dnd-kit` | Kanban y reordenar filas, como en Monday. |
| Tipografía | Figtree (Google Fonts, vía `next/font`) | Estilo cercano a Monday. |
| IA | DeepSeek (`deepseek-flash`) por `fetch` a `/chat/completions` en modo JSON | Elegido por Victor para probar. Primera función: propuestas de copy (texto principal y titular). |

### 2.3 Qué no se usa

- socket.io (basta con polling de TanStack Query).
- FunnelFlux, ni ninguna escritura en Meta.
- Servicios de video de terceros (Mux, Frame.io…).

---

## 3. Diseño: estilo Monday

La app debe **sentirse como un board de Monday**: tablas de colores, estados como celdas pintadas y todo editable en línea. Se toma la **inspiración visual**, no la marca: sin logo, nombre ni assets de Monday.

### 3.1 Estructura de pantalla

```
┌──────────┬───────────────────────────────────────────────────────────────┐
│ Creative │  Concepts · OF012 Immuno DE                         🔔  (VA)  │
│ Loop     │  [Tabla] [Kanban] [Calendario] [Performance]    + Nuevo asset │
│          │  🔍 Buscar   👤 Persona   ⚙ Filtro   ↕ Ordenar   ▣ Agrupar    │
│ 🏠 Inicio│───────────────────────────────────────────────────────────────│
│ ✅ Tareas│ ▾ C082 · Descubrimiento accidental                   (verde)  │
│ 🎬 Review│ ┃ Asset     │ Editor │ Estado        │ Deadline │ Prio │ Perf  │
│ 📁 Concep│ ┃ C082-A01  │  (AN)  │█ Aprobado    █│ 12 sep   │█Alta█│█Loser█│
│ 📊 Perfor│ ┃ C082-A02  │  (CA)  │█ En revisión █│ 16 sep   │█Med.█│  —    │
│ 📚 Biblio│ ┃ C082-A03  │  (AN)  │█ Editando    █│ 18 sep   │█Baja█│  —    │
│ ⚙ Ajustes│ ┃ + Añadir asset                                              │
│          │ ┃           │        │ ▓▓▓▓▓░░░ (barra resumen de estados)     │
│          │ ▾ C083 · Antes y después                            (morado)  │
└──────────┴───────────────────────────────────────────────────────────────┘
```

| Concepto Monday | En Creative Loop |
|---|---|
| Workspace | Oferta (`OF###`) |
| Board | Lista de concepts de una oferta (o todas) |
| Group (bloque de color plegable) | **Concept** (`C###`), con su color |
| Item (fila) | **Asset** (`C###-A##`) |
| Columna Status | Estado de producción y estado de performance |
| Columna People | Editor asignado (avatar con iniciales) |
| Columna Date / Priority | Deadline y prioridad |
| Columna Tags | Tags controlados (chips) |
| Panel lateral del item ("Updates") | **Drawer del asset**: brief, versiones, comentarios, historial |
| Summary row | Barra de distribución de estados al pie de cada grupo |
| Vistas del board | Tabla · Kanban · Calendario · Performance |

### 3.2 Reglas visuales

- **Status como celda llena:** el estado pinta toda la celda con texto blanco centrado. Clic → menú de colores con las opciones válidas **según la máquina de estados** (no se ofrecen transiciones prohibidas).
- **Edición en línea:** editor, deadline, prioridad y tags se cambian sin salir de la tabla.
- **Grupos:** barra de color a la izquierda, título editable, plegables y con contador.
- **Densidad:** filas de ~36 px, bordes finos grises y hover suave.
- **Botón primario azul**, esquinas redondeadas (4–8 px) y sombras mínimas.
- **Modo claro por defecto**, con modo oscuro vía next-themes.
- La **pantalla de revisión** (reproductor) es la excepción: pantalla completa y fondo oscuro para ver el video.

### 3.3 Paleta (tokens en `globals.css`)

| Token | Uso | Color aprox. |
|---|---|---|
| `--primary` | Botones, enlaces, selección | `#0073EA` |
| `--status-done` | Aprobado · Winner | `#00C875` |
| `--status-working` | Editando | `#FDAB3D` |
| `--status-review` | En revisión | `#579BFC` |
| `--status-stuck` | Cambios pedidos · Loser | `#DF2F4A` |
| `--status-brief` | Brief (sin empezar) | `#C4C4C4` |
| `--status-testing` | Testing | `#9D50DD` |
| `--status-rejected` | Rechazado | `#333333` |
| `--status-muted` | Archivado · Inconclusive | `#797E93` |
| `--prio-high` / `--prio-med` / `--prio-low` | Prioridad | `#401694` / `#5559DF` / `#579BFC` |
| `--group-*` | Colores de concept (rotativos) | verde, morado, azul, naranja, rosa… |

Los colores de estado se definen **una sola vez** (mapa `status → token`) y se usan en tabla, kanban, badges y gráficos.

### 3.4 Vistas en el MVP

| Vista | MVP |
|---|---|
| Tabla agrupada por concept | ✅ |
| Kanban por estado de producción (drag = transición válida) | ✅ |
| My Tasks del editor (misma tabla, filtrada a sus assets) | ✅ |
| Drawer del asset | ✅ |
| Calendario de deadlines | Después |
| Dashboard con widgets | Después (Home del manager simple en el MVP) |

---

## 4. Arquitectura local

```
Navegador ──► app (Next.js :3100) ──► postgres (:5440)
   │             │   └──────────────► redis (:6385)
   │             │ encola jobs              ▲
   │             ▼                          │
   │          worker (BullMQ + ffmpeg) ─────┘
   │             │ lee original / escribe derivados
   ▼             ▼
minio (:9000 API · :9001 consola)
  ├─ creative-originals
  └─ creative-derived
                 ▲
worker ──► Meta Graph API (ads_read, solo lectura)
```

Los puertos se eligen para no chocar con otros proyectos locales y se pueden cambiar en `.env`.

### 4.1 `docker-compose.yml` (local)

| Servicio | Imagen / build | Notas |
|---|---|---|
| `app` | build del repo, `npm run dev` | Código montado como volumen (hot reload) |
| `worker` | mismo build + ffmpeg, `npm run worker` | Concurrencia 1 para ffmpeg |
| `transcriber` | build de `transcriber/` (Python 3.12 + faster-whisper + ffmpeg) | Extractor de guion. Sin puerto publicado ni volumen; solo la red de Docker. Ver §8.3d |
| `postgres` | `postgres:16-alpine` | Volumen persistente + healthcheck |
| `redis` | `redis:7-alpine` | Volumen persistente + healthcheck |
| `minio` | `minio/minio` | Consola en :9001 |
| `minio-init` | `minio/mc` | Crea los buckets y la política CORS al arrancar, y termina |

Se añadirá un `docker-compose.prod.yml` cuando se decida el envío.

### 4.2 Estructura del repo

```
Creative Loops/
  src/
    app/            rutas (App Router)
    components/     ui/ (shadcn) + board/ (tabla, grupos, celdas de estado, kanban)
    lib/            prisma, auth, s3, queue, redis, meta-api, crypto, permissions, codes
  worker/           jobs: process-version, meta-sync, winner-engine
  prisma/           schema.prisma, migraciones, seed.ts
  docs/             FEATURES, SPEC, STACK (se mueven aquí al empezar)
  Dockerfile
  docker-compose.yml
  .env.example
```

### 4.3 Colas BullMQ

| Cola | Disparo | Qué hace |
|---|---|---|
| `process-version` | Al completar un upload | ffprobe → QA → proxy 720p → thumbnails → sprite → notificación |
| `meta-sync` | Cada 6 h + botón manual (owner) | Insights a nivel de anuncio (últimos 7 días), detección del token `cl-…`, deployments, `PerformanceDaily` |
| `winner-engine` | Diario 08:00 | Evalúa los assets en `testing` y guarda cada evaluación |

### 4.4 Modelo de datos (MVP)

`User` · `Offer` · `TagDimension` · `TagValue` · `Concept` · `ConceptTag` · `Asset` · `AssetTagOverride` · `Version` · `QaCheck` · `Comment` · `CommentReply` · `StatusEvent` · `MetaConnection` · `AdAccount` · `Deployment` · `PerformanceDaily` · `WinnerRule` · `WinnerEvaluation` · `Notification` · `AuditLog`

- Códigos (`OF012`, `C082`, `C082-A03`, `V2`) generados con secuencias de Postgres e inmutables.
- `Asset.performanceStatus` solo lo escribe el motor de winners (o un override auditado).
- Dinero en céntimos (`Int`), fechas en UTC.
- Tokens de Meta cifrados con AES-256-GCM.

### 4.5 Permisos

- `User.role`: `OWNER` · `MANAGER` · `EDITOR` · `BUYER`.
- La matriz de `SPEC.md` §1 se aplica en el servidor (server actions y rutas API), no solo ocultando botones.
- Un editor solo ve sus assets y **nunca** recibe spend, CPA ni revenue: se filtra en la consulta.

---

## 5. MVP

**Objetivo:** cerrar el ciclo **brief → edición → revisión → lanzamiento manual → performance → winner**, en local, en **6 semanas**.

### 5.1 MVP-A · Producción (semanas 1–3)

| ID | Característica | Recorte |
|---|---|---|
| — | Docker local, auth, layout estilo Monday, seed | Base de todo |
| F-101–103 | Ofertas, gate de oferta y tags | Tags iniciales por seed |
| F-104 | Usuarios (invitar, rol, desactivar) | — |
| F-201–203 | Concepts como **grupos** del board | Filtros: oferta, estado, editor |
| F-301–307 | Assets como **filas**: alta, duplicar, herencia de tags, estados, historial, My Tasks, reasignar | Edición en línea |
| — | Vista Kanban | Drag solo a transiciones válidas |
| F-401 | Upload reanudable | — |
| F-402–403 | QA técnico y bloqueo | Sin LUFS ni subtítulos |
| F-404, F-407 | Proxy 720p, thumbnails, estado de procesamiento | Sprite opcional |
| F-501–503 | Cola de revisión, reproductor, comentarios por timestamp | Solo comentarios de punto |
| F-506–508 | Panel de QA, decisión, revisión de imágenes | Sin compliance |
| F-701, F-707 | Códigos y descarga del aprobado | — |
| F-1401, F-1501–1502 | Notificaciones in-app, auditoría y permisos | — |

### 5.2 MVP-B · Trazabilidad y performance (semanas 4–6)

| ID | Característica | Recorte |
|---|---|---|
| F-105 | Conexión con Meta (token cifrado, cuentas en solo lectura) | — |
| F-702–706 | Token, paquete de lanzamiento, deployments automáticos, "Anuncios sin asset", aprobados sin lanzar | — |
| F-801–804 | Sync de Insights, conversiones desde Meta, métricas unidas, vista Performance | Columna de performance en el board |
| F-806 | Estado del sync | — |
| F-901–903, F-907 | Motor de winners y etiqueta visible para el editor | Reglas globales + override por oferta |
| F-1201 | Home del manager | Sin capacidad de testing |

**Iteración en el MVP:** manual, con **Duplicar asset** sobre el winner.

### 5.3 Después del MVP

| Bloque | Características |
|---|---|
| v1.1 | Comparar versiones · exportar marcadores a Premiere/DaVinci · zonas seguras de Meta · curva de retención · comentarios de tramo · override y relanzar · digest diario · import CSV · vista Calendario |
| F3 | Iterar con IA · transcripción · OCR · compliance · biblioteca · métricas de equipo · árbol de iteraciones · comparativa por tag · capacidad de testing |
| Envío | `docker-compose.prod.yml`, R2, dominio y servidor |

### 5.4 Criterio de "MVP terminado" (en local)

1. `docker compose up` levanta todo desde cero y el seed crea un owner, un manager y 3 editores.
2. El manager crea un concept con 3 assets en la tabla y los asigna.
3. Un editor sube un video de 200 MB, corta la conexión y la subida se reanuda.
4. Un video con resolución incorrecta no se puede enviar a revisión.
5. El manager comenta con la tecla `C`, pide cambios, el editor sube V2 y el manager aprueba; el estado cambia de color en tabla y kanban.
6. Tras lanzar a mano en Meta con el ad name del paquete, el siguiente sync crea el deployment solo.
7. Un anuncio sin token aparece en la bandeja y se asigna a mano.
8. El motor marca winner o loser; el editor ve la etiqueta, pero no puede obtener spend ni CPA ni llamando a la API.

---

## 6. Variables de entorno (`.env.example`)

```ini
# App
APP_PORT=3100
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=            # openssl rand -base64 32
ENCRYPTION_KEY=             # openssl rand -hex 32 (no cambiar una vez usada)

# Postgres
POSTGRES_USER=creative
POSTGRES_PASSWORD=creative
POSTGRES_DB=creative_loop
POSTGRES_PORT=5440
DATABASE_URL=postgresql://creative:creative@postgres:5432/creative_loop

# Redis
REDIS_PORT=6385
REDIS_URL=redis://redis:6379

# Almacenamiento S3 (MinIO en local, R2 en producción)
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_ORIGINALS=creative-originals
S3_BUCKET_DERIVED=creative-derived
S3_FORCE_PATH_STYLE=true
MAX_UPLOAD_MB=2048
```

`S3_PUBLIC_ENDPOINT` existe porque el navegador no resuelve `minio`; las URLs firmadas deben apuntar a `localhost`.

```ini
# Extractor de guion
TRANSCRIBER_URL=http://transcriber:8000
MAX_SCRIPT_MB=100
MAX_SCRIPT_MINUTES=30
```

---

## 7. Decisiones pendientes

1. **Imágenes desde el día 1**, ¿o solo video?
2. **Recortes del MVP (§5):** ¿algo de "Después del MVP" es imprescindible?
3. **Reglas de winner y evento FTD por oferta** (`FEATURES.md` §5). Necesarias para validar el MVP-B.
4. **Meta en local:** ¿qué token y qué cuentas publicitarias usamos para probar el sync?
5. **Envío:** se decide cuando el MVP funcione en local.

---

## 8. Estado de la implementación (2026-09-16)

### 8.1 Verificado en local

Probado de punta a punta en el navegador y por HTTP:

| Criterio (§5.4) | Resultado |
|---|---|
| 1. `docker compose up` desde cero + seed | ✅ |
| 2. Concept con assets en la tabla y asignación | ✅ (C002 creado con 2 assets, uno de imagen) |
| 3. Subida de 15 MB por partes directa a MinIO | ✅ · probado con un fallo de red simulado (reintento automático) y recargando la página a mitad: «Reanudando: 1 de 2 partes» |
| 4. Video horizontal en un asset 9:16 no se puede enviar | ✅ (QA: aspect ratio bloqueante) |
| 5. Comentario con `C`, pedir cambios, V3, aprobar; color en tabla y kanban | ✅ · aprobar con un `must` abierto se rechaza |
| 6. Sync crea el deployment por token | ✅ contra la Graph API simulada (`scripts/mock-meta.mts`) · **falta probar con Meta real** |
| 7. Anuncio sin token en la bandeja y asignación manual | ✅ |
| 8. Motor marca winner; el editor ve la etiqueta pero no el dinero | ✅ · por HTTP: el editor recibe 307/404 en páginas ajenas y ningún campo de dinero en sus respuestas |

Tests automáticos (`npm test`): 28 casos de estados, permisos, token, ad name, reglas de winner, métricas y QA.

### 8.2 Desviaciones respecto al SPEC

- **Regex del token.** La del SPEC (`\bcl-…\b`) no reconoce su propio ejemplo `…20260915__cl-C082A03V2`, porque `_` es carácter de palabra y no hay límite `\b` entre `_` y `c`. Se usa `(?<![A-Za-z0-9])cl-(C\d{3,5})(A\d{2,3})(V\d{1,2})(?![A-Za-z0-9])`.
- **Comentarios nuevos** solo los abre el manager/owner; el editor responde y resuelve en los suyos (matriz de SPEC §1).
- **Resolución mínima del control técnico:** sigue la especificación de Meta para Reels (ancho mínimo 500 px, o 250 px si el video dura menos de 30 s; 600 px en imágenes). Por debajo de 1080 px solo hay aviso. Tras cambiar reglas: `docker compose exec app npx tsx scripts/recheck-qa.mts`.
- **Relanzar inconclusive (F-905)** marca `relaunchRequestedAt` y el asset vuelve a «Aprobados sin lanzar».

### 8.3 Huecos cerrados después

- Editar conceptos (lápiz en la cabecera de cada grupo del Tablero).
- Mosaico de miniaturas del timeline con vista previa al pasar el ratón.
- Cambiar el formato de una pieza recalcula el control técnico.
- Editar nombre y email de usuarios.
- «Entrar como…» para probar roles (solo desarrollo).

- **IA:** propuestas de copy con DeepSeek en la pestaña Indicaciones (probado con la clave real).
- **Guion del video** en texto libre por pieza (pestaña Indicaciones); se copia al duplicar.
- **Analizar y crear variaciones** (piezas ganadoras o en prueba): la IA explica por qué funciona, con el guion, el copy y las métricas, y propone de 1 a 5 variaciones con guion completo; cada una cambia una sola etiqueta. El análisis se guarda y se ve en la pestaña Rendimiento. Es una excepción consciente al «por qué ganó automático» del SPEC: se presenta como hipótesis y nada se crea sin revisión.

### 8.3b Octubre 2026 (en producción)

- **Variaciones anidadas.** «Crear variaciones» (fila, panel y página del creativo) abre el alta enlazada al original (`iteratedFromId`). En el Tablero cuelgan de su original, plegables y con un solo nivel: la variación de una variación cuelga del original («de A07»). Si un filtro deja fuera al original, sale atenuado como contexto. «Duplicar» ya no enlaza.
- **Descartar y archivar.** Archivar exige motivo de lista cerrada (`Asset.archiveReason`). «Descartar» = archivar como «Descartado sin testear», solo si nunca se lanzó. Archivar ya no quita la versión aprobada.
- **Archivar conceptos** (`Concept.archivedAt`). Sus creativos sin lanzar en curso se archivan con él («Concepto archivado»); los lanzados se siguen midiendo. Desarchivar no reabre los creativos.
- **«Aprobados sin lanzar»** agrupado por concepto, con variaciones anidadas, Descartar / Descartar todos y Traducir.
- **Nombre del concepto editable en línea**; el código del concepto ya no se muestra junto al nombre (queda en el tooltip).
- **Similares** (pestaña del creativo): hasta 5 creativos juzgados de la misma oferta con etiquetas en común (`src/lib/similar.ts`).
- **Guion en español e inglés.** En Indicaciones, «Traducir con IA» guarda la traducción del guion junto a él (inglés → español o español → inglés; `scriptTranslation*`). La puede pedir cualquiera que vea el creativo y avisa si el guion cambió después. (Una primera versión que adaptaba creativos a otra oferta se retiró sin haberse usado.)
- **Descarga** con el token de seguimiento como nombre (`cl-C082A03V2.mp4`).

### 8.3c Noviembre 2026 · ajustes de Elkin

- **La oferta pasa del concepto al creativo** (`Asset.offerId`, opcional). La migración `20261104190000_oferta_por_creativo_etiquetas_notas` copió a cada creativo la oferta de su concepto y quitó `Concept.offerId`, `geo` y `language` (se leen de la oferta del creativo). Columna «Oferta» en el tablero; filtro por oferta = conceptos con algún creativo de esa oferta. Sin oferta no se aprueba (`checkTransition`), la IA pide oferta, el motor de ganadores lo salta y las métricas no cuentan conversiones.
- **Mover creativos entre conceptos** (`moveAsset`, regla pura en `planMove` de `src/lib/variations.ts`). Códigos nuevos en destino; avisos viejos reapuntados.
- **Etiquetas de equipo** (`AssetLabel`, relación N:M con `Asset`), colores en `LABEL_COLORS` con test de contraste.
- **Notas** (`Asset.notes`, `updateAssetNotes`).
- **Avisos de asignación** con la oferta al lado del concepto (`assignedBody` en `src/lib/messages.ts`): «Vince group · OF012 Inmuno DE».
- **Menú ⋯** del creativo junto a su código, siempre visible; los del concepto con su color.
- `getLookups` ya no manda CPA objetivo ni payout de las ofertas al navegador (llegaba también a editores).

### 8.3d Noviembre 2026 · extractor de guion

Herramienta **independiente** de los creativos (rama `script-extract`): se sube un video y se descarga el guion. No guarda nada.

- **Servicio `transcriber/`** (Python, FastAPI, faster-whisper modelo `base` en CPU int8, ffmpeg del sistema). `POST /transcribe` recibe el archivo como cuerpo crudo, lo guarda en una carpeta temporal, extrae el audio (mono 16 kHz, con corrección de canales en antifase), transcribe con detección automática de idioma y devuelve el texto con segmentos. El video se borra en cuanto hay audio y la carpeta entera en un `finally`; al arrancar se limpia lo que haya quedado de un corte. Una transcripción a la vez: las demás esperan turno, y la subida no ocupa ese turno. Con 3 peticiones entre subidas y transcripciones (`MAX_SCRIPT_PENDING`), la siguiente recibe 429. El modelo se descarga al construir la imagen y en marcha no sale a internet.
- **Ruta `POST /api/script`** (`src/app/api/script/route.ts`): comprueba sesión y permiso `script.extract` (propietario, responsable creativo y editor) y reenvía el cuerpo en streaming al servicio. **Excepción a «los archivos no pasan por Next.js»**: sin almacenamiento intermedio, el video tiene que viajar por la app. Está excluida del `proxy` (que limita el cuerpo) y comprueba la sesión ella misma.
- **Pantalla `/script`** (`src/components/script-extractor.tsx`): subida con progreso, animación de carga (`src/components/script-processing.tsx`, CSS en `globals.css`), reproductor sincronizado con el guion (el video se reproduce desde el archivo local con una URL `blob:`, sin pedirlo al servidor), búsqueda, vista por frases o texto corrido, copiar texto y descarga en TXT, SRT, VTT y JSON. Los formatos son lógica pura en `src/lib/script-export.ts` (con tests). El resultado vive solo en el navegador.
- **Límites:** `MAX_SCRIPT_MB` (100) y `MAX_SCRIPT_MINUTES` (30), aplicados por la app y por el servicio. Los 100 MB vienen de Cloudflare, que está delante de producción y responde 413 por encima de ese tamaño. Cloudflare también corta si la respuesta tarda más de unos 100 s, así que los videos largos pueden fallar aunque pesen poco.
- **Producción:** el compose del servidor (`/opt/apps/creative/`) tiene que añadir el servicio `transcriber` (build desde `transcriber/`) y `TRANSCRIBER_URL` en `app`. Necesita unos 1,5 GB de RAM libres y unos 2 GB de disco para la imagen. Si hay un proxy inverso delante, su límite de cuerpo y su tiempo de espera deben cubrir el máximo configurado.

### 8.4 Pendiente

- **Extractor de guion:** probarlo con un video real en Docker y desplegarlo (compose de producción, RAM del servidor y límites del proxy inverso).

- Probar el sync con un token real de Meta y confirmar qué `action_type` es el FTD de cada oferta.
- Validar las reglas de winner por defecto con Victor.
- Las versiones subidas antes del 2026-09-16 19:00 no tienen mosaico del timeline (solo las nuevas).
- `docker-compose.prod.yml` y R2 cuando se decida el envío.
