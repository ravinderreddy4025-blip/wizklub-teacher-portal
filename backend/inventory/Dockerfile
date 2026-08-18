FROM node:20-alpine AS base

WORKDIR /app

ENV NODE_ENV=production



FROM base AS deps

COPY backend/inventory/package.json backend/inventory/package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force



FROM base AS runner

RUN apk add --no-cache wget \

  && addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs



COPY --from=deps /app/node_modules ./node_modules

COPY backend/inventory/package.json backend/inventory/package-lock.json ./

COPY backend/inventory/server.js ./server.js

COPY backend/inventory/src ./src

COPY backend/inventory/scripts ./scripts

COPY school-portal ./school-portal



RUN mkdir -p uploads && chown -R nodejs:nodejs /app



USER nodejs



EXPOSE 5002



HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \

  CMD wget -qO- http://127.0.0.1:5002/api/health || exit 1



CMD ["node", "server.js"]

