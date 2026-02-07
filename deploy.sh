#!/bin/bash

# Advanced Container Manager Deployment Script
# This script handles the complete deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="advanced-container-manager"
BACKUP_DIR="./backups"
DATA_DIR="./data"
LOG_DIR="./logs"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check Node.js (for local development)
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_warning "Node.js version is less than 18. Consider upgrading for better compatibility."
        fi
    fi
    
    log_success "Prerequisites check completed"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$DATA_DIR/projects"
    mkdir -p "$DATA_DIR/config"
    mkdir -p "$DATA_DIR/backups"
    mkdir -p "$DATA_DIR/logs"
    mkdir -p "$LOG_DIR"
    
    # Set proper permissions
    chmod 755 "$DATA_DIR"
    chmod 755 "$BACKUP_DIR"
    chmod 755 "$LOG_DIR"
    
    log_success "Directories created successfully"
}

# Backup existing data
backup_existing_data() {
    if [ -d "$DATA_DIR" ] && [ "$(ls -A $DATA_DIR)" ]; then
        log_info "Backing up existing data..."
        
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
        
        mkdir -p "$BACKUP_PATH"
        cp -r "$DATA_DIR"/* "$BACKUP_PATH/"
        
        log_success "Data backed up to $BACKUP_PATH"
    else
        log_info "No existing data to backup"
    fi
}

# Build the application
build_application() {
    log_info "Building the application..."
    
    # Check if we're in development mode
    if [ "$1" = "--dev" ]; then
        log_info "Building in development mode..."
        npm run build:backend
        npm run build:frontend
    else
        log_info "Building in production mode..."
        npm run build
    fi
    
    log_success "Application built successfully"
}

# Deploy with Docker Compose
deploy_docker() {
    log_info "Deploying with Docker Compose..."
    
    # Stop existing containers
    if [ "$1" != "--no-stop" ]; then
        log_info "Stopping existing containers..."
        docker-compose down || true
    fi
    
    # Build and start containers
    log_info "Building and starting containers..."
    docker-compose up --build -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Check health
    if curl -f http://localhost:5003/health &> /dev/null; then
        log_success "Application is running and healthy"
    else
        log_error "Application health check failed"
        docker-compose logs advanced-container-manager
        exit 1
    fi
}

# Setup SSL certificates (optional)
setup_ssl() {
    if [ "$1" = "--ssl" ]; then
        log_info "Setting up SSL certificates..."
        
        # Create SSL directory
        mkdir -p ./ssl
        
        # Generate self-signed certificate (for development)
        if [ ! -f "./ssl/cert.pem" ]; then
            openssl req -x509 -newkey rsa:4096 -keyout ./ssl/key.pem -out ./ssl/cert.pem -days 365 -nodes \
                -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
            log_success "Self-signed SSL certificate generated"
        fi
        
        # Create nginx configuration
        create_nginx_config
    fi
}

# Create nginx configuration
create_nginx_config() {
    log_info "Creating nginx configuration..."
    
    cat > nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server advanced-container-manager:5003;
    }

    server {
        listen 80;
        server_name localhost;
        
        # Redirect HTTP to HTTPS (optional)
        # return 301 https://$server_name$request_uri;
        
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }

    server {
        listen 443 ssl;
        server_name localhost;
        
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
EOF

    log_success "Nginx configuration created"
}

# Show deployment status
show_status() {
    log_info "Deployment status:"
    echo ""
    
    # Show running containers
    echo "Running containers:"
    docker-compose ps
    echo ""
    
    # Show application logs
    echo "Recent application logs:"
    docker-compose logs --tail=20 advanced-container-manager
    echo ""
    
    # Show system resources
    echo "System resources:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Remove unused Docker images
    docker image prune -f
    
    # Remove unused volumes (be careful with this)
    # docker volume prune -f
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting Advanced Container Manager deployment..."
    
    # Parse command line arguments
    DEV_MODE=false
    SSL_MODE=false
    NO_STOP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dev)
                DEV_MODE=true
                shift
                ;;
            --ssl)
                SSL_MODE=true
                shift
                ;;
            --no-stop)
                NO_STOP=true
                shift
                ;;
            --cleanup)
                cleanup
                exit 0
                ;;
            --status)
                show_status
                exit 0
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --dev      Build and run in development mode"
                echo "  --ssl      Setup SSL certificates and HTTPS"
                echo "  --no-stop  Don't stop existing containers"
                echo "  --cleanup  Clean up unused Docker resources"
                echo "  --status   Show deployment status"
                echo "  -h, --help Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run deployment steps
    check_prerequisites
    create_directories
    backup_existing_data
    
    if [ "$DEV_MODE" = true ]; then
        build_application --dev
    else
        build_application
    fi
    
    setup_ssl --ssl
    deploy_docker --no-stop
    show_status
    
    log_success "Deployment completed successfully!"
    echo ""
    echo "Application is available at:"
    echo "  - HTTP: http://localhost:5003"
    echo "  - Health Check: http://localhost:5003/health"
    if [ "$SSL_MODE" = true ]; then
        echo "  - HTTPS: https://localhost"
    fi
}

# Run main function with all arguments
main "$@"
