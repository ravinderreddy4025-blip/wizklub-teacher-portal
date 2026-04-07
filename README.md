# Parent Orientation Tracker

Web app for **PMO** (plan sessions) and **Speaker** (post-activity updates). Sessions are stored in **MongoDB** (shared) with a **local Excel** file sync, and the browser keeps a **localStorage** cache.

## Requirements

- **Node.js** 18+
- **MongoDB** reachable from the server (optional for local-only use without shared DB; required for multi-user / server deployments)
- Writable directory for `Parent_Orientation_Tracker.xlsx` (see layout below)

## Project layout

| Path | Role |
|------|------|
| **`backend/server.js`** | Process entry: loads env, builds the app, starts HTTP |
| **`backend/src/app.js`** | Express app factory (`createApp`) |
| **`backend/src/server.js`** | Startup checks, Mongo/Excel init, `listen`, graceful shutdown |
| **`backend/src/config/`** | `env.js`, `paths.js`, `constants.js` |
| **`backend/src/domain/`** | Session validation & merge rules (`sessions.js`) |
| **`backend/src/services/`** | `mongo.js`, `excel.js` |
| **`backend/src/middleware/`** | Auth cookies, rate limits, Helmet |
| **`backend/src/routes/`** | Static assets + API + 404/error handlers |
| **`frontend/index.html`** | App shell (served at `/`) |
| **`frontend/public/`** | `app.js`, PWA assets, toast bundles, `brand/` logo |
| **`frontend/src/client/`** | `toast-bridge.jsx` → run **`npm run build:toast`** to emit bundles into `public/` |
| **Repo root** | `package.json`, `node_modules/`, `.env`, optional legacy `Parent_Orientation_Tracker.xlsx` |
| **`backend/Parent_Orientation_Tracker.xlsx`** | Preferred workbook location (created on first run if missing; server also accepts a file at repo root for existing deployments) |

## Quick start (local)

```bash
cp .env.example .env
# Edit .env: set COOKIE_SECRET, MONGODB_URI if using Mongo, etc.
npm ci
npm start
```

Open `http://localhost:8080` (or the `PORT` in `.env`).

### Docker (optional)

```bash
docker compose up --build
```

Same URL; includes **MongoDB** in Compose. Details: **[`deploy/docker.md`](deploy/docker.md)**.

Default logins (change in `.env` before any shared deployment):

| Role    | Username  | Password (default) |
|---------|-----------|--------------------|
| PMO     | `PMO`     | `PMO@123`          |
| Speaker | `Speaker` | `Speaker@123`      |
| Admin   | `admin`   | same as PMO pass   |

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `8080`) |
| `BIND_HOST` | `127.0.0.1` (local only) or `0.0.0.0` (listen on all interfaces) |
| `COOKIE_SECRET` | Long random string for signed session cookies |
| `PMO_USER`, `PMO_PASS`, `SPEAKER_USER`, `SPEAKER_PASS`, `ADMIN_USER` | App logins |
| `MONGODB_URI` | MongoDB connection string (omit to disable server-side persistence) |
| `MONGODB_DB` | Database name (default `parent_orientation`) |
| `TRUST_PROXY` | `1` when behind nginx / load balancer |
| `COOKIE_SECURE` | `1` on HTTPS if `NODE_ENV` is not `production` |
| `NODE_ENV` | `production` enables secure cookies when `COOKIE_SECURE` unset; enables stricter rate limits |
| `RATE_LIMIT_LOGIN_MAX` | Max login attempts per IP per 15 min (default 15 in production, 100 otherwise) |
| `RATE_LIMIT_UPLOAD_MAX` | Max Excel uploads per IP per minute (default 20 in production, 120 otherwise) |
| `RATE_LIMIT_API_MAX` | Max authenticated `/api/*` requests per IP per minute, excluding `/api/health` (default 400 in production, 2000 otherwise) |

Never commit `.env` or paste real credentials into tickets or screenshots.

### Production mode (`NODE_ENV=production`)

Start with **`npm run start:prod`** (or `NODE_ENV=production node backend/server.js`). The process **exits on startup** unless:

- **`COOKIE_SECRET`**: at least 32 characters, not a placeholder string.
- **`PMO_PASS`** / **`SPEAKER_PASS`**: set in the environment, at least **12** characters each, **not equal**, and not a blocked common default.
- **`MONGODB_URI`**: set (shared persistence is mandatory in production).
- **`frontend/public/app.js`** exists.

