"""Importa entrenamientos completados desde Lyfta al historial de Fitness."""
import argparse
from datetime import UTC, datetime, time
import fcntl
from getpass import getpass
import json
import math
import re
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, build_opener

# Usar el mismo bloqueo y la misma sesión renovable que el importador de Android.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "android-screen-time"))
import sync as dashboard

CONFIG = dashboard.CONFIG / "lyfta.json"


def workout(raw):
    raw_id = raw.get("id")
    if type(raw_id) not in (int, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(raw_id).strip()):
        raise ValueError("Lyfta devolvió un identificador de sesión vacío o con formato desconocido.")
    workout_id = str(raw_id).strip()
    try:
        instant = datetime.fromisoformat(str(raw.get("workout_perform_date")).strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("Lyfta devolvió una fecha de entrenamiento que no se pudo interpretar.") from None
    # Si Lyfta solo informa el día o una hora sin zona, conservar el día informado.
    day = instant.astimezone(dashboard.TZ).date() if instant.tzinfo else instant.date()
    # En sesiones finalizadas sin casillas marcadas, Lyfta igualmente
    # devuelve las repeticiones cargadas. Si hay marcas, respetarlas.
    unchecked = (False, 0, "0", "false")
    has_checked = any(item.get("is_completed") in (True, 1, "1", "true")
                      for exercise in raw["exercises"] for item in exercise["sets"])
    exercises = []
    for exercise in raw["exercises"]:
        sets = []
        for item in exercise["sets"]:
            if has_checked and item.get("is_completed") in unchecked:
                continue
            reps = item.get("reps")
            if reps in (None, "") or int(reps) <= 0:
                continue
            weight = float(item.get("weight") or 0)
            if not math.isfinite(weight):
                raise ValueError("Carga inválida en Lyfta.")
            sets.append({"reps": int(reps), "weight": weight, "rir": item.get("rir") or None})
        if sets:
            exercises.append({"name": exercise["excercise_name"], "sets": sets})
    return {"id": "lyfta-" + workout_id, "source": "lyfta", "discipline": "pesas",
            "date": day.isoformat(),
            "title": raw.get("title") or "Pesas", "exercises": exercises}


def fetch_page(key, params):
    req = Request("https://my.lyfta.app/api/v1/workouts?" + urlencode(params),
                  headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
    with build_opener(dashboard.NoRedirect).open(req, timeout=30) as response:
        result = json.load(response)
    if result.get("status") is not True or not isinstance(result.get("workouts"), list):
        raise ValueError("Formato inesperado en la respuesta de Lyfta.")
    return result


def configure():
    if not sys.stdin.isatty():
        sys.exit("Abrí una terminal para ingresar la clave de forma privada.")
    key = getpass("Clave personal de Lyfta (oculta): ").strip()
    latest = fetch_page(key, {"limit": 1})["workouts"]
    if latest:
        sample = workout(latest[0])
        print("Última sesión:", sample["date"], sample["title"], "·", len(sample["exercises"]), "ejercicios")
    start = datetime.now(dashboard.TZ).date().isoformat()
    if CONFIG.exists():
        start = json.loads(CONFIG.read_text())["start"]
    with tempfile.NamedTemporaryFile(mode="w", dir=CONFIG.parent, delete=False) as out:
        json.dump({"key": key, "start": start}, out)
    Path(out.name).replace(CONFIG)


def run():
    config = json.loads(CONFIG.read_text())
    start = datetime.combine(datetime.fromisoformat(config["start"]).date(), time.min, dashboard.TZ)
    params = {"from": start.astimezone(UTC).date().isoformat(), "limit": 100, "page": 1}
    rows = []
    while True:
        result = fetch_page(config["key"], params)
        if int(result["current_page"]) != params["page"]:
            raise ValueError("Paginación inesperada en Lyfta.")
        for raw in result["workouts"]:
            data = workout(raw)
            if data["date"] >= config["start"] and data["exercises"]:
                rows.append(data)
        if params["page"] >= int(result["total_pages"]):
            break
        params["page"] += 1
    with (dashboard.CONFIG / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        settings = json.loads((dashboard.CONFIG / "session.json").read_text())
        if settings["expires"] < datetime.now().timestamp() + 60:
            dashboard.accept_session(settings, dashboard.request(settings, "/auth/v1/token?grant_type=refresh_token",
                                     {"refresh_token": settings["refresh"]}))
        for i in range(0, len(rows), 100):
            batch = rows[i:i + 100]
            query = urlencode({"collection": "eq.gym_workouts", "select": "id,data",
                               "id": "in.(" + ",".join(w["id"] for w in batch) + ")"})
            old = dashboard.request(settings, "/rest/v1/records?" + query, token=settings["token"])
            existing = {r["id"]: r["data"] for r in old}
            changed = [{"collection": "gym_workouts", "id": w["id"], "data": w,
                        "updated_at": datetime.now(UTC).isoformat()} for w in batch if existing.get(w["id"]) != w]
            if changed:
                dashboard.request(settings, "/rest/v1/records?on_conflict=collection,id", changed,
                                  token=settings["token"], prefer="resolution=merge-duplicates,return=minimal")
    print(f"Lyfta: {len(rows)} sesiones de pesas comprobadas.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["conectar", "sync"])
    args = parser.parse_args()
    try:
        configure() if args.action == "conectar" else run()
    except (OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(str(error))
