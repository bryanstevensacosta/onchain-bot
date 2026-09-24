# Dockerfile for kol-system skeleton (Tramo 1, todo 2)
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Disable husky in CI/Docker (MUST be before npm ci)
ENV HUSKY=0

# Copy package files
COPY package*.json ./
COPY apps/kol-system/package*.json ./apps/kol-system/

# Install dependencies (including devDependencies for build)
# Use --ignore-scripts to prevent prepare hook failures (no husky in Docker)
RUN npm ci --workspace=@alpha-meta-token-scanner/kol-system --ignore-scripts

# Copy source code
COPY apps/kol-system/ ./apps/kol-system/
COPY tsconfig.base.json ./

# Build application
RUN npm run build --workspace=@alpha-meta-token-scanner/kol-system

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
COPY --from=builder /app/apps/kol-system/package*.json ./apps/kol-system/

# Disable husky in production
ENV HUSKY=0

# Install production dependencies only
# Use --ignore-scripts to prevent prepare hook failures
RUN npm ci --workspace=@alpha-meta-token-scanner/kol-system --omit=dev --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/kol-system/dist ./apps/kol-system/dist

# Set proper ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3050

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3050/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "apps/kol-system/dist/src/main.js"]
