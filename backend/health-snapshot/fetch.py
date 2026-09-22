"""Stage 1: run every sql/*.sql through Metabase (read-only) and cache results in raw/<name>.json.

Usage: python3 fetch.py [--from 2026-04-01] [--only 06_workouts,07_assessments] [--force]
"""
import argparse, datetime as dt, json, os, sys, time
from zoneinfo import ZoneInfo
import mb

HERE = os.path.dirname(os.path.abspath(__file__))
SQL = os.path.join(HERE, "sql")
RAW = os.path.join(HERE, "raw")
IST = ZoneInfo("Asia/Kolkata")
PROD_DB = int(os.environ.get("METABASE_PROD_DB_ID", "16"))


def render(name, params):
    sql = open(os.path.join(SQL, name + ".sql")).read()
    common = open(os.path.join(SQL, "_common.sql")).read()
    common = "\n".join(l for l in common.splitlines() if not l.lstrip().startswith("--"))
    sql = sql.replace("{{COMMON}}", common)
    for k, v in params.items():
        sql = sql.replace("{{" + k + "}}", str(v))
    assert "{{" not in sql, f"unrendered placeholder in {name}"
    return sql


def run(name, params, db=None):
    t = time.time()
    sql = render(name, params)
    if db:
        old = mb.MB_DB
        mb.MB_DB = db
    try:
        rows = mb.query(sql)
    finally:
        if db:
            mb.MB_DB = old
    json.dump(rows, open(os.path.join(RAW, name + ".json"), "w"))
    print(f"{name}: {len(rows):,} rows in {time.time() - t:.0f}s", flush=True)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm", default="2026-04-01")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)

    # data_as_of = IST date of the OLDEST of the key sources' latest change (conservative).
    src = run("00_sources", {})
    key = {"batch_info_fdw", "batch", "score_management_fdw", "session_log_fdw"}
    stamps = {r["source"]: r["max_ts"] for r in src}
    as_of = min(stamps[k][:10] for k in key)
    end = dt.datetime.fromisoformat(as_of).replace(tzinfo=IST) + dt.timedelta(days=1)
    params = {"FROM": a.frm, "AS_OF_MS": int(end.timestamp() * 1000)}
    meta = {"from": a.frm, "data_as_of": as_of, "as_of_ms": params["AS_OF_MS"], "sources": stamps,
            "fetched_at": dt.datetime.now(IST).isoformat(timespec="seconds")}
    json.dump(meta, open(os.path.join(RAW, "_meta.json"), "w"), indent=1)
    print("meta:", meta, flush=True)

    names = sorted(f[:-4] for f in os.listdir(SQL) if f.endswith(".sql") and f[0].isdigit() and not f.startswith("00_"))
    if a.only:
        names = [n for n in names if n in a.only.split(",")]
    for n in names:
        if not a.force and not a.only and os.path.exists(os.path.join(RAW, n + ".json")):
            print(f"{n}: cached (use --force)")
            continue
        db = PROD_DB if n == "11_principal_feedback" else None
        try:
            run(n, params, db)
        except Exception as e:
            print(f"{n}: FAILED {str(e)[:500]}", flush=True)
            if n != "11_principal_feedback":
                sys.exit(1)


if __name__ == "__main__":
    main()
