FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies for all backend apps.
COPY backend/parent-orientation/package.json backend/parent-orientation/package-lock.json ./backend/parent-orientation/
COPY backend/wizklub-testimonials/package.json backend/wizklub-testimonials/package-lock.json ./backend/wizklub-testimonials/
RUN npm ci --omit=dev --prefix ./backend/parent-orientation \
  && npm ci --omit=dev --prefix ./backend/wizklub-testimonials

# Copy backend source trees and boot script.
COPY backend ./backend
# Join gateway page (read by PMO backend joinController).
COPY frontend/parent-orientation/public/join.html ./backend/parent-orientation/public/join.html
COPY backend/start-backends.sh /usr/local/bin/start-backends.sh
RUN sed -i 's/\r$//' /usr/local/bin/start-backends.sh \
  && chmod +x /usr/local/bin/start-backends.sh

EXPOSE 8080 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/start-backends.sh"]
