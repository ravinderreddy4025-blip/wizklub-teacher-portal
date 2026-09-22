#!/usr/bin/env bash
# Load a built snapshot (out/<run_id>/*.ndjson) into MongoDB and make it the latest run.
#   ./load.sh                 # loads the run named in out/LATEST
#   ./load.sh hs-20260919T...  # loads a specific run
# Env: HEALTH_MONGO_URI (default mongodb://127.0.0.1:27018/?directConnection=true), HEALTH_MONGO_DB_NAME (default wizklub_health)
# Old runs are kept (is_latest:false). Re-loading the same run_id first deletes that run's docs (idempotent).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
URI="${HEALTH_MONGO_URI:-mongodb://127.0.0.1:27018/?directConnection=true}"
DB="${HEALTH_MONGO_DB_NAME:-wizklub_health}"
RUN="${1:-$(tr -d '[:space:]' < "$HERE/out/LATEST")}"
DIR="$HERE/out/$RUN"
[ -d "$DIR" ] || { echo "no such run dir: $DIR" >&2; exit 1; }
DBURI="$(echo "$URI" | sed -E "s#^(mongodb://[^/]+)/?#\1/$DB#")"
echo "Loading $RUN into $DB"

mongosh --quiet "$DBURI" --eval "
  const run='$RUN';
  for (const c of ['health_schools','health_batches','health_students','health_student_details']) db[c].deleteMany({run_id: run});
  db.health_runs.deleteOne({_id: run});"

for C in health_schools health_batches health_students health_student_details health_runs; do
  mongoimport --quiet --uri "$DBURI" --collection "$C" --file "$DIR/$C.ndjson" --numInsertionWorkers 4
done

mongosh --quiet "$DBURI" --eval "
  const run='$RUN';
  db.health_schools.createIndex({run_id:1, school_id:1});
  db.health_batches.createIndex({run_id:1, batch_id:1});
  db.health_batches.createIndex({run_id:1, school_id:1});
  db.health_batches.createIndex({run_id:1, 'teacher.username':1});
  db.health_students.createIndex({run_id:1, batch_id:1});
  db.health_students.createIndex({run_id:1, username:1});
  db.health_students.createIndex({run_id:1, school_id:1});
  db.health_student_details.createIndex({run_id:1, batch_id:1, username:1});
  db.health_runs.createIndex({is_latest:1, generated_at:-1});
  // verify the import before flipping
  const want = db.health_runs.findOne({_id: run}).counts;
  const got = {schools: db.health_schools.countDocuments({run_id: run}), batches: db.health_batches.countDocuments({run_id: run}),
               rows: db.health_students.countDocuments({run_id: run}), details: db.health_student_details.countDocuments({run_id: run})};
  if (got.schools !== want.schools || got.batches !== want.batches || got.rows !== want.student_batch_rows || got.details !== want.student_batch_rows) {
    print('COUNT MISMATCH — not flipping is_latest', JSON.stringify({want, got})); quit(2);
  }
  // single-statement flip (standalone mongod has no transactions): exactly one run ends up is_latest
  db.health_runs.updateMany({}, [{\$set: {is_latest: {\$eq: ['\$_id', run]}}}]);
  printjson({latest: db.health_runs.find({is_latest: true}, {_id: 1, data_as_of: 1}).toArray(), counts: got});"
