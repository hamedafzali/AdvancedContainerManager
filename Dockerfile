# Multi-stage build for frontend and backend

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
ARG VITE_API_BASE
ARG VITE_SOCKET_URL
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
# Build TypeScript to JavaScript
RUN npm run build

# Stage 3: Production image
FROM node:18-alpine AS production

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
    docker-compose \
    curl \
    bash \
    && rm -rf /var/cache/apk/* \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./public

# Create logs directory
RUN mkdir -p logs && chmod 755 logs

# Create non-root user for security
RUN addgroup -S appuser && \
    adduser -S -G appuser appuser && \
    chown -R appuser:appuser /app && \
    chmod 755 /app

# Set ts-node environment variables
ENV TS_NODE_COMPILER_OPTIONS="{\"module\":\"commonjs\",\"moduleResolution\":\"node\",\"target\":\"ES2020\",\"esModuleInterop\":true}"

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
