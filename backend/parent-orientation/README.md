# Parent Orientation (PMO)

Session tracker for WizKlub parent-orientation meetings. This package is the **PMO backend** (`Express` + `MongoDB`). The UI lives in `frontend/parent-orientation`.

## Architecture

- **Frontend:** vanilla JS SPA (`frontend/parent-orientation/public/app.js`) with hash routing. Optional React toast/bundle.
- **Backend:** Express app in `src/app.js`. Entry: `server.js` → `src/bootstrap.js` (loads repo-root `.env`) → `src/server.js`.
- **Database:** MongoDB (`MONGODB_URI` / `MONGO_URI`, database `MONGODB_DB` / `PMO_MONGO_DB_NAME`).
- **Auth:** signed HTTP-only cookies per role (`superadmin`, `pmo`, `speaker`, `sales_admin`). Super Admin is env-only. PMO can also authenticate via the WizKlub staff API. Speaker and Sales Admin use Super Admin–created DB users.
- **Workers:** in-process LSQ webhook sweeper (`src/services/lsqWebhook.js`) when Mongo is connected.

## Local setup

From the repo root, copy `.env.example` to `.env` and set at least:

- `MONGO_URI` / `MONGODB_URI`
- `PMO_MONGO_DB_NAME`
- `COOKIE_SECRET` (32+ random characters)
- `SUPERADMIN_PASS` (12+ characters in production)
- `WIZKLUB_PARENTS_SESSION_WEBHOOK_URL` (required in production when LSQ sync is enabled)

```bash
cd backend/parent-orientation
npm install
npm run dev
```

The API listens on `BIND_HOST`:`PORT` (default `127.0.0.1:8080`).

## Tests

Tests are Node `assert` scripts (no extra test runner). They do **not** need a live MongoDB or CRM.

```bash
npm test
npm run lint
```

`npm test` covers LSQ sync, WizKlub login parsing, password/session validation, auth helpers, sales fulfillment, and HTTP security checks against `createApp()`.

## Deployment

Docker Compose (`docker-compose.yml` at repo root) builds a combined backend image and a frontend gateway. Production refuses to start without `COOKIE_SECRET`, `SUPERADMIN_PASS`, and `MONGODB_URI`. Swagger (`/api-docs`) is off in production unless `SWAGGER_UI=1`.
