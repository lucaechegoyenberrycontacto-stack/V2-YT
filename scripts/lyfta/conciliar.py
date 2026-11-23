"""Vista previa determinista sobre sesiones canónicas, sin escribir datos."""
from collections import Counter
from decimal import Decimal


def signature(row):
    def number(value):
        return None if value in (None, "") else Decimal(str(value))
    exercises = []
    for exercise in row.get("exercises", []):
        series = tuple((number(s.get("reps")), number(s.get("weight")), s.get("unit") or ("kg" if row.get("source") in ("lyfta","manual") else None))
                       for s in exercise.get("sets", []) if s.get("reps") and number(s["reps"]) > 0)
        if series:
            exercises.append((" ".join(exercise["name"].casefold().split()), series))
    return row["date"], row.get("discipline"), tuple(exercises)


def reconcile(incoming, stored, decisions=None):
    decisions = decisions or {}
    claimed = set()
    counts = Counter(leídas=len(incoming), nuevas=0, iguales=0, enriquecidas=0, revisar=0)
    by_api = {w.get("lyftaId", w["id"]): w for w in stored}
    signatures = Counter(signature(w) for w in incoming)
    changes, review = [], []
    for w in incoming:
        previous = by_api.get(w["id"])
        if previous is None:
            sig = signature(w)
            neighbors = [v for v in stored if v["date"] == w["date"] and
                         not v.get("lyftaId") and not v["id"].startswith("lyfta-")]
            matches = [v for v in neighbors if sig[2] and signature(v) == sig and
                       (not v.get("startedAt") or v["startedAt"] == w.get("startedAt"))]
            choice = decisions.get(w["id"])
            if choice == "NUEVA":
                previous = None
            elif choice is not None:
                previous = next((v for v in neighbors if v["id"] == choice), None)
                if previous is None:
                    raise ValueError(f"Resolución inválida para {w['id']}")
            elif len(matches) == 1 and signatures[sig] == 1:
                previous = matches[0]
            elif neighbors:
                counts["revisar"] += 1
                review.append((w["id"], w["date"], [v["id"] for v in neighbors]))
                continue
        merged = {**(previous or {}), **w, "lyftaId": w["id"]}
        if previous:
            if previous["id"] in claimed:
                raise ValueError("Dos decisiones reclaman la misma sesión. Revisá las resoluciones.")
            claimed.add(previous["id"])
            merged["id"] = previous["id"]
            merged["sources"] = sorted(set(previous.get("sources", [previous.get("source") or "desconocida"])) | {"lyfta"})
            if not previous.get("lyftaId") and "historicalOriginal" not in merged:
                merged["historicalOriginal"] = previous
        else:
            merged["sources"] = ["lyfta"]
        if previous == merged:
            counts["iguales"] += 1
        else:
            counts["enriquecidas" if previous else "nuevas"] += 1
            changes.append((previous, merged))
    return counts, changes, review
