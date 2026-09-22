"""Minimal read-only Metabase client for the health snapshot builder.

Reads the API key from env METABASE_API_KEY, else from the IL Jira .env
(`metabase_business_reports_api_key`). Only native SELECT queries are sent.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

MB_URL = os.environ.get("METABASE_URL", "https://businessreports.infinitylearn.com")
MB_DB = int(os.environ.get("METABASE_DB_ID", "18"))
ENV_PATH = os.environ.get("IL_JIRA_ENV", "/Users/infinitylearn/Downloads/Isaee Projects/IL Jira/.env")


def _key():
    k = os.environ.get("METABASE_API_KEY")
    if k:
        return k
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith("metabase_business_reports_api_key"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Metabase API key not found (set METABASE_API_KEY)")


KEY = _key()
_WRITE = re.compile(r"\b(insert|update|delete|create|drop|alter|truncate|grant|revoke|copy|vacuum|refresh)\b", re.I)


def _guard(sql):
    body = re.sub(r"--[^\n]*", "", sql)
    body = re.sub(r"'(?:[^']|'')*'", "''", body)
    if _WRITE.search(body):
        raise ValueError("refusing non-SELECT SQL")


def _req(path, data=None, form=False, timeout=900):
    headers = {"X-API-KEY": KEY}
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    else:
        body = None
    r = urllib.request.Request(MB_URL + path, data=body, headers=headers, method="POST" if body else "GET")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.read()


def get(path):
    return json.loads(_req(path))


def query(sql, retries=2):
    """Bulk SELECT via /api/dataset/json (no 2,000-row cap). Returns list[dict]."""
    _guard(sql)
    q = {"database": MB_DB, "type": "native", "native": {"query": sql}}
    for attempt in range(retries + 1):
        try:
            raw = _req("/api/dataset/json", {"query": json.dumps(q)}, form=True)
            rows = json.loads(raw)
            if isinstance(rows, dict) and rows.get("error"):
                raise RuntimeError(rows["error"])
            return rows
        except Exception as e:  # noqa
            if attempt == retries:
                raise
            print(f"  retry after error: {str(e)[:200]}", file=sys.stderr)
            time.sleep(5)


def query_small(sql):
    """/api/dataset (capped at 2,000 rows) — returns (cols, rows); errors surface clearly."""
    _guard(sql)
    res = json.loads(_req("/api/dataset", {"database": MB_DB, "type": "native", "native": {"query": sql}}))
    if res.get("error"):
        raise RuntimeError(res["error"])
    d = res["data"]
    return [c["name"] for c in d["cols"]], d["rows"]
