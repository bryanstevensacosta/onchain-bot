FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/telegram-bots-gateway/package.json apps/telegram-bots-gateway/
RUN npm ci --workspace=@onchain-bot/telegram-bots-gateway --ignore-scripts || npm install --workspace=@onchain-bot/telegram-bots-gateway --ignore-scripts
COPY apps/telegram-bots-gateway apps/telegram-bots-gateway
COPY tsconfig.base.json ./
WORKDIR /app/apps/telegram-bots-gateway
RUN npx nest build
RUN node -e "require('fs').writeFileSync('dist/main.js', '// Monorepo proxy\nrequire(\'./src/main.js\');\n')"

FROM node:22-alpine AS runtime
RUN apk add --no-cache dumb-init
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
WORKDIR /app
COPY --from=build /app/apps/telegram-bots-gateway/dist ./dist
COPY --from=build /app/apps/telegram-bots-gateway/package.json ./
RUN npm install --omit=dev --ignore-scripts || true
RUN mkdir -p /app/uploads/avatars && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 4070
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4070/api/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
