FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies for both backend apps.
COPY backend/technathon/package.json backend/technathon/package-lock.json ./backend/technathon/
COPY backend/parent-orientation/package.json backend/parent-orientation/package-lock.json ./backend/parent-orientation/
RUN npm ci --omit=dev --prefix ./backend/technathon \
  && npm ci --omit=dev --prefix ./backend/parent-orientation

# Copy backend source trees and boot script.
COPY backend ./backend
# Join gateway page (read by PMO backend joinController).
COPY frontend/parent-orientation/public/join.html ./backend/parent-orientation/public/join.html
COPY backend/start-backends.sh /usr/local/bin/start-backends.sh
RUN sed -i 's/\r$//' /usr/local/bin/start-backends.sh \
  && chmod +x /usr/local/bin/start-backends.sh

EXPOSE 5000 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/start-backends.sh"]
