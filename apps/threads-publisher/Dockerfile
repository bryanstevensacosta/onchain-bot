# Dockerfile for threads-publisher (threads-publisher plan Fase 2 todo 9)
# Multi-stage build for optimized production image (mirror feed-publisher).

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/threads-publisher/package*.json ./apps/threads-publisher/

# Install dependencies (including devDependencies for build)
# Use --ignore-scripts to prevent prepare hook failures (no husky in Docker)
RUN npm ci --workspace=@onchain-bot/threads-publisher --ignore-scripts

# Copy source code
COPY apps/threads-publisher/ ./apps/threads-publisher/
COPY tsconfig.base.json ./

# Build application
RUN npm run build --workspace=@onchain-bot/threads-publisher

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
COPY --from=builder /app/apps/threads-publisher/package*.json ./apps/threads-publisher/

# Disable husky in production
ENV HUSKY=0

# Install production dependencies only
# Use --ignore-scripts to prevent prepare hook failures
RUN npm ci --workspace=@onchain-bot/threads-publisher --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/threads-publisher/dist ./apps/threads-publisher/dist

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (dev :4100; staging host :4101 and prod host :4102 map to container :4100)
EXPOSE 4100

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4100/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application (nest build emits dist/main.js — sourceRoot src, no src/ prefix)
CMD ["node", "apps/threads-publisher/dist/main.js"]
