# syntax=docker/dockerfile:1
# PMO static shell (nginx). Proxies /pmo/api/ to po-backend:8080 per nginx.conf.
# For live public/ and nginx.conf edits without rebuild, use compose bind mounts (see root docker-compose.yml).

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
