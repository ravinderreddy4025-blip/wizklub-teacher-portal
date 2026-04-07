# Docker

One **image** runs the whole app: Express serves **`/api/*`** and static files from **`frontend/`**.

## Quick start (local)

From the project root (where `Dockerfile` lives):

```bash
docker compose up --build
```

Open **http://localhost:8080**. Default logins match `.env.example` (`PMO` / `PMO@123`, `Speaker` / `Speaker@123`). Data persists in the **`po_mongo_data`** volume.

Stop: `docker compose down` (add `-v` to drop Mongo data).

## Production image

Build:

```bash
docker build -t parent-orientation-tracker:latest .
```

Run (fill real secrets; **do not** publish Mongo or the app port to the internet without TLS and a firewall):

```bash
docker run -d --name po-tracker \
  -p 127.0.0.1:8080:8080 \
  -e NODE_ENV=production \
  -e COOKIE_SECRET="$(openssl rand -base64 32)" \
  -e PMO_PASS='your-12-plus-char-pmo-pass' \
  -e SPEAKER_PASS='your-12-plus-char-speaker-pass' \
  -e MONGODB_URI='mongodb://user:pass@your-mongo-host:27017/?authSource=admin' \
  -e MONGODB_DB=parent_orientation \
  -e TRUST_PROXY=1 \
  -e COOKIE_SECURE=1 \
  parent-orientation-tracker:latest
```

Keep **`BIND_HOST=0.0.0.0`** inside the container (default in the `Dockerfile`) so the server listens on all interfaces within the container. Restrict access with **`-p 127.0.0.1:8080:8080`** or place the container behind your reverse proxy network.

## Optional: Compose overrides

To use your own env file instead of the inline `environment` block in `docker-compose.yml`:

1. Copy **`.env.docker.example`** to **`.env.docker`** (gitignored).
2. Add to the `app` service:

```yaml
env_file:
  - .env.docker
```

Remove or trim the duplicate keys under `environment:` to avoid confusion.

## Health check

The image defines `HEALTHCHECK` against **`GET /api/health`**. Orchestrators can use the same URL for liveness/readiness.
