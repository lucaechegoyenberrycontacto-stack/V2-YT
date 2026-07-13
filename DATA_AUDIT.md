# DATA_AUDIT.md — Inventario de la capa de datos

> Regenerado en modo solo-lectura el 2026-07-13. No se modificó ningún archivo del proyecto ni ninguna fila de Supabase. Todas las consultas a la base fueron `SELECT`/lecturas de metadatos (`list_tables`, `get_advisors`, `information_schema`, `pg_policies`). Esta es la segunda versión del documento — la primera (Fase 0) quedó desactualizada y su contenido histórico se preserva marcado como **CORREGIDO** donde ya no aplica, en vez de borrarse.

---

## 0. Qué cambió desde la versión anterior

La versión anterior de este documento se escribió **antes del 2026-07-08** (no tiene fecha propia, pero no menciona `login.html` ni `dataLayer.js`, que existen desde esa fecha — ver 0.5). Desde entonces el proyecto tuvo actividad real y sostenida: 25+ commits, una migración de arquitectura de datos completa para `nutrition.html`, una feature nueva (Expenses), y — según confirmé contra el historial de git — **los 7 hallazgos CRÍTICO de `UI_AUDIT.md` están resueltos**, no solo el que motivó esta tarea. El audit anterior no reflejaba nada de esto.

### 0.1 — Tabla `gym_pesas_store`: CORREGIDO

La versión anterior decía (sección 4): *"Solo dos tablas existen: `app_state` y `workout_history`. `gym_pesas_store` NO existe"*. Eso ya no es cierto. Evidencia fresca (`list_migrations`, `information_schema.columns`, `pg_policies`, todos consultados en esta sesión):

- Migración `create_gym_pesas_store` (versión `20260712200920`) está aplicada.
- Columnas reales: `key text primary key not null`, `data jsonb not null default '{}'::jsonb`, `updated_at timestamptz not null default now()`.
- RLS habilitada (`relrowsecurity = true`). Policy real, texto completo vía `pg_policies`:
  ```sql
  -- policyname: "anon full access gym_pesas_store"
  -- permissive: PERMISSIVE · roles: {anon} · cmd: ALL
  -- qual: true · with_check: true
  ```
  Mismo patrón exacto que `app_state`/`workout_history` — no es una política nueva o distinta, es la misma plantilla "todo permitido para `anon`" ya presente en el resto del esquema.
- La tabla tiene **1 fila real** (`key='pesas_store'`), con los 3 campos esperados (`exerciseOverrides`, `muscleFatigueConfig`, `mobilityLog`) y `updated_at` = 2026-07-13 01:44 UTC — es decir, la app ya la está usando en producción, no es solo un esqueleto vacío.

### 0.2 — `syncStatus.js`: nuevo, confirmado

