# Creative Loop — Características del producto

**Versión:** 0.2 (borrador)
**Fecha:** 2026-09-16
**Cambios v0.2:**
- Sin integración con FunnelFlux.
- La app no lanza anuncios en Meta, ni directamente ni a través de FBLaunch. El lanzamiento es manual y la app solo **lee** datos de Meta.
**Alcance del documento:** solo **qué hace** la app. El stack, la arquitectura y la infraestructura se definen después, en un documento aparte.
**Fuente:** `SPEC.md` v1.0. El SPEC está cortado en §5.4. Lo que viene después (motor de winners, IA, compliance, biblioteca, métricas) lo he completado como **propuesta** y está marcado con 🟡.

---

## 1. Visión

Creative Loop es una herramienta interna que cierra el ciclo **brief → producción → revisión → lanzamiento → performance → iteración**.

**Promesa:** de cualquier anuncio sé qué creativo es, quién lo hizo, qué hipótesis probaba y cuánto revenue generó. Además, convertir un winner en su siguiente tanda de variaciones me lleva 2 minutos.

**Qué no es:**
- un generador de video con IA;
- un clon de Frame.io;
- un dashboard de Meta Ads;
- un SaaS multi-tenant.

### Fases

| Fase | Semanas | Objetivo |
|---|---|---|
| **F1 · Producción** | 1–4 | Concepts, assets, upload, QA, revisión y tags |
| **F2 · Trazabilidad y performance** | 5–8 | Token en el ad name, sync de Meta en solo lectura, motor de winners |
| **F3 · Iteración e inteligencia** | 9–12 | Iterar con IA, transcripción y OCR, compliance, biblioteca y métricas de equipo |

---

## 2. Usuarios

| Rol | Quién | Resumen |
|---|---|---|
| `owner` | Victor | Todo, incluida la configuración, las integraciones y las reglas |
| `manager` | Creative manager | Crea el trabajo, lo revisa, lo aprueba y lo itera |
| `editor` | 3 editores | Trabaja sus tareas, sube versiones y responde comentarios |
| `buyer` *(F3, opcional)* | Media buyer | Ve lo aprobado y la performance, y pide creativos |

**Principio:** el editor ve **si** su creativo ganó, pero nunca ve el CPA, el spend ni el revenue.

La matriz completa de permisos está en `SPEC.md` §1.

---

## 3. Módulos y características

Formato de cada característica: **ID · nombre · fase**, seguido de su descripción y sus reglas.

---

### M1 · Ofertas y configuración

- **F-101 · Gestión de ofertas · F1.** Crear y editar ofertas con código `OF###`, nombre, GEO, idioma, canales permitidos, **CPA objetivo**, evento de conversión (FTD, lead…) y payout. Solo el owner puede hacerlo.
- **F-102 · Gate de oferta · F1.** Cada oferta tiene un estado de compliance (`ok` / `bloqueada`). Si la oferta está bloqueada, **ningún asset de esa oferta puede aprobarse**. Un creativo **sin oferta** tampoco se puede aprobar: el ad name necesita su producto y su GEO.
- **F-103 · Vocabulario de tags · F1.** El owner edita los valores permitidos de cada dimensión: `angle`, `hook_type`, `format`, `persona`, `cta` y `pacing`.
  - No se permite texto libre.
  - Un valor en uso no se borra; solo se desactiva.
- **F-104 · Gestión de usuarios · F1.** Invitar usuarios, asignar su rol y desactivarlos.
- **F-108 · Cambiar la contraseña propia · F1.** Cualquier rol, desde el menú del avatar. Pide la contraseña actual y queda en la auditoría. Quien la olvide, se la reinicia el propietario desde Ajustes → Usuarios.
- **F-105 · Conexión con Meta · F2.** Pantalla para conectar las cuentas publicitarias de Meta **en solo lectura** (Insights), con el estado del último sync y sus errores.
- **F-106 · Reglas de winner · F2.** Se configuran por oferta, con un valor por defecto global (ver M9).
- **F-107 · Capacidad de testing · F2.** Número de slots de test por semana, global o por oferta.

---

### M2 · Concepts (hipótesis)

