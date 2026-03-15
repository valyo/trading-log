# Dev stage: deps only; source is mounted at runtime. Use with docker-compose.dev.yml.
FROM node:20-bookworm AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
EXPOSE 3000
ENV NODE_ENV=development
ENV HOSTNAME="0.0.0.0"
CMD ["npm", "run", "dev"]

# Build stage: install deps and build (better-sqlite3 needs native compile)
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
RUN npm run build

# Run stage: minimal image with standalone server
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Standalone output: server + static + public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# DB and uploads live here; mount a volume in production
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
