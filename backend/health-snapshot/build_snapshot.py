"""Stage 2: compute the WizKlub health snapshot (HEALTH_CONTRACT v1) from raw/*.json and write NDJSON.

    python3 fetch.py            # pull raw data via Metabase (read-only)
    python3 build_snapshot.py   # -> out/<run_id>/health_*.ndjson  (+ out/LATEST)
    ./load.sh                   # mongoimport + indexes + flip is_latest

All thresholds live in THRESHOLDS (copied into health_runs.thresholds).
"""
import datetime as dt
import json
import os
from collections import defaultdict
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "out")
IST = ZoneInfo("Asia/Kolkata")

THRESHOLDS = {
    "delivery": {"G": 90, "A": 70},
    # Workouts counted from held sessions of these v_session_type types (every WizKlub session carries
    # platform workouts; assessments are scored under outcomes instead). Set to ["Lab"] for lab-only.
    "participation": {"G": 60, "A": 40, "min_lab_sessions": 2,
                      "session_types": ["Lab", "Lecture", "Other", "Questions/Practice"]},
    "outcomes": {"G": 60, "A": 40, "assessment_weight": 0.5, "code_run_weight": 0.5},
    "attendance": {"G": 80, "A": 60, "min_held": 3},
    "aggregate": {"G": 60, "A": 40},
    "activity_days": 90,
}
BAND_ORDER = {"R": 3, "A": 2, "G": 1, "N": 0}


# ---------------------------------------------------------------- helpers
def load(name):
    return json.load(open(os.path.join(RAW, name + ".json")))


def pct(a, b):
    return round(a * 100.0 / b, 1) if b else None


def band3(v, t):
    if v is None:
        return "N"
    if v >= t["G"]:
        return "G"
    if v >= t["A"]:
        return "A"
    return "R"


def worst(*bands):
    real = [b for b in bands if b and b != "N"]
    return max(real, key=lambda b: BAND_ORDER[b]) if real else "N"


def agg_band(c):
    denom = 3 * (c["G"] + c["A"] + c["R"])
    if not denom:
        return None, "N"
    score = round((3 * c["G"] + c["A"]) * 100.0 / denom, 1)
    return score, band3(score, THRESHOLDS["aggregate"])


def overall_group(d, p, o):
    reds = [d, p, o].count("R")
    if d == "R" or reds >= 2:
        return "R"
    if d == "G" and p == "G" and o == "G":
        return "G"
    if d == "N" and p == "N" and o == "N":
        return "N"  # nothing measurable yet — never Red
    return "A"


def ist_date(ms):
    return dt.datetime.fromtimestamp(ms / 1000, IST).date().isoformat()


def mdate(value):
    """Mongo extended-JSON date (mongoimport understands {"$date": ...})."""
    return {"$date": value} if value else None