**Graceful shutdown**: `SIGTERM` / `SIGINT` closes the HTTP server and MongoDB client (use with systemd, Kubernetes, or PM2).

Copy **`.env.production.example`** into `.env` on the server and fill every empty value. Prefer **`BIND_HOST=127.0.0.1`** with **nginx** (or similar) on `443`; see **`deploy/nginx-snippet.conf`** for a TLS + proxy example.

### Security headers and rate limits

The server uses **Helmet** with a **Content-Security-Policy** (scripts **`'self'`** + **`'unsafe-inline'`** for the small inline boot snippet in `index.html`; styles/fonts allow Google Fonts). **`X-Powered-By`** is disabled. **Login**, **Excel upload**, and **most `/api` routes** are **rate-limited** by IP (`/api/health` is excluded). Malformed JSON bodies return **400** without exposing stack traces in production. Behind a reverse proxy, set **`TRUST_PROXY=1`** so the client IP is correct. The Excel template URL `/Parent_Orientation_Tracker.xlsx` requires a signed-in session.

## API (authenticated except health)

- `GET /api/health` — `{ ok, mongo }`
- `GET /api/me` — current role or 401
- `POST /api/login` — JSON `{ user, pass }`, sets cookie
- `POST /api/logout`
- `GET /api/sessions` — full session array (Mongo or `[]`)
- `PUT /api/sessions` — PMO: replace full session array (each session needs a safe `id`: letters, digits, `_`, `-`, max 80 chars). Speaker: merges only post-activity fields onto the server copy (cannot add/delete sessions or change PMO-planned fields).
- `POST /api/uploadExcel` — PMO only; raw `.xlsx` body (syncs `Parent_Orientation_Tracker.xlsx` on the server). Speaker updates do not rewrite that file; have PMO save or export to refresh it.

## MongoDB layout

- Database: `MONGODB_DB` (default `parent_orientation`)
- Collection: `app_state`
- Document `_id`: `tracker_sessions` — field `sessions` (array)

