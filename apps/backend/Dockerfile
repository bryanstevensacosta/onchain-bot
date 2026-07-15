FROM node:22-bookworm-slim AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/backend/package.json ./apps/backend/
COPY scripts ./scripts
COPY apps/backend/tsconfig*.json apps/backend/nest-cli.json ./apps/backend/

RUN npm ci --no-audit --no-fund --ignore-scripts

COPY apps/backend ./apps/backend

RUN npm run build:backend


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3030

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/package.json ./package.json

RUN chown -R node:node /app
USER node

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3030}/api/health || exit 1

CMD ["node", "dist/src/main.js"]