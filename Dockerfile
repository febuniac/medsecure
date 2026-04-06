# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build tooling)
RUN npm install --ignore-scripts

# Copy application source
COPY . .

# ---- Stage 2: Production ----
FROM node:20-alpine AS production

# Add labels for container metadata
LABEL org.opencontainers.image.title="MedSecure Platform" \
      org.opencontainers.image.description="HIPAA-compliant healthcare data platform" \
      org.opencontainers.image.version="2.8.3"

# Create a non-root user for security (HIPAA requirement)
RUN addgroup -S medsecure && adduser -S medsecure -G medsecure

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source from build stage
COPY --from=build /app/src ./src

# Set ownership to non-root user
RUN chown -R medsecure:medsecure /app

# Switch to non-root user
USER medsecure

# Expose the application port
EXPOSE 3000

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
