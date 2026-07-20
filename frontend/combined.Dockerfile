FROM node:20-alpine AS testimonials-build

WORKDIR /app
COPY frontend/wizklub-testimonials/package*.json ./
RUN npm ci
COPY frontend/wizklub-testimonials ./
ARG TESTIMONIALS_BASE_PATH="/wizklub-testimonials/"
ARG VITE_USE_MOCK="false"
ENV VITE_APP_BASE_PATH=${TESTIMONIALS_BASE_PATH}
ENV VITE_USE_MOCK=${VITE_USE_MOCK}
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx-combined.conf /etc/nginx/conf.d/default.conf

# Gateway landing page
COPY frontend/gateway/index.html /usr/share/nginx/html/index.html
COPY frontend/gateway/brand /usr/share/nginx/html/brand

# PMO static app
COPY frontend/parent-orientation/public /usr/share/nginx/html/pmo

# Wizklub Testimonials SPA build
COPY --from=testimonials-build /app/dist /usr/share/nginx/html/wizklub-testimonials

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
