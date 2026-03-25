# ── Stage 1: build the Vite frontend ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: production runtime ─────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install all deps (tsx is in devDependencies, needed at runtime)
COPY package*.json ./
RUN npm ci

# Copy server source and built frontend
COPY server/ ./server/
COPY tsconfig.server.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]
