# UI_AUDIT.md — Auditoría de UI e interactividad

> Generado en modo solo-lectura (Fase 2). No se modificó ningún archivo del proyecto salvo la creación de este documento, no se aplicó ningún fix, y no se hizo ninguna llamada de escritura a Supabase. Continuación directa de `/DATA_AUDIT.md` — no repite sus hallazgos de capa de datos, solo los cita cuando tienen impacto visual/UX nuevo.

**Corrección al enunciado, antes de empezar:** el proyecto ya no tiene 12 páginas HTML ni 10 módulos JS — tiene **13 páginas** y **11 módulos**. `login.html` y `dataLayer.js` se sumaron en la migración "Fase 1" del 2026-07-08 (ver memoria del proyecto), después de que `DATA_AUDIT.md` fuera escrito. Ambos están incluidos en esta auditoría.

**Sobre la Fase B (verificación visual en navegador):** este entorno **no tiene herramienta de navegador ni de captura de pantalla**. Todo lo que sigue es Fase A — lectura estática de HTML/CSS/JS. Cuando un hallazgo depende de cómo se ve realmente algo renderizado (un breakpoint, una superposición, un contraste), lo digo explícitamente y lo marco como inferido, no confirmado. La sección 6 junta todo lo que necesita tus ojos en un dispositivo real.

---

## 1. Resumen ejecutivo

Ordenado por severidad, hallazgos más importantes primero.

### CRÍTICO — rompe la función o puede perder datos del usuario

1. **El stat "Calorías" de `index.html` miente con confianza.** `renderCaloriesStat()` (`index.html:811-839`) lee la clave muerta `burned:YYYY-MM-DD` (huérfana desde que `health.html` migró a `caloriesBurnedEntries` — hallazgo ya documentado en DATA_AUDIT §7.1). A diferencia de **todos los demás** stats del Home, que caen a `'—'` cuando falta el dato (sueño, patrimonio, gastos), este stat **siempre** muestra un número coloreado y con la misma confianza visual que un stat real (`index.html:838`). Nunca hay ninguna pista de que el número está permanentemente desactualizado.
2. **Toda edición de músculo/fatiga/movilidad en `gym.html` se "guarda" sin guardarse, y no hay forma de saberlo desde la UI.** `gymPesasStore.js` intenta sincronizar contra la tabla `gym_pesas_store`, que **no existe** en la base (ya confirmado en DATA_AUDIT §4). Cada intento de `select`/`upsert` falla y es tragado por un `try/catch` vacío (`gymPesasStore.js:95-167`); no existe ningún flag, callback o timestamp exportado que le permita a `gymUI.js`/`gym.html` enterarse de la falla. El modal se cierra, la lista se actualiza, todo se ve exactamente igual a un guardado exitoso — sea que la fila realmente llegó a Supabase o no (nunca llega).
3. **Las fotos de progreso que fallan al subir quedan invisibles para siempre en otros dispositivos, sin aviso ni reintento.** `uploadPhotoToStorage` devuelve `null` en cualquier error (`gym.html:3556-3570`); el caller no hace nada con ese `null` (`gym.html:3599-3607`); y `pcCollectState()` **filtra** las fotos sin `url` antes de subirlas a `app_state` (`gym.html:3883-3887`). La foto se ve idéntica a una exitosa en el dispositivo actual, pero nunca sale de él, y no hay ningún mecanismo de reintento en todo el archivo.
4. **El botón "Reset" de `po-water.html` promete algo que no cumple, y no lo dice.** El `confirm()` (`po-water.html:1062`) dice literalmente *"This cannot be undone"* — falso: `removeItem` (línea 1063) solo borra el localStorage local; como `sync.js` nunca borra (solo mergea), la fila `health` en la nube **reaparece sola** en el próximo sync. La UI se ve 100% exitosa después del reset, sin ninguna advertencia de que podría no persistir entre dispositivos.
5. **Los 3 flujos de "guardado" de Health/Water muestran éxito sin haber verificado que el guardado ocurrió.** `saveEntries`/`cbSaveEntries` (`health.html:679,1891`) y `saveState` (`po-water.html:694-696`) envuelven `localStorage.setItem` en `try/catch` silencioso; los 3 handlers de guardado (`health.html:979-1003,2070-2083`; `po-water.html` en general) muestran "Saved ✓" o redibujan como si hubiera funcionado **sin chequear el resultado del try**. En un caso de cuota excedida o navegación privada, el usuario cree que guardó y no.
6. **Un sync en segundo plano puede borrar silenciosamente una edición no guardada.** En `health.html`, el listener de `storage` para Calorías Quemadas (`health.html:2088-2090`) siempre llama a `render()`, que siempre sobreescribe el input (`health.html:2044-2061`) — si el usuario está tipeando un valor nuevo (con el aviso "cambios sin guardar" visible, `cbDirty`, líneas 2059-2068) y llega un evento de sync de otro tab/dispositivo, el input se reemplaza y el aviso se resetea **sin ningún warning**. El widget de Sueño, en el mismo archivo, no tiene este problema — la inconsistencia es interna al propio archivo.
7. **Borrar una cuenta de Net Worth en `finance.html` no tiene confirmación ni deshacer — es la acción más grave de la página y la menos protegida.** El delete de fila Bank/Stocks/Crypto/Other (`finance.html:2277-2284`) no tiene `confirm()` ni `aria-label`, mientras que borrar una Suscripción (acción de menor impacto económico) sí pide confirmación (`finance.html:2980`). Un solo toque de más borra un registro de dinero real, sin poder deshacerlo.

### IMPORTANTE — funciona pero confunde, se ve roto, o es inconsistente

