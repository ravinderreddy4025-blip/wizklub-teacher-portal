FROM node:20-alpine AS testimonials-build

WORKDIR /app
COPY frontend/wizklub-testimonials/package*.json ./frontend/wizklub-testimonials/
RUN npm ci --legacy-peer-deps --prefix ./frontend/wizklub-testimonials \
  || npm install --legacy-peer-deps --prefix ./frontend/wizklub-testimonials
COPY frontend/wizklub-testimonials ./frontend/wizklub-testimonials
COPY frontend/inventory ./frontend/inventory
COPY school-portal ./school-portal
ARG TESTIMONIALS_BASE_PATH="/wizklub-testimonials/"
ARG VITE_USE_MOCK="false"
ENV VITE_APP_BASE_PATH=${TESTIMONIALS_BASE_PATH}
ENV VITE_INVENTORY_API_URL=/wizklub-testimonials/inventory-api
ENV VITE_USE_MOCK=${VITE_USE_MOCK}
WORKDIR /app/frontend/wizklub-testimonials
RUN npm install --prefix ../inventory --legacy-peer-deps
RUN npm run build

FROM node:20-alpine AS inventory-build

WORKDIR /app
COPY frontend/inventory/package*.json ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
COPY frontend/inventory ./
COPY school-portal ./school-portal
ARG INVENTORY_BASE_PATH="/inventory/"
ENV VITE_INVENTORY_BASE_PATH=${INVENTORY_BASE_PATH}
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx-combined.conf /etc/nginx/conf.d/default.conf

# Gateway landing page
COPY frontend/gateway/index.html /usr/share/nginx/html/index.html
COPY frontend/gateway/brand /usr/share/nginx/html/brand

# PMO static app
COPY frontend/parent-orientation/public /usr/share/nginx/html/pmo

# Wizklub Testimonials SPA build
COPY --from=testimonials-build /app/frontend/wizklub-testimonials/dist /usr/share/nginx/html/wizklub-testimonials

# Inventory SPA (Admin / AM / Dispatch / School)
COPY --from=inventory-build /app/dist /usr/share/nginx/html/inventory

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
