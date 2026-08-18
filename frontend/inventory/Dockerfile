FROM node:20-alpine AS build
WORKDIR /app

COPY inventory-frontend/package.json inventory-frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY inventory-frontend/ ./
COPY school-portal/ /school-portal/

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY inventory-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
