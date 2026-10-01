# Dockerfile for kol-calls-publisher (P51 split from kol-system)
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/kol-calls-publisher/package*.json ./apps/kol-calls-publisher/

# Install dependencies (including devDependencies for build)
# Use --ignore-scripts to prevent prepare hook failures (no husky in Docker)
RUN npm ci --workspace=@onchain-bot/kol-calls-publisher --ignore-scripts

# Copy source code
COPY apps/kol-calls-publisher/ ./apps/kol-calls-publisher/
COPY tsconfig.base.json ./

# Build application
RUN npm run build --workspace=@onchain-bot/kol-calls-publisher

# Stage 2: Production
FROM node:22-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/apps/kol-calls-publisher/package*.json ./apps/kol-calls-publisher/

# Disable husky in production
ENV HUSKY=0

# Install production dependencies only
# Use --ignore-scripts to prevent prepare hook failures
RUN npm ci --workspace=@onchain-bot/kol-calls-publisher --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/kol-calls-publisher/dist ./apps/kol-calls-publisher/dist

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3060

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3060/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application (nest build emits dist/main.js — sourceRoot src, no src/ prefix)
CMD ["node", "apps/kol-calls-publisher/dist/main.js"]
