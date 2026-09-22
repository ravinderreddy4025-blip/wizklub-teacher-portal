"""Sanity report over a built run (no PII printed).  python3 validate.py [run_id]"""
import json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
run = sys.argv[1] if len(sys.argv) > 1 else open(os.path.join(HERE, "out", "LATEST")).read().strip()
D = os.path.join(HERE, "out", run)
rd = lambda n: [json.loads(l) for l in open(os.path.join(D, n + ".ndjson"))]
runs, schools, batches, students = rd("health_runs"), rd("health_schools"), rd("health_batches"), rd("health_students")
r = runs[0]
print("run", run, "| data_as_of", r["data_as_of"], "| counts", r["counts"])
print("anchor: all-session workout completion", r["anchor_workout_completion_pct_all_sessions"], "% (dash 29 / 19-Sep meeting ~48%)")

def dist(docs, path):
    c = Counter()
    for d in docs:
        v = d
        for p in path.split("."):
            v = v[p]
        c[v] += 1
    n = len(docs)
    return " ".join(f"{k}={c.get(k,0)} ({c.get(k,0)*100/n:.1f}%)" for k in "GARN")

for label, docs in [("students", students), ("batches", batches), ("schools", schools)]:
    print(f"\n[{label}] n={len(docs)}")
    pillars = ["participation.band", "outcomes.band", "attendance.band", "overall_band"]
    if label != "students":
        pillars = ["delivery.band"] + pillars
    for p in pillars:
        print(f"  {p:22s} {dist(docs, p)}")

ns = sum(1 for s in students if s["participation"]["not_started"])
print(f"\nnot_started students: {ns} | ever logged in: {sum(s['login']['ever_logged_in'] for s in students)}/{len(students)}")
print("students with >=1 assessment:", sum(1 for s in students if s["outcomes"]["assessments_taken"]),
      "| with code-run data:", sum(1 for s in students if s["outcomes"]["code_runs_total"]))
dp = [b["delivery"]["pct"] for b in batches if b["delivery"]["pct"] is not None]
dp.sort()
q = lambda f: dp[int(f * (len(dp) - 1))]
print(f"delivery pct (batches with schedule, n={len(dp)}): p10={q(.1)} p25={q(.25)} median={q(.5)} p75={q(.75)} p90={q(.9)}")
bins = Counter(min(int(v // 10) * 10, 100) for v in dp)
print("  histogram:", {f"{k}-{k+9}" if k < 100 else "100": bins[k] for k in sorted(bins)})
sc = [s for s in schools if s["participation"]["completion_pct"] is not None]
print(f"schools workout completion <20%: {sum(1 for s in sc if s['participation']['completion_pct'] < 20)}, <50%: "
      f"{sum(1 for s in sc if s['participation']['completion_pct'] < 50)} of {len(sc)} (meeting: ~44 / ~100)")
for s in schools:
    if "Banaswadi" in (s["school_name"] or ""):
        print("\nBanaswadi:", s["school_id"], "batches", s["batches"], "students", s["students"], "overall", s["overall_band"],
              "delivery", s["delivery"], "| teachers", [t["username"] for t in s["teachers"]])
