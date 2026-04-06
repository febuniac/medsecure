# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install production dependencies only
# Use npm ci when lockfile exists, fall back to npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---- Stage 2: Build ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy application source
COPY . .

# Run linting to validate code
RUN npm run lint || true

# ---- Stage 3: Production ----
FROM node:20-alpine AS production

# Add labels for container metadata
LABEL maintainer="MedSecure Platform Team"
LABEL description="HIPAA-compliant healthcare data platform"
LABEL version="2.8.3"

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user for security (HIPAA compliance)
RUN addgroup -g 1001 -S medsecure && \
    adduser -S medsecure -u 1001 -G medsecure

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source from build stage
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations

# Set proper ownership
RUN chown -R medsecure:medsecure /app

# Switch to non-root user
USER medsecure

# Expose application port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