Inspect with [MongoDB Compass](https://www.mongodb.com/products/compass) using the same URI as `MONGODB_URI`.

## Deployment (Linux server)

**Full checklist:** **[`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md)** (env, HTTPS, Mongo backups, systemd/PM2, smoke tests, secrets rotation).

1. Upload the project (zip or git). Include **`.env.example`** and **`.env.production.example`**; create **`.env`** on the server only.
2. `npm ci --omit=dev` (install without devDependencies) or `npm ci` if you use `npm run start:prod` on the host.
3. Create `.env` from **`.env.production.example`**: set `MONGODB_URI`, `COOKIE_SECRET`, passwords, `TRUST_PROXY=1`, `COOKIE_SECURE=1`. Use **`BIND_HOST=127.0.0.1`** and **`PORT=8080`** when nginx proxies to Node.
4. **HTTPS in front** (nginx, Caddy, cloud LB): terminate TLS at the proxy; see **`deploy/nginx-snippet.conf`**.
5. Run under **PM2** or **systemd** so the process survives SSH disconnect and reboot.

### PM2 (example)

```bash
cd /path/to/parent-orientation
cp deploy/pm2-ecosystem.example.cjs ecosystem.config.cjs
# Edit ecosystem.config.cjs (cwd path), then:
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the printed sudo command once
pm2 save
```

Or ad hoc: `NODE_ENV=production pm2 start backend/server.js --name parent-orientation`.

### systemd

See `deploy/parent-orientation-tracker.service` — adjust `User`, `WorkingDirectory`, and `ExecStart` (`which node`).

### Preprod server (testing)

Use the same stack as production so behavior matches. The app only knows **`NODE_ENV=production`** (there is no separate “preprod” flag): preprod must satisfy the same startup rules (strong `COOKIE_SECRET`, passwords, `MONGODB_URI`, `frontend/public/app.js`).

1. **Copy the app** to the server (git clone, `scp`, or zip). Do not upload `.env`.
2. **Install:** `cd /path/to/Parent_Orientation_Tracker && npm ci --omit=dev`
3. **Config:** `cp .env.preprod.example .env` and edit:
   - **`MONGODB_URI`** — preprod database user/URI (prefer a **separate** `MONGODB_DB`, e.g. `parent_orientation_preprod`, so production data is never used).
   - **`COOKIE_SECRET`**, **`PMO_PASS`**, **`SPEAKER_PASS`** — new random values (not the same as production).
   - **`TRUST_PROXY=1`** and **`COOKIE_SECURE=1`** when HTTPS terminates in nginx (see `deploy/nginx-snippet.conf`; set `server_name` to your preprod hostname).
   - **`BIND_HOST=127.0.0.1`** and **`PORT=8080`** (or another port) with nginx `proxy_pass` to that port.
4. **Firewall:** allow **443** (and **22** for SSH) from your office/VPN; do not expose the Node port publicly if nginx is on the same host.
5. **Run:** `NODE_ENV=production node backend/server.js` once to confirm it starts, or install the systemd unit and `sudo systemctl enable --now parent-orientation-tracker` (after copying/editing the unit file).
6. **Smoke tests** (replace host and passwords):
   - `SMOKE_BASE_URL=https://preprod.your-org.example npm run smoke` (or `curl -sS …/api/health`).
   - Open the same origin in a browser, log in as PMO and Speaker, create a session, confirm the other role sees it (proves Mongo + cookies).

**Plain HTTP on a locked-down network only:** if you truly cannot use TLS yet, set **`COOKIE_SECURE=0`** in `.env` so cookies work over `http://`; do not use this on the public internet.

## Packaging a zip for upload

Include at least:

`backend/server.js`, `backend/src/` (all of it), `frontend/index.html`, `frontend/public/` (including `app.js`), `frontend/src/` (toast source), `scripts/` (e.g. `smoke-check.js`), `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `Parent_Orientation_Tracker.xlsx` (repo root or `backend/`), `clean_excel.js`, `.env.example`, `.env.production.example`, `.env.preprod.example`, `.env.docker.example`, `deploy/` (including `DEPLOYMENT.md`, `docker.md`, nginx, systemd, backup example).

Exclude: `node_modules/`, `.env` (create on server).

Then on the server: `unzip`, `npm ci`, create `.env`, `pm2 start` or `npm start`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Run the server |
| `npm run start:prod` | Production mode (`NODE_ENV=production`) |
| `npm test` | Run automated tests |
| `npm run smoke` | `GET /api/health` against `SMOKE_BASE_URL` or first CLI arg (default `http://127.0.0.1:8080`) |
| `npm run docker:up` | `docker compose up --build` (requires Docker Desktop / Engine) |
| `npm run clean` | Clear data rows in `Parent_Orientation_Tracker.xlsx` (destructive) |

## Is this ready for deployment?

**Internal / preprod:** yes, with strong secrets, HTTPS (or private network only), firewall rules, and PM2/systemd as in this README.

### Public production (internet-facing)

The app is a **small internal-style tool**. You can run it on the public internet only if you **layer proper infrastructure** on top:

| Layer | What to do |
|--------|------------|
| **TLS** | Terminate **HTTPS** at nginx, Caddy, or a cloud load balancer. Never expose plain HTTP to the world. |
| **Env** | `NODE_ENV=production`, `TRUST_PROXY=1`, `COOKIE_SECURE=1` (or rely on `NODE_ENV` for secure cookies), **long random** `COOKIE_SECRET` (32+ chars), **strong** PMO/Speaker passwords. |
| **Network** | Prefer Node listening on **127.0.0.1** and proxy from 443 only. If Node listens on `0.0.0.0`, use a **firewall / security group** so only the proxy can reach the app port. |
| **MongoDB** | **TLS** to Mongo if available; **IP allowlist** / private VPC; least-privilege DB user; backups. |
| **Abuse** | Built-in **rate limits** on login and uploads; tune with `RATE_LIMIT_*`. Consider a **WAF** or CDN for DDoS. |
| **Data** | Back up **`app_state`** in Mongo and **`Parent_Orientation_Tracker.xlsx`**. The `PUT /api/sessions` model is a **full replace** — plan for conflicts if many editors work at once. |
| **Compliance** | If you handle personal data, follow your org’s **privacy / retention** rules; this app does not include audit logs or field-level encryption. |

**Honest summary:** suitable **public production** only with the table above handled by your team. For high-assurance or regulated data, get a security review and consider a fuller product (SSO, audit trail, dedicated API hardening).

---

## License / support

Internal use; adjust as needed for your organization.
