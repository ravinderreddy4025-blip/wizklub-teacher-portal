#!/bin/sh
set -eu

cleanup() {
  kill "${TECH_PID:-0}" "${PMO_PID:-0}" "${TESTIMONIALS_PID:-0}" 2>/dev/null || true
}
trap cleanup INT TERM

# Technathon API (port 5000)
(
  cd /app/backend/technathon
  export NODE_ENV="${NODE_ENV:-production}"
  export PORT=5000
  export TRUST_PROXY="${TECH_TRUST_PROXY:-true}"
  # Shared Mongo URI + explicit DB name in env.
  export MONGO_URI="${MONGO_URI:?MONGO_URI is required}"
  if [ -n "${TECH_MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${TECH_MONGO_DB_NAME}"
  elif [ -n "${MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${MONGO_DB_NAME}"
  fi
  node server.js
) &
TECH_PID=$!

# PMO API (port 8080)
(
  cd /app/backend/parent-orientation
  export NODE_ENV="${PMO_NODE_ENV:-production}"
  export PORT=8080
  export BIND_HOST=0.0.0.0
  export TRUST_PROXY="${PMO_TRUST_PROXY:-true}"
  # Shared Mongo URI + explicit DB name in env.
  export MONGODB_URI="${MONGO_URI:?MONGO_URI is required}"
  if [ -n "${PMO_MONGO_DB_NAME:-}" ]; then
    export MONGODB_DB="${PMO_MONGO_DB_NAME}"
  elif [ -n "${MONGO_DB_NAME:-}" ]; then
    export MONGODB_DB="${MONGO_DB_NAME}"
  fi
  export WIZKLUB_PARENTS_SESSION_WEBHOOK_URL="${WIZKLUB_PARENTS_SESSION_WEBHOOK_URL:-}"
  export LSQ_WEBHOOK_DELAY_HOURS="${LSQ_WEBHOOK_DELAY_HOURS:-8}"
  export LSQ_WEBHOOK_POLL_INTERVAL_MS="${LSQ_WEBHOOK_POLL_INTERVAL_MS:-60000}"
  export LSQ_WEBHOOK_MAX_ATTEMPTS="${LSQ_WEBHOOK_MAX_ATTEMPTS:-10}"
  export LSQ_WEBHOOK_BATCH_SIZE="${LSQ_WEBHOOK_BATCH_SIZE:-25}"
  export LSQ_WEBHOOK_DISABLED="${LSQ_WEBHOOK_DISABLED:-0}"
  node server.js
) &
PMO_PID=$!

# Wizklub Testimonials API (port 3001)
(
  cd /app/backend/wizklub-testimonials
  export NODE_ENV="${TESTIMONIALS_NODE_ENV:-${NODE_ENV:-production}}"
  export PORT="${TESTIMONIALS_PORT:-3001}"
  export TRUST_PROXY="${TESTIMONIALS_TRUST_PROXY:-true}"
  export MONGO_URI="${MONGO_URI:?MONGO_URI is required}"
  export GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-}"
  export GCS_FOLDER="${GCS_FOLDER:-wizklub}"
  export GCS_CREDENTIALS="${GCS_CREDENTIALS:-}"
  if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS}"
  fi
  if [ -n "${TESTIMONIALS_MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${TESTIMONIALS_MONGO_DB_NAME}"
  elif [ -n "${MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${MONGO_DB_NAME}"
  fi
  node src/index.js
) &
TESTIMONIALS_PID=$!

# Keep container alive while all three processes are healthy.
while kill -0 "$TECH_PID" 2>/dev/null && kill -0 "$PMO_PID" 2>/dev/null && kill -0 "$TESTIMONIALS_PID" 2>/dev/null; do
  sleep 1
done

EXIT_CODE=0
if ! kill -0 "$TECH_PID" 2>/dev/null; then
  wait "$TECH_PID" || EXIT_CODE=$?
fi
if ! kill -0 "$PMO_PID" 2>/dev/null; then
  wait "$PMO_PID" || EXIT_CODE=$?
fi
if ! kill -0 "$TESTIMONIALS_PID" 2>/dev/null; then
  wait "$TESTIMONIALS_PID" || EXIT_CODE=$?
fi

cleanup
wait || true
exit "$EXIT_CODE"
