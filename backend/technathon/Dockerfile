FROM node:20-alpine

WORKDIR /app

# Install only production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "start"]