- **F-201 · Crear concept · F1.** Campos del concept (desde 2026-11-04 **no lleva oferta**: va en cada creativo, ver F-309):
  - título;
  - **hipótesis**, obligatoria y de una frase: "Si abrimos con X, sube Y porque Z";
  - tags por defecto, **opcionales**: se pueden rellenar después, desde el concepto;
  - referencias (links y archivos), que heredan todos sus creativos.
  - Se genera el código `C###`.
- **F-202 · Lista de concepts · F1.** Tabla con estas columnas:
  - código, título, oferta y GEO;
  - chips con el número de assets por estado;
  - winners / testeados;
  - última actividad.
  - Se puede filtrar por oferta, GEO, estado y tag.
- **F-203 · Detalle de concept · F1.** Cabecera con la hipótesis, los tags y las ofertas de sus creativos, y tabla de assets con: oferta, editor, estado de producción, fecha límite, prioridad, variable, etiquetas, notas, estado de performance, hook rate y CPA. El menú de cada creativo (⋯) va junto a su código, siempre visible.
- **F-204 · Árbol de iteraciones · F3.** Vista de qué asset nació de cuál y qué variable cambió en cada rama.
- **F-205 · Aprendizaje del concept · F3 🟡.** Campo de conclusión que llena el manager: la hipótesis se marca como `confirmada`, `refutada` o `sin datos`, con una nota. Alimenta la biblioteca.

---

### M3 · Assets (creativos = tareas)

- **F-301 · Alta masiva de assets · F1.** Tabla editable dentro del concept, con una fila por creativo. Cada fila lleva:
  - canal y formato (9:16, 4:5, 1:1 o 16:9);
  - tipo (video o imagen);
  - editor, deadline y prioridad;
  - indicaciones para el editor y, en los creativos de video, el guion (dos campos distintos, en la segunda línea de cada fila);
  - variable que cambia (opcional).
  - Al guardar se crean N assets `C###-A##` en estado `brief`.
- **F-302 · Duplicar asset · F1.** Crea una fila hermana con todo copiado, lista para cambiar una variable.
- **F-303 · Herencia de tags · F1.** El asset hereda los tags del concept y **solo puede sobrescribir una dimensión**, que es la variable que prueba.
- **F-304 · Máquina de estados de producción · F1.** Los estados son `brief → in_progress → in_review → approved / changes_requested / rejected → archived`, con las condiciones que define `SPEC.md` §3.1.
  - Rechazar un asset o reabrir uno aprobado exige un motivo.
- **F-305 · Historial de estados · F1.** Cada transición queda registrada con quién la hizo, cuándo, desde qué estado, a qué estado y el motivo.
- **F-306 · My Tasks (editor) · F1.** Lista de las tareas asignadas al editor, agrupada por estado y ordenada por deadline y prioridad. Tiene un botón **Empezar**, que registra el inicio real del trabajo.
- **F-307 · Reasignar y cambiar deadline · F1.** El manager puede hacerlo en cualquier momento, y el cambio queda en el historial.
- **F-309 · Oferta del creativo · F1.** La oferta (y con ella producto, GEO, idioma, CPA objetivo y evento de conversión) es de cada creativo, no del concepto: un mismo concepto puede probarse en varias ofertas. Se elige en el alta o en la columna «Oferta» del tablero. Es opcional mientras se produce, obligatoria para aprobar y **fija una vez lanzado**. Las variaciones y los duplicados heredan la del original.
- **F-310 · Mover a otro concepto · F1.** Menú del creativo → «Mover a otro concepto…». Se mueve con todas sus variaciones y recibe **códigos nuevos** del concepto de destino (`C005-A01` → `C007-A04`, y sus versiones igual), porque el código lleva el concepto dentro. Solo si nada de la familia está lanzado: su token ya estaría en un anuncio de Meta. Una variación no se mueve sola. El código antiguo queda en el historial y en la auditoría.
- **F-311 · Etiquetas de equipo · F1.** Columna «Etiquetas» con selección múltiple (UGC, urgente, para test…). Lista cerrada con color que el propietario mantiene en Ajustes → Etiquetas; una en uso no se borra, se desactiva. Son distintas de las etiquetas del concepto (ángulo, gancho…), que siguen igual.
- **F-312 · Notas del creativo · F1.** Columna «Notas» en texto libre. La editan el responsable creativo, el propietario y el editor asignado. No lleva dinero.
- **F-308 · Referencias del creativo · F1.** Cada creativo puede tener sus propias referencias, en la pestaña Indicaciones. **Se suman a las del concepto, no las sustituyen:** el panel las muestra en dos grupos, «de este creativo» y «del concepto». Al duplicar un creativo se copian con él.

