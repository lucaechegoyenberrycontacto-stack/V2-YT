# Tiempo de pantalla de Android

El importador busca `test.db` bajo `~/ActivityWatchSync` y reconoce la base por sus tablas y por los registros `currentwindow` de `aw-android`. Lee los intervalos de apps en primer plano, une los solapados y divide en la medianoche de Argentina. Los huecos entre intervalos quedan fuera. La réplica inspeccionada trae marcas de desbloqueo, pero carece de intervalos de pantalla apagada o AFK. El tiempo representa el uso en primer plano registrado y puede diferir del tiempo de pantalla físico. Las pestañas, la reproducción y los desbloqueos no se agregan al total. [Código del watcher de Android](https://github.com/ActivityWatch/aw-android/blob/master/mobile/src/main/java/net/activitywatch/android/watcher/UsageStatsWatcher.kt)

Cada corrida vuelve a leer el historial y publica solo las diferencias en `records`. Las claves son fechas `YYYY-MM-DD` y los valores son horas decimales. Una fecha sin eventos queda ausente. Un evento de duración cero puede aportar una fecha con cero horas. Si una fecha desaparece dentro del rango de la réplica, se retira su importación. El historial ya publicado fuera de ese rango se conserva. Si falla la lectura se reintenta en el siguiente turno. Los registros manuales de `habits_screen_time` tienen prioridad, incluido un cero. El total importado se muestra también para esos días.

## Activación

Publicá los cambios de `main` en Vercel (`rowanluca`) y aplicá [records-policy.sql](records-policy.sql) una vez en el SQL Editor de Supabase `jarbis`. La política restringe las filas de Android al usuario autenticado que figura en su colección.

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

Abrí **Hábitos → Screen Time · Phone**, elegí la fecha de hoy y buscá **Android: … h** debajo del formulario. Si la sesión del importador fue revocada, repetí el comando `login`. Para comprobar la base sin conectarte a Supabase, corré `python3 scripts/android-screen-time/sync.py preview`.
