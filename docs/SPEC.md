# Creative Loop — Especificación funcional y técnica

**Versión:** 1.0 (propuesta)
**Fecha:** 2026-09-15
**Estado:** listo para construir el MVP (fases 1–3, 12 semanas)
**Base:** `performance_creative_loop_master_context.md` + evaluación crítica

---

## 0. Qué es (y qué no es)

**Creative Loop** es una herramienta interna que conecta cuatro cosas:

1. **Producción:** brief, editor, versiones y revisión con comentarios por timestamp.
2. **Trazabilidad:** cada creativo tiene un código que viaja hasta el anuncio y hasta el revenue.
3. **Performance:** datos de Meta y FunnelFlux unidos por anuncio, con un motor de winners basado en reglas.
4. **Iteración:** a partir de un winner se crean variaciones controladas, cambiando una variable a la vez.

**La promesa del producto:** *de cualquier anuncio sé qué creativo es, quién lo hizo, qué hipótesis probaba y cuánto revenue generó; y convertir un winner en su próxima tanda de variaciones me lleva 2 minutos.*

**Qué NO es:** un generador de video con IA, un clon de Frame.io, un dashboard de Meta Ads ni un SaaS multi-tenant.

### Alcance

| Dentro (12 semanas) | Fuera (≥ 90 días o nunca) |
|---|---|
| Concepts, assets, versions, códigos | Google Ads / YouTube / Demand Gen |
| Upload, QA técnico, proxy, thumbnails | Creative DNA inferido por IA |
| Revisión con comentarios por timestamp | "Por qué ganó" automático |
| Vista del editor | Creación automática de tareas sin click humano |
| Tags controlados | Publicación automática de anuncios |
| Integración FBLaunch (código en ad name) | Generación de imagen/video |
| Sync de Meta Insights + FunnelFlux | Predictive scoring |
| Motor de winners con reglas | Multi-tenant, rol cliente |
| Biblioteca con búsqueda | Chequeo de consistencia con la landing |
| Iterar winner con borrador de brief por IA | |
| Transcripción, OCR de texto en pantalla | |
| Compliance: gate de oferta + flags | |
| Métricas de equipo y operación | |

---

## 1. Usuarios y permisos

| Rol | Quién | Qué hace |
|---|---|---|
| `owner` | Victor | Todo, incluido configuración, integraciones y reglas |
| `manager` | Creative manager (puede ser el owner) | Concepts, briefs, asignación, revisión, aprobación, iteración |
| `editor` | 3 editores | Sus tareas, subir versiones, responder comentarios |
| `buyer` *(fase 3, opcional)* | Media buyer | Ver aprobados listos para lanzar, performance, pedir creativos |

### Matriz de permisos

| Acción | owner | manager | editor | buyer |
|---|:-:|:-:|:-:|:-:|
| Crear/editar ofertas y reglas de winner | ✅ | ❌ | ❌ | ❌ |
| Crear concept / asset (brief) | ✅ | ✅ | ❌ | ➕ solicitar |
| Asignar editor, deadline, prioridad | ✅ | ✅ | ❌ | ❌ |
| Ver assets | todos | todos | solo asignados | aprobados |
| Subir versión | ✅ | ✅ | solo asignados | ❌ |
| Comentar | ✅ | ✅ | responder/resolver en los suyos | ❌ |
| Aprobar / pedir cambios / rechazar | ✅ | ✅ | ❌ | ❌ |
| Descartar un finding de compliance | ✅ | ✅ (con motivo) | ❌ | ❌ |
| Ver spend / CPA / revenue | ✅ | ✅ | ❌ | ✅ |
| Ver etiqueta winner/loser de sus assets | ✅ | ✅ | ✅ | ✅ |
| Ver métricas de equipo | ✅ | ✅ | solo las propias | ❌ |
| Iterar winner | ✅ | ✅ | ❌ | ❌ |

