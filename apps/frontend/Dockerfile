FROM node:22-bookworm-slim AS build

ARG VITE_APP_ENV=production

WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/frontend/tsconfig.json apps/frontend/vite.config.ts apps/frontend/tailwind.config.ts apps/frontend/postcss.config.js apps/frontend/index.html ./apps/frontend/

RUN npm ci --no-audit --no-fund

COPY apps/frontend ./apps/frontend

ENV VITE_API_BASE_URL="" \
    VITE_WS_URL="" \
    VITE_APP_ENV="${VITE_APP_ENV}"

RUN npm run build:frontend


FROM nginx:1.27-alpine AS runtime

COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]