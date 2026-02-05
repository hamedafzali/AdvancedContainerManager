# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    python3-dev \
    py3-pip \
    make \
    g++ \
    docker \
    docker-cli \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Create logs directory
RUN mkdir -p logs && chmod 755 logs

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Create non-root user for security
RUN addgroup -S appuser && \
    adduser -S -G appuser appuser && \
    chown -R appuser:appuser /app && \
    chmod 755 /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5003/health || \
  node -e "require('http').get('http://localhost:5003/health').then(() => process.exit(0)).catch(() => process.exit(1))"

# Default command
CMD ["node", "dist/index.js"]