> Los editores ven **si** su creativo ganó, no su CPA. Así se refuerza el aprendizaje sin generar rankings injustos (el CPA depende de oferta, buying y landing).

---

## 2. Entidades y códigos

```
Offer ── Concept (hipótesis) ── Asset (pieza concreta = tarea) ── Version (V1, V2…)
                                    │
                                    └── Deployment (anuncio en Meta) ── PerformanceDaily
```

| Entidad | Qué es | Código |
|---|---|---|
| **Offer** | Oferta + GEO + canales permitidos | `OF012` |
| **Concept** | Una hipótesis creativa: ángulo + mensaje central | `C082` |
| **Asset** | Una pieza para un canal y formato; **también es la tarea del editor** | `C082-A03` |
| **Version** | Un archivo subido para ese asset | `C082-A03-V2` |
| **Deployment** | Un anuncio en la plataforma que usa una versión aprobada | `ad_id` de Meta |

### Token de trazabilidad en el ad name

Todo anuncio lanzado lleva el token **`cl-C082A03V2`** al final del nombre:

```
IMMUNO_DE_CURIOSITY_20260915__cl-C082A03V2
```

- Regex de parseo: `\bcl-(C\d{3,5})(A\d{2,3})(V\d{1,2})\b`
- **FBLaunch** lo inyecta automáticamente al seleccionar el asset aprobado (ver §8.1).
- El sync de Meta crea el `deployment` automáticamente al detectar el token.
- Los anuncios sin token aparecen en una bandeja **"Anuncios sin asset"** para asignarlos a mano. Esa bandeja debería quedar vacía; si no lo está, el loop se rompe.

### Tags controlados (vocabulario cerrado)

Se definen en el brief. Son la base de todo aprendizaje posterior, así que **nada de texto libre**.

| Dimensión | Valores iniciales (editables por owner) |
|---|---|
| `angle` | curiosity, problem_solution, social_proof, authority, fear_of_missing_out, comparison, story |
| `hook_type` | question, bold_statement, pattern_interrupt, testimonial, visual_shock, news_style |
| `format` | ugc, talking_head, voiceover_broll, slideshow, screen_recording, static_image, carousel |
| `persona` | female_18_34, female_35_54, male_18_34, male_35_54, senior, none |
| `cta` | learn_more, sign_up, watch_video, get_offer |
| `pacing` | fast, medium, slow |

Un concept define tags por defecto; cada asset los hereda y puede sobrescribir **una** dimensión (la variable que prueba).

---

## 3. Máquinas de estado

Hay **dos ejes independientes**.

### 3.1 Producción (en `asset.production_status`)

```
brief ──► in_progress ──► in_review ──► approved ──► archived
                ▲              │
                │              ├──► changes_requested ──┐
                │              │                        │
                └──────────────┴────────────────────────┘ (nueva versión)
                               └──► rejected ──► archived
```

| Transición | Quién | Condición |
|---|---|---|
| `brief → in_progress` | editor | Pulsa "Empezar" (registra el inicio real) |
| `in_progress → in_review` | editor | Versión procesada, **sin fallos técnicos bloqueantes**, pulsa "Enviar a revisión" |
| `changes_requested → in_review` | editor | Sube una versión nueva y la envía |
| `in_review → changes_requested` | manager | Al menos 1 comentario abierto |
| `in_review → approved` | manager | 0 comentarios `must` abiertos **y** 0 findings `red` abiertos **y** oferta con gate OK |
| `in_review → rejected` | manager | Motivo obligatorio |
| `approved → in_review` | manager | Reabrir (motivo obligatorio) |
| `* → archived` | manager | — |

Cada transición escribe en `status_events`. De ahí salen todas las métricas de tiempos.

### 3.2 Performance (en `asset.performance_status`, calculado)

```
not_launched ──► testing ──► winner
                        ├──► loser
                        └──► inconclusive
```

Lo calcula el motor de winners (§9). Nunca se edita a mano, salvo con un override del owner que queda registrado.

### 3.3 QA y compliance

