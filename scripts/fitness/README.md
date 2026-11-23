# Fitness en Jarvis

## Historial y transición

El 23/11/2026 el inventario de solo lectura del proyecto personal encontró 167 filas en `records/gym_workouts`. La pantalla, el importador y la interfaz SQL usan su clave primaria `(collection,id)`. No hay una segunda tabla de sesiones que mantener.

| Fuente | Leídas | Resultado de la preview |
|---|---:|---|
| Colección canónica, origen Lyfta | 132 | 30/06/2025 al 23/11/2026, 131 históricas y una con ID de API |
| Colección canónica, origen manual | 34 | 02/07/2026 al 13/11/2026, 22 de pesas y 12 de boxeo/muay thai |
| Colección canónica, origen Strava | 1 | 03/07/2026, figura como pesas en el original |
| Archivo Supabase `workout_history/lyfta_data` | 134 | 131 Lyfta, dos manuales y una Strava. Las 134 tienen correspondencia única por contenido, incluidas las notas. Cero altas o enriquecimientos necesarios |
| API paginada sin filtro de instalación | 163 | 30/06/2025 al 20/11/2026. 13 altas candidatas, 25 enriquecimientos, 125 para revisar |
| Pesajes `gym_body_weight` | 17 | Serie independiente |
| Markdown, respaldos de navegador | — | No se identificó un Markdown de sesiones ni se exportó un perfil personal. El archivo de Supabase cubre las 134 entradas históricas verificadas |

La fecha más reciente de una consulta sin filtros y la de la colección pueden diferir. La ausencia de un ID en una respuesta jamás desencadena una baja. La auditoría vieja describe un escritor de blobs. La implementación actual escribe por fila y mantiene espejos para consumidores como Nutrición. La primera carga del rediseño retiene una copia local de los espejos anteriores con sufijo `:original`.

## Operación de Lyfta