Existe (`/syncStatus.js`, 84 líneas). Expone `window.DashSyncStatus = { report(channel, ok), getState(), subscribe(cb) }` — store en memoria (nada en localStorage), agrega el estado de 3 canales de sync (`sync.js`'s `appKey`, `'gym_pesas_store'`, `'po-coach'`) con la regla: un solo fallo no cambia el estado visual; hacen falta ≥2 fallos consecutivos **y** más de 30s desde el último éxito real para marcar `error`; un solo éxito limpia el canal al instante.

Cargado, confirmado por grep literal del `<script>` tag, en:

| Página | Línea | Orden relativo |
|---|---|---|
| `apps.html` | 12 | antes de `sync.js` (13), `defer` |
| `finance.html` | 12 | antes de `sync.js` (13), `defer` |
| `health.html` | 12 | antes de `sync.js` (13), `defer` |
| `index.html` | 12 | antes de `sync.js` (13), `defer` |
| `habits.html` | 12 | antes de `sync.js` (13), `defer` |
| `main.html` | 11 | antes de `sync.js` (12), `defer` |
| `po-water.html` | 24 | antes de `sync.js` (25), `defer` |
| `template.html` | 28 | antes de `sync.js` (29), `defer` |
| `gym.html` | 1626 | antes de `gymPesasStore.js` (1627), **sin** `defer` — a propósito: `gymPesasStore.js` tampoco tiene `defer` (se ejecuta en orden de parseo, no espera a que termine el documento), así que si `syncStatus.js` fuera `defer` ahí correría *después* y llegaría tarde. |

`nutrition.html` y `nova-lite.html`/`avatar-lab.html` no lo cargan — correcto: `nutrition.html` no usa ninguno de los 3 motores de sync instrumentados (usa `DataLayer`, ver 0.5), y los otros dos nunca cargaron `sync.js`/`gymPesasStore.js` tampoco.

### 0.3 — Pill de estado de sync en `topbar.js`: nuevo, confirmado

Existe. Markup: `<span class="topbar-sync-dot" id="topbarSyncDot" role="button" tabindex="0">` (`topbar.js:217`), dentro del mismo `.topbar-water-wrap` que el pill de agua. CSS en `topbar.js:82-92`:

```css
.topbar-sync-dot {
  display: none; /* oculto = todo bien, sin ruido visual permanente */
  ...
  animation: topbar-miss-pulse 1.6s ease-in-out infinite;
}
.topbar-sync-dot.show { display: inline-block; }
```

**Reusa** la animación `@keyframes topbar-miss-pulse` (`topbar.js:56-59`) — es la misma que ya usaba `.topbar-water-pill.miss .topbar-pill-dot`, no hay una segunda copia de las keyframes. Lógica en `topbar.js:375-420` (`renderSyncDot`, `initSyncDot`, `describeSyncFailures`): se suscribe a `window.DashSyncStatus.subscribe()` en `boot()` (`topbar.js:538`), sin polling. Click/tap dispara un `alert()` plano listando los canales en error y hace cuánto no tienen éxito — no hay modal ni toast nuevo.

### 0.4 — Sistema de estado local previo en `gymPesasStore.js` (commit `807df44`): documentado por primera vez

Este es un hallazgo nuevo — ningún audit anterior lo mencionó porque el commit que lo introdujo (`807df44`, "Fix silent gym_pesas_store sync failures with a visible status note") es **anterior** a los cambios de `syncStatus.js` de esta sesión, pero **posterior** a la versión vieja de este documento.

Qué hace: `gymPesasStore.js:95-109` define `gpSyncStatus` ('ok'|'pending'|'error'), `gpSyncDetail` (string humano) y `gpSetSyncStatus(status, detail)`, que en cada cambio llama a `window.gpsOnSyncStatusChange` si existe. `gpPushNow()` (`gymPesasStore.js:111-130`) llama `gpSetSyncStatus('ok')` tras un upsert exitoso y `gpSetSyncStatus('error', '...')` en el catch. `window.GymPesasStore.getSyncStatus()` expone `{status, detail}` (`gymPesasStore.js:341`).

Quién lo consume: **no `topbar.js`, sino `gymUI.js`**. `gymUI.js:917-921` conecta `window.gpsOnChange` (re-renderiza tras cualquier cambio, local o remoto) y `window.gpsOnSyncStatusChange` (re-renderiza el mapa muscular). `gymUI.js:262-266` (`appendSyncNoteIfError`) inserta una nota discreta `<div class="tr-sync-note">⚠ ...</div>` **dentro del mapa muscular de gym.html**, solo si `status === 'error'`, con el mismo tono que la nota de "ecosystem modifier" ya existente ahí. Se llama desde dos puntos de `renderMuscleMap()` (`gymUI.js:222` y `gymUI.js:253`).

**Solapamiento con `syncStatus.js` (de esta sesión)**: ninguno funcional, pero sí son dos sistemas de estado paralelos para el mismo canal:
- `gpSyncStatus`/`gpSetSyncStatus` → local a `gymPesasStore.js`, alimenta una nota de texto **dentro de gym.html únicamente**, con 3 estados (`ok`/`pending`/`error`) y sin regla de "2 fallos + 30s" — cualquier fallo aislado ya muestra la nota inmediatamente.
- `window.DashSyncStatus` → global, alimenta el pill de `topbar.js` **en todas las páginas**, con la regla anti-falsa-alarma de 2 fallos + 30s.

`gymPesasStore.js:124` y `:128` llaman a **ambos** sistemas en los mismos puntos (éxito/error de `gpPushNow`) — son aditivos, no se pisan, pero un fallo aislado hoy puede mostrar la nota de `gymUI.js` (que no tiene grace period) sin que el pill de `topbar.js` se encienda (que sí lo tiene). Esto es **intencional según el diseño de cada uno** pero no está documentado en ningún lado fuera de este párrafo — vale la pena que quien toque cualquiera de los dos sepa que el otro existe.

### 0.5 — Otros cambios detectados, no listados en los 4 puntos de la tarea

La consigna pedía presuponer que cualquier parte del código pudo cambiar, no solo los 4 archivos mencionados. Encontré cambios sustanciales adicionales, todos verificados contra el código actual y el historial de git (`git log --oneline -25`):

**a) Migración de capa de datos para `nutrition.html` (commit `18956a8`, 2026-07-08)** — la versión anterior de este documento no la menciona en absoluto, porque fue escrita antes de esa fecha. Son 2 archivos nuevos que no existían: `login.html` (pantalla de login con Supabase Auth, `supa.auth.signInWithPassword`) y `dataLayer.js` (gateway nuevo a una tabla `public.records`, ver sección 3). `nutrition.html` es la única página migrada — ya no llama `initCloudSync`/`sync.js` en absoluto, usa `DataLayer.init({requireAuth:true})` y redirige a `login.html` si no hay sesión. El conteo de archivos correcto hoy es **13 HTML + 12 JS propios** (antes: 12/10) — `login.html` y `dataLayer.js` explican 2 de esos; `syncStatus.js` (0.2) explica el tercero.

**b) Los 7 hallazgos CRÍTICO de `UI_AUDIT.md` están resueltos**, no solo el #2 (`gym_pesas_store`, sección 0.4). Evidencia — comentario explícito citando `UI_AUDIT.md CRÍTICO #N` en el código + commit correspondiente:

| # | Hallazgo original | Commit | Evidencia en código |
|---|---|---|---|
| 1 | `index.html` "Calorías" leía la clave muerta `burned:YYYY-MM-DD` | `706b58e` | `index.html:805-810` ahora lee `caloriesBurnedEntries` |
| 2 | `gym_pesas_store` sync 100% silencioso | `807df44` | ver 0.4 |
| 3 | Fotos de progreso fallidas se ocultaban sin aviso | `870815a` | no re-verificado en detalle en esta pasada, ver sección 8 |
| 4 | Reset de `po-water.html` decía "no se puede deshacer" (falso) | `e33bb10` | `po-water.html:1132-1139`, texto corregido |
| 5 | "Saved ✓" se mostraba sin confirmar que el `localStorage.setItem` funcionó | `f6b00d8` | `health.html:999-1006` y `:2097-2100`, `saveEntries`/`cbSaveEntries` ahora devuelven bool y el caller lo chequea |
| 6 | Evento `storage` cross-tab podía pisar una edición sin guardar | `9061953` | `health.html:2112-2118` |
| 7 | Borrar una cuenta de Net Worth (dinero real) no pedía confirmación | `784128b` | no re-verificado en detalle en esta pasada, ver sección 8 |

