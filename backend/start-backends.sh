#!/bin/sh
set -eu

cleanup() {
  kill "${PMO_PID:-0}" "${TESTIMONIALS_PID:-0}" "${INVENTORY_PID:-0}" 2>/dev/null || true
}
trap cleanup INT TERM

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
  export INTERNAL_BRIDGE_SECRET="${INTERNAL_BRIDGE_SECRET:-}"
  export INVENTORY_API_BASE_URL="${INVENTORY_API_BASE_URL:-http://127.0.0.1:5002/api}"
  if [ -n "${TESTIMONIALS_MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${TESTIMONIALS_MONGO_DB_NAME}"
  elif [ -n "${MONGO_DB_NAME:-}" ]; then
    export MONGO_DB_NAME="${MONGO_DB_NAME}"
  fi
  node src/index.js
) &
TESTIMONIALS_PID=$!

# WizKlub Inventory API (port 5002) — school portal backend
(
  cd /app/backend/inventory
  export NODE_ENV="${INVENTORY_NODE_ENV:-${NODE_ENV:-production}}"
  export PORT="${INVENTORY_PORT:-5002}"
  export JWT_SECRET="${JWT_SECRET:?JWT_SECRET is required for inventory auth}"
  export WIZKLUB_API_BASE_URL="${WIZKLUB_API_BASE_URL:-https://api.wizklub.com/v1}"
  export INTERNAL_BRIDGE_SECRET="${INTERNAL_BRIDGE_SECRET:?INTERNAL_BRIDGE_SECRET is required}"
  export NODE_PATH="/app/backend/inventory/node_modules${NODE_PATH:+:$NODE_PATH}"
  if [ -n "${INVENTORY_MONGODB_URI:-}" ]; then
    export MONGODB_URI="${INVENTORY_MONGODB_URI}"
  else
    BASE_URI="${MONGO_URI:?MONGO_URI is required}"
    DB_NAME="${INVENTORY_MONGO_DB_NAME:-wizklub-inventory}"
    case "$BASE_URI" in
      *'?'*)
        HOST_PART="${BASE_URI%%\?*}"
        HOST_PART="${HOST_PART%/}"
        export MONGODB_URI="${HOST_PART}/${DB_NAME}?${BASE_URI#*\?}"
        ;;
      *)
        export MONGODB_URI="${BASE_URI%/}/${DB_NAME}"
        ;;
    esac
  fi
  node server.js
) &
INVENTORY_PID=$!

# Keep container alive while all processes are healthy.
while kill -0 "$PMO_PID" 2>/dev/null && kill -0 "$TESTIMONIALS_PID" 2>/dev/null && kill -0 "$INVENTORY_PID" 2>/dev/null; do
  sleep 1
done

EXIT_CODE=0
if ! kill -0 "$PMO_PID" 2>/dev/null; then
  wait "$PMO_PID" || EXIT_CODE=$?
fi
if ! kill -0 "$TESTIMONIALS_PID" 2>/dev/null; then
  wait "$TESTIMONIALS_PID" || EXIT_CODE=$?
fi
if ! kill -0 "$INVENTORY_PID" 2>/dev/null; then
  wait "$INVENTORY_PID" || EXIT_CODE=$?
fi

cleanup
wait || true
exit "$EXIT_CODE"
