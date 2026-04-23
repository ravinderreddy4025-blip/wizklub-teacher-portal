# Infrastructure Folder

This folder holds deployment/runtime infrastructure config.

## Docker Compose

- Primary compose file: `infra/technathon/docker-compose.yml`
- Run from workspace root (`WIZKLUB`):

```bash
docker compose -f infra/technathon/docker-compose.yml --env-file backend/technathon/.env up --build -d
```

Use `--env-file backend/technathon/.env` so local values are loaded consistently.
