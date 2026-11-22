#!/usr/bin/env python3
"""Import daily Android foreground usage from the local Syncthing replica."""
import argparse
from collections import defaultdict
from contextlib import closing, contextmanager
from datetime import datetime, time, timedelta
import fcntl
from getpass import getpass
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import time as clock
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Argentina/Cordoba")
NS = 10**9
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "v2yt-android-screen-time"


def signature(path):
    files = []
    for suffix in ("", "-wal", "-journal"):
        try:
            stat = Path(str(path) + suffix).stat()
            files.append((stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
        except FileNotFoundError:
            if not suffix:
                raise
            files.append(None)
    return tuple(files)


@contextmanager
def open_read_only(path, before):
    # A checkpointed WAL-mode replica without sidecars needs immutable mode.
    # With sidecars, SQLite can maintain shared-memory files in a private copy.
    if before[1:] == (None, None):
        with closing(sqlite3.connect(path.absolute().as_uri() + "?mode=ro&immutable=1", uri=True)) as db:
            yield db
        return
    with tempfile.TemporaryDirectory(prefix="v2yt-aw-") as folder:
        snapshot = Path(folder) / "test.db"
        shutil.copyfile(path, snapshot)
        for suffix, stat in zip(("-wal", "-journal"), before[1:]):
            if stat is not None:
                shutil.copyfile(str(path) + suffix, str(snapshot) + suffix)
        if signature(path) != before:
            raise ValueError("Syncthing cambió la base durante la copia.")
        with closing(sqlite3.connect(snapshot.as_uri() + "?mode=ro", uri=True)) as db:
            yield db


def read_android(root):
    candidates = []
    for path in sorted(root.rglob("test.db")):
        before = signature(path)
        with open_read_only(path, before) as db:
            db.execute("BEGIN")
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"buckets", "events"} <= tables:
                continue
            buckets = db.execute(
                "SELECT id FROM buckets WHERE client='aw-android' AND type='currentwindow'"
            ).fetchall()
            if buckets:
                if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise ValueError("La réplica SQLite no pasó la verificación de integridad.")
                intervals = db.execute("""
                    SELECT starttime, endtime FROM events JOIN buckets ON bucketrow=buckets.id
                    WHERE client='aw-android' AND type='currentwindow' ORDER BY starttime, endtime
                """).fetchall()
                candidates.append(intervals)
        if signature(path) != before:
            raise ValueError("Syncthing cambió la base durante la lectura.")
    if len(candidates) != 1 or not candidates[0]:
        raise ValueError("Se necesita una única base Android con historial. Acotá --root si hay varias.")
    return candidates[0]


def daily_hours(intervals):
    totals = defaultdict(int)
    covered_until = 0
    for start, end in intervals:
        if not (isinstance(start, int) and isinstance(end, int) and 0 < start <= end):
            raise ValueError("La base tiene intervalos inválidos.")
        day = datetime.fromtimestamp(start // NS, TZ).date()
        totals[day.isoformat()] += 0
        start = max(start, covered_until)
        covered_until = max(covered_until, end)
        while start < end:
            day = datetime.fromtimestamp(start // NS, TZ).date()
            midnight = datetime.combine(day + timedelta(days=1), time.min, TZ)
            stop = min(end, int(midnight.timestamp()) * NS)
            totals[day.isoformat()] += stop - start
            start = stop
    return {day: round(duration / (3600 * NS), 8) for day, duration in sorted(totals.items())}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(settings, resource, body=None, token=None, method=None, prefer=None):
    headers = {"apikey": settings["key"], "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if prefer:
        headers["Prefer"] = prefer
    req = Request(
        settings["url"] + resource,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with build_opener(NoRedirect()).open(req, timeout=25) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except HTTPError as error:
        raise ValueError(f"Supabase devolvió HTTP {error.code} en {resource.split('?')[0]}.") from None


def save_settings(settings):
    with tempfile.NamedTemporaryFile(mode="w", dir=CONFIG, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(settings, stream)
            stream.flush()
            os.fsync(stream.fileno())
            temporary.replace(CONFIG / "session.json")
        finally:
            temporary.unlink(missing_ok=True)


def accept_session(settings, session):
    user = str(UUID(session["user"]["id"]))
    if settings.get("user", user) != user:
        raise ValueError("La sesión renovada pertenece a otra cuenta.")
    settings.update(
        user=user,
        token=session["access_token"],
        refresh=session["refresh_token"],
        expires=clock.time() + session["expires_in"],
    )
    save_settings(settings)


def login():
    if not sys.stdin.isatty():
        raise ValueError("Ejecutá login desde una terminal.")
    url = input("URL del proyecto Supabase: ").strip().rstrip("/")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.netloc != parsed.hostname or parsed.path or parsed.query or parsed.fragment:
        raise ValueError("Ingresá la URL HTTPS del proyecto, sin ruta.")
    key = getpass("Clave pública (publishable o anon): ").strip()
    if not key.startswith("sb_publishable_"):
        import base64
        try:
            payload = key.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except (IndexError, ValueError):
            raise ValueError("Se necesita una clave pública de Supabase.") from None
        if claims.get("role") != "anon":
            raise ValueError("Se necesita una clave pública de Supabase.")
    settings = {"url": url, "key": key}
    accept_session(settings, request(settings, "/auth/v1/token?grant_type=password", {
        "email": input("Email del dashboard: ").strip(),
        "password": getpass("Contraseña del dashboard: "),
    }))
    print("Sesión guardada para la sincronización.")


def reconcile(settings, totals):
    token = settings["token"]
    collection = "habits_screen_time_android:" + settings["user"]
    records = "/rest/v1/records"
    filters = {"collection": "eq." + collection}
    existing = {}
    offset = 0
    while True:
        query = urlencode({**filters, "select": "id,data", "order": "id.asc", "limit": 200, "offset": offset})
        page = request(settings, records + "?" + query, token=token)
        if not page:
            break
        existing.update((row["id"], row["data"]["hours"]) for row in page)
        offset += len(page)
    changed = [
        {"collection": collection, "id": day, "data": {"hours": hours},
         "updated_at": datetime.now(TZ).isoformat()}
        for day, hours in totals.items() if existing.get(day) != hours
    ]
    for offset in range(0, len(changed), 200):
        request(settings, records + "?on_conflict=collection,id", changed[offset:offset + 200],
                token=token, prefer="resolution=merge-duplicates,return=minimal")
    # Keep previously imported days outside the current snapshot's coverage.
    first, last = min(totals), max(totals)
    removed = sorted(day for day in existing.keys() - totals.keys() if first < day < last)
    for offset in range(0, len(removed), 100):
        query = urlencode({**filters, "id": "in.(" + ",".join(removed[offset:offset + 100]) + ")"})
        request(settings, records + "?" + query, token=token, method="DELETE")
    return len(changed), len(removed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("preview", "login", "sync"))
    parser.add_argument("--root", type=Path, default=Path.home() / "ActivityWatchSync")
    args = parser.parse_args()
    if args.command == "preview":
        print(json.dumps(daily_hours(read_android(args.root)), indent=2))
        return
    CONFIG.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (CONFIG / "lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == "login":
            login()
            return
        totals = daily_hours(read_android(args.root))
        settings = json.loads((CONFIG / "session.json").read_text())
        if settings["expires"] < clock.time() + 60:
            accept_session(settings, request(settings, "/auth/v1/token?grant_type=refresh_token",
                                             {"refresh_token": settings["refresh"]}))
        changed, removed = reconcile(settings, totals)
        print(f"Sincronización exitosa | {len(totals)} días leídos | {changed} actualizados | {removed} retirados")


if __name__ == "__main__":
    try:
        main()
    except sqlite3.Error:
        sys.exit("No se pudo leer SQLite. Se reintentará en el próximo turno.")
    except (OSError, KeyError, ValueError) as error:
        sys.exit(str(error))
