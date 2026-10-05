# Dockerfile for publishing-queue (todos 1-2, sessions-scheduler contract)
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/publishing-queue/package*.json ./apps/publishing-queue/

# Install dependencies (including devDependencies for build)
# Use --ignore-scripts to prevent prepare hook failures (no husky in Docker)
RUN npm ci --workspace=@onchain-bot/publishing-queue --ignore-scripts

# Copy source code
COPY apps/publishing-queue/ ./apps/publishing-queue/
COPY tsconfig.base.json ./

# Build application
RUN npm run build --workspace=@onchain-bot/publishing-queue

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
COPY --from=builder /app/apps/publishing-queue/package*.json ./apps/publishing-queue/

# Disable husky in production
ENV HUSKY=0

# Install production dependencies only
# Use --ignore-scripts to prevent prepare hook failures
RUN npm ci --workspace=@onchain-bot/publishing-queue --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/publishing-queue/dist ./apps/publishing-queue/dist

# Persistent media library (named volume at compose level)
RUN mkdir -p /app/apps/publishing-queue/uploads && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application (nest build emits dist/main.js — sourceRoot src, no src/ prefix)
CMD ["node", "apps/publishing-queue/dist/main.js"]
