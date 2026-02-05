FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app && \
    chmod 755 /app

USER appuser

# Environment variables
ENV PYTHONPATH=/app
ENV PORT=5003
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5003/api/system/status || exit 1

# Copy application code
COPY templates/ ./templates/
COPY advanced_manager.py .

# Expose port
EXPOSE 5003

# Default command
CMD ["python", "advanced_manager.py"]