---

### M4 · Upload y procesamiento de versiones

- **F-401 · Upload robusto · F1.**
  - Se arrastra el archivo y se ve una barra de progreso.
  - Soporta archivos grandes y la subida **se puede reanudar** si se corta.
  - Cada subida crea una versión `V1`, `V2`…
- **F-402 · QA técnico automático · F1.** Checklist por versión:
  - resolución y aspect ratio frente al formato pedido;
  - duración dentro del rango del canal;
  - códec y contenedor válidos;
  - archivo no corrupto;
  - audio presente (si aplica);
  - peso máximo;
  - FPS;
  - **volumen del audio (LUFS)**: aviso si está muy bajo o satura;
  - **subtítulos incrustados** (vía OCR, F3): aviso si el video no tiene, porque en Meta la mayoría lo ve sin sonido.
  - Cada check es `bloqueante` o `advertencia`.
- **F-403 · Bloqueo por QA · F1.** Una versión con fallos bloqueantes **no puede enviarse a revisión**, y la app muestra el motivo.
- **F-404 · Proxy y thumbnails · F1.** Se genera una versión ligera (720p) para revisar rápido, junto con los thumbnails y el sprite de la línea de tiempo.
- **F-405 · Transcripción · F3.** Transcripción con timestamps en el idioma del concept.
- **F-406 · OCR de texto en pantalla · F3.** Extrae el texto que aparece en el video o la imagen, con su timestamp. Alimenta compliance y la búsqueda.
- **F-407 · Estado de procesamiento · F1.** Muestra "Procesando…" (30–90 s) y avisa al editor cuando termina.

---

### M5 · Revisión

- **F-501 · Cola de revisión · F1.** Muestra las versiones en `in_review`, ordenadas por prioridad y deadline, con:
  - el editor y el formato;
  - un resumen de QA y compliance;
  - el tiempo que llevan en espera.
- **F-502 · Reproductor de revisión · F1.**
  - Controles: play/pausa, avance frame a frame (±1f), velocidades 0.5x y 1x, y volumen.
  - La línea de tiempo marca los comentarios (◆) y los flags de compliance (▲).
  - Atajos de teclado.
- **F-503 · Comentarios por timestamp · F1.**
  - La tecla `C` pausa el video y abre un comentario en el segundo actual.
  - Un comentario puede marcar un **punto o un tramo** (inicio y fin, por ejemplo "de 0:03 a 0:05, cortar"). El tramo se puede reproducir en bucle.
  - Severidades: `must` (bloquea la aprobación), `should` y `nit`.
  - Los comentarios admiten hilo de respuestas y se marcan como resueltos.
- **F-504 · Anotación sobre el frame · F3 🟡.** Dibujar o marcar un área del frame dentro del comentario.
- **F-505 · Comparar versiones · F1.** Dos reproductores sincronizados (por ejemplo, V1 frente a V2) y los comentarios de la versión anterior con su estado.
- **F-506 · Panel lateral · F1.** Reúne el QA técnico, los findings de compliance y el transcript clicable (un clic salta a ese segundo).
- **F-507 · Decisión · F1.** Tres acciones:
  - **Aprobar:** solo si no quedan comentarios `must` abiertos, no quedan findings `red` y el gate de la oferta está OK.
  - **Pedir cambios:** exige al menos un comentario abierto.
  - **Rechazar:** exige un motivo.