- **Solo 1 de las 13 páginas (`nutrition.html`) tiene algún indicador visible de sincronización con la nube.** Las 9 páginas que usan el motor viejo (`sync.js`) — `main.html`, `health.html`, `po-water.html`, `habits.html`, `finance.html`, `apps.html`, `template.html` — no muestran nunca un spinner, un "guardando…", ni un aviso de error; todo Supabase call está en un `try/catch` mudo. Los 3 motores propios de `gym.html` tampoco muestran nada. Solo `nutrition.html` (migrada a `dataLayer.js`) tiene un puntito de estado (`#dl-status-dot`) y un toast de "sin conexión" — y ese puntito **se superpone físicamente con la pestaña "Fitness"** de la barra inferior compartida (`dataLayer.js:115` vs `topbar.js:100-107,213-232`), el único lugar del dashboard donde eso ocurre.
- **El bug de TDZ en `loadArsRates` de `finance.html` es real, pero más acotado de lo que se creía.** Verificado línea por línea: `NW_HISTORY_KEY` (`finance.html:2565`) efectivamente no existe todavía cuando la rama de caché tibia de `loadArsRates` (`finance.html:2195-2198`) la necesita en un load con caché de <24h. **Pero** `loadArsRates` es `async function`, así que el throw se convierte en una promesa rechazada no manejada, no en un corte del script — la ejecución sigue normalmente y `renderAllNetWorth()` se vuelve a llamar completa y exitosamente en `finance.html:2857` (después de que `NW_HISTORY_KEY` ya existe), antes de que el navegador pinte nada. **Corrección a una nota previa de memoria de este proyecto**, que describía esto como un corte total del script (tabs, botones de alta/baja rotos): eso no es lo que hace el código actual. El único síntoma real y confirmado es que el widget de cotización ARS queda pegado en "—" hasta que el usuario aprieta refrescar manualmente — nada más se rompe. Ver nota de memoria al final de este documento.
- **Confirmación de acciones destructivas: sin ningún patrón consistente**, ni siquiera dentro de un mismo archivo. Ejemplos con `confirm()`: Reset/Import de `po-water.html` y de `gym.html` Settings, borrar Suscripción y "deducir con saldo insuficiente" en `finance.html`. Sin ninguna confirmación: borrar una meta en `main.html` (`goal-delete`, líneas 976-981) — mientras que "Push remaining" (mucho menos destructivo, solo mueve metas) sí pide confirmar (línea 1081); borrar un registro de comida en `nutrition.html` (`log-del`, líneas 587-592); sobreescribir un día pasado de NoFap en `habits.html` (sin `confirm()` en todo el archivo); borrar cuenta/orden/wishlist/expense en `finance.html`; reimportar JSON de Lyfta en `gym.html` (reemplaza todo el historial sin avisar, líneas 2559-2583); borrar un ítem en `template.html` (y por ende, en cualquier página futura copiada de esta plantilla).
- **`nutrition.html` puede crear registros duplicados con doble clic.** `saveFood`/`saveCombo` (`nutrition.html:684-695,717-733`) no tienen guardia de reentrada; un doble clic rápido antes de que el modal se cierre crea dos filas idénticas. `confirmLogCombo` está protegido por casualidad (`pendingLog` se anula sincrónicamente), no por diseño — inconsistente entre botones estructuralmente idénticos del mismo archivo.
- **Colisión real de CSS entre `nutrition.html` y `topbar.js` a ≤480px.** La regla global de `topbar.js` (`topbar.js:177-194`) fuerza cualquier `.modal` a pantalla completa (`height:100vh !important`), pero `nutrition.html` envuelve sus modales en `.modal-backdrop` con padding propio de 60px arriba/abajo (`nutrition.html:170-174`) que `topbar.js` no toca — el modal de 100vh queda dentro de un backdrop que ya le resta 120px, probablemente recortando/desplazando el contenido (fila de Guardar/Cancelar). Además, los modales de `nutrition.html` usan `.modal-backdrop`+`.on` (no `.modal-bg`/`.show`), por lo que **nunca activan el scroll-lock compartido** de `topbar.js`, y no tienen manejo de tecla Escape en ningún lado del archivo.
- **`po-water.html` es visualmente "otra app" pegada exactamente donde más se nota.** Variables de color (`--text-1`/`--good`/`--warn`/`--bad`) distintas a las del resto del dashboard, chasis de card **sólido y opaco** (`#111113`, sin `backdrop-filter`, sin `box-shadow`) en vez del vidrio translúcido que usa el resto — incluida la propia `health.html`, que lo embebe por `<iframe>` un renglón más arriba. La costura es literalmente visible en el borde del iframe.
- **`gym.html` tiene el mismo problema de chasis de card** que `po-water.html` (fondo opaco, sin blur, sin sombra) y su propio set de tokens de color (`--text-1/2/3`, `--good/warn/bad`) distinto al del resto del dashboard — es la segunda página que más se aleja del sistema de diseño documentado en `BUILD_DASHBOARD.md`.
- **Gráficos de `gym.html` se distorsionan en ancho angosto.** 4 charts (frecuencia semanal, volumen, cardio, distancia) más el de pasos usan `preserveAspectRatio="none"` con altura CSS fija y un viewBox de 700 unidades — a cualquier ancho de contenedor menor a 700px (o sea, siempre en mobile) el eje X se comprime más que el Y, distorsionando barras/etiquetas. Necesita confirmación visual real para medir qué tan grave se ve.
- **Accesibilidad de teclado: varias interacciones son mouse-only.** El reordenamiento por drag-and-drop de metas en `main.html` no tiene alternativa por teclado (`main.html:896-919`); el editado inline de texto (`main.html:861-894`) no es descubrible ni operable por teclado; `#ringWrap` de `nutrition.html` (`nutrition.html:233,918-920`) y los resultados de búsqueda de sustancias en `po-water.html` (`po-water.html:1002-1027`) son `<div>` con click pero sin `role`/`tabindex`; las celdas de calendario y los puntos/barras de gráfico de `habits.html` son igual de inalcanzables por teclado.
- **`--text-tertiary` (#76746E, ~4.2:1 de contraste) se usa para contenido que sí importa**, no solo metadata, en varios lugares: desglose de macros por comida y estado del balance calórico en `nutrition.html`; el texto de seguridad de `nova-lite.html` que explica a dónde viaja tu API key (justo el texto que más conviene que se lea bien).
- **`template.html`, la plantilla que se copia para páginas nuevas, propaga sus propios defectos**: borrar un ítem no tiene `confirm()` ni `aria-label`, el checkbox y el texto editable no tienen ninguna semántica accesible, y no modela ningún indicador de carga para el sync — cualquier página nueva construida a partir de este archivo hereda los tres problemas de entrada.

### MENOR — cosmético / pulido

- Botones primarios con forma de "pill" (~999px de radio) vs. rectángulo redondeado de 12px: la especificación de `BUILD_DASHBOARD.md` pide pill, pero la mayoría de los botones primarios reales (`main.html .gm-add`, `gym.html .po-btn-primary`) usan 12px. Solo un puñado de botones (login.html, nutrition.html, apps.html, template.html) son pill de verdad.
- Tokens de color re-declarados con otros nombres pero mismo valor en `habits.html` (`--hb-clean`/`--hb-relapse`/`--hb-goal` en vez de reusar `--success`/`--danger`/`--warning`), más un cuarto rojo nuevo sin sanción (`--hb-screen:#F14C4C`) que no coincide con `--danger` (#FF6B6B).
- `--danger` está declarado en `finance.html` pero se usa una sola vez; los 15+ rojos "de peligro" reales de la página usan un coral distinto (`#FF8A8A`) no documentado.
- Íconos-only con `title` pero sin `aria-label` en varios archivos (`gymUI.js`, `finance.html` editar/borrar suscripción, `avatar-lab.html` paletas — las 8 comparten el mismo `title` genérico y no se distinguen entre sí).
- Falta de `<label for>`/wrap real en formularios de `apps.html`, `avatar-lab.html`, `nova-lite.html`, `template.html`, `po-water.html` (Settings) y `finance.html` — un hábito de autoría repetido en casi todo el dashboard, no un caso aislado.
- CSS muerto en `gym.html`: ~70+ líneas de clases (`.po-ex-select`, `.po-log-grid`, todo el bloque `.rot-*`) sin ningún HTML/JS que las use — resabio de un tracker de una sola disciplina, descartado.
- `habits.html` muestra el texto "últimos 7 días" en la vista Mensual del gráfico de pantalla, sin actualizarlo (`habits.html:286` vs. `568`) — la etiqueta hermana sí cambia correctamente.
- Ningún gráfico SVG del dashboard (finance, gym, health, habits) tiene `role="img"`/`aria-label`/alternativa textual — gap dashboard-wide, no de una sola página.

---

## 2. Inventario por página (Tarea 1)

Convención: **Componente** · **Comportamiento encontrado** · **Severidad** · **archivo:línea**. Solo se listan hallazgos, no cada botón que funciona bien (ver categorías positivas al pie de cada bloque cuando algo se hizo notablemente bien).

### index.html (Home / stats)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Stat "Calorías" | Lee clave muerta `burned:*`, nunca cae a `'—'`, siempre parece un dato real y actual | **CRÍTICO** | `index.html:811-839` |
| `loadFinanceRates()` | Sin indicador de carga; `renderAllStats()` puede pintar el stat de gastos con tasa 1:1 (default) antes de que la tasa real llegue — un usuario no-CHF puede ver un número materialmente incorrecto por un instante | IMPORTANTE | `index.html:893,905-923,1073` |
| `loadFinanceRates()` catch | `catch(e){}` silencioso — una tasa vieja/incorrecta se queda sin aviso | IMPORTANTE | `index.html:906-914,920` |
| `warmUpFromCloud()` | Cero feedback visual (Promise.allSettled silencioso) — "todavía cargando" y "nunca hubo datos" se ven idénticos | IMPORTANTE | `index.html:1018-1059` |
| Stats de pasos/sets de gym | Muestran "0" en vez de `'—'` cuando nunca hubo datos (vs. otros stats que sí distinguen) | MENOR | `index.html:848,878-883` |
| `fetchWeather()` | Sin guardia de reentrada (doble clic reinicia la animación de spin) | MENOR | `index.html:639-674` |
| `.home-welcome` | Introduce fuente serif y color `#6B8E23` no documentados en el baseline | MENOR | `index.html:136-141,195-199` |
| Positivo | `fetchWeather` cae a caché + mensaje "Sin conexión" en error; sueño/patrimonio/gastos sí muestran `'—'` correctamente; `weatherRefreshBtn` tiene `aria-label`+`title` | — | `index.html:667-670,770-960,230` |

### main.html (Goals / To-Do)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| `goal-delete` | Sin `confirm()` — borra una meta permanentemente con un clic, mientras "Push remaining" (menos destructivo) sí confirma | IMPORTANTE | `main.html:976-981` vs. `1081` |
| Inline-edit de texto (`.gm-text`) | No es descubrible ni operable por teclado (sin `role`/`tabindex`/hint semántico) | IMPORTANTE | `main.html:861-894` |
| Drag-and-drop de reordenamiento | Sin alternativa por teclado | IMPORTANTE | `main.html:896-919` |
| `goalInput`/`tomorrowInput` | Solo `placeholder`, sin `<label>`/`aria-label` | IMPORTANTE | `main.html:624,643` |
| `gm-queue-btn` | Solo `title`, sin `aria-label` (inconsistente con `goal-delete`, que sí tiene ambos) | MENOR | `main.html:955-969` |
| `goal_streak_v1` | No sincronizada (ver DATA_AUDIT); la UI no distingue visualmente que puede divergir entre dispositivos | MENOR | `main.html:613-617,1018-1022` |
| Positivo | Polish button: guardia de doble-submit correcta (`disabled`+`finally`), mensaje claro cuando `ANTHROPIC_API_KEY` está vacía, error real bien mostrado en rojo; empty states de hoy/mañana/sueño bien diseñados; `gmPushBtn` recalcula visibilidad correctamente tras cada mutación; ticker con `aria-live` | — | `main.html:658,1097,1146-1161,621,641,1014-1015` |

### health.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Guardado de Sueño / Calorías Quemadas | Éxito mostrado sin verificar que `localStorage.setItem` no falló | **CRÍTICO** | `health.html:679,979-1003,1891,2070-2083` |
| Sync en background sobreescribe edición sin guardar (Calorías Quemadas) | Input se resetea silenciosamente ante un evento `storage`, perdiendo el tipeo del usuario | **CRÍTICO** | `health.html:2044-2061,2088-2090` |
| Sin ninguna acción de borrado | No existe forma de eliminar una noche de sueño o un registro de calorías ya guardado — solo resobreescribir | IMPORTANTE | (ausente en todo el archivo) |
| `burnedInput` | Sin `<label>`/`aria-label`, solo `placeholder` (inconsistente con los campos de Sueño, que sí anidan input en label) | IMPORTANTE | `health.html:1825` vs. `541-544` |
| Empty state de sueño en español | Único string en español en un archivo por lo demás en inglés (`"Aún no hay datos..."` vs. `"No sleep data yet"` 20 líneas después) | MENOR | `health.html:653-656` vs. `1414,1446` |
| `.sleep-week-svg` | Altura fija 800px sin override responsive — chart desproporcionadamente alto en columna angosta de mobile | IMPORTANTE (necesita verificación visual) | `health.html:436` |
| Positivo | Sin remanentes de UI de WHOOP (solo un comentario de código); popovers de calendario con Escape/click-afuera/focus-trap propios; iconos con `aria-label` consistente | — | `health.html:154,777-819,1950-1990` |

### po-water.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Reset ("cannot be undone") | Promesa falsa — la fila cloud reaparece en el próximo sync, sin aviso | **CRÍTICO** | `po-water.html:1061-1067` |
| Guardado general (`saveState`) | Mismo patrón de "éxito sin verificar" que health.html | **CRÍTICO** | `po-water.html:694-696` |
| Borrar una sustancia | Sin `confirm()`, a diferencia de Reset/Import (un renglón arriba, en el mismo modal) | IMPORTANTE | `po-water.html:981-986` |
| Modal de Settings | Sin cerrar por Escape ni por click-afuera — solo el botón "Done" | IMPORTANTE | `po-water.html:1037` |
| Import — error | Único uso de `alert()` nativo en todo el par de archivos — funciona, pero desentona con el resto de la app | MENOR | `po-water.html:1057` |
| Campos del formulario de Settings | `<label>` como hermano del input, no asociado con `for`/wrap | IMPORTANTE | `po-water.html:530-590` |
| Resultados de búsqueda de sustancia | `<div>` con click, sin `tabindex`/`role` — no operable por teclado | IMPORTANTE | `po-water.html:1002-1027` |
| Chasis de card | Fondo sólido opaco `#111113`, sin blur ni sombra — no matchea el vidrio del resto del dashboard, más notorio por estar iframeado bajo health.html | IMPORTANTE | `po-water.html:132-138` vs. baseline |
| Iframe de altura fija | 880px/780px no crecen con el contenido — riesgo de doble scrollbar con listas largas | IMPORTANTE (necesita verificación visual) | `health.html:2276` |
| Positivo | Reset/Import sí usan `confirm()`; botones primarios sí matchean el baseline (gradiente blanco); empty states de sustancias/búsqueda/historial bien resueltos | — | `po-water.html:1054,1062,429-438` |

### nutrition.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| `saveFood`/`saveCombo` | Sin guardia de doble-submit — doble clic crea duplicados | IMPORTANTE | `nutrition.html:684-695,717-733` |
| `log-del` | Sin `confirm()`, sin deshacer | IMPORTANTE | `nutrition.html:587-592` |
| No hay forma de borrar un food/combo ya creado | Solo alta, nunca baja | IMPORTANTE | (ausente) |
| Colisión CSS de modal a ≤480px con `topbar.js` | Ver resumen ejecutivo | IMPORTANTE | `nutrition.html:170-174` vs. `topbar.js:177-194` |
| Modales (`.modal-backdrop`+`.on`) | No matchean las clases que vigila `topbar.js` → nunca activan el scroll-lock; sin manejo de tecla Escape en ningún modal | IMPORTANTE | `nutrition.html:672-677` vs. `topbar.js:444-445` |
| `#dl-status-dot` | Se superpone con la pestaña "Fitness" de la bottombar compartida | IMPORTANTE | `dataLayer.js:115` vs. `topbar.js:100-107,213-232` |
| `#ringWrap` | `<div>` con click, sin `role`/`tabindex` — no accesible por teclado | IMPORTANTE | `nutrition.html:233,918-920` |
| Botón `×` de quitar ingrediente en combo | Sin `aria-label` | MENOR | `nutrition.html:703-704` |
| Positivo | Calorie Balance con estado vacío bien diseñado (no es el problema; el problema es la clave muerta que lee, ya cubierto en índice); calculadora degrada con gracia ante datos ausentes (sin NaN); búsqueda y log vacío bien resueltos; `dl-status-dot` confirmado correctamente cableado | — | `nutrition.html:620-626,820-843,658,581` |

### habits.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Sobreescribir un día pasado de NoFap | Sin `confirm()` — reescribe historia con un clic | IMPORTANTE | `habits.html:393-394,434-437` |
| NoFap: sin ningún feedback de guardado | Contrasta con Screen Time, que sí muestra "Saved ✓" (mismo archivo, mismo blob `po_habits_v1`) | IMPORTANTE | `habits.html:393-394` vs. `541-542` |
| "Saved ✓" da más confianza de la real | Solo confirma el guardado local; el push a Supabase es 100% silencioso (motor viejo) | IMPORTANTE | `habits.html:541-542` |
| Empty state del chart mensual | Muestra el texto de "últimos 7 días" también en vista Mensual | MENOR (confirmado, no ambiguo) | `habits.html:286` vs. `568` |
| Cero `aria-label` en todo el archivo | Nav de mes `‹`/`›` sin nombre accesible (inconsistente con el mismo patrón en nutrition.html, que sí lo tiene) | IMPORTANTE | `habits.html:238,240` vs. `nutrition.html:222,224` |
| Celdas de calendario / puntos de gráfico | `<div>`/`<circle>` con click, sin `role`/teclado; tooltip solo mouse/touch | MENOR/IMPORTANTE | `habits.html:434-437,622,679` |
| `.hb-row` | 3 campos + botón sin manejo explícito de mobile — probablemente wrappea a los 375px, mientras nutrition.html sí tiene tratamiento explícito | MENOR (necesita verificación visual) | `habits.html:141` |
| Chasis de card | 18px de radio + borde propio, diverge levemente del baseline (16px, sin borde) y de nutrition.html | MENOR | `habits.html:69-75` |
| Cuarto rojo sin sanción | `--hb-screen:#F14C4C` no coincide con `--danger` | MENOR | `habits.html` (tokens) |
| Positivo | Botones de navegación de calendario usan `disabled` nativo correctamente en los límites de mes; gráficos recalculan `viewBox` según ancho real del contenedor | — | `habits.html:121-122,412,582-689` |

### finance.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Borrar cuenta de Net Worth | Sin `confirm()`, sin `aria-label` — la acción más grave de la página, la menos protegida | **CRÍTICO** | `finance.html:2277-2284` |
| `loadArsRates` TDZ | Real pero acotado — solo el widget de cotización ARS queda sin poblar hasta refresh manual; NO rompe tabs/botones/el resto de la página (ver resumen ejecutivo, corrige una nota de memoria previa) | IMPORTANTE | `finance.html:2192-2216,2565,2857` |
| Ningún add-handler tiene guardia de doble-submit | Doble clic puede duplicar cuentas/subs/ordenes/wishlist/gastos | IMPORTANTE | `finance.html` (todos los `do*Add`) |
| Borrar orden/wishlist/gasto | Sin `confirm()` en ninguno de los tres | IMPORTANTE | `finance.html:3290-3298,3488-3495,3845-3846` |
| `loadExchangeRates()` catch | `catch(e){}` totalmente silencioso, ni siquiera log | IMPORTANTE | `finance.html:2158` |
| Subcards de Net Worth (Bank/Stocks/Crypto/Other) | Único conjunto de listas de toda la página sin empty state diseñado — tira vacía sin texto | IMPORTANTE | `finance.html:1774-1813` |
| `.nw-subcard .quick-add` | Único formulario de alta sin tratamiento mobile explícito (todos los demás sí lo tienen a ≤600px) | IMPORTANTE (necesita verificación visual) | `finance.html:411-419` |
| `outline:none` en 6 inputs, cero reemplazo de foco en todo el archivo | Usuarios de teclado no ven foco en ningún input de texto de la página | IMPORTANTE | `finance.html:308,782,1003,1495,2301,2341` (sin ningún `:focus` en el archivo) |
| `.wish-hero-top` | Sin `flex-wrap`; un total grande podría recortarse en vez de wrappear a 375px | MENOR (necesita verificación visual) | `finance.html:938-941` |
| `--danger` declarado pero casi no usado | 15+ rojos reales usan `#FF8A8A` en vez del token | MENOR | `finance.html:36` vs. usos reales |
| Migración silenciosa de "Efectivo" | Corre en cada carga tras la primera vez, sin ningún aviso (aunque no destructiva) | MENOR | `finance.html:2761-2774` |
| Positivo | El único botón con loading real de toda la página (`arsRefreshBtn`, spin + texto "Actualizando…"); empty states de Subs/Incoming/Wishlist/Expenses/Activity/Chart/Donut todos bien diseñados (contradice el riesgo que sugería DATA_AUDIT sobre las filas vacías de `subs`/`incoming_orders`); no existe ningún modal real en la página, por lo que la pregunta sobre compatibilidad con el scroll-lock de `topbar.js` es un no-issue, no un bug | — | `finance.html:2242-2248,1833,1897-1901,1950-1954,2014-2027` |

### gym.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Sync de `gym_pesas_store` (vía `gymPesasStore.js`) | Ver resumen ejecutivo — falla 100% silenciosamente | **CRÍTICO** | `gymPesasStore.js:95-167`, consumido en `gymUI.js:297-314,410,684` |
| Subida de foto de progreso | Falla silenciosa + foto invisible para siempre en otros dispositivos | **CRÍTICO** | `gym.html:3556-3570,3599-3607,3883-3887` |
| Ningún botón "Guardar" (pesas/cardio/movilidad/ejercicio/config/workout) tiene guardia de doble-submit ni estado de carga | Doble-tap con manos sudadas a mitad de entrenamiento puede duplicar un set/sesión | IMPORTANTE | `gymUI.js:610-646,754-784,674-688,396-413,297-314`; `gym.html:2616-2630` |
| Reimportar JSON de Lyfta | Reemplaza todo el historial sin ningún `confirm()` | IMPORTANTE | `gym.html:2559-2583` |
| `GymPesasStore.deleteMobilityLogEntry` | Existe en el store pero no está cableado a ningún botón — no hay forma de borrar una entrada de movilidad desde la UI | IMPORTANTE | `gymPesasStore.js:278-281` (sin caller en `gymUI.js`) |
| 3 patrones de confirmación distintos conviviendo | `confirm()` nativo (Reset/Import Settings) vs. "tocar de nuevo en 3s" (borrar foto) vs. ninguno (reimport Lyfta, borrar movilidad inexistente) | IMPORTANTE | `gym.html:2690,2680,3776-3793` |
| Zero indicador de sync en las 3 vías (po-coach, workout_history, gym_pesas_store) | Confirmado explícitamente, ningún spinner/dot/texto en ninguna | IMPORTANTE | `gym.html:3968-3982,4114-4125`; `gymPesasStore.js:95-106` |
| Charts con `preserveAspectRatio="none"` | Distorsión horizontal en cualquier ancho <700px (viewBox), 5 gráficos afectados | IMPORTANTE (necesita verificación visual) | `gym.html:889,1001` y usos en `1905,1915,1922,1929,1685` |
| `.po-set-row input` / `.nv-input` (Nova chat) | `outline:none` sin reemplazo de foco | IMPORTANTE | `gym.html:577-582,4225` |
| Modales sin Escape ni click-afuera | Todos los `.po-modal-bg` y los `.wt-*` se cierran solo con botón explícito | IMPORTANTE | (todo el set de modales) |
| Chasis de card opaco, sin blur/sombra | Mismo problema que `po-water.html`, tokens de color propios (`--good/warn/bad`) | IMPORTANTE | `gym.html:243-249,919-924,842-848,39-56` |
| Iconos `✎`/`×` con solo `title` | Inconsistente con `wh-add-ex-del`, que sí tiene `aria-label`, en el mismo archivo | MENOR/IMPORTANTE | `gymUI.js:348,562,568` vs. `gym.html:2599` |
| `#nvSend` (Nova chat) | Sin `aria-label` ni `title` | MENOR | `gym.html:4247` |
| ~70+ líneas de CSS muerta (tracker de una disciplina, descartado) | No afecta el render, sí el mantenimiento | MENOR | `gym.html` (bloque `.rot-*` y compañía) |
| Positivo | Nova API key confirmado `type="password"` (gym.html solo lee la key, no la pide); empty states de todas las listas de la página (workouts, PRs, movilidad, progresión, fotos, peso, pasos) bien diseñados; los 9 modales de diálogo sí matchean exactamente las clases/toggles que `topbar.js` vigila (scroll-lock funciona); warm-up del mapa de fatiga muestra "Cargando datos de recovery…" en la carga inicial | — | `nova-lite.html:96`, `gym.html:2442,2469,1904-1928,2484-2485`; `gymUI.js:215-222,262-267,889` |

### gym*.js (módulos, sección propia porque no son páginas)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Toda mutación en `gymPesasStore.js` | Ver CRÍTICO #2 del resumen ejecutivo — análisis línea por línea completo | **CRÍTICO** | `gymPesasStore.js:95-106,111-128,130-134,136-167` |
| Recuperación/fatiga "sin datos" == "recuperación perfecta" | `linearPenalty` devuelve 0 tanto para `null` (sin dato) como para el valor neutro real — la UI nunca distingue "no hay info de sueño/proteína/pantalla" de "estás perfecto" | IMPORTANTE | `gymEcosystem.js:104,119-131` + `gymUI.js:243-251` |
| `lastTrainedAt` calculado pero nunca mostrado | "Nunca entrenado" y "totalmente recuperado" se ven idénticos (ambos 0%) | MENOR | `gymUI.js:230-235` (dato disponible en `gymMuscleFatigue.js:65,95-97`) |
| Barra de comparación en 0 | Renderiza una barra invisible de altura 0 en vez de un estado vacío diseñado (solo alcanzable en el caso mixto semana-actual-vs-pasada) | MENOR | `gymCharts.js:57` |
| Gráficos sin `role="img"`/alternativa textual | — | MENOR | `gymCharts.js` (todo el archivo) |
| Positivo | `gymMuscleFatigue.js` implementa correctamente la gula "nunca inventar datos" con su flag `isPlaceholder`; filas del mapa muscular en `gymUI.js` sí son accesibles por teclado (`role="button"`+Enter/Space) | — | `gymMuscleFatigue.js:67-70`; `gymUI.js:232-240` |

### apps.html (bento nav)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Campos del formulario de perfil (altura/peso/edad/actividad) | `<label>` sin `for` — no asociado al input | IMPORTANTE | `apps.html:335-370` |
| Toggles segmentados (unidad altura/peso/sexo) | Solo clase `.on` visual, sin `aria-pressed` | IMPORTANTE | `apps.html:339-368` |
| `tile-sub` | Texto de wayfinding real en `--text-tertiary` (el color más tenue) | MENOR | `apps.html:119-121` |
| Positivo | Modal de Settings con las 3 formas de cierre (X, click-afuera, Escape) implementadas localmente; sin depender de `topbar.js` para eso (aunque sí se beneficia del scroll-lock automático); los 8 links del bento grid verificados, ninguno roto; 3 breakpoints (`480/720/440px`) sin problema aparente de doble-altura en la transición | — | `apps.html:327-378,487-488,212-321,129-138` |

### avatar-lab.html (playground, sin persistencia)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| "Use in Nova" (copiar CSS) | Muestra "✓ Copied" incondicionalmente, incluso si tanto el Clipboard API como el fallback de `execCommand` fallan | IMPORTANTE | `avatar-lab.html:282-291` |
| Labels de controles (Colors/Palettes/State/Size) | Sin `for`, no asociados a sus inputs | IMPORTANTE | `avatar-lab.html:163-189` |
| 8 botones de paleta | Comparten el mismo `title="Apply palette"` genérico — no se distinguen entre sí por nombre accesible | IMPORTANTE | `avatar-lab.html:237-239` |
| Toast de confirmación | Sin `aria-live` | MENOR | `avatar-lab.html:195` |
| Nota | Divergencia visual del baseline es intencional (es un playground de diseño, así lo dice su propio comentario) — no se cuenta como inconsistencia | — | `avatar-lab.html:7-12` |

### nova-lite.html (chat widget)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Input no se deshabilita durante `busy` | Un segundo Enter durante una respuesta pendiente se ignora sin ninguna señal visual de por qué | IMPORTANTE | `nova-lite.html:179-215` |
| Mensaje de bienvenida | Dice "Pega tu key arriba" incluso a un usuario que ya tiene una key guardada | MENOR/IMPORTANTE | `nova-lite.html:130,217` |
| `.hint` sobre privacidad de la key | Texto de confianza relevante para seguridad, en color de bajo contraste (`--muted`) | IMPORTANTE | `nova-lite.html:99-102` |
| `#chatInput`/`#keyInput` | Solo `placeholder`, sin `<label>` | IMPORTANTE | `nova-lite.html` (inputs) |
| Sin `@media` en todo el archivo | Header con orb+título+botón sin ajuste angosto — riesgo no confirmado | MENOR (necesita verificación visual) | `nova-lite.html:28-29,88-92` |
| Sistema visual propio, no el del dashboard | Posiblemente intencional (el propio comentario del archivo lo describe como "portable a cualquier dashboard"), pero genera una discontinuidad real al navegar desde `apps.html` | IMPORTANTE (decisión de producto a confirmar, no bug claro) | `nova-lite.html` (tokens propios) |
| Positivo | Doble-submit correctamente guardado (`busy` flag limpio en todos los caminos); indicador de "escribiendo" con 3 puntos animados; los 3 caminos de error (sin key, error de API, fallo de red) muestran mensaje visible y distinto — el manejo de errores más robusto de las 13 páginas; key input correctamente `type="password"` | — | `nova-lite.html:183-211,184-185,182,203,207-210,96` |

### template.html (scaffold interno, no una página real en producción)
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Botón de borrar ítem | Sin `confirm()`, sin `aria-label` — y al ser la plantilla que se copia, este defecto se propaga a cada página nueva | IMPORTANTE | `template.html:431-437` |
| Checkbox / texto contentEditable | Sin ninguna semántica accesible (`aria-label`, `role="textbox"`) | IMPORTANTE | `template.html:410-425` |
| Sin modelo de loading para el sync | El template tampoco muestra cómo dar feedback de guardado en la nube — perpetúa el gap en cualquier página nueva | IMPORTANTE | `template.html:465-472` |
| "Example 1" (stat card) | 100% números hardcodeados de muestra, sin ningún marcador que impida que alguien lo copie sin conectarlo a datos reales | MENOR | `template.html:308-330` |
| Positivo | El sistema de tokens/chasis de card/tipografía es una copia fiel del baseline (es, literalmente, la referencia); "Example 2" sí tiene un empty state bien diseñado, digno de copiarse | — | `template.html:397-402` |

### login.html
| Componente | Comportamiento encontrado | Severidad | archivo:línea |
|---|---|---|---|
| Mensaje de error genérico | Un error de red y una contraseña incorrecta muestran el mismo texto ("Could not sign in — check your email and password"), a diferencia del caso "librería no cargada", que sí tiene su propio mensaje | IMPORTANTE | `login.html:132-138` |
| Positivo | Único formulario del dashboard con guardia de doble-submit completa y correcta (`disabled`+cambio de texto a "Entering…", reversión en el catch); redirige solo si ya hay sesión; inputs con `autocomplete`/`type` correctos | — | `login.html:126-138,116-119,85-87` |

---

## 3. Patrones inconsistentes entre páginas (Tarea 3)

**Loading / estado de sync.** Tres motores de sync (ya documentados en DATA_AUDIT §7.4) implican tres experiencias distintas para el usuario, y en la práctica **una sola** es visible: `sync.js` (9 páginas) es completamente mudo; los 3 canales propios de `gym.html` son completamente mudos; solo `dataLayer.js` (únicamente `nutrition.html`) muestra un punto de estado + un toast — y ese punto se superpone con la barra de navegación inferior compartida. El usuario no tiene ninguna forma de saber, en 12 de las 13 páginas, si un cambio realmente llegó a la nube.

**Confirmación de acciones destructivas.** Conviven al menos 4 patrones distintos sin ninguna regla clara de cuándo usar cada uno: `confirm()` nativo, un patrón de "tocar de nuevo dentro de 3 segundos" (solo en `gym.html`, para fotos), y ningún tipo de confirmación. La correlación entre "qué tan destructiva es la acción" y "cuánta fricción tiene" está invertida en varios casos (borrar una cuenta de Net Worth con dinero real no confirma; mover metas no destructivas a mañana sí confirma).

**Convenciones de modal.** Se identificaron al menos 4 sistemas de apertura/cierre de overlay coexistiendo:
1. `.modal-bg` / `.po-modal-bg` + clase `.show` — el que vigila `topbar.js`. Usado correctamente por `apps.html` y por los 9 modales de diálogo de `gym.html`.
2. `.wt-overlay` / `.wt-viewer` / `.wt-cam` + clase `.is-open` — también vigilado por `topbar.js`, usado por el visor de fotos/cámara de `gym.html`.
3. `.modal-backdrop` + clase `.on` — **no vigilado por `topbar.js`** — usado únicamente por `nutrition.html`, con la colisión de CSS ya descripta y sin manejo de Escape.
4. Popovers de calendario/fecha (`.hidden`/`.open`, o `.steps-popover`) — no son modales de pantalla completa por diseño, implementan su propio Escape/click-afuera/focus-trap a mano en `health.html`, `po-water.html` y `gym.html` (duplicado casi literal en dos archivos).
`finance.html` no tiene ningún modal real — todo son ediciones inline — por lo que la pregunta de compatibilidad con `topbar.js` no aplica ahí.

**Guardado local vs. guardado real.** `health.html` y `po-water.html` comparten el mismo patrón de "mostrar éxito sin verificar la escritura" en sus 3 flujos de guardado — el `try/catch` de `localStorage.setItem` nunca se revisa antes de confirmar visualmente al usuario.

**Etiquetado de inputs/botones-ícono.** El gap de `<label for>` faltante aparece en `finance.html`, `po-water.html`, `apps.html`, `avatar-lab.html`, `nova-lite.html`, `template.html`, `main.html` y `health.html` (`burnedInput`) — es un hábito de autoría transversal a casi todo el dashboard, no un defecto de una sola página. Del mismo modo, botones-ícono con `title` pero sin `aria-label` aparecen en `gymUI.js`, `finance.html` y `avatar-lab.html`, mientras que otros archivos (`nova-lite.html`, `apps.html`, partes de `health.html`/`nutrition.html`) sí usan `aria-label` consistentemente — no hay una convención única seguida en todo el proyecto.

**Sistema de diseño.** El baseline de `BUILD_DASHBOARD.md` (tokens `--text-primary/secondary/tertiary`, `--success/warning/danger`, chasis de card translúcido con blur, botón primario en forma de pill) se sigue fielmente en `index.html`, `main.html`, `nutrition.html`, `apps.html`, `template.html` y en gran parte de `finance.html`. Tres páginas se apartan de forma sistemática, no puntual: `po-water.html` y `gym.html` usan un chasis de card **opaco** (sin blur ni sombra) y sus propios nombres/valores de color; `habits.html` re-declara los mismos 3 colores semánticos con otros nombres y agrega un cuarto rojo sin sanción; `nova-lite.html` y `avatar-lab.html` tienen sistemas de color completamente propios (el segundo, deliberadamente, por ser un playground).

---

## 4. Hallazgos de responsive / mobile

**Advertencia de método:** no hay herramienta de navegador disponible en este entorno. Todo lo siguiente se infiere de `@media` queries, `grid`/`flex` rules y dimensiones fijas leídas del CSS — no de una captura de pantalla real. Cada ítem dice explícitamente si necesita confirmación visual.

- **`nutrition.html`**: colisión de CSS de `topbar.js` (`.modal` forzado a 100vh a ≤480px) contra el padding propio de `.modal-backdrop` (60px arriba/abajo) — la regla en sí es inequívoca en el código; el resultado pixel-exacto necesita confirmarse en un teléfono real. `nutrition.html:170-174` vs. `topbar.js:177-194`.
- **`finance.html`**: `.nw-subcard .quick-add` es el único formulario de alta de toda la página sin tratamiento mobile explícito (todos los demás sí lo tienen a ≤600px) — a 375px el campo de nombre queda apretado entre un campo de monto de 100px fijo y un botón; y `.wish-hero-top` no tiene `flex-wrap`, con riesgo de recorte de un total grande en vez de que haga wrap. Ambos necesitan verificación visual real. `finance.html:411-419,938-941`.
- **`gym.html`**: 5 gráficos SVG (`preserveAspectRatio="none"` con altura fija y viewBox de 700 unidades) se distorsionan horizontalmente en cualquier ancho de contenedor menor a 700px — la distorsión existe siempre en mobile, la severidad visual exacta necesita confirmarse. `gym.html:889,1001,1685,1905,1915,1922,1929`.
- **`health.html`**: `.sleep-week-svg` tiene 800px de alto fijos sin ningún override responsive — en columna única de mobile (no aplica el layout de 2 columnas que solo entra a partir de 1024px) el gráfico queda desproporcionadamente alto y con mucho scroll para su densidad de contenido real. `health.html:436`.
- **`po-water.html` embebido**: el `<iframe>` tiene alturas fijas (880px / 780px a ≤480px) que no crecen con el contenido — listas largas de sustancias o el historial expandido podrían generar un scrollbar interno anidado dentro del iframe, encima del scroll de la página. Necesita confirmación visual con contenido real. `health.html:2276`.
- **`habits.html`**: `.hb-row` (Fecha + Horas + Meta + botón Guardar, todos con `min-width:110px`) no tiene tratamiento mobile explícito — 3 campos a 110px ya casi agotan el ancho útil de un viewport de 375px antes de sumar el botón; se apoya en el `flex-wrap` por defecto en vez de un diseño deliberado, a diferencia de `nutrition.html`. `habits.html:141`.
- **`nova-lite.html`**: cero `@media` queries en todo el archivo; el header (orb 60px + título serif + botón de ícono) no tiene ajuste angosto explícito — riesgo bajo pero no confirmado. `nova-lite.html:28-29,88-92`.
- **`index.html`**: `.home-weather-row` no tiene `flex-wrap`, pero sí `flex:1; min-width:0` en el bloque de info — debería truncar en vez de desbordar; no confirmado visualmente. `index.html:173-179`.
- **Confirmado limpio / sin riesgo aparente**: `apps.html` (3 breakpoints, transición de grid verificada sin doble-altura), `po-water.html` propio (`@media max-width:480px`, sin elementos de ancho fijo problemáticos), `main.html` (headers y filas de input con `flex-wrap` correctamente aplicado), `.tr-pesas-set-row` de `gym.html` (la aritmética de columnas fijas + 1fr sí entra en 375px pese a la densidad).
- **Lockdown móvil global de `topbar.js`** (oculta scrollbar, `touch-action:pan-y`, fuerza modales a pantalla completa) aplica a las 10 páginas que cargan `topbar.js`. **No aplica** a `avatar-lab.html`, `nova-lite.html` ni `login.html`, que no lo cargan — consistente con que ninguna de las tres necesita la navegación compartida, pero implica que si alguna de ellas tuviera un modal real, no tendría scroll-lock ni el tratamiento full-screen a 480px (en la práctica, ninguna de las tres tiene un modal real hoy).

---

## 5. Hallazgos de accesibilidad

- **Inputs sin `<label>` asociado (solo `placeholder` o `<label>` sin `for`):** `finance.html` (casi todos los campos de monto/nombre/moneda), `po-water.html` (todo el modal de Settings), `health.html` (`burnedInput`), `main.html` (`goalInput`/`tomorrowInput`), `apps.html` (formulario de perfil completo), `avatar-lab.html` (los 4 grupos de controles), `nova-lite.html` (`chatInput`/`keyInput`), `template.html` (`itemInput`). Es el hallazgo más repetido de toda la auditoría — un hábito de autoría, no un caso puntual.
- **Botones-ícono sin `aria-label` (solo `title`, o nada):** el más grave es el borrar-cuenta de `finance.html` (`nw-del`, sin `title` ni `aria-label`, y es la acción con más impacto económico de la página); luego `gymUI.js` (editar/quitar ejercicio/set), `habits.html` (navegación de mes, cero `aria-label` en todo el archivo), `avatar-lab.html` (8 botones de paleta con el mismo `title` genérico, indistinguibles entre sí), `template.html` (botón de borrar, sin ninguna etiqueta). Contraejemplos bien resueltos: `nova-lite.html`, `apps.html`, la mayoría de `health.html`/`nutrition.html`.
- **Operabilidad por teclado:** el reordenamiento por drag-and-drop de `main.html` no tiene alternativa por teclado; el editado inline de `main.html` no es descubrible sin mouse; `#ringWrap` de `nutrition.html`, los resultados de búsqueda de `po-water.html`, y las celdas de calendario + puntos/barras de gráfico de `habits.html` son todos `<div>`/`<circle>`/`<rect>` con `click` pero sin `role`/`tabindex`. El contraejemplo positivo es `gymUI.js`, cuyas filas del mapa muscular sí implementan `role="button"` + Enter/Space correctamente.
- **Supresión de foco sin reemplazo visible:** `finance.html` tiene `outline:none` en 6 inputs y **cero** reglas `:focus` en todo el archivo — el gap más grande y sistemático de la auditoría en esta categoría. También `po-water.html` (`.sub-dose-input`) y `gym.html` (`.po-set-row input`, `.nv-input` del chat Nova). La mayoría de los demás campos del dashboard sí compensan `outline:none` con un `:focus` visible (border/box-shadow) — confirmado explícitamente en `main.html`, `nutrition.html`, `habits.html`.
- **Contraste de `--text-tertiary` (#76746E, ~4.2:1 estimado, justo bajo el 4.5:1 de WCAG AA) usado para contenido real, no solo metadata:** desglose de macros por comida y estado del balance calórico en `nutrition.html`; el texto de privacidad de la API key en `nova-lite.html` (justamente el texto que más conviene leer antes de pegar una credencial); `tile-sub` de `apps.html`. El valor de contraste es una estimación por fórmula, no una medición con herramienta real — ver sección 6.
- **Gráficos SVG sin alternativa textual:** ninguno de los charts del dashboard (`gym.html`/`gymCharts.js`, `health.html`, `habits.html`, `finance.html`) tiene `role="img"`, `aria-label` o un resumen textual — es un gap consistente en todo el proyecto, no de un solo archivo.
- **Positivo, vale la pena destacar:** `login.html` (guardia de doble-submit + mensajes de error visibles), `nova-lite.html` (los 3 caminos de error son visibles, key input enmascarado), `gymUI.js` (mapa muscular accesible por teclado), `main.html` (ticker con `aria-live`), el patrón general de `disabled` nativo en navegación de calendario (`habits.html`, `health.html`).

---

## 6. Lista de "NO VERIFICABLE DESDE CLAUDE CODE"

Este entorno no tiene herramienta de navegador ni de captura de pantalla — nada de esto se pudo confirmar visualmente, solo inferir del código:

- **Severidad visual exacta de cada hallazgo de responsive marcado como "necesita verificación visual"** en la sección 4: el apretujamiento de `.nw-subcard .quick-add` y el posible recorte de `.wish-hero-top` en `finance.html`; la distorsión real de los 5 gráficos de `gym.html`; qué tan alto/incómodo se ve `.sleep-week-svg` en un teléfono real; si el iframe de `po-water.html` genera un scrollbar anidado con contenido largo; si `.hb-row` de `habits.html` efectivamente wrappea sin verse roto a 375px; si el header de `nova-lite.html` se ve apretado sin `@media` alguno.
- **El resultado pixel-exacto de la colisión de CSS del modal de `nutrition.html`** a ≤480px: la colisión de reglas está confirmada en el código (`topbar.js:177-194` vs. `nutrition.html:170-174`), pero si el modal se ve "solo un poco desplazado" o "claramente roto/cortado" requiere abrirlo en un teléfono real.
- **La posición/superposición exacta del `#dl-status-dot` sobre la pestaña "Fitness"** de la bottombar en distintos tamaños de pantalla — confirmado que las coordenadas coinciden en el CSS, no confirmado el radio exacto de interceptación del tap.
- **Contraste real de `--text-tertiary`** medido con una herramienta como el analizador de WebAIM — el ~4.2:1 citado en este documento es una estimación por fórmula de luminancia, no una medición certificada.
- **Comportamiento real de lectores de pantalla** ante los botones con solo `title` (sin `aria-label`) — el razonamiento de "el nombre accesible prioriza el texto visible sobre el `title`" es un estándar de la especificación, pero no se probó con un lector de pantalla real (NVDA/VoiceOver/TalkBack).
- **Si en algún momento anterior el bug de TDZ de `loadArsRates` en `finance.html` realmente rompía toda la página**, como describía una nota de sesión previa de este proyecto — el código actual, verificado línea por línea en esta auditoría, no reproduce ese comportamiento (ver corrección en el resumen ejecutivo y nota final). No hay forma de confirmar si el código cambió desde esa observación o si la observación original fue imprecisa, sin acceso a versiones anteriores o a los logs de esa sesión.
- **Latencia real (>3s) de cualquier llamada a Supabase** bajo condiciones de red reales (3G, wifi inestable, etc.) — todo lo dicho sobre "qué pasa si tarda" es sobre el código tal cual está escrito (qué indicador existe o no), no sobre una medición de tiempo real.
- **Comportamiento real de `lock.js` en el despliegue de Vercel** — ya señalado en `DATA_AUDIT.md` §8, aplica también a `login.html`, que lo carga en la línea 4; el archivo no existe en esta copia de trabajo.
- **Anuncio real por lector de pantalla del ticker `aria-live` de `main.html`** y de los toasts sin `aria-live` (`avatar-lab.html`) — el marcado está confirmado, el comportamiento audible no.

---

## 7. Checklist final

- [x] Leí las 13 páginas HTML y los 11 módulos JS (corregido de la cuenta original de 12/10 — ver nota al principio)
- [x] Audité botones/interactivos, estados de carga, estados de error, estados vacíos, modales, responsive, accesibilidad y consistencia visual en cada página
- [x] Clasifiqué cada hallazgo por severidad (CRÍTICO / IMPORTANTE / MENOR) con archivo:línea concreto
- [x] Referencié cruzado los hallazgos relevantes de `DATA_AUDIT.md` y describí su impacto visual específico
- [x] Señalé explícitamente una corrección a una nota de memoria previa del proyecto (severidad del bug de `loadArsRates`)
- [ ] Fase B (verificación visual real en navegador/dispositivo) — **no disponible en este entorno**; todo lo que la necesitaba quedó listado en la sección 6, no se inventó ningún resultado visual
- [x] No modifiqué ningún archivo del proyecto salvo la creación de este mismo `UI_AUDIT.md`
- [x] No toqué `DATA_AUDIT.md`
- [x] No hice ninguna llamada de escritura a Supabase (ni de prueba)

---

**Nota de memoria:** la memoria del proyecto `project-finance-ars-tdz-bug` describe este bug como un corte total del script de `finance.html` ("todo lo que sigue nunca corre"). Esta auditoría lo verificó línea por línea contra el código actual y encontró que, al ser `loadArsRates` una `async function`, el throw se convierte en una promesa rechazada no manejada — no interrumpe la ejecución síncrona del resto del script, que continúa y vuelve a renderizar todo correctamente en `finance.html:2857`. Esa memoria quedará actualizada por separado para reflejar este alcance más acotado.