`scripts/lyfta/activar.sh` configura un timer de usuario cada quince minutos. La tarjeta muestra la marca de `gym_lyfta_sync/main` escrita al terminar las páginas y lotes. La fecha de sesión corresponde a cuándo entrenaste. Un timer apagado deja visible la marca anterior. La API usa filtros UTC por fecha de actividad y no documenta un flujo de eliminaciones. Después de la recuperación inicial, el importador relee catorce días y hace un barrido completo semanal. Los HTTP transitorios tienen reintentos acotados. El límite documentado es 60 solicitudes por minuto. [Lyfta](https://my.lyfta.app/developers) · [OpenAPI](https://my.lyfta.app/openapi.json) · [Sandbox](https://my.lyfta.app/api/sandbox/v1/workouts)

Para repetir la preview con la configuración personal ya conectada:

```sh
umask 077
python3 scripts/lyfta/importar.py preview
```

La salida da IDs candidatos y fecha para revisar, sin series ni notas. Un archivo JSON privado puede resolver casos explícitamente, por ejemplo `{"lyfta-1001":"sesion-historica-42","lyfta-1002":"NUEVA"}`. Repetí `preview --resoluciones /ruta/privada.json` y aprobá el resultado antes de usar `recuperar` con las mismas resoluciones. `recuperar` es el punto de transición del historial completo. Sin resolución, un caso ambiguo no se agrega. Los IDs canónicos existentes sobreviven a una coincidencia. Se conserva el ID de Lyfta, la procedencia combinada, las notas y el original histórico antes del enriquecimiento. Las correcciones por ID sustituyen el conjunto de series completo.

Cada aplicación escribe un diario privado `lyfta-reversion-*.json` junto a la configuración del importador antes de enviar datos. `python3 scripts/lyfta/revertir.py RUTA_AL_DIARIO` previsualiza la reversión. Con `--aplicar` restaura solo filas cuyo contenido sigue coincidiendo con la versión escrita. Revisá los diarios en orden cronológico inverso y coordiná la pausa del timer al revertir una recuperación.

## Lectura autenticada

La migración PostgreSQL 15+ es `001_read.sql`. Antes de aplicarla, verificá la identidad dueña de este dashboard personal y configurá `SET fitness.owner_id = '<UUID>'` en la misma conexión. Las filas históricas son compartidas y carecen de columna de usuario. La migración vincula las colecciones existentes a ese propietario. RLS restringe los registros canónicos y el archivo histórico. Las vistas de sesiones, series, semanas, pesajes y PR usan permisos del invocador. Las proyecciones de configuración y señales de recuperación solo exponen al propietario los campos necesarios. Para deshacer el esquema, `001_down.sql` elimina los contratos y las políticas agregadas. Conserva las sesiones y pesajes y restablece las políticas de acceso previas.

Habilitá el esquema `fitness` para PostgREST en el entorno de destino. `GET /api/fitness` es la ruta para la IA, operativa en un entorno de funciones Vercel con `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FITNESS_READER_JWT` y `FITNESS_READ_TOKEN`. El JWT privado del servidor debe estar firmado por el emisor admitido por Supabase, con `role=fitness_reader`, `sub` del propietario y vencimiento. Rotá ese JWT antes de su vencimiento. El agente recibe únicamente `FITNESS_READ_TOKEN` en el encabezado Authorization Bearer. La ruta limita recursos, filtros, métodos y tamaño de página. El servidor estático sirve la pantalla, mientras que la ruta de IA requiere la función.

| Recurso | Qué representa una fila |
|---|---|
| sessions | Una sesión con ID canónico, día argentino, instante opcional, precisión temporal, título, disciplina, duración en minutos si se conoce y procedencias |
| sets | Una serie localizada por sesión, posición de ejercicio y posición de serie (desde 1), ID de origen opcional, nombre original, clave normalizada, repeticiones, carga original y unidad, RIR numérico y original, tiempo, distancia y completitud |
| exercise_muscles | Una asociación principal o secundaria del catálogo y las correcciones del usuario. Para contar series, agrupá primero por identidad de serie |
| body_weight | Un pesaje manual por día. Los anteriores sin unidad explícita exponen NULL. La referencia corporal de Lyfta permanece en la sesión de origen |
| personal_records | Seis filas fijas, con sesión y serie ganadoras cuando existe una marca |
| weekly | Una semana que empieza el lunes, sesiones, fechas activas y desglose por disciplina |
| fatigue | Resultado calculado con el mismo JavaScript de la pantalla. Acepta un instante ISO con zona en `at`. Devuelve versión, instante, músculos, última fecha, aportes por sesión, posiciones de series, rol, multiplicador y cobertura faltante |

Los campos observados ausentes quedan nulos. Los valores numéricos de duración y distancia de serie conservan el valor y representación originales. La especificación pública no fija sus unidades. Los IDs 2, 18, 7, 382 y 6 se comprobaron con las series de banca, sentadilla, peso muerto, Zercher y curl. El catálogo de press militar devolvió dos IDs con idéntico nombre (2593 y 47631). Se conserva el ID recibido. La asociación histórica utiliza el nombre exacto normalizado. La unidad de carga de Lyfta en este historial es kg por confirmación del usuario.

Racha cuenta fechas locales consecutivas hasta hoy o ayer. Una sesión completada suma una vez al total, aunque tenga cero series de pesas. Un PR exige carga externa positiva, unidad conocida, serie realizada y al menos una repetición. Desempata por repeticiones, primera fecha y posición estable. Una casilla explícitamente desmarcada o de estado desconocido de la API queda excluida de carga y PR. Las series del registro histórico previo se tratan como registros realizados.

Fatiga y recuperación son estimaciones. Las series principales aportan una unidad, las secundarias media y el cardio se pondera por minutos y disciplina según la configuración personal. La intensidad modifica la carga. El modelo aplica decaimiento lineal dentro del tiempo de recuperación por músculo. Sueño, proteína y pantalla pueden ampliar ese tiempo, con un máximo combinado del 60 %. Los datos faltantes tienen efecto neutral. Para fechas sin hora se usa el comienzo del día argentino. La última fecha permanece aunque el aporte actual sea cero. El puntaje no mide un porcentaje fisiológico.

## Cinco consultas de ejemplo

Los resultados siguientes son sintéticos. Todas las rutas llevan el prefijo `/api/fitness` y el token de lectura. Para recorrer colecciones usá `limit` de 1 a 100 y aumentá `offset` hasta recibir una página corta. En SQL, las fechas se filtran por `local_date` y las semanas por `week`.

1. Últimas diez sesiones. `?resource=sessions&limit=10` → `[{"id":"s12","discipline":"boxeo_muaythai","duration_min":45}]`. La sesión aparece aunque no tenga series.
2. Progresión de Zercher. `?resource=sets&exercise=full%20zercher%20squat&from=2026-10-01&to=2026-11-30` → s8, 80 kg × 5 y s11, 85 kg × 3. Compará cargas realizadas por fecha y unidad. Para banca usá `exercise=bench%20press`.
3. Evidencia del récord. `?resource=personal_records` → Zercher, 85 kg × 3, s11, ejercicio 2, serie 3. `?resource=sets&session_id=s11` devuelve la fila con esas dos posiciones.
4. Fatiga de espalda en un instante fijo. `?resource=fatigue&at=2026-11-23T18%3A00%3A00-03%3A00` → `muscles["Espalda baja"].evidence` contiene s11, Deadlift, principal, tres series.
5. Pesajes en semanas de tres entrenamientos. En SQL, `select b.local_date,b.weight,b.unit from fitness.body_weight b join fitness.weekly w on w.week=date_trunc('week',b.local_date)::date where w.sessions=3 order by b.local_date` → 19/11/2026, 78,4 kg. Desde la API cruzá las páginas de `weekly` y `body_weight` por el lunes local.

## Pruebas

Desde la raíz, `python3 scripts/lyfta/test_importar.py`, `node scripts/fitness/test_model.mjs`, `node scripts/fitness/test_data.mjs` y `node scripts/fitness/test_read_api.mjs` funcionan sin instalar paquetes. Para la prueba SQL instalá `@electric-sql/pglite` en una carpeta temporal y copiá allí `test_rls.mjs`. Ejecutalo desde la raíz del repo. Para el recorrido visual hacé lo mismo con `playwright-core`, `@sparticuz/chromium` y `test_visual.mjs`, con el servidor local de AGENTS.md corriendo. Pasale 390 o 1280 de ancho. Las llamadas externas del navegador están bloqueadas y los pesajes de la prueba son sintéticos.