- **F-508 · Revisión de imágenes · F1.** El mismo flujo, con comentarios anclados a un punto de la imagen en lugar de a un timestamp.
- **F-509 · Exportar comentarios como marcadores · F1.** Descarga los comentarios de una versión en un formato que Premiere y DaVinci importan como marcadores de su timeline (XML/EDL/CSV). El editor ve los cambios dentro de su programa, sin ir y volver al navegador.
- **F-510 · Zonas seguras de Meta · F1.** Capa opcional sobre el reproductor con la interfaz real de Reels, Stories y Feed: usuario, caption, botón CTA y botones laterales. Sirve para ver si algún texto o elemento clave queda tapado.
  - **F3:** aviso automático cuando el texto detectado por OCR (F-406) cae dentro de una zona tapada.

---

### M6 · Compliance

- **F-601 · Reglas de compliance · F3.** Catálogo de reglas con ID (por ejemplo `R-DE-014`), GEO, idioma, tipo (término prohibido, claim, disclaimer obligatorio…) y severidad (`red` / `yellow`).
- **F-602 · Detección automática · F3.** Revisa el transcript, el OCR y el copy del brief contra las reglas. Cada finding guarda el timestamp, el texto detectado y la regla que incumple.
- **F-603 · Bloqueo por findings `red` · F3.** Un finding `red` abierto impide aprobar la versión.
- **F-604 · Descartar un finding · F3.** Pueden hacerlo el owner y el manager, siempre con motivo, y queda registrado.
- **F-605 · Disclaimer requerido · F3 🟡.** Verifica que el texto legal obligatorio de la oferta o el GEO aparece en pantalla.

---

### M7 · Trazabilidad y lanzamiento

- **F-701 · Códigos jerárquicos · F1.** `OF###` → `C###` → `C###-A##` → `C###-A##-V#`. Son únicos, legibles e inmutables.
- **F-702 · Token en el ad name · F2.** El token tiene la forma `cl-C082A03V2` y se añade al final del nombre del anuncio.
  - Desde el asset aprobado se copia con un clic, junto con un ad name sugerido que sigue la convención `[PRODUCTO]_[GEO]_[ANGULO]_[FECHA]__cl-…`.
  - El buyer lanza el anuncio **a mano en Meta** y pega ese nombre.
- **F-703 · Paquete de lanzamiento · F2.** Botón "Preparar para lanzar" en el asset aprobado. Reúne en una sola vista:
  - la descarga del archivo con nombre estandarizado;
  - el ad name con el token;
  - el copy y el CTA del brief.
  - Se puede marcar como "lanzado" (opcional; el deployment real lo confirma el sync).
- **F-704 · Detección automática de deployments · F2.** El sync de Meta detecta el token en el nombre de cada anuncio y crea el deployment (`ad_id`, `adset_id`, `campaign_id`, `version_id`). Es **la única vía** para vincular anuncios de forma automática.
- **F-705 · Bandeja "Códigos sin creativo" · F2.** La sincronización solo trae de Meta los anuncios con token `cl-…` en el nombre (y los ya vinculados); el resto de la cuenta se ignora. La bandeja lista los anuncios cuyo token no corresponde a ninguna versión (mal escrito o inexistente), con su gasto de los últimos 7 días, para corregirlos o asignarlos a mano. Su contador aparece en el Home, y el objetivo es que esté en 0.
- **F-706 · Aprobados sin lanzar · F2.** Lista de assets aprobados que todavía no tienen deployment, con el tiempo que llevan esperando.
- **F-707 · Descarga del aprobado · F1.** Descarga del archivo original de la versión aprobada. El archivo se llama como el token de seguimiento (`cl-C082A03V2.mp4`).

---

### M8 · Performance

- **F-801 · Sync de Meta Insights (solo lectura) · F2.**
  - Se ejecuta cada 6 h, a nivel de anuncio.
  - Re-lee los últimos 7 días, porque la atribución cambia.
  - Métricas: spend, impresiones, clics, CTR, CPM, hook rate (reproducciones de 3 s / impresiones), hold rate y reproducciones al 25/50/75/100 %.
- **F-802 · Conversiones y revenue desde Meta · F2 🟡.** Salen de las `actions` y `action_values` que reporta Meta (pixel/CAPI).
  - Por cada oferta se elige qué evento cuenta como conversión (por ejemplo `purchase`, `lead` o un evento personalizado de FTD) y la ventana de atribución.
  - Si la oferta no tiene valor de conversión en Meta, el revenue se calcula como conversiones × payout de la oferta.
