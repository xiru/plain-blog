# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies for the runtime image
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY views ./views
COPY public ./public

# Data (SQLite) and uploaded images are mounted as volumes.
RUN mkdir -p /app/data /app/images
VOLUME ["/app/data", "/app/images"]

EXPOSE 3000
CMD ["node", "dist/server.js"]