**No son estados.** Son resultados adjuntos a cada versión (`qa_result`, `compliance_findings`) que **bloquean o permiten** transiciones.

---

## 4. Flujos principales

### 4.1 Crear trabajo (manager)

1. **Nuevo concept:** oferta, GEO, idioma, título, **hipótesis** (1 frase: "Si abrimos con X, el CTR sube porque Y"), tags por defecto y referencias.
2. **Añadir assets** al concept, uno por fila de una tabla editable: canal (Meta), formato (9:16, 4:5, 1:1, 16:9), tipo (video/imagen), editor, deadline, prioridad, brief/script y la variable que cambia respecto a la hermana (opcional).
3. Guardar: se crean N assets en `brief` y cada editor recibe una notificación.

> Atajo: **"Duplicar asset"** crea una fila hermana con todo copiado, lista para cambiar una variable.

### 4.2 Producir (editor)

1. Abre **My Tasks** y entra al asset.
2. Pulsa **Empezar**.
3. Sube el archivo arrastrándolo. Es un upload multipart directo a R2, con barra de progreso y reanudable.
4. Se procesa (30–90 s) y aparecen el **checklist de QA técnico**, la transcripción y los flags de compliance.
5. Si hay fallos bloqueantes (resolución, duración, archivo corrupto), la versión no se puede enviar y se muestra el motivo.
6. **Enviar a revisión**: el manager recibe la notificación.

### 4.3 Revisar (manager)

1. Abre la **cola de revisión**, ordenada por prioridad y deadline.
2. Se abre el reproductor con el proxy de 720p. Tecla `C` pausa y abre un comentario en el timestamp actual.
3. Cada comentario tiene severidad: `must` (bloquea la aprobación), `should` o `nit`.
4. Panel lateral: QA, findings de compliance y transcript clicable (saltar al tiempo).
5. Botón **Comparar con V anterior**: dos reproductores sincronizados.
6. Decisión: **Aprobar / Pedir cambios / Rechazar**.

### 4.4 Lanzar (buyer/owner en FBLaunch)

1. En FBLaunch, **"Elegir creativo de Creative Loop"** lista los assets `approved`.
2. FBLaunch descarga la versión aprobada con URL firmada, la sube a Meta y arma el ad name con el token `cl-…`.
3. FBLaunch llama a `POST /api/deployments` con `ad_id`, `adset_id`, `campaign_id` y `version_id`.
4. Si se lanza fuera de FBLaunch, el sync diario detecta el token y crea el deployment igual.

### 4.5 Medir (automático)

1. **Cada 6 h:** sync de Meta Insights a nivel ad, re-leyendo los últimos 7 días porque la atribución se actualiza.
2. **Cada 6 h:** sync de conversiones y revenue de FunnelFlux, agrupado por `ad_id`.
3. **Diario 08:00:** el motor de winners evalúa los assets en `testing`.
4. **Diario 09:00:** digest del manager con nuevos winners/losers/inconclusive, revisiones pendientes y tareas atrasadas.

### 4.6 Iterar winner (manager)

1. Asset `winner` → botón **Iterar**.
2. Modal:
   - **Variable a cambiar** (una sola): hook, opening visual, persona, CTA, pacing, duración o formato.
   - **Número de variantes** (1–5), con límite por capacidad de testing (§9.4).
   - **Editores** y deadline.
   - Opción **"Borrador con IA"**.
3. Si se pide el borrador, la IA devuelve N briefs estructurados (§10.4) que el manager edita.
4. **Crear**: se generan N assets en `brief` bajo el mismo concept, con `iterated_from_asset_id` y `variable_changed`. Los tags se heredan salvo el de la variable cambiada.

> Así el experimento queda **controlado**: una variable por tanda. Es lo único que permite hablar de causalidad con algo de base.

---

## 5. Pantallas

### 5.1 Navegación

**Manager/owner:** Home · Concepts · Review queue · Library · Performance · Team · Settings
**Editor:** My Tasks · Library (solo lectura, sin métricas de dinero) · Mis métricas

