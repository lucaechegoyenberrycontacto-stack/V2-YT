#!/bin/bash
set -eu
cd "$(dirname "$0")"
if [[ ! -f "${XDG_CONFIG_HOME:-$HOME/.config}/v2yt-android-screen-time/session.json" ]]; then
  python3 ../android-screen-time/sync.py login
fi
python3 importar.py conectar
python3 importar.py sync
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$units"
cat > "$units/v2yt-lyfta.service" <<UNIT
[Unit]
Description=Importar entrenamientos de Lyfta
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 "$PWD/importar.py" sync
UNIT
cat > "$units/v2yt-lyfta.timer" <<'UNIT'
[Unit]
Description=Actualizar Lyfta cada quince minutos
[Timer]
OnCalendar=*:0/15
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now v2yt-lyfta.timer