def avg(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def kind_of(ctype, name):
    if ctype == "Lab":
        return "lab"
    if ctype == "Assessment":
        return "assessment"
    if ctype == "Lecture":
        return "lecture"
    return "other"


def is_held(status, completion_type):
    return (status in ("COMPLETED", "PARTIAL") or completion_type in ("FULL", "PARTIAL")) and status != "CANCELLED"


# ---------------------------------------------------------------- build
def main():
    meta = load("_meta")
    as_of, as_of_ms, frm = meta["data_as_of"], meta["as_of_ms"], meta["from"]
    as_of_d = dt.date.fromisoformat(as_of)
    from_ms = int(dt.datetime.fromisoformat(frm).replace(tzinfo=IST).timestamp() * 1000)
    run_id = "hs-" + dt.datetime.now(IST).strftime("%Y%m%dT%H%M%S")

    batches = {b["batch_id"]: b for b in load("01_batches")}
    roster = load("02_roster")
    schedule = load("03_schedule")
    classes = load("04_classes")
    attendance = load("05_attendance")
    workouts = load("06_workouts")
    assessments = load("07_assessments")
    coding = load("08_coding")
    activity = load("09_activity")
    prodigy_rows = load("10_prodigy") if os.path.exists(os.path.join(RAW, "10_prodigy.json")) else []
    pf_path = os.path.join(RAW, "11_principal_feedback.json")
    principal = {r["school_id"]: r for r in json.load(open(pf_path))} if os.path.exists(pf_path) else None

    # --- delivery per batch: held (latest batch_info, held statuses) / scheduled (schedule ∪ held), up to as_of
    # Unit = curriculum session (session_id; occurrence_id when a slot has no session). When a class is
    # cancelled the platform re-slots its session, so counting occurrences would count one lesson twice.
    due_keys = defaultdict(set)      # sessions with any occurrence dated <= as_of
    held_keys = defaultdict(set)     # sessions with a held occurrence dated <= as_of
    occ_stats = defaultdict(lambda: {"scheduled": 0, "held": 0, "cancelled": 0, "not_marked": 0})
    past_occ = defaultdict(set)
    for r in schedule:
        if r["scheduled_ms"] and 0 < r["scheduled_ms"] <= as_of_ms:
            due_keys[r["batch_id"]].add(r["session_id"] or r["occurrence_id"])
            past_occ[r["batch_id"]].add(r["occurrence_id"])
    for c in classes:
        if not (c["scheduled_ms"] and 0 < c["scheduled_ms"] <= as_of_ms):
            continue
        key = c["session_id"] or c["occurrence_id"]
        past_occ[c["batch_id"]].add(c["occurrence_id"])
        st = occ_stats[c["batch_id"]]
        if is_held(c["status"], c["completion_type"]):
            held_keys[c["batch_id"]].add(key)
            due_keys[c["batch_id"]].add(key)
            st["held"] += 1
        elif c["status"] == "CANCELLED":
            st["cancelled"] += 1
    for bid, occs in past_occ.items():
        st = occ_stats[bid]
        st["scheduled"] = len(occs)
        st["not_marked"] = st["scheduled"] - st["held"] - st["cancelled"]

    # --- per (batch, student) accumulators
    att = defaultdict(lambda: [0, 0])  # present, listed-on-held-classes
    att_occ = {}  # (batch, occ, user) -> present
    for r in attendance:
        k = (r["batch_id"], r["username"])
        att[k][1] += 1
        att[k][0] += 1 if r["present"] else 0
        att_occ[(r["batch_id"], r["occurrence_id"], r["username"])] = bool(r["present"])

    lab_due = defaultdict(set)
    lab_done = defaultdict(set)
    all_due = defaultdict(set)  # all session types — for the dashboard-29 anchor
    all_done = defaultdict(set)
    wk_by_session = {}  # (batch, user, session) -> (levels_done, expected)
    for w in workouts:
        k = (w["batch_id"], w["username"])
        all_due[k].add(w["topic_key"])
        if w["submitted"]:
            all_done[k].add(w["topic_key"])
        if w["ctype"] in THRESHOLDS["participation"]["session_types"]:
            lab_due[k].add(w["topic_key"])
            if w["submitted"]:
                lab_done[k].add(w["topic_key"])
        wk_by_session[(w["batch_id"], w["username"], w["session_id"])] = (w["levels_done"], w["expected_levels"])

    assess_by_user = defaultdict(list)
    for a in assessments:
        mx = a["max_score"] or 0
        p = round(min(float(a["score"]) * 100.0 / mx, 100.0), 1) if mx else None
        assess_by_user[a["username"]].append({
            "session_id": a["session_id"], "name": a["name"], "date": a["date"],
            "score": float(a["score"]), "max": mx, "pct": p,
        })
    for v in assess_by_user.values():
        v.sort(key=lambda x: x["date"] or "")

    code = {(c["batch_id"], c["username"]): (int(c["code_runs_ok"]), int(c["code_runs_total"])) for c in coding}

    act_days = defaultdict(dict)
    last_active = {}
    for a in activity:
        act_days[a["username"]][a["day"]] = int(a["events"])
        if a["username"] not in last_active or a["last_at"] > last_active[a["username"]]:
            last_active[a["username"]] = a["last_at"]

    prodigy = defaultdict(dict)
    for p in prodigy_rows:
        if p["strand"]:
            prodigy[p["username"]][p["strand"]] = pct(p["correct"], p["answered"])

    roster_by_batch = defaultdict(list)
    for r in roster:
        if r["batch_id"] in batches:
            roster_by_batch[r["batch_id"]].append(r)

    T = THRESHOLDS
    students_out, details_out, batches_out = [], [], []
    anchor = [0, 0]

    for bid, b in batches.items():
        rs = roster_by_batch.get(bid, [])
        batch_students = []
        b_assess_ids = set()
        per_student = []
        for r in rs:
            u = r["username"]
            k = (bid, u)
            present, listed = att.get(k, (0, 0))
            att_pct = pct(present, listed)
            attendance_d = {"present": present, "held": listed, "pct": att_pct,
                            "band": band3(att_pct, T["attendance"]) if listed >= T["attendance"]["min_held"] else "N"}

            due, done = len(lab_due.get(k, ())), len(lab_done.get(k, ()))
            anchor[0] += len(all_done.get(k, ()))
            anchor[1] += len(all_due.get(k, ()))
            p_pct = pct(done, due)
            not_started = done == 0 and due >= T["participation"]["min_lab_sessions"]
            if due < T["participation"]["min_lab_sessions"]:
                p_band = "N"
            elif not_started:
                p_band = "R"
            else:
                p_band = band3(p_pct, T["participation"])
            participation = {"done": done, "due": due, "pct": p_pct, "band": p_band,
                             "not_started": not_started, "lab_sessions_held": due}

            alist = assess_by_user.get(u, [])
            for a in alist:
                b_assess_ids.add(a["session_id"])
            avg_a = avg([a["pct"] for a in alist])
            ok, tot = code.get(k, (0, 0))
            c_pct = pct(ok, tot)
            if avg_a is not None and c_pct is not None:
                o_score = round(T["outcomes"]["assessment_weight"] * avg_a + T["outcomes"]["code_run_weight"] * c_pct, 1)
            else:
                o_score = avg_a if avg_a is not None else c_pct
            outcomes = {"assessments": alist, "avg_assessment_pct": avg_a, "assessments_taken": len(alist),
                        "code_runs_ok": ok if tot else None, "code_runs_total": tot if tot else None,
                        "code_run_pct": c_pct, "score": o_score, "band": band3(o_score, T["outcomes"])}

            ll = r.get("last_login")
            ever = bool(ll and ll >= from_ms)
            login = {"ever_logged_in": ever,
                     "last_login_at": mdate(dt.datetime.fromtimestamp(ll / 1000, dt.timezone.utc).isoformat().replace("+00:00", "Z")) if ll else None}
            days = act_days.get(u, {})
            d30 = {(as_of_d - dt.timedelta(days=i)).isoformat() for i in range(30)}
            active_30 = sum(1 for d in days if d in d30)
            la = last_active.get(u)
            st = {
                "run_id": run_id, "batch_id": bid, "school_id": b["school_id"], "username": u,
                "name": r.get("name"), "grade": b.get("grade") or r.get("grade"),
                "overall_band": worst(p_band, outcomes["band"]), "reasons": [],
                "attendance": attendance_d, "participation": participation, "outcomes": outcomes,
                "login": login, "active_days_30": active_30,
                "last_active_at": mdate(la.replace(" ", "T")[:23] + "Z") if la else None,
            }
            per_student.append(st)

        # pending assessment = missed an assessment session at least one batch-mate has taken (same rule as the portal)
        for st in per_student:
            taken = {a["session_id"] for a in st["outcomes"]["assessments"]}
            missed = len(b_assess_ids - taken)
            st["outcomes"]["pending_assessments"] = missed
            p, o, a = st["participation"], st["outcomes"], st["attendance"]
            reasons = []
            if p["not_started"]:
                reasons.append(f"Workouts not started — 0 of {p['due']} done")
            elif p["band"] == "R":
                reasons.append(f"Workouts {round(p['pct'])}% — {p['done']} of {p['due']} done")
            elif p["band"] == "A":
                reasons.append(f"Workouts {round(p['pct'])}% ({p['done']} of {p['due']})")
            if o["band"] in ("R", "A"):
                parts = []
                if o["avg_assessment_pct"] is not None:
                    parts.append(f"assessments {round(o['avg_assessment_pct'])}%")
                if o["code_run_pct"] is not None:
                    parts.append(f"code runs {round(o['code_run_pct'])}%")
                reasons.append(f"Outcome score {round(o['score'])}%" + (f" ({', '.join(parts)})" if parts else ""))
            if missed:
                reasons.append(f"Missed {missed} of {len(b_assess_ids)} assessments")
            if a["band"] == "R":
                reasons.append(f"Attendance {a['pct']}% — {a['present']} of {a['held']} classes")
            if not st["login"]["ever_logged_in"]:
                reasons.append("Never logged in since 1 Apr")
            if not reasons and p["band"] == "N" and o["band"] == "N":
                reasons.append("Not enough classes yet to measure")
            if not reasons:
                reasons.append("On track on workouts and outcomes")
            st["reasons"] = reasons
            batch_students.append(st)

            # ---- detail doc
            u = st["username"]
            cl = []
            cl_rows = BATCH_CLASSES.get(bid, [])
            for c in cl_rows:
                wk = wk_by_session.get((bid, u, c["session_id"]))
                cl.append({
                    "date": c["date"], "session_id": c["session_id"], "session_name": c["session_name"],
                    "kind": c["kind"], "status": c["status"],
                    "present": att_occ.get((bid, c["occurrence_id"], u)),
                    "workouts_done": wk[0] if wk else None, "workouts_total": wk[1] if wk else None,
                })
            cutoff = (as_of_d - dt.timedelta(days=T["activity_days"] - 1)).isoformat()
            acts = sorted(({"date": d, "events": n} for d, n in act_days.get(u, {}).items() if cutoff <= d <= as_of),
                          key=lambda x: x["date"], reverse=True)
            prod = prodigy.get(u)
            details_out.append({"run_id": run_id, "batch_id": bid, "username": u, "classes": cl, "activity": acts,
                                "prodigy": {s: prod.get(s) for s in "ACILMS"} if prod else None})

        # ---- batch rollup
        n_held, n_due = len(held_keys.get(bid, ())), len(due_keys.get(bid, ()))
        d_pct = pct(n_held, n_due)
        delivery = {"scheduled": n_due, "held": n_held, "pct": d_pct,
                    "band": band3(d_pct, T["delivery"]) if n_due else "N",
                    "occurrences": dict(occ_stats.get(bid, {"scheduled": 0, "held": 0, "cancelled": 0, "not_marked": 0}))}
        batches_out.append(rollup_batch(run_id, b, batch_students, delivery, len(b_assess_ids)))
        students_out.extend(batch_students)

    schools_out = rollup_schools(run_id, batches_out, students_out, principal)
    run = {
        "_id": run_id, "generated_at": mdate(dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")),
        "data_as_of": as_of, "source": "growth-poc", "window": {"from": frm, "to": as_of},
        "thresholds": THRESHOLDS, "is_latest": False,
        "counts": {"schools": len(schools_out), "batches": len(batches_out), "students": len({s["username"] for s in students_out}),
                   "student_batch_rows": len(students_out)},
        "sources": meta["sources"],
        "anchor_workout_completion_pct_all_sessions": pct(anchor[0], anchor[1]),
    }
    d = os.path.join(OUT, run_id)
    os.makedirs(d, exist_ok=True)
    for name, docs in [("health_runs", [run]), ("health_schools", schools_out), ("health_batches", batches_out),
                       ("health_students", students_out), ("health_student_details", details_out)]:
        with open(os.path.join(d, name + ".ndjson"), "w") as f:
            for doc in docs:
                f.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{name}: {len(docs):,}")
    open(os.path.join(OUT, "LATEST"), "w").write(run_id + "\n")
    print("run_id:", run_id, "| anchor (all-session workout completion):", run["anchor_workout_completion_pct_all_sessions"])


def build_batch_classes(classes, schedule, as_of_ms):
    """Per batch: class rows for the detail view — latest batch_info row per occurrence, plus schedule-only
    occurrences (never opened in batch_info), dated up to data_as_of."""
    names = {}
    for c in classes:
        if c["session_id"]:
            names[c["session_id"]] = (c["session_name"], c["ctype"])
    for s in SESSIONS:
        names.setdefault(s["session_id"], (s["name"], s["ctype"]))
    out = defaultdict(list)
    seen = set()
    for c in classes:
        if not c["scheduled_ms"] or c["scheduled_ms"] > as_of_ms:
            continue
        seen.add((c["batch_id"], c["occurrence_id"]))
        nm, ct = names.get(c["session_id"], (c["session_name"], c["ctype"]))
        out[c["batch_id"]].append({"occurrence_id": c["occurrence_id"], "ms": c["scheduled_ms"], "date": ist_date(c["scheduled_ms"]),
                                   "session_id": c["session_id"], "session_name": nm, "kind": kind_of(ct, nm),
                                   "status": c["status"] or "NOT_MARKED"})
    for s in schedule:
        k = (s["batch_id"], s["occurrence_id"])
        if k in seen or not s["scheduled_ms"] or s["scheduled_ms"] > as_of_ms:
            continue
        seen.add(k)
        nm, ct = names.get(s["session_id"], (None, None))
        out[s["batch_id"]].append({"occurrence_id": s["occurrence_id"], "ms": s["scheduled_ms"], "date": ist_date(s["scheduled_ms"]),
                                   "session_id": s["session_id"], "session_name": nm, "kind": kind_of(ct, nm),
                                   "status": "NOT_MARKED"})
    for v in out.values():
        v.sort(key=lambda x: x["ms"])
    return out


def rollup_batch(run_id, b, sts, delivery, n_assess):
    T = THRESHOLDS
    size = len(sts)

    def counts(key):
        c = {"G": 0, "A": 0, "R": 0, "N": 0}
        for s in sts:
            c[s[key]["band"]] += 1
        return c

    pc, oc = counts("participation"), counts("outcomes")
    p_score, p_band = agg_band(pc)
    o_score, o_band = agg_band(oc)
    not_started = sum(1 for s in sts if s["participation"]["not_started"])
    done = sum(s["participation"]["done"] for s in sts)
    due = sum(s["participation"]["due"] for s in sts)
    ok = sum(s["outcomes"]["code_runs_ok"] or 0 for s in sts)
    tot = sum(s["outcomes"]["code_runs_total"] or 0 for s in sts)
    ap = sum(s["attendance"]["present"] for s in sts)
    ah = sum(s["attendance"]["held"] for s in sts)
    a_pct = pct(ap, ah)
    pending = sum(1 for s in sts if s["outcomes"]["pending_assessments"])
    never = sum(1 for s in sts if not s["login"]["ever_logged_in"])
    participation = dict(pc, not_started=not_started, completion_pct=pct(done, due), score=p_score, band=p_band)
    outcomes = dict(oc, avg_assessment_pct=avg([s["outcomes"]["avg_assessment_pct"] for s in sts]),
                    code_run_pct=pct(ok, tot), score=o_score, band=o_band)
    attendance = {"pct": a_pct if delivery["held"] >= T["attendance"]["min_held"] else None,
                  "band": band3(a_pct, T["attendance"]) if delivery["held"] >= T["attendance"]["min_held"] else "N"}
    reasons = []
    if delivery["band"] in ("R", "A"):
        reasons.append(f"Delivery {delivery['pct']}% — {delivery['held']} of {delivery['scheduled']} classes held")
    if pc["R"]:
        reasons.append(f"{pc['R']} of {size} students are Red on workouts" + (f" ({not_started} not started)" if not_started else ""))
    if oc["R"]:
        reasons.append(f"{oc['R']} of {size} students are Red on outcomes")
    if n_assess and pending:
        reasons.append(f"{pending} students missed at least one assessment")
    if never:
        reasons.append(f"{never} of {size} students have never logged in")
    overall = overall_group(delivery["band"], p_band, o_band)
    if not reasons:
        reasons.append("Batch has not started classes yet" if delivery["band"] == "N" else "On track on delivery, workouts and outcomes")
    return {
        "run_id": run_id, "batch_id": b["batch_id"], "batch_name": b["batch_name"], "grade": b["grade"],
        "school_id": b["school_id"], "school_name": b["school_name"], "region": b["region"],
        "teacher": {"username": b["instructor"], "name": b.get("instructor_name")},
        "start_date": b["start_date"], "batch_state": b["batch_state"], "batch_type": b["batch_type"],
        "batch_category": b["batch_category"], "students": size,
        "delivery": delivery, "participation": participation, "outcomes": outcomes, "attendance": attendance,
        "pending_assessment": pending, "not_logged_in": never,
        "overall_band": overall, "reasons": reasons,
        "_att": [ap, ah], "_code": [ok, tot], "_wk": [done, due],
    }


def rollup_schools(run_id, batches_out, students_out, principal):
    T = THRESHOLDS
    by_school = defaultdict(list)
    for b in batches_out:
        if b["school_id"]:
            by_school[b["school_id"]].append(b)
    st_by_school = defaultdict(list)
    for s in students_out:
        if s["school_id"]:
            st_by_school[s["school_id"]].append(s)
    out = []
    for sid, bs in by_school.items():
        sts = st_by_school.get(sid, [])
        uniq = {}
        for s in sts:  # a student in 2 batches of one school counts once for onboarding
            uniq[s["username"]] = uniq.get(s["username"]) or s["login"]["ever_logged_in"]
        n_students = len(uniq)
        logged = sum(1 for v in uniq.values() if v)
        scheduled = sum(b["delivery"]["scheduled"] for b in bs)
        held = sum(b["delivery"]["held"] for b in bs)
        d_pct = pct(held, scheduled)
        delivery = {"scheduled": scheduled, "held": held, "pct": d_pct,
                    "band": band3(d_pct, T["delivery"]) if scheduled else "N"}
        pc = {k: sum(b["participation"][k] for b in bs) for k in "GARN"}
        oc = {k: sum(b["outcomes"][k] for b in bs) for k in "GARN"}
        p_score, p_band = agg_band(pc)
        o_score, o_band = agg_band(oc)
        not_started = sum(b["participation"]["not_started"] for b in bs)
        wd, wt = sum(b["_wk"][0] for b in bs), sum(b["_wk"][1] for b in bs)
        cok, ctot = sum(b["_code"][0] for b in bs), sum(b["_code"][1] for b in bs)
        ap, ah = sum(b["_att"][0] for b in bs), sum(b["_att"][1] for b in bs)
        a_pct = pct(ap, ah)
        participation = dict(pc, not_started=not_started, completion_pct=pct(wd, wt), score=p_score, band=p_band)
        outcomes = dict(oc, avg_assessment_pct=avg([s["outcomes"]["avg_assessment_pct"] for s in sts]),
                        code_run_pct=pct(cok, ctot), score=o_score, band=o_band)
        rows = sum(b["students"] for b in bs)
        pending = sum(b["pending_assessment"] for b in bs)
        reasons = []
        if delivery["band"] in ("R", "A"):
            reasons.append(f"Delivery {d_pct}% — {held} of {scheduled} classes held")
        if pc["R"]:
            reasons.append(f"{pc['R']} of {rows} students are Red on workouts" + (f" ({not_started} not started)" if not_started else ""))
        if oc["R"]:
            reasons.append(f"{oc['R']} of {rows} students are Red on outcomes")
        if n_students - logged:
            reasons.append(f"{n_students - logged} students have never logged in")
        if pending:
            reasons.append(f"{pending} students missed at least one assessment")
        overall = overall_group(delivery["band"], p_band, o_band)
        if overall == "N":
            reasons.insert(0, "Classes have only just started — not enough data to measure yet")
        teachers = {}
        for b in bs:
            if b["teacher"]["username"]:
                teachers[b["teacher"]["username"]] = b["teacher"]
        pf = None
        if principal is not None and sid in principal:
            pf = {"responses": int(principal[sid]["responses"]), "not_satisfied": int(principal[sid]["not_satisfied"])}
        regions = [b["region"] for b in bs if b["region"]]
        out.append({
            "run_id": run_id, "school_id": sid, "school_name": bs[0]["school_name"],
            "region": max(set(regions), key=regions.count) if regions else "Unknown Region",
            "batches": len(bs), "students": n_students, "teachers": sorted(teachers.values(), key=lambda t: t["username"]),
            "onboarding": {"enrolled": n_students, "logged_in": logged, "not_logged_in": n_students - logged},
            "delivery": delivery, "participation": participation, "outcomes": outcomes,
            "attendance": {"pct": a_pct, "band": band3(a_pct, T["attendance"]) if ah else "N"},
            "pending_assessment": pending,
            "overall_band": overall, "reasons": reasons, "principal_feedback": pf,
        })
    for b in batches_out:
        for k in ("_att", "_code", "_wk"):
            b.pop(k, None)
    return out


SESSIONS = []
BATCH_CLASSES = {}

if __name__ == "__main__":
    _m = load("_meta")
    if os.path.exists(os.path.join(RAW, "12_sessions.json")):
        SESSIONS = load("12_sessions")
    BATCH_CLASSES = build_batch_classes(load("04_classes"), load("03_schedule"), _m["as_of_ms"])
    main()
