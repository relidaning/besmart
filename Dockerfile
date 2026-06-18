FROM node:20-alpine

WORKDIR /app

# Need build tools only for rebuilding native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY node_modules ./node_modules
# Pre-built on host; rebuild only the server-side native module for Alpine/musl
RUN npm rebuild better-sqlite3 --build-from-source

COPY dist ./dist

RUN mkdir -p data

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/server/index.js"]
