# Dockerfile for Centralized Ingestion Service
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/ingestion-telegram/package*.json ./apps/ingestion-telegram/

# Install dependencies (including devDependencies for build)
# Use --ignore-scripts to prevent prepare hook failures (no husky in Docker)
RUN npm ci --workspace=@alpha-meta-token-scanner/ingestion-telegram --ignore-scripts

# Copy source code
COPY apps/ingestion-telegram/ ./apps/ingestion-telegram/
COPY tsconfig.base.json ./

# Copy config files (needed at build time)
COPY config/ ./config/

# Build application
RUN npm run build --workspace=@alpha-meta-token-scanner/ingestion-telegram

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
COPY --from=builder /app/apps/ingestion-telegram/package*.json ./apps/ingestion-telegram/

# Disable husky in production
ENV HUSKY=0

# T2 version-match (prod-safety-gates item 2): bake the built commit SHA into
# the image so /api/health can expose it as imageRevision.
ARG IMAGE_REVISION=unknown
ENV IMAGE_REVISION=$IMAGE_REVISION

# Install production dependencies only
# Use --ignore-scripts to prevent prepare hook failures
RUN npm ci --workspace=@alpha-meta-token-scanner/ingestion-telegram --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/ingestion-telegram/dist ./apps/ingestion-telegram/dist

# Copy config files
COPY --from=builder /app/config ./config

# Create uploads directory
RUN mkdir -p /app/uploads/crypto-news/media && \
    chown -R nodejs:nodejs /app/uploads

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3031

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3031/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "apps/ingestion-telegram/dist/src/main.js"]
