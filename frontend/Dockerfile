# Multi-stage Dockerfile for Loom Frontend (TanStack Start + Nitro)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (legacy peer deps handles TanStack Start peer resolution)
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build production bundle (.output/server and .output/public)
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080

# Copy prebuilt Nitro artifacts from builder
COPY --from=builder /app/.output ./.output

EXPOSE 8080

# Start production Nitro web server
CMD ["node", ".output/server/index.mjs"]