Esto no vuelve a este documento un audit de UI — para el detalle completo de cada uno, `UI_AUDIT.md` sigue siendo la fuente correcta (y también quedó desactualizado en cuanto a "todos abiertos, esperando priorización" — ver nota en mi memoria). Se listan acá porque 4 de los 7 (#1, #2, #5, #6) son directamente hallazgos de capa de datos/sync, el tema de este documento.

**c) Feature nueva: Expenses (commits `caf7807`, `2cf6cba`, `147fc61`+`224f6a8` revert, `cacaf08`)** — `finance.html` ahora tiene una 5ª pestaña (`net`/`subs`/`incoming`/`wish`/**`expenses`**, `finance.html:2124`) con deducción automática de Net Worth. `index.html` (Home) ahora tiene 2 stat tiles nuevos, **Net Worth** y **Expenses** (`index.html:284-292`, `renderNetWorthStat`/`renderExpensesStat`/`renderFinanceStats`, `index.html:943-1000`), y su warm-up de arranque ahora trae también la fila `finance` (antes solo `health`/`nutrition`/`po-coach`) — ver sección 2/3 para el detalle completo, es nuevo inventario, no una corrección de algo viejo.

**d) Arquitectura de sesión de auth consolidada (commit `c820bab`, posterior al resto)** — con `login.html`/`dataLayer.js` ya en el proyecto, cada cliente Supabase de cada página empezó a competir por la misma sesión persistida en localStorage (causando 401 intermitentes, según los comentarios del propio código). El fix fue explícito: **todo** cliente que no sea `login.html`/`dataLayer.js` ahora pasa `{ auth: { persistSession: false, autoRefreshToken: false } }` a `createClient()` — confirmado en `sync.js:169`, `gym.html:4135`/`4248`, `gymPesasStore.js:174`, `topbar.js:454`, `index.html:1023`. Solo `login.html:113` y `dataLayer.js:292` dejan la sesión persistir (a propósito, la necesitan para que `requireAuth` funcione).

---

## 1. Resumen ejecutivo

- El proyecto tiene **13 páginas HTML** y **12 módulos JS** propios (más 4 funciones serverless en `api/`). La mayoría comparte un único proyecto Supabase (`bkkjtxvneldsqwyhrhub`) vía el modelo viejo (`app_state`/`workout_history`/`gym_pesas_store`, mirroring de filas completas); `nutrition.html` es la única página migrada a un modelo nuevo (`records`, por-registro, con autenticación real).
- Hay **cuatro** mecanismos de sync/lectura distintos hoy, no tres: (a) `sync.js`/`initCloudSync` genérico (8 páginas), (b) el sync casero de `gym.html` para `app_state.po-coach` (semántica de borrado inversa a `sync.js` — sí hace `removeItem`), (c) dos sync dedicados más (`workout_history`, `gym_pesas_store`), y (d) `dataLayer.js`, el gateway nuevo de `records` usado solo por `nutrition.html`, con semántica de borrado real (per-registro) y autenticación obligatoria.
- **`gym_pesas_store` ya no es un hallazgo crítico** — existe, tiene RLS consistente con el resto, y tiene datos reales sincronizados hoy. Ver sección 0.1.
- Hay ahora **dos sistemas de estado de sync superpuestos** para ese mismo canal: uno local a `gymPesasStore.js`/`gymUI.js` (nota de texto dentro de gym.html) y uno global nuevo (`syncStatus.js`, pill en `topbar.js`, todas las páginas). Ver sección 0.4.
- **Los 7 hallazgos CRÍTICO de `UI_AUDIT.md` están resueltos** (sección 0.5b) — 4 de ellos eran hallazgos de esta misma capa de datos.
- `nutrition.html` migró a un modelo con autenticación real (`login.html` + `dataLayer.js` + tabla `records`, RLS restringida a `authenticated`, no `anon`) — es la única página del dashboard que hoy requiere login.
- Se confirmó una feature nueva no relacionada con ninguno de los hallazgos anteriores: **Expenses** (finance.html 5ª pestaña + 2 stat tiles nuevos en el Home).
- Persisten sin cambios: la integración WHOOP fantasma (3 endpoints serverless vivos, sin consumidor en frontend), el "Daily Stack" muerto en `topbar.js`, `ANTHROPIC_API_KEY` vacía en `main.html`, y el misterio de por qué la fila `finance` de `app_state` nunca tuvo `subs`/`incoming_orders` (sigue sin tenerlos, confirmado de nuevo con datos frescos).
- `nova-lite.html` sigue siendo el único canal de salida de datos hacia un tercero no-Supabase, y ahora envía un conjunto más grande de `localStorage` (incluye las claves nuevas `dlcache:*`/`dlqueue` de `dataLayer.js`).
- Advisors de seguridad: **6 hallazgos** hoy (antes 3) — los 4 `RLS ALL/true` de siempre (`app_state`, `workout_history`, ahora también `gym_pesas_store` y `records`), el bucket público con listado (`progress-photos`), y uno nuevo no relacionado con este proyecto de código: `auth_leaked_password_protection` deshabilitado (config de Supabase Auth, no algo que se arregle en el repo). Advisors de performance: sin hallazgos.

---

## 2. Inventario por página (re-verificado línea por línea)

### index.html (Home)
Sigue sin llamar `initCloudSync` — comentario explícito en el código: *"read-only, no writes, no initCloudSync"* (`index.html:1083`). Warm-up de arranque ahora trae **4** filas de `app_state`, no 3.

| Clave | Lectura | Escritura | Forma | Sync |
|---|---|---|---|---|
| `home:weather_cache` | `index.html:635` | `index.html:638` | `{temp,feels,code,isDay,max,min,hourly:{...},ts}` | No sincronizada (cache local, no crítico) |
| `po_water_v1` | `index.html:712` | `index.html:1057` (warm-up) | ver po-water.html | Ajena, solo lectura/rehidratación |
| `sleepEntries` | `index.html:770` | `index.html:1056` (warm-up) | `[{date,bedTime,wakeTime}]` | Ajena |
| `goals:YYYY-MM-DD` | `index.html:793` | — | `[{text,done,doneAt?,queued?}]` | Ajena, solo lectura |
| `nut:log`,`nut:foods`,`nut:goals` | `index.html:832-834` | `index.html:1061-1063` (warm-up) | ver nutrition.html (ahora vía `DataLayer.setLegacyMirror`, no `sync.js`) | Ajena |
| `caloriesBurnedEntries` | `index.html:823` | `index.html:1058` (warm-up) | `[{date,kcal,loggedAt}]` | Ajena. **CORREGIDO** (0.5b #1): ya no lee `burned:YYYY-MM-DD` |
| `po_coach_v1` | `index.html:865` | `index.html:1068` (warm-up) | `{units}` | Ajena |
| `gym:steps`, `gym:stepsGoal` | `index.html:890,893` | `index.html:1066-1067` (warm-up) | `{'YYYY-MM-DD':num}`, número | Ajena |
| `nw_currency` | `index.html:914` | `index.html:1073` (warm-up) | string moneda | Ajena |
| `nw:history` | `index.html:945` | `index.html:1071` (warm-up) | `[{t,v}]` | Ajena |
| `expenses` | `index.html:977` | `index.html:1072` (warm-up) | ver finance.html | **Nuevo** — ajena, alimenta el stat tile "Expenses" del Home |

Warm-up (`index.html:1039-1080`) trae `health`/`nutrition`/`po-coach`/**`finance`** (nuevo) vía `Promise.allSettled`, sigue sin pasar por el `setItem` parcheado de `sync.js` (esta página nunca lo carga con efecto activo).

### main.html (Goals / Home legacy)
Sin cambios respecto a la versión anterior, re-verificado.

| Clave | Lectura/Escritura | Forma | Sync |
|---|---|---|---|
| `goals:YYYY-MM-DD` (hoy/mañana) | `main.html:663-671`, bloque completo | `[{text,done,doneAt?,queued?}]` | Sí — `appKey:'goals'`, `syncedPrefixes:['goals:']` (`main.html:1202-1203`) |
| `goal_streak_v1` | `main.html:740,744` | `{count,lastProcessedDate}` | No sincronizada (no matchea el prefijo `goals:`) |
| `sleepEntries` | `main.html:843` | — | Ajena, solo lectura |

`ANTHROPIC_API_KEY = ''` sigue vacía (`main.html:659`) — la función "✨ Polish" sigue inerte.

### health.html
| Clave | Lectura | Escritura | Forma | Sync |
|---|---|---|---|---|
| `sleepEntries` | `health.html:677` | `health.html:681` | `[{date,bedTime,wakeTime}]` | Sí — `syncedKeys` |
| `caloriesBurnedEntries` | `health.html:1900` | `health.html:1904` | `[{date,kcal,loggedAt}]` | Sí — `syncedKeys` |
| `burned:YYYY-MM-DD` (legacy) | `health.html:1914-1924` (solo migración) | nunca más | string numérico | Sin cambios — huérfana pero ya inofensiva (ver sección 6) |

`appKey:'health'`, `syncedKeys:['po_water_v1','sleepEntries','caloriesBurnedEntries']` (`health.html:2323-2329`). **Nuevo desde la versión anterior**: `saveEntries()`/`cbSaveEntries()` ahora devuelven `true`/`false` y los callers lo chequean antes de mostrar "Guardado" (0.5b #5); el listener `storage` de Calorías Quemadas ya no pisa una edición sin guardar (0.5b #6). Sigue embebiendo `po-water.html` vía iframe.

### po-water.html
| Clave | Lectura | Escritura | Forma | Sync |
|---|---|---|---|---|
| `po_water_v1` | `po-water.html:733` | `po-water.html:757`; `removeItem` en Reset (`po-water.html:1140`) | sin cambios de forma respecto a la versión anterior | Sí, condicional a no estar embebida en iframe |

`appKey:'health'`, `syncedKeys:['po_water_v1']` (`po-water.html:1182-1183`). **CORREGIDO** (0.5b #4): el texto de confirmación del botón Reset ya no dice "no se puede deshacer" — ahora explica correctamente que un dato ya sincronizado puede volver (`po-water.html:1132-1139`).

### nutrition.html — reescrita casi por completo desde la versión anterior

**Ya no usa `sync.js`/`initCloudSync` en absoluto.** Es la única página migrada al modelo `DataLayer`/`records` (commit `18956a8`, 2026-07-08). Requiere sesión: `DataLayer.init({requireAuth:true})` (`nutrition.html:977`) redirige a `login.html?next=...` si no hay sesión activa.

| Colección (`records.collection`) | localStorage key espejo | Operaciones | Archivo:línea |
|---|---|---|---|
| `nutrition_foods` | `nut:foods` (legacy mirror) | `list`,`put` | `nutrition.html:453-454,706,980,997` |
| `nutrition_combos` | `nut:combos` (sin legacy mirror activo) | `list`,`put` | `nutrition.html:453,744,985` |
| `nutrition_log` | `nut:log` (legacy mirror) | `list`,`put`,`remove` | `nutrition.html:453-454,591,796,990,998` |
| `nutrition_goals` | `nut:goals` (legacy mirror, transformado) | `getSingleton`,`putSingleton` | `nutrition.html:453-454,813,925,991,999-1003` |
| `nutrition_profile` | (sin legacy mirror) | `getSingleton`,`putSingleton` | `nutrition.html:453,842,926` |

Además, solo-lectura y ajenas: `caloriesBurnedEntries` (`nutrition.html:609`), `po_coach_weights` (`nutrition.html:834`), `po_water_v1` (`nutrition.html:845`). **CORREGIDO** respecto a la versión anterior: ya no lee `burned:YYYY-MM-DD` (esa página fue la primera en arreglarse, antes que `index.html` — ver [[project_datalayer_migration_fase1]]).

Los legacy mirrors (`setLegacyMirror`, `nutrition.html:997-1003`) existen exclusivamente para que `index.html` y `gymEcosystem.js` (no migrados) sigan leyendo datos de nutrición de este dispositivo sin ellos mismos hablar con `DataLayer`.

### habits.html
Sin cambios. `po_habits_v1` (`habits.html:304-305`, `loadJSON`/`saveJSON`), `appKey:'habits'`, `syncedKeys:['po_habits_v1']` (`habits.html:716-717`).

### finance.html — cambios sustanciales desde la versión anterior

| Clave | Lectura/Escritura | Forma | Sync |
|---|---|---|---|
| `finance_active_tab` | `finance.html:2110` | string, ahora incluye `'expenses'` como valor válido (`finance.html:2124`) | No sincronizada (estado de UI) |
| `nw_currency` | `finance.html` (storeGet/storeSet) | string moneda | Sí |
| `ars_rates` / `ars_rates_ts` | `finance.html:2168-2169` | cache de cotizaciones, 24h | No sincronizada — sin cambios |
| `nw:bank`,`nw:stocks`,`nw:crypto`,`nw:other` | amplio | `[{name,amount}]` | Sí (prefijo `nw:`) |
| `nw:activity`, `nw:history`, `nw:bank:registry`, `nw:efectivo_migrated` | amplio | sin cambios de forma | Sí |
| `subs`, `wishlist`, `incoming_orders` | amplio | sin cambios de forma | Sí (explícito) |
| **`expenses`** | `finance.html:3899-3927` | `[{id,name,amount,entered_amount,entered_currency,method,date,ts,deductedFrom:{cat,name}\|null}]` | **Nuevo** — Sí (explícito, `syncedKeys`) |
| **`expense_methods_registry`** | `finance.html:2092-2103` | `string[]` (nombres de métodos de pago usados) | **Nuevo** — Sí (explícito, `syncedKeys`) |

`appKey:'finance'`, `syncedKeys:['subs','wishlist','incoming_orders','nw_currency','nw:activity','nw:history','expenses','expense_methods_registry']`, `syncedPrefixes:['nw:']` (`finance.html:4102-4104`). **CORREGIDO** (0.5b #7): borrar una cuenta de Net Worth ahora pide confirmación.

**Hallazgo nuevo — patrón TDZ**: dos constantes (`ORD_FROM_META`, `finance.html:2073-2083`; `EXPENSE_METHOD_REGISTRY_KEY`, `finance.html:2086-2092`) tienen comentarios explícitos explicando por qué están *hoisteadas* al principio del IIFE — evitar un crash por temporal-dead-zone si `renderAllNetWorth()` corre antes de llegar a su declaración original. Esto es exactamente la misma clase de bug que [[project_finance_ars_tdz_bug]] documentó para `ars_rates` (que sigue sin arreglarse, por decisión explícita de no tocarla sin pedido). Es decir: el mismo problema se identificó y arregló proactivamente dos veces más en este archivo, pero la instancia original sigue abierta — vale la pena que quien la toque sepa que ya hay precedente de cómo resolverla (hoist + comentario), no hace falta rediseñar nada.

### gym.html
Sigue sin usar `sync.js` — motor propio (`pcPushNow`/`pcInitCloudSync`, `appKey` interno `'po-coach'`). **Instrumentado esta sesión** para reportar a `window.DashSyncStatus` (ver 0.2/0.3), sin tocar su lógica de merge/debounce.

| Clave | Lectura | Escritura | Forma | Sync |
|---|---|---|---|---|
| `po_coach_v1` | `gym.html:2284` | `gym.html:2291` | `{units}` | Sí — `PC_SYNCED_KEYS` (`gym.html:3948`) |
| `po_coach_lyfta_v1` | `gym.html:2377` | `gym.html:2383` | sin cambios de forma | Sí, tabla propia `workout_history` (`WH_TABLE`, `gym.html:2315`) |
| `po_coach_weights` | `gym.html:2765` | `gym.html:2771` | `[{dateKey,weight}]` | Sí — `PC_SYNCED_KEYS` |
| `po_coach_photos` | `gym.html:3537` | `gym.html:3543` | sin cambios de forma | Sí — `PC_SYNCED_KEYS`. **CORREGIDO** (0.5b #3, commit `870815a`): las fotos que fallan al subir ahora se muestran como fallidas en vez de desaparecer silenciosamente del array pusheado — no re-verifiqué el detalle línea por línea en esta pasada (ver sección 8) |
| `gym:steps` / `gym:stepsGoal` | `gym.html:3105` / `3115` | `gym.html:3111` / `3121` | sin cambios | Sí — `PC_SYNCED_KEYS` |
| `nova_lite_api_key` | `gym.html:4381` | — | string | No sincronizada |
| `po_coach_pesas_store_v1` | `gymPesasStore.js:79` | `gymPesasStore.js:85` | sin cambios de forma | Sí, tabla `gym_pesas_store` — **ya no rota**, ver 0.1 |

`PC_SYNCED_KEYS = ['po_coach_v1','po_coach_weights','po_coach_photos','gym:steps','gym:stepsGoal']` (`gym.html:3948`).

### apps.html
Sin cambios. `po_water_v1.profile` (`apps.html:385-388`, `WATER_KEY`/`loadJSON`/`saveJSON`), `appKey:'health'`, `syncedKeys:['po_water_v1']` (`apps.html:409-410`).

### login.html — página nueva, no existía en la versión anterior del audit
Sin claves de `localStorage` propias en el código de la app — la sesión de Supabase Auth se persiste vía el mecanismo interno de `supabase-js` (localStorage, pero bajo una clave que la librería gestiona sola, no leída/escrita explícitamente por el código del proyecto). Es la única página, junto con `dataLayer.js`, que deja `persistSession` en su default (`true`) al crear el cliente (`login.html:113`) — a propósito, ver 0.5d.

### avatar-lab.html
Sigue sin ninguna clave de `localStorage`/`sessionStorage` — confirmado de nuevo, sigue siendo la única página sin ningún dato persistido.

### nova-lite.html
| Clave | Lectura/Escritura | Forma | Sync |
|---|---|---|---|
| `nova_lite_api_key` | `nova-lite.html:129,134` | string | No sincronizada |

`dashboardData()` (`nova-lite.html:142-150`) sigue iterando **todo** `localStorage` (excepto su propia key) y mandándolo al endpoint de Anthropic. Sin cambios de comportamiento, pero el conjunto de datos que efectivamente envía creció: ahora incluye las claves nuevas de `dataLayer.js` (`dlcache:nutrition_foods`, `dlcache:nutrition_combos`, `dlcache:nutrition_log`, `dlqueue`, etc.) para cualquier dispositivo donde `nutrition.html` se haya abierto.

### template.html
Sin cambios. `tpl:template_list` (`template.html:384,390`), `appKey:'template'`, `syncedKeys:[STORE_KEY]` (`template.html:468-469`) — sigue sin fila real en `app_state`.

### Resumen sessionStorage/IndexedDB/cookies
Sin cambios — no se encontró ningún uso en ninguna de las 13 páginas ni los 12 JS.

---

## 3. Puntos de contacto con Supabase (re-verificado)

Credenciales hardcodeadas (URL + key publicable), confirmadas idénticas hoy en **7** archivos (antes 5) — se sumaron `dataLayer.js` y `login.html`: `sync.js:18-19`, `gym.html:3841-3842` (sin re-verificar línea exacta esta pasada), `gymPesasStore.js:17-18`, `topbar.js:19-20`, `index.html:1015-1016`, `dataLayer.js:23-24`, `login.html:98-99` → mismos valores de siempre (`https://bkkjtxvneldsqwyhrhub.supabase.co` / `sb_publishable_G8LqREPRDk0_tMEJNSFBxA_mIXNAnmT`).

| Archivo:línea | Tabla/objeto | Operación | Manejo de error / estado |
|---|---|---|---|
| `index.html:1043-1047,1023` | `app_state` (filas `health`,`nutrition`,`po-coach`,**`finance`** nuevo) | `select().maybeSingle()` ×4 vía `Promise.allSettled` | `try/catch`; solo lectura |
| `gym.html:4067-4081` (`pcPushNow`) | `app_state` (fila `po-coach`) | `upsert()` | **Instrumentado esta sesión**: reporta a `DashSyncStatus`, lógica de merge sin tocar |
| `gym.html:4135-4160` aprox. | `app_state` (fila `po-coach`) | `select()` + canal realtime | sin cambios |
| `gym.html:3620-3632` | Storage bucket `progress-photos` | `.upload()` + `.getPublicUrl()` | **CORREGIDO** (0.5b #3): fallos ahora visibles, no solo `null` silencioso |
| `gym.html:4185-4187` | `app_state` (filas `health`,`nutrition`,`habits`) | `select()` ×3, solo lectura | sin cambios |
| `gym.html:4219-4261` | `workout_history` (`WH_TABLE`, fila `lyfta_data`) | `select()`+`upsert()`+realtime | sin cambios |
| `gymPesasStore.js:111-130,161-210` | `gym_pesas_store` (fila `pesas_store`) — **tabla ahora existe**, ver 0.1 | `select()`+`upsert()`+realtime+`fetch()` unload | Ya no falla — reporta a 2 sistemas de estado (0.4) |
| `topbar.js:454-463` | `app_state` (fila `health`) | `select()`+`upsert()` | sin cambios |
| `sync.js` (motor genérico) | `app_state` (fila según `appKey`) | `select`,`upsert`,realtime,`fetch` unload | **Instrumentado esta sesión**: reporta a `DashSyncStatus`, aditivo únicamente |
| `dataLayer.js:187-222,267-278,346-360,385-407,425-444,455-464` | `records` (`collection`,`id`,`data`) — **nuevo** | `select`,`upsert`,`delete`,realtime, cola offline con reintentos (`RETRY_DELAYS=[1000,3000,8000]`) | Manejo de error explícito y visible (dot + toast propios, `dataLayer.js:110-161`), a diferencia de todos los demás motores — es el más maduro de los 4 |
| `login.html:107-140` | `auth.getSession()`, `auth.signInWithPassword()` — **nuevo** | — | Mensaje de error visible al usuario en el form |

**Arquitectura de sesión (0.5d)**: todo cliente salvo `login.html`/`dataLayer.js` pasa `{persistSession:false, autoRefreshToken:false}` — confirmado en los 6 archivos restantes que crean un cliente. Esto es intencional y reciente (commit `c820bab`): antes de ese fix, múltiples clientes independientes competían por la misma sesión persistida y producían 401 intermitentes (documentado en comentarios de código en `sync.js:161-168`, `gym.html:4118-4126`, `gymPesasStore.js:166-173`).

---

## 4. Estado real de la base (Tarea 3, re-verificada)

### Tablas existentes en `public` — ahora 4, no 2

| Tabla | Filas | RLS | Policy |
|---|---|---|---|
| `app_state` | 6 | habilitada | `ALL` / `anon` / `true`,`true` |
| `workout_history` | 1 | habilitada | `ALL` / `anon` / `true`,`true` |
| `gym_pesas_store` | 1 | habilitada | `ALL` / `anon` / `true`,`true` — **nueva desde la versión anterior**, ver 0.1 |
| `records` | 46 | habilitada | `ALL` / `authenticated` / `true`,`true` — **nueva**, la única con RLS restringida (no `anon`) |

### `app_state` (6 filas, sin huérfanas — re-consultado, datos frescos)

| key | updated_at (UTC) | claves de primer nivel en `data` |
|---|---|---|
| `finance` | 2026-07-13 13:26:18 | `nw:bank`, **`expenses`** (nuevo), `nw:other`, `wishlist`, `nw:crypto`, `nw:stocks`, `nw:history`, `nw:activity`, `nw_currency`, `nw:bank:registry`, `nw:efectivo_migrated` |
| `goals` | 2026-07-05 15:06:04 | `goals:2026-07-04`, `goals:2026-07-05` (sin cambios) |
| `habits` | 2026-07-13 02:03:35 | `po_habits_v1` |
| `health` | 2026-07-13 13:42:34 | `po_water_v1`, `sleepEntries`, `caloriesBurnedEntries` |
| `nutrition` | 2026-07-08 02:04:30 | `nut:log`, `nut:foods`, `nut:goals`, `nut:combos`, `nut:profile` — **congelada desde el día de la migración a `DataLayer`**, ya no recibe escrituras propias (nutrition.html ya no la toca) |
| `po-coach` | 2026-07-13 13:02:45 | `gym:steps`, `po_coach_v1`, `gym:stepsGoal`, `po_coach_photos`, `po_coach_weights` |

**Hallazgo reconfirmado, sigue sin explicación**: la fila `finance` sigue sin `subs` ni `incoming_orders`, pese a estar en `syncedKeys`. Ya lo decía la versión anterior de este documento; con datos frescos de hoy, sigue siendo así. Ver sección 8.

**Nota sobre `nutrition`**: esta fila quedó congelada en el momento exacto de la migración (2026-07-08 02:04:30) — es un respaldo de rollback deliberado, no un dato huérfano (ver [[project_datalayer_migration_fase1]]).

### `workout_history` (1 fila, sin cambios)
`key='lyfta_data'`, `updated_at` 2026-07-07 06:06:37, 134 entradas de workout.

### `gym_pesas_store` (1 fila) — ver 0.1 para el detalle completo

### `records` (46 filas, 5 colecciones) — tabla nueva

| collection | filas |
|---|---|
| `nutrition_foods` | 26 |
| `nutrition_combos` | 1 |
| `nutrition_goals` | 1 (singleton, id='main') |
| `nutrition_log` | 17 |
| `nutrition_profile` | 1 (singleton, id='main') |

### Advisors — Seguridad (`get_advisors(type:"security")`, re-consultado)

| Nivel | Detalle | Comparado con la versión anterior |
|---|---|---|
| WARN | `app_state`: `ALL`/`anon`/`true` | Sin cambios |
| WARN | `workout_history`: `ALL`/`anon`/`true` | Sin cambios |
| WARN | `gym_pesas_store`: `ALL`/`anon`/`true` | **Nuevo** — mismo patrón esperado, no un hallazgo distinto |
| WARN | `records`: `ALL`/`authenticated`/`true` | **Nuevo** — mismo patrón, sobre el único rol que no es `anon` |
| WARN | Bucket público `progress-photos` permite listado | Sin cambios |
| WARN | `auth_leaked_password_protection` deshabilitado | **Nuevo** — no existía en la versión anterior. Es configuración de Supabase Auth (Dashboard → Auth → Policies), no algo en el repo de código; relevante ahora que `login.html` existe y hay contraseñas reales en juego |

### Advisors — Performance
Sin hallazgos (`lints: []`), sin cambios.

---

## 5. Claves compartidas (re-verificado)

Sin cambios estructurales respecto a la versión anterior — mismas páginas, mismo appKey `'health'` compartido por `health.html`/`po-water.html`/`apps.html`/`topbar.js`, mismo mecanismo de merge-sobre-`lastKnownRemote` en `sync.js` (`sync.js:34-43,109-129`, sin tocar en esta sesión salvo las líneas de `report()` aditivas).

**Cambio real**: `nut:log`/`nut:foods`/`nut:goals` ahora tienen un dueño distinto — antes las escribía `nutrition.html` directamente vía `sync.js`; hoy las escribe `dataLayer.js` como legacy mirror de las colecciones `records`. `index.html` y `gymEcosystem.js` (ninguno migrado) siguen leyéndolas igual, sin saber que el origen cambió — el contrato de lectura no cambió, solo quién escribe.

---

## 6. Código muerto (re-verificado)

| Elemento | Evidencia | Estado |
|---|---|---|
| `stack:items`, `stack:taken:YYYY-MM-DD` | `topbar.js:325,327`, sigue sin escribirse en ningún archivo | Sin cambios — sigue muerto |
| Integración WHOOP (`api/whoop-*.js`) | Los 3 archivos siguen existiendo, sin consumidor en frontend | Sin cambios |
| `burned:YYYY-MM-DD` (por-día) | `health.html:1908-1924`, migración de una sola vez, claves nunca borradas | **Estado mejorado, no eliminado**: ya no las lee nadie activamente (`nutrition.html` y `index.html` fueron corregidas, sección 0.5b #1) — siguen huérfanas en el storage de cada dispositivo pero dejaron de ser dañinas |
| `nw:efectivo_migrated` | Sigue presente en la fila `finance` (sección 4) | Sin cambios — migración ya cumplida, función sigue siendo no-op |
| `gym_training_config` (tabla, en comentarios) | `gym.html:2277` sigue mencionándola en un comentario | Sin cambios — comentario desactualizado, tabla nunca existió en esta base |
| `ANTHROPIC_API_KEY = ''` en `main.html:659` | Sin cambios | "✨ Polish" sigue inerte |
| `lock.js` | Sigue sin existir en este working copy; referenciado por `<script src="lock.js">` en 11 páginas (todas salvo `avatar-lab.html`/`nova-lite.html`) | Sin cambios — sigue sin ser verificable desde acá |
| `dlqueue` / cola offline de `dataLayer.js` | `dataLayer.js:163-222` | **Elemento nuevo, no dead code todavía** — no hay evidencia de que se haya ejercitado con un fallo de red real; ver sección 8 |

---

## 7. Hallazgos inesperados

1. **CORREGIDO (2026-07-13, esta sesión no lo hizo — ya estaba corregido)**: la clave `burned:YYYY-MM-DD` ya no es zombie-dañina. La versión anterior de este documento la marcaba como hallazgo #1 ("activamente dañina, no solo huérfana"). Hoy tanto `nutrition.html` (commit anterior a `18956a8`) como `index.html` (commit `706b58e`) leen `caloriesBurnedEntries`. Las claves viejas siguen en el storage de cada dispositivo (nunca se borran, por diseño) pero no las lee nadie.
2. **CORREGIDO**: `gym_pesas_store` ya no es un sync roto — ver 0.1 y 0.4. Se agregaron además dos sistemas de estado de sync (uno local a `gymPesasStore.js`/`gymUI.js`, otro global nuevo) que hoy coexisten sin conflicto mutuo pero con reglas distintas (sección 0.4) — vale la pena unificarlos en algún momento futuro, no es urgente.
3. **`nova-lite.html` sigue siendo el único canal hacia un tercero no-Supabase**, y ahora manda un `localStorage` más grande (incluye caché/cola de `dataLayer.js`, sección 2). Sin cambios de fondo, solo de volumen.
4. **Cuatro (no tres) mecanismos de sync/lectura coexistiendo con semánticas de borrado distintas**: `sync.js` (nunca borra ausentes), el sync casero de `gym.html`/`po-coach` (sí borra ausentes), y ahora `dataLayer.js` (borra de verdad, por registro — `remove()`, `dataLayer.js:425-444`). Quien mezcle código entre estos tres modelos sin darse cuenta puede introducir un bug de borrado en cualquier dirección.
5. Header de copyright de terceros en `po-water.html` (líneas 1-13) — sin cambios, sigue ahí.
6. `po-water.html`'s "Reset all" ya no promete algo falso (0.5b #4) pero el comportamiento de fondo (el dato sincronizado vuelve en el próximo pull) **no cambió** — solo el texto que lo describe. Sigue siendo cierto que un "Reset" local no borra la copia en la nube.
7. RLS "todo permitido" ahora cubre 3 de las 4 tablas (`app_state`, `workout_history`, `gym_pesas_store` para `anon`); `records` usa el mismo patrón pero sobre `authenticated`. La superficie de exposición creció proporcionalmente a la cantidad de tablas, no cambió de naturaleza.
8. **Nuevo — patrón TDZ recurrente en `finance.html`**: ver sección 2 (finance.html), tercer caso del mismo bug de fondo que [[project_finance_ars_tdz_bug]], dos de tres instancias ya resueltas con el mismo patrón (hoist + comentario).
9. **Nuevo — dos sistemas de auth conviviendo**: 12 de 13 páginas siguen sin login (modelo `anon`+RLS abierta); `nutrition.html` sola requiere sesión real. Si se migra una segunda página al modelo `DataLayer`, el usuario tendrá que loguearse para acceder a esa página pero no a las demás — vale la pena decidir si eso es un estado intermedio aceptable o si hace falta login unificado antes de migrar más páginas.
10. **Nuevo — feature Expenses sin documentar hasta ahora**: existía desde antes de esta sesión (commits `caf7807`→`cacaf08`) pero ningún audit la había registrado. Ver sección 2 (finance.html, index.html).

---

## 8. Lista de "NO VERIFICABLE DESDE CLAUDE CODE"

- **Contenido y comportamiento real de `lock.js` en el despliegue de Vercel** — sin cambios respecto a la versión anterior, sigue sin poder verificarse desde acá.
- **Si las env vars de Vercel (`WHOOP_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) están configuradas en producción** — sin cambios, sigue sin poder verificarse.
- **Por qué la fila `finance` sigue sin `subs`/`incoming_orders`** — reconfirmado con datos de hoy (sección 4), sigue sin explicación posible desde acá.
- **El detalle línea-por-línea de los fixes de UI_AUDIT.md CRÍTICO #3 y #7** (fotos de progreso fallidas, confirmación de borrado de cuenta) — confirmé que existen commits con esos títulos y que el comportamiento descrito por el título coincide con lo que se ve en un vistazo rápido del código circundante, pero no re-audité esas dos rutas con el mismo nivel de detalle línea-por-línea que el resto de este documento. Si hace falta ese nivel de precisión, es una tarea de 15-20 minutos adicional, no una reapertura de todo el audit.
- **Si la cola offline de `dataLayer.js` (`dlqueue`, reintentos con backoff `[1s,3s,8s]`) alguna vez se ejercitó con un corte de red real** — el código está ahí y parece correcto en una lectura estática, pero confirmar que funciona en la práctica requeriría simular una desconexión real en un navegador, algo que no hice en esta sesión (ni en la anterior) por la regla de no testear contra datos/red reales sin una copia de scratch.
- **Si se abrió alguna vez `template.html` en producción** — sin cambios, sigue sin fila `template` en `app_state`, sigue sin poder confirmarse si existió y se borró.
- **Contenido real (no solo claves de primer nivel) de las filas de las 4 tablas** — por el mismo criterio de solo-lectura de la versión anterior, este documento sigue sin volcar valores reales, solo claves de primer nivel y conteos.

---

## Checklist final

- [x] Revisé las 13 HTML y los 12 JS (conteo corregido respecto a la versión anterior, que decía 12/10)
- [x] Re-verifiqué (no copié) todas las claves de localStorage con su esquema actual
- [x] Re-verifiqué todos los puntos de contacto con Supabase, incluidos los 2 archivos nuevos (`dataLayer.js`, `login.html`)
- [x] Consulté el estado real de las 4 tablas (`app_state`, `workout_history`, `gym_pesas_store`, `records`) vía MCP, con datos frescos del día de hoy
- [x] Corrí `get_advisors` (seguridad y performance) de nuevo
- [x] Cero modificaciones a archivos de código o filas de Supabase — única excepción, la reescritura de este mismo documento
- [x] La sección 0 responde los 4 puntos pedidos con evidencia verificable, y además documenta lo que cambió más allá de esos 4 puntos
- [x] Ninguna mención restante en el documento dice que `gym_pesas_store` no existe
