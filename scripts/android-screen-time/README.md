# Tiempo de pantalla de Android y PC

El importador busca `test.db` bajo `~/ActivityWatchSync` y reconoce la base por sus tablas y por los registros `currentwindow` de `aw-android`. Lee los intervalos de apps en primer plano, une los solapados y divide en la medianoche de Argentina. Los huecos entre intervalos quedan fuera. La réplica inspeccionada trae marcas de desbloqueo, pero carece de intervalos de pantalla apagada o AFK. El tiempo representa el uso en primer plano registrado y puede diferir del tiempo de pantalla físico. Las pestañas, la reproducción y los desbloqueos no se agregan al total. [Código del watcher de Android](https://github.com/ActivityWatch/aw-android/blob/master/mobile/src/main/java/net/activitywatch/android/watcher/UsageStatsWatcher.kt)

En la PC, el importador abre `~/.local/share/activitywatch/aw-server/peewee-sqlite.v2.db` en modo solo lectura y selecciona únicamente los intervalos `not-afk` de `aw-watcher-afk`. Los solapamientos se unen dentro de cada dispositivo y ambos historiales se cortan a medianoche de Argentina. La vista Ambos suma las horas de los dos dispositivos, incluido el uso simultáneo, y marca los períodos con datos parciales.

Cada corrida vuelve a leer el historial y publica solo las diferencias en `records`. El importador guarda solo las horas decimales diarias en la colección privada ya existente. Android conserva las claves `YYYY-MM-DD` y la PC usa `pc:YYYY-MM-DD`. Una fecha sin eventos queda ausente. Un evento de duración cero puede aportar una fecha con cero horas. Si una fecha desaparece dentro del rango de la réplica, se retira su importación. El historial ya publicado fuera de ese rango se conserva. Si una fuente falla, la otra sigue actualizándose y la fallida se reintenta en el siguiente turno. Los registros manuales de `habits_screen_time` tienen prioridad, incluido un cero. El total importado se muestra también para esos días.

## Actualizar una instalación existente

Desde la raíz del repo, actualizá el ejecutable de la PC y verificá una corrida. Conservá la sesión y el temporizador existentes. La política instalada también protege las filas de PC.

```bash
install -Dm755 scripts/android-screen-time/sync.py ~/.local/lib/v2yt-android-screen-time/sync.py
systemctl --user start v2yt-android-screen-time.service
journalctl --user -u v2yt-android-screen-time.service -n 12 --no-pager
```

Publicá el cambio de `habits.html` en `main` para ver ambas fuentes en Vercel.

## Primera instalación

Publicá los cambios de `main` en Vercel (`rowanluca`) y aplicá [records-policy.sql](records-policy.sql) una vez en el SQL Editor de Supabase `jarbis`. La política restringe los totales importados al usuario autenticado que figura en su colección.

En la PC, ejecutá desde la raíz del repo. Usá el correo y la contraseña del dashboard, la URL del proyecto y la clave pública de Supabase. La contraseña se usa durante el inicio de sesión y la sesión renovable queda en un archivo privado fuera del repositorio.

```bash
cd /home/wayne/Documentos/V2-YT
install -Dm755 scripts/android-screen-time/sync.py ~/.local/lib/v2yt-android-screen-time/sync.py
install -Dm644 scripts/android-screen-time/v2yt-android-screen-time.service ~/.config/systemd/user/v2yt-android-screen-time.service
install -Dm644 scripts/android-screen-time/v2yt-android-screen-time.timer ~/.config/systemd/user/v2yt-android-screen-time.timer
python3 ~/.local/lib/v2yt-android-screen-time/sync.py login
systemctl --user daemon-reload
systemctl --user enable --now v2yt-android-screen-time.timer
systemctl --user start v2yt-android-screen-time.service
```

El temporizador corre cada 15 minutos y recupera el turno pendiente cuando vuelve a iniciar el gestor de usuario. Para activarlo desde el arranque antes de iniciar sesión en EndeavourOS, ejecutá `loginctl enable-linger "$USER"`.

```bash
journalctl --user -u v2yt-android-screen-time.service -g 'Sincronización exitosa' -n 1 --no-pager
systemctl --user list-timers v2yt-android-screen-time.timer
```

Abrí **Hábitos → Tiempo de pantalla** y seleccioná **Celular**, **PC** o **Ambos**. Tocá una barra para ver el detalle. Si la sesión del importador fue revocada, repetí el comando `login`. Para comprobar la base sin conectarte a Supabase, corré `python3 scripts/android-screen-time/sync.py preview` para Android o `python3 scripts/android-screen-time/sync.py preview-pc` para la PC.