### 5.2 Home del manager

```
┌────────────────────────────────────────────────────────────────────┐
│ Hoy                                                   15 sep 2026   │
├──────────────┬──────────────┬──────────────┬──────────────┬────────┤
│ Por revisar  │ Atrasados    │ En edición   │ Aprobados sin│ Anuncios│
│     7        │     2        │     11       │ lanzar   4   │ sin asset 3│
├──────────────┴──────────────┴──────────────┴──────────────┴────────┤
│ Novedades de performance (últimas 24 h)                             │
│  🏆 C082-A03  winner   CPA $6,10 vs $11 objetivo · 29 FTD  [Iterar] │
│  ✖  C079-A01  loser    $340 spend · CPA $31                         │
│  ?  C075-A02  inconclusive · 14 días, $48 spend         [Relanzar]  │
├────────────────────────────────────────────────────────────────────┤
│ Capacidad de testing esta semana: 4 de 6 slots usados               │
├────────────────────────────────────────────────────────────────────┤
│ Cola de revisión (orden: prioridad, deadline)                       │
│  C084-A01-V1  Carlos   9:16  ⚠ 1 yellow   hace 2 h     [Revisar]    │
│  C083-A02-V2  Ana      4:5   ✓            hace 5 h     [Revisar]    │
└────────────────────────────────────────────────────────────────────┘
```

### 5.3 Concepts (lista + detalle)

**Lista:** tabla con código, título, oferta, GEO, nº de assets por estado (chips), winners/testeados y última actividad. Filtros: oferta, GEO, estado, tag.

**Detalle de concept:**

```
C082 · "Descubrimiento accidental" · OF012 · DE · de
Hipótesis: Abrir con una pregunta sobre un hábito diario sube hook rate vs. bold statement.
Tags por defecto: curiosity · question · ugc · female_35_54 · learn_more · fast
───────────────────────────────────────────────────────────────────────────
Asset       Formato  Variable      Editor  Estado        Perf.     Hook rate  CPA
C082-A01    9:16     —             Ana     approved      loser     21%        $19
C082-A02    9:16     hook_type     Carlos  approved      testing   34%        —
C082-A03    9:16     persona       Ana     approved      winner 🏆  38%        $6,1
C082-A04    4:5      —             Luis    in_review     —         —          —
[+ Añadir asset] [Duplicar seleccionado]
───────────────────────────────────────────────────────────────────────────
Árbol de iteraciones:  A01 ─┬─ A02 (hook_type)
                            └─ A03 (persona) ─┬─ A05 (hook) ...
```

### 5.4 Asset / Review (pantalla central)

```
┌──────────────────────────────────────────┬─────────────────────────────┐
│  C082-A03 · V2 ▾   [Comparar con V1]     │  Comentarios (3 abiertos)   │
│ ┌──────────────────────────────────────┐ │  ● 00:03.2 must  Manager    │
│ │                                      │ │    "Hook más rápido, cortar │
│ │           reproductor 9:16           │ │     los 2 primeros frames"  │
│ │                                      │ │    ↳ Carlos: hecho en V3    │
│ └──────────────────────────────────────┘ │  ● 00:12.0 should           │
│ ▕━━●━━━━━◆━━━━━━━━◆━━━━━━━━━━━━━━━━━▏     │  ● 00:20.4 nit              │
│  0:03   ◆ = comentario   ▲ = flag         │  [C] nuevo comentario aquí  │
│  ⏮ -1f  ▶  +1f ⏭   0.5x 1x   🔊           ├─────────────────────────────┤
├──────────────────────────────────────────┤  QA técnico        ✓ 7/7    │
│ Transcript (clic = saltar)               │  Compliance       ⚠ 1 yellow│
│ 00:00 Hast du dich jemals gefragt...     │   00:07 término "garantiert"│
│ 00:04 ...                                │   regla R-DE-014  [