- **F-802b · Import manual de conversiones · F2 🟡.** Subida de un CSV (`ad_id` o token, fecha, conversiones, revenue) para corregir o completar lo que Meta no ve, como los datos que da la red de afiliados. Si existe un import, tiene prioridad sobre el dato de Meta.
- **F-803 · Métricas unidas · F2.** Todas las métricas se agregan por anuncio, versión, asset y concept:
  - spend, conversiones, CPA, revenue y ROAS;
  - hook rate y CTR.
- **F-804 · Vista Performance · F2.** Tabla de assets con sus métricas y su estado de performance.
  - Filtros: oferta, GEO, tag, editor, rango de fechas y estado.
  - Se puede ordenar por cualquier métrica.
- **F-805 · Comparativa por tag · F3 🟡.** Métricas agregadas por valor de tag (por ejemplo, hook rate medio de `question` frente a `bold_statement` dentro de una oferta), siempre mostrando el tamaño de la muestra.
- **F-807 · Curva de retención sobre el timeline · F2.** La curva de reproducción que da Meta (`video_play_curve_actions`) se dibuja sobre la línea de tiempo del reproductor de revisión.
  - Muestra en qué segundo se va la gente, junto a los comentarios.
  - Se puede comparar la curva de un winner con la de sus variantes.
  - El editor ve la curva, pero no las métricas de dinero.
- **F-806 · Estado del sync · F2.** Muestra la última ejecución, los errores y los datos pendientes, con un botón para forzar el sync (solo owner).

---

### M9 · Motor de winners 🟡

> El SPEC remite a §9, pero esa sección no está en el archivo. Esta es mi propuesta para validar.

- **F-901 · Estados de performance · F2.** `not_launched → testing → winner / loser / inconclusive`.
  - Los calcula el motor; nadie los edita a mano.
  - Un asset pasa a `testing` cuando tiene su primer deployment con gasto.
- **F-902 · Reglas configurables por oferta · F2.** Valores por defecto propuestos, con "objetivo" = CPA objetivo de la oferta:
  - **Winner:**
    - CPA ≤ 80 % del objetivo;
    - al menos N conversiones (por defecto 10);
    - spend ≥ 2 × objetivo.
  - **Loser:** cualquiera de estas dos condiciones:
    - spend ≥ 3 × objetivo **y** CPA > 130 % del objetivo;
    - spend ≥ 2 × objetivo con 0 conversiones.
  - **Inconclusive:** lleva X días en testing (por defecto 14) sin cumplir ninguna de las dos reglas; normalmente por falta de spend.
  - Gate de calidad opcional: el hook rate debe superar un mínimo para que el asset pueda ser winner.
- **F-903 · Evaluación diaria · F2.** Corre a las 08:00 y guarda cada evaluación con las métricas que usó, para poder auditarla.
- **F-904 · Override del owner · F2.** El owner puede forzar un estado, con motivo. El override queda visible y registrado.
- **F-905 · Relanzar inconclusive · F2.** Un botón devuelve el asset a la lista de aprobados sin lanzar para darle más presupuesto.
- **F-906 · Capacidad de testing · F2.** Contador de slots usados frente a disponibles en la semana. Iterar o crear assets por encima de la capacidad muestra un aviso (no bloquea, salvo que el owner lo configure así).
- **F-907 · Visibilidad para el editor · F2.** El editor ve la etiqueta winner / loser / inconclusive de sus assets, sin cifras de dinero.

---

### M10 · Iteración

- **F-1001 · Iterar winner · F3.** Botón en los assets `winner` que abre un modal con:
  - la **variable a cambiar**, una sola: hook, opening visual, persona, CTA, pacing, duración o formato;
  - el número de variantes (1–5), con un límite según la capacidad de testing;
  - los editores y el deadline.
- **F-1002 · Borrador con IA · F3.** A partir del winner (brief, transcript, tags y métricas), genera N briefs estructurados que el manager edita antes de crearlos. Cada brief propuesto 🟡 incluye:
  - título de la variante;
  - variable cambiada, con el valor anterior y el nuevo;
  - hook (texto y visual de los primeros 3 s);
  - script o estructura por segmentos;
  - notas para el editor (qué se mantiene idéntico);
  - tags resultantes.
- **F-1003 · Creación controlada · F3.** Genera N assets en `brief`, dentro del mismo concept, con `iterated_from` y `variable_changed`. Los tags se heredan, salvo el de la variable cambiada.
- **F-1004 · Nunca automático · F3.** La IA propone y el humano crea. No se generan tareas sin un clic.
- **F-1005 · Iterar desde loser o inconclusive · F3 🟡.** Opción secundaria, con el mismo flujo.

---

### M11 · Biblioteca

- **F-1101 · Biblioteca de creativos · F3.** Grid de thumbnails de todas las versiones aprobadas, con preview al pasar el ratón.
- **F-1102 · Búsqueda · F3.** Busca por código, título, hipótesis, texto del transcript y del OCR, y tags.
- **F-1103 · Filtros · F3.**
  - Oferta, GEO, idioma y formato.
  - Tags.
  - Estado de performance.
  - Editor.
  - Fecha.
- **F-1104 · Vista por rol · F3.** Manager y owner ven las métricas. El editor ve la biblioteca en solo lectura, sin dinero, pero con la etiqueta winner / loser.
- **F-1105 · Colecciones · F3 🟡.** Listas guardadas, por ejemplo "Mejores hooks DE" o "Referencias UGC".

---

### M12 · Home y operación

- **F-1201 · Home del manager · F1/F2.**
  - **KPIs del día:** por revisar, atrasados, en edición, aprobados sin lanzar y anuncios sin asset.
  - **Novedades de performance de las últimas 24 h:** winners (con el botón Iterar), losers e inconclusive (con el botón Relanzar).
  - Capacidad de testing de la semana.
  - Cola de revisión resumida.
- **F-1202 · Home del editor · F1 🟡.**
  - Mis tareas de hoy y las atrasadas.
  - Cambios pedidos pendientes.
  - Mis últimos resultados (winner / loser).

---

### M13 · Métricas de equipo

- **F-1301 · Tiempos de producción · F3.** Calculados a partir del historial de estados:
  - lead time del brief a la aprobación;
  - tiempo de edición;
  - tiempo en espera de revisión;
  - rondas de cambios por asset.
- **F-1302 · Métricas por editor · F3.**
  - Volumen entregado.
  - Cumplimiento de deadline.
  - Porcentaje de aprobación a la primera.
  - Tasa de winners (sobre los assets testeados).
- **F-1303 · Métricas de operación · F3.**
  - Tiempo de revisión del manager.
  - Assets aprobados sin lanzar (y cuántos días llevan).
  - Anuncios sin asset.
  - Tasa global de winners por oferta.
- **F-1304 · Mis métricas (editor) · F3.** El editor solo ve sus propios datos.

---

### M14 · Notificaciones

- **F-1401 · Notificaciones in-app · F1.** Avisan de:
  - un asset asignado;
  - una versión procesada;
  - una versión enviada a revisión;
  - cambios pedidos, aprobaciones y rechazos;
  - un comentario nuevo o una respuesta;
  - una deadline próxima o vencida.
- **F-1402 · Avisos en Slack · F1.** Los mismos avisos, publicados por un bot de Slack **en el canal privado de cada persona**. Se configura en **Ajustes → Slack**:
  - token del bot (`xoxb-…`), guardado cifrado y comprobado contra Slack antes de aceptarlo;
  - **un canal por persona**, elegido de la lista de canales donde está el bot; sin canal, esa persona solo recibe la campana de la app;
  - botón para mandar un mensaje de prueba a cada canal.
  - **El reparto por destinatario hereda los permisos de la app:** a nadie le llega a su canal nada que no viera ya en la campana, así que un editor sigue sin ver gasto ni CPA.
  - Se publican desde el worker, en una cola aparte con reintentos, para que un fallo de Slack no bloquee la app. Salen con 5 segundos de retraso para no anunciar algo que luego se deshace.
  - **No todo sale a Slack.** Se quedan dentro de la app los avisos de algo que la persona acaba de hacer (`version.uploaded`) y los comentarios sueltos, que llegan en ráfaga durante una revisión; lo accionable es el resumen que llega al pedir cambios. Una versión procesada solo interrumpe si trae fallos bloqueantes.
  - **Enviar a revisión avisa al responsable creativo**, no a los cuatro propietarios. Si no hay ningún responsable activo, entonces sí avisa a los propietarios.
  - **A un editor solo le llegan cuatro avisos al canal:** creativo asignado, enviado a revisión, cambios pedidos y aprobado. El resto le sigue llegando a la campana de la app.
  - **Canal técnico.** Los avisos técnicos —error al sincronizar con Meta, versión que falla al procesarse, control técnico con fallos bloqueantes y anuncios con gasto sin creativo— van a un canal propio y **a ningún canal personal**. Nadie del equipo recibe problemas de la herramienta en su canal.
