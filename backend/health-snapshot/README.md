# WizKlub health snapshot builder

This builds the `wizklub_health` MongoDB snapshot that the Teachers Portal and PMO health screens read.
The shape and band rules come from HEALTH_CONTRACT v1. The source is the growth-poc replica, schema `wizklub`
(Metabase DB 18). The builder only runs SELECT queries, never writes to growth-poc and never changes anything
in Metabase.

## Run

```bash
cd backend/health-snapshot
/opt/homebrew/bin/python3 fetch.py            # ~4 min: sql/*.sql via Metabase /api/dataset/json -> raw/*.json (no 2k-row cap)
/opt/homebrew/bin/python3 build_snapshot.py   # ~5 s: bands + rollups -> out/<run_id>/health_*.ndjson, out/LATEST
/opt/homebrew/bin/python3 validate.py         # counts, band distributions, anchors (no PII printed)
./load.sh                                     # mongoimport, indexes, count check, then flip is_latest
```

- **Secrets:** the Metabase key comes from `METABASE_API_KEY`. If that is not set, the builder reads
  `metabase_business_reports_api_key` from `$IL_JIRA_ENV` (default: `…/Isaee Projects/IL Jira/.env`).
  Nothing secret is stored in this folder.
- **Mongo:** set with `HEALTH_MONGO_URI` (default `mongodb://127.0.0.1:27018/?directConnection=true`) and
  `HEALTH_MONGO_DB_NAME` (default `wizklub_health`).
- **Runs:** each run gets a new `run_id` (`hs-YYYYMMDDTHHMMSS`). Old runs stay in the database with
  `is_latest:false`. The latest run is switched by a single `updateMany`, because the standalone mongod has no
  transactions. Loading the same run twice replaces it.
- **Rebuilds:** `fetch.py --only 07_assessments` re-pulls one dataset. `fetch.py --force` re-pulls all of them.
- `raw/` and `out/` contain student names, so both are git-ignored.
- `fetch.py` also pulls principal feedback (`11_principal_feedback.sql`) from Metabase **DB 16 (prod)**, because
  `feedback_school` is empty in growth-poc.

## Scope and window

- **Batches:** every batch with `batch_details.start_date >= 2026-04-01`, of any state or type (2,727 on the
  18 Sep data). `batch_state`, `batch_type` and `batch_category` are stored, so the UI can filter on them.
- **Roster:** `batch.attendees` (the `v_batch_roster` view). A student in two batches gets one row per batch.
- **Schools:** the schools that own those batches (203). Batches without a `school_id` are left out of the
  school rollup.
- **`data_as_of`:** the IST date of the oldest "latest change" among batch_info, batch, score_management and
  session_log. Classes count only if they are dated on or before the end of that day. Each source's own freshness
  is stored in `health_runs.sources`.

## Metric definitions (what each pillar really reads)

