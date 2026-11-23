"""Revisa un diario privado del importador. --aplicar restaura solo filas sin cambios posteriores."""
import argparse
from datetime import UTC, datetime
import fcntl
import json
from pathlib import Path
from urllib.parse import urlencode

from importar import dashboard


def restore(path, apply):
    with (dashboard.CONFIG / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        settings = json.loads((dashboard.CONFIG / "session.json").read_text())
        if settings["expires"] < datetime.now().timestamp() + 60:
            dashboard.accept_session(settings, dashboard.request(settings, "/auth/v1/token?grant_type=refresh_token",
                                     {"refresh_token":settings["refresh"]}))
        for old, new in json.loads(path.read_text()):
            where = {"collection":"eq.gym_workouts", "id":"eq."+new["id"]}
            endpoint = "/rest/v1/records?"
            rows = dashboard.request(settings, endpoint+urlencode({**where,"select":"data,updated_at"}),
                                     token=settings["token"])
            if not rows or rows[0]["data"] != new:
                print(new["id"], "omitida: ausente o modificada")
                continue
            print(new["id"], "restaurar" if old else "retirar alta")
            if apply:
                where["updated_at"] = "eq."+rows[0]["updated_at"]
                dashboard.request(settings,endpoint+urlencode(where),
                                  {"data":old,"updated_at":datetime.now(UTC).isoformat()} if old else None,
                                  token=settings["token"],method="PATCH" if old else "DELETE")
if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("diario",type=Path)
    parser.add_argument("--aplicar",action="store_true")
    args=parser.parse_args()
    restore(args.diario,args.aplicar)
