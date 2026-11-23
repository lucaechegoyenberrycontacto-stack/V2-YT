"""Importa entrenamientos completados desde Lyfta al historial de Fitness."""
import argparse
from datetime import UTC, datetime, time, timedelta
import fcntl
from getpass import getpass
import json
import math
import time as clock
from urllib.error import HTTPError, URLError
from conciliar import reconcile
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
    exercises = []
    for exercise in raw["exercises"]:
        sets = []
        for pos, item in enumerate(exercise["sets"], 1):
            def number(key):
                value = item.get(key)
                if value is None or value == "":
                    return None
                result = float(value)
                if not math.isfinite(result) or result < 0:
                    raise ValueError(f"Sesión {workout_id}, serie {pos}: {key} inválido.")
                return result
            flag = item.get("is_completed")
            sets.append({"id": item.get("id"), "position": pos, "reps": number("reps"),
                         "weight": number("weight"), "unit": item.get("weight_unit") or "kg", "unitSource": "api" if item.get("weight_unit") else "confirmación del usuario",
                         "rir": number("rir"), "duration": None if item.get("duration") in (None,"") else item["duration"],
                         "distance": None if item.get("distance") in (None,"") else item["distance"], "setType": item.get("set_type_id"),
                         "completed": True if flag in (True, 1, "1", "true") else
                                      False if flag in (False, 0, "0", "false") else None})
        exercises.append({"name": exercise["excercise_name"], "exerciseId": exercise.get("exercise_id"),
                          "exerciseType": exercise.get("exercise_type"), "sets": sets})
    types = {ex["exerciseType"] for ex in exercises}
    return {"id": "lyfta-" + workout_id, "source": "lyfta",
            "discipline": "pesas" if types == {"weight_reps"} else "desconocida",
            "completed":True, "date": day.isoformat(), "startedAt": instant.isoformat() if instant.tzinfo else None,
            "bodyWeightReference": raw.get("body_weight"),
            "title": raw.get("title") or "Entrenamiento", "exercises": exercises}


def fetch_page(key, params):
    req = Request("https://my.lyfta.app/api/v1/workouts?" + urlencode(params),
                  headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
    for attempt in range(3):
        try:
            with build_opener(dashboard.NoRedirect).open(req, timeout=30) as response:
                result = json.load(response)
            break
        except HTTPError as error:
            if attempt == 2 or error.code not in (429, 500, 502, 503, 504):
                raise
            delay = int(error.headers.get("Retry-After", 2 ** attempt))
            if delay > 60:
                raise
            clock.sleep(delay)
        except URLError:
            if attempt == 2:
                raise
            clock.sleep(2 ** attempt)
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
        print("Acceso verificado. Última sesión:", sample["date"])
    start = datetime.now(dashboard.TZ).date().isoformat()
    if CONFIG.exists():
        start = json.loads(CONFIG.read_text())["start"]
    with tempfile.NamedTemporaryFile(mode="w", dir=CONFIG.parent, delete=False) as out:
        json.dump({"key": key, "start": start}, out)
    Path(out.name).replace(CONFIG)


def run(action, decisions=None):
    # Serializa lectura y escritura para que una página más vieja no reemplace una corrección nueva.
    with (CONFIG.parent / "lyfta.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return sync_locked(action, decisions)


def sync_locked(action, decisions):
    config = json.loads(CONFIG.read_text())
    start = datetime.combine(datetime.fromisoformat(config["start"]).date(), time.min, dashboard.TZ)
    params = {"from": start.astimezone(UTC).date().isoformat(), "limit": 100, "page": 1}
    if action in ("preview", "recuperar"):
        params.pop("from")
    elif config.get("backfilled"):
        # Releer cambios viejos semanalmente. El checkpoint solo avanza tras la última escritura.
        last_full=datetime.fromisoformat(config["backfilled"])
        if datetime.now(UTC)-last_full >= timedelta(days=7):
            params.pop("from")
        else:
            params["from"]=(datetime.now(UTC)-timedelta(days=14)).date().isoformat()
    rows = []
    while True:
        result = fetch_page(config["key"], params)
        if int(result["current_page"]) != params["page"]:
            raise ValueError("Paginación inesperada en Lyfta.")
        for raw in result["workouts"]:
            data = workout(raw)
            rows.append(data)
        if params["page"] >= int(result["total_pages"]):
            break
        params["page"] += 1
        clock.sleep(1.1)
    with (dashboard.CONFIG / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        settings = json.loads((dashboard.CONFIG / "session.json").read_text())
        if settings["expires"] < datetime.now().timestamp() + 60:
            dashboard.accept_session(settings, dashboard.request(settings, "/auth/v1/token?grant_type=refresh_token",
                                     {"refresh_token": settings["refresh"]}))
        stored = []
        while True:
            query = {"collection": "eq.gym_workouts", "select": "id,data", "order":"id.asc", "limit":500}
            if stored:
                query["id"] = "gt." + stored[-1]["id"]
            page = dashboard.request(settings, "/rest/v1/records?" + urlencode(query), token=settings["token"])
            stored.extend({**r["data"], "id":r["id"]} for r in page)
            if len(page) < 500:
                break
        incoming = {w["id"]:w for w in rows}
        counts, changes, review = reconcile(list(incoming.values()), stored, decisions)
        for row_id, day, candidates in review:
            print(json.dumps({"revisar":row_id, "fecha":day, "candidatos":candidates}))
        if action == "sync":
            # Las fusiones históricas solo se aplican con la recuperación aprobada.
            changes = [(old,w) for old,w in changes if not old or old["id"] == w["lyftaId"] or old.get("lyftaId")]
        if action != "preview" and changes:
            # Diario privado anterior a la primera escritura, incluso si falla un lote.
            with tempfile.NamedTemporaryFile(mode="w", dir=CONFIG.parent, prefix="lyfta-reversion-", suffix=".json", delete=False) as journal:
                json.dump(changes,journal)
            for i in range(0,len(changes),100):
                batch=[{"collection":"gym_workouts","id":w["id"],"data":w,
                        "updated_at":datetime.now(UTC).isoformat()} for _,w in changes[i:i+100]]
                dashboard.request(settings, "/rest/v1/records?on_conflict=collection,id", batch,
                                  token=settings["token"], prefer="resolution=merge-duplicates,return=minimal")
        if action != "preview":
            dashboard.request(settings, "/rest/v1/records?on_conflict=collection,id",
                              {"collection":"gym_lyfta_sync","id":"main","data":{
                                  "verifiedAt":datetime.now(UTC).isoformat(), "review":counts["revisar"]}},
                              token=settings["token"], prefer="resolution=merge-duplicates,return=minimal")
        if action != "preview" and "from" not in params:
            config["backfilled"]=datetime.now(UTC).isoformat()
            with tempfile.NamedTemporaryFile(mode="w",dir=CONFIG.parent,delete=False) as checkpoint:
                json.dump(config,checkpoint)
            Path(checkpoint.name).replace(CONFIG)
    if rows:
        print("Período API:",min(w["date"] for w in rows),max(w["date"] for w in rows))
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["conectar", "sync", "preview", "recuperar"])
    parser.add_argument("--resoluciones",type=Path,help="JSON privado: ID API -> ID canónico o NUEVA")
    args = parser.parse_args()
    if args.resoluciones and args.action not in ("preview","recuperar"):
        parser.error("Las resoluciones se usan en preview y recuperar.")
    try:
        configure() if args.action == "conectar" else run(args.action, json.loads(args.resoluciones.read_text()) if args.resoluciones else None)
    except (OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(str(error))
