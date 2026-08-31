# Dockerfile for Centralized Ingestion Service
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/ingestion-service/package*.json ./apps/ingestion-service/

# Install dependencies (including devDependencies for build)
RUN npm ci --workspace=@alpha-meta-token-scanner/ingestion-service

# Copy source code
COPY apps/ingestion-service/ ./apps/ingestion-service/
COPY tsconfig.base.json ./

# Build application
RUN npm run build --workspace=@alpha-meta-token-scanner/ingestion-service

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
COPY --from=builder /app/apps/ingestion-service/package*.json ./apps/ingestion-service/

# Disable husky in production
ENV HUSKY=0

# Install production dependencies only
RUN npm ci --workspace=@alpha-meta-token-scanner/ingestion-service --omit=dev

# Copy built application
COPY --from=builder /app/apps/ingestion-service/dist ./apps/ingestion-service/dist

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
CMD ["node", "apps/ingestion-service/dist/main.js"]