- **F-1403 · Digest diario del manager · F2.** Se envía a las 09:00 con:
  - nuevos winners, losers e inconclusive;
  - revisiones pendientes;
  - tareas atrasadas;
  - anuncios sin asset.
- **F-1404 · Alertas de sync · F2.** Avisan al owner cuando falla un sync o cuando la bandeja de anuncios sin asset crece.

---

### M15 · Transversal

- **F-1501 · Auditoría · F1.** Registra quién hizo qué y cuándo en todas las acciones sensibles: aprobaciones, overrides, descartes de compliance y cambios de reglas.
- **F-1502 · Permisos por rol · F1.** Aplica la matriz de `SPEC.md` §1 en todas las pantallas y en la API.
- **F-1504 · Atajos de teclado · F1.** En la revisión y en la navegación principal.
- **F-1505 · Idioma de la interfaz · F1.** Español. El contenido de los creativos puede estar en cualquier idioma.

### M16 · Extractor de guion

Herramienta independiente: no se relaciona con conceptos, creativos ni versiones.

- **F-1601 · Extraer el guion de un video · F1.** Pantalla «Extractor de guion» (`/script`) para propietario, responsable creativo y editor. Se sube un video o audio (máximo 500 MB y 30 minutos) y se obtiene el texto completo con marcas de tiempo. El idioma se detecta solo. Se procesa un archivo a la vez.
- **F-1602 · Descarga y copia · F1.** Copiar el texto y descargar en TXT, SRT, VTT o JSON.
- **F-1603 · Sin almacenamiento · F1.** El archivo y su audio se borran al terminar, también si falla. No se guarda el video ni el guion; el resultado solo está en la pantalla. No usa S3 ni la base de datos y no escribe en `Asset.script`.

---

## 4. Fuera de alcance (≥ 90 días o nunca)

- Google Ads, YouTube y Demand Gen.
- Creative DNA inferido por IA.
- "Por qué ganó" automático.
- Predictive scoring.
- Creación automática de tareas sin un clic humano.
- Publicación de anuncios en Meta, directa o a través de FBLaunch.
- Integración con FunnelFlux.
- Generación de imagen o video.
- Multi-tenant y rol de cliente.
- Chequeo de consistencia con la landing.

---

## 5. Decisiones abiertas

1. **Reglas de winner (M9):** ¿sirven los umbrales propuestos (80 % / 130 % del objetivo, mínimo de 10 conversiones, 14 días) o ya tienes criterios propios?
2. **Fuente de conversiones sin FunnelFlux:** ¿el evento de Meta (pixel/CAPI) es suficientemente fiable? ¿Qué evento es el FTD en cada oferta? ¿Hace falta el import manual por CSV (F-802b)?
3. **Capacidad de testing:** ¿cuántos slots por semana? ¿Es un límite global o por oferta? ¿Solo avisa o bloquea?
4. **Rol `buyer`:** ¿entra en el MVP o se queda en F3?
5. **Compliance:** ¿de dónde sale el catálogo inicial de reglas por GEO? ¿Existe ya alguna lista?
6. **Notificaciones externas:** ¿email, Telegram o Slack?
7. **Borrador con IA:** ¿el formato del brief propuesto en F-1002 encaja con cómo briefeáis hoy?
8. **SPEC.md truncado:** ¿tienes el resto del documento (§5.4 en adelante, §8–§10)? Si existe, sustituyo mis 🟡 por lo que ya estaba definido.
