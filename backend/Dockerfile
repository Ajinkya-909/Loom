FROM node:20-alpine AS base

# Install openssl for Prisma on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for build step)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build config
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to dist/
RUN npm run build

# Expose backend port
EXPOSE 4000

# Push schema to database and start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
