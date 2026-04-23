# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN groupadd --system --gid 1001 poapp \
  && useradd --system --uid 1001 --gid 1001 poapp \
  && chown -R poapp:poapp /app

USER poapp

ENV NODE_ENV=production
ENV PORT=8080
ENV BIND_HOST=0.0.0.0

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=50s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health',(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d);process.exit(j.ok?0:1)}catch{process.exit(1)}})}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
