FROM node:20-alpine AS technathon-build

WORKDIR /app
COPY frontend/technathon/package*.json ./
RUN npm ci
COPY frontend/technathon ./
ARG VITE_API_URL=""
ARG VITE_APP_BASE_PATH="/technathon/"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH}
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx-combined.conf /etc/nginx/conf.d/default.conf

# PMO static app
COPY frontend/parent-orientation/public /usr/share/nginx/html/pmo

# Technathon SPA build
COPY --from=technathon-build /app/dist /usr/share/nginx/html/technathon

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
