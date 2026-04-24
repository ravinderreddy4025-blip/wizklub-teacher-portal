# Environment templates (non-secrets)

Copy the file you need into the real app as `.env` (never commit `.env`).

| App | Template | Copy to |
|-----|------------|---------|
| Parent Orientation (PMO) | `parent-orientation.env.example` | `backend/parent-orientation/.env` |
| PMO — Docker-style overrides | `parent-orientation.env.docker.example` | e.g. `.env.docker` if you use compose `env_file` |
| PMO — preprod | `parent-orientation.env.preprod.example` | server `.env` on preprod |
| PMO — production | `parent-orientation.env.production.example` | server `.env` in production |
| Technathon API | `technathon-server.env.example` | `backend/technathon/.env` |
| Technathon web (Vite) | `technathon-client.env.example` | `frontend/technathon/.env` |

Excel layout notes for PMO exports live in `parent-orientation.excel-info-*.txt`.

Unified Docker stack (gateway): from repo root run `docker compose up --build -d` (see root `docker-compose.yml`).

**Compose-only override:** create a repo-root `.env` (not committed; same file Compose reads for variable substitution) to set e.g. `PMO_NODE_ENV=development` if you need relaxed PMO inside Docker locally. Default is production‑aligned.
