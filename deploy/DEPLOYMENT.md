# Production deployment guide

**Docker:** see **[`docker.md`](docker.md)** for `docker compose` (local) and `docker run` (production image).

End-to-end checklist for running Parent Orientation Tracker in production. The app enforces strong config when `NODE_ENV=production` (see `backend/src/server.js`).

## 1. Server environment (`.env`)

1. Copy **`.env.production.example`** to **`.env`** on the server. **Never commit `.env`.**
2. Set every required value:
   - **`COOKIE_SECRET`** — at least 32 characters; generate with `openssl rand -base64 32`.
   - **`PMO_PASS`** / **`SPEAKER_PASS`** — each at least 12 characters, not equal, not a weak default (blocked list in code).
   - **`MONGODB_URI`** — full connection string; production startup fails if Mongo is unreachable.
3. Recommended behind nginx:
   - **`BIND_HOST=127.0.0.1`**, **`PORT=8080`** (or another local port).
   - **`TRUST_PROXY=1`**
   - **`COOKIE_SECURE=1`** when users use **HTTPS** (required for public internet).
4. Optional tuning: **`RATE_LIMIT_LOGIN_MAX`**, **`RATE_LIMIT_UPLOAD_MAX`**, **`RATE_LIMIT_API_MAX`** (see `.env.example`).

### Secrets rotation

- Changing **`COOKIE_SECRET`** invalidates all existing session cookies — users must sign in again.
- Changing **`PMO_PASS`** / **`SPEAKER_PASS`** takes effect immediately; communicate new credentials securely.
- Prefer a **separate** `COOKIE_SECRET` and DB credentials per environment (prod vs preprod).

## 2. HTTPS (reverse proxy)

- Terminate TLS at **nginx**, Caddy, or a cloud load balancer.
- Use **`deploy/nginx-snippet.conf`** as a starting point: set `server_name`, certificate paths, and upstream port.
- Do not expose the Node port to the public internet if the proxy runs on the same host.

## 3. MongoDB

- Use a **dedicated database user** with least privilege (read/write on your app DB only).
- Prefer **TLS** to MongoDB and **network isolation** (VPC, firewall, IP allowlist).
- **Backups**: schedule `mongodump` (see **`deploy/mongodb-backup.example.sh`**) or your cloud provider’s backup feature.
- Document restore procedure before you need it.

## 4. Install and run

From the project root (same directory as `package.json`):

```bash
npm ci --omit=dev
# Create .env from .env.production.example and edit
NODE_ENV=production node backend/server.js   # smoke: should print Listening…
```

### systemd (recommended on Linux)

1. Copy **`deploy/parent-orientation-tracker.service`** to `/etc/systemd/system/`.
2. Edit **`User`**, **`WorkingDirectory`**, **`ReadWritePaths`**, and **`ExecStart`** (`which node`).
3. Ensure **`.env`** exists under `WorkingDirectory`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now parent-orientation-tracker
sudo systemctl status parent-orientation-tracker
journalctl -u parent-orientation-tracker -f
```

### PM2 (alternative)

```bash
cp deploy/pm2-ecosystem.example.cjs ecosystem.config.cjs
# Edit cwd / paths, then:
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # run the printed command once
```

## 5. Monitoring and logs

- **Health**: `GET /api/health` returns `{ ok, mongo, mongoConfigured }`. Point uptime checks here (no auth).
- **Logs**: systemd → `journalctl`; PM2 → `pm2 logs`. The app logs Mongo/connectivity warnings to stdout/stderr.
- **Disk**: ensure the app user can write **`Parent_Orientation_Tracker.xlsx`** (under `backend/` or repo root per `paths.js`).

## 6. Smoke tests (after deploy)

```bash
# From your laptop or the server (replace URL):
SMOKE_BASE_URL=https://orientation.example.org node scripts/smoke-check.js
```

In a browser (same origin as production):

1. Log in as **PMO** — plan a session, save.
2. Log in as **Speaker** — confirm session appears; submit a post-activity update.
3. **Export to Excel** as PMO.
4. If using the **PWA**, reload once after deploy so **`sw.js`** updates (cache version bumps).

## 7. Packaging for upload

Include: `backend/`, `frontend/`, `package.json`, `package-lock.json`, `deploy/`, `.env.example`, `.env.production.example`, `.env.preprod.example`, optional template xlsx.

Exclude: `node_modules/`, `.env`.

On server: `npm ci --omit=dev`, create `.env`, start via systemd or PM2.

## 8. Admin login note

**`ADMIN_USER`** (default `admin`) signs in with the **same password as PMO** (`PMO_PASS`) and receives the PMO role. It is an alternate username, not a separate secret.

## 9. Pre-production (staging)

Use **`.env.preprod.example`** with a **separate** MongoDB database (e.g. `MONGODB_DB=parent_orientation_preprod`) and different secrets from production. Same `NODE_ENV=production` rules apply.
