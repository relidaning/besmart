FROM node:22-alpine AS base

WORKDIR /app

FROM base AS dependencies

COPY package.json package-lock.json ./
# Install the toolchain only if a native dependency needs a source build.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund || \
    (apk add --no-cache python3 make g++ && npm ci --no-audit --no-fund)

FROM dependencies AS build

COPY index.html vite.config.ts postcss.config.js tailwind.config.js tsconfig.json tsconfig.server.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime

ENV NODE_ENV=production

COPY package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p data

EXPOSE 3001

CMD ["node", "dist/server/index.js"]