| Pillar | Definition |
|---|---|
| **delivery** (batch) | Counted in **distinct curriculum sessions**, not calendar slots. `scheduled` = distinct `session_id` whose occurrence in `batch_schedule_fdw.schedule_details` is dated ≤ as_of, plus any held ones. `held` = distinct `session_id` whose **latest** `batch_info_fdw` row (per occurrence) is COMPLETED or PARTIAL, or has `completion_type` FULL or PARTIAL, and is not CANCELLED. When a class is cancelled, the platform re-slots its session, so counting slots would count one lesson twice. On the slot basis, delivery would be 63% instead of 80%, and 53% of batches would be Red instead of 25%. The raw slot counts are kept in `delivery.occurrences {scheduled, held, cancelled, not_marked}`. |
| **participation** (student) | Workout submission, using the logic of dashboard 29 card 235. A student has submitted a session's workout when their latest `session_log_fdw` status is COMPLETED, or when they have `score_management_fdw` rows for every level in `session.level_list` after the last session_log change. Due = held sessions (unique by normalised session name) on which the student appears in `batch_info.attendees`. **Session types:** `THRESHOLDS.participation.session_types` = Lab, Lecture, Other and Practice (from `v_session_type`). Every WizKlub session has platform workouts. Lab-only would leave 49% of batches N, and the business anchor (48%) is measured over all sessions. Assessments are excluded because they are scored under outcomes. Set the list to `["Lab"]` for lab-only. `not_started` means 0 submitted with 2 or more sessions due. `lab_sessions_held` = sessions due. |
| **outcomes** (student) | Score = 0.5 × average assessment % + 0.5 × code-run %. If one side is missing, the other is used; if both are missing, the band is N. **Assessment:** `score_management_fdw` since 1 Apr on sessions whose name matches `assess?ment`. That includes Assessment - I, Mid-Year, Final and product assessments. It excludes Pre-Assessment, Revision, Practice Test, Prodigy and CORE Battery. % = `LEAST(SUM(score) / session.max_score, 1)`, as in card 1245. `pending_assessments` = assessment sessions that at least one batch-mate has taken and this student has not (the same rule the portal service uses). |
| **code-run success** (decision) | The replica stores **only submitted runs**. BLOCKLY and CHALLENGE rows are always score 1, and CODING rows are 97% > 0, so "success among attempts" is ~100% and carries no signal. The definition used instead: **due** = every coding-type exercise (`level.level_type` in CODING, BLOCKLY, CHALLENGE, APPBUILDER) in the `level_list` of a session held for the batch while the student was on the class list. **ok** = the student has a `score_management_fdw` row with score > 0 for that level since 1 Apr. A missing run counts as not successful. Overall this comes to 46.7%. It overlaps with participation, which is a known limitation. |
| **attendance** (supporting) | Present ÷ held classes on which the student is listed (`batch_info.attendees[].present_flag`). N when fewer than 3 were held. |
| **login** | `wizklub_users_fdw.last_login` (epoch-ms). `ever_logged_in` = last login on or after 1 Apr. Only the latest login is stored, so this is a lower bound. |
| **activity** | Rows of `session_log_fdw` per IST day. Each row is one session the student touched, and `last_modified` is the latest touch, so this undercounts earlier activity. `active_days_30` and `last_active_at` come from the same data. Details keep the last 90 days. |
| **prodigy** | % of answered Prodigy questions scored > 0, per strand. The strand comes from the `prodigy:<bank>-<strand><n>` tag in `level.tags`. It is null when the student has not taken the test. |

**Bands:** the thresholds are in `THRESHOLDS` in `build_snapshot.py` and are copied to `health_runs.thresholds`.
- Batch and school pillar bands use `(3G + A) / 3(G+A+R)`.
- Overall band: R if delivery is R or 2 or more pillars are R; G if all three pillars are G; N if all three are N;
  A otherwise. The N case is not written in the contract. It keeps new batches from showing as Amber.
- School pillar counts are sums of the batch-student rows, the same way the fixture does it. School
  `students` and `onboarding` count distinct usernames instead.

**Fields added beyond the contract** (extra fields only; nothing in the contract was renamed):
- `delivery.occurrences`
- batch `region`, `batch_type`, `batch_category`, `pending_assessment` and `not_logged_in`
- school `pending_assessment`
- student `outcomes.pending_assessments`
- run `sources`, `counts.student_batch_rows` and `anchor_workout_completion_pct_all_sessions`

## Validation (run of 19 Sep 2026, data as of 18 Sep)

- Workout completion over all sessions is **47.0%**. The 19 Sep meeting quoted about 48% (dashboard 29).
- School workout completion is under 20% at 37 schools and under 50% at 97. The meeting quoted about 44 and about 100.
- Two batches were checked by hand against raw `batch_info` / `session_log` / `score_management` SQL. Held,
  cancelled, attendance and workout % all matched exactly.
- Sri Chaitanya-Banaswadi (`beng0010`): 29 batches, 582 students. All 29 batches are present.

## Known gaps

- Principal feedback comes from prod DB 16 and shows 55 responses at 33 schools. The card's
  respondent-name filter is only partly copied, so this differs from the "48" quoted in the meeting.
- `batch_enrollment` lags the roster, so `batch.attendees` is used as the roster.
- Region comes from `schools.region_id` plus the card-190 overrides. Many B2B schools have no region, so they
  show as "Unknown Region".
- Assessments belong to the student, not the batch. A student in two batches carries the same assessments
  in both rows.
- There is no in-class QR data or at-home homework data yet. Participation covers platform workouts only.
