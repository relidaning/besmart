# Build stage: rebuild the native module for Alpine/musl, then drop dev dependencies.
FROM node:20-alpine AS build

WORKDIR /app

# Need build tools only for rebuilding native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY node_modules ./node_modules
# Pre-built on host; rebuild only the server-side native module for Alpine/musl
RUN npm rebuild better-sqlite3 --build-from-source
# Offline: only removes packages the server doesn't need at runtime (vite, tsc, tailwind…)
RUN npm prune --omit=dev --offline

# Runtime stage: no compiler toolchain, production node_modules only.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY dist ./dist

RUN mkdir -p data

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/server/index.js"]
