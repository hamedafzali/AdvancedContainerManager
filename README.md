# Advanced Container Manager

A professional web-based container management platform built with Node.js, TypeScript, and modern web technologies.

## 🚀 Features

### Core Functionality
- **Real-time Monitoring**: Live CPU, memory, disk, and network metrics
- **Container Management**: Start, stop, restart, inspect containers
- **Web Terminal**: Full bash shell access inside containers
- **Project Management**: Multi-project Git repository integration
- **Resource Monitoring**: Live resource usage with charts and graphs
- **Health Checks**: Container health status monitoring

### Advanced Features
- **TypeScript**: Type-safe codebase with modern JavaScript features
- **WebSocket Integration**: Real-time data streaming and updates
- **Terminal Sessions**: xterm.js powered web terminal
- **Process Monitoring**: View running processes inside containers
- **Log Management**: Advanced log viewing and filtering
- **Network Management**: Docker networks control
- **Volume Management**: Docker volumes management
- **Image Management**: Docker images control

### Modern UI/UX
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: WebSocket-based live data streaming
- **Interactive Charts**: Visual metrics with Chart.js
- **Glassmorphism Design**: Modern UI with smooth animations
- **Dark Theme**: Professional terminal aesthetic

## 🛠️ Installation

### Prerequisites
- Node.js 18 or higher
- Docker Engine running on the host
- Git (for project management features)

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd AdvancedContainerManager

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Build the application
npm run build

# Start the application
npm start
```

### Development Mode

```bash
# Run in development mode with hot reload
npm run dev

# Run in development mode with debugging
npm run dev:debug
```

### Docker Deployment

```bash
# Build the image
npm run docker:build

# Run the container
npm run docker:run
```

### Docker Compose

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Run with Docker Compose
docker-compose up -d
```

## 📋 Usage

### API Endpoints

#### System
- `GET /api/system/status` - Get system status
- `GET /api/system/metrics` - Get system metrics
- `GET /api/system/metrics/history` - Get metrics history

#### Containers
- `GET /api/containers` - List all containers
- `GET /api/container/:id` - Get container details
- `POST /api/container/:id/start` - Start container
- `POST /api/container/:id/stop` - Stop container
- `POST /api/container/:id/restart` - Restart container
- `DELETE /api/container/:id` - Remove container
- `GET /api/container/:id/logs` - Get container logs
- `GET /api/container/:id/stats` - Get container stats
- `GET /api/container/:id/processes` - Get container processes

#### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Add new project
- `GET /api/project/:name` - Get project details
- `POST /api/project/:name/build` - Build project
- `POST /api/project/:name/start` - Start project
- `POST /api/project/:name/stop` - Stop project
- `DELETE /api/project/:name` - Remove project
- `GET /api/project/:name/health` - Get project health

#### Images
- `GET /api/images` - List all images
- `POST /api/images/pull` - Pull image
- `DELETE /api/images/:id` - Remove image

#### Networks
- `GET /api/networks` - List all networks
- `POST /api/networks` - Create network
- `DELETE /api/networks/:id` - Remove network

#### Volumes
- `GET /api/volumes` - List all volumes
- `POST /api/volumes` - Create volume
- `DELETE /api/volumes/:id` - Remove volume

#### Terminal
- `POST /api/terminal/:containerId/session` - Create terminal session
- `GET /api/terminal/sessions` - List terminal sessions
- `DELETE /api/terminal/sessions/:sessionId` - Close terminal session

### WebSocket Events

#### Client to Server
- `get_system_metrics` - Request system metrics
- `get_container_metrics` - Request container metrics
- `get_system_metrics_history` - Request metrics history
- `get_container_metrics_history` - Request container metrics history
- `subscribe_container` - Subscribe to container updates
- `unsubscribe_container` - Unsubscribe from container updates

#### Server to Client
- `system_status_update` - System status updates
- `system_metrics_update` - System metrics updates
- `container_metrics_update` - Container metrics updates
- `notification` - System notifications

## 🔧 Configuration

### Environment Variables

```bash
# Application Configuration
NODE_ENV=production
PORT=5003
HOST=0.0.0.0
DEBUG_MODE=false
LOG_LEVEL=info

# Docker Configuration
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_TIMEOUT=2000
DOCKER_PROTOCOL=http

# Redis Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Project Configuration
PROJECTS_DIR=/tmp/advanced_manager_projects
CONFIG_PATH=/tmp/advanced_manager_config.json

# WebSocket Configuration
WEBSOCKET_TIMEOUT=300000
TERMINAL_TIMEOUT=3600000
MAX_TERMINAL_SESSIONS=100

# Metrics Configuration
METRICS_INTERVAL=5000
METRICS_RETENTION=24

# Security
SESSION_SECRET=your-session-secret-here
```

### TypeScript Configuration

The project uses TypeScript with strict type checking. Key configuration options:

- **Target**: ES2020
- **Module**: CommonJS
- **Strict**: Enabled
- **Source Maps**: Enabled
- **Path Mapping**: Configured for clean imports

### ESLint Configuration

ESLint is configured with TypeScript support and recommended rules:

- **TypeScript ESLint**: Enabled
- **No Unused Variables**: Error
- **No Explicit Any**: Warning
- **Prefer Const**: Required

## 📊 Architecture

### Project Structure
```
AdvancedContainerManager/
├── src/
│   ├── types/                 # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/                 # Utility functions
│   │   └── logger.ts
│   ├── services/              # Business logic services
│   │   ├── docker-service.ts
│   │   ├── metrics-collector.ts
│   │   ├── project-service.ts
│   │   ├── terminal-service.ts
│   │   └── websocket-handler.ts
│   ├── middleware/            # Express middleware
│   │   └── error-handler.ts
│   ├── routes/                # API routes
│   │   └── index.ts
│   ├── public/                # Static files
│   │   └── index.html
│   └── index.ts               # Application entry point
├── dist/                      # Compiled JavaScript
├── logs/                      # Application logs
├── tests/                     # Test files
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── jest.config.js             # Jest test configuration
├── .eslintrc.json             # ESLint configuration
├── Dockerfile                 # Container definition
├── docker-compose.yml         # Service orchestration
└── README.md                  # This file
```

### Key Components

#### **DockerService**
- Docker API integration
- Container management
- Image management
- Network and volume management

#### **MetricsCollector**
- System metrics collection
- Container metrics collection
- Redis integration for storage
- Historical data management

#### **ProjectService**
- Git repository management
- Project lifecycle management
- Health monitoring
- Build and deployment tracking

#### **TerminalService**
- WebSocket terminal sessions
- Container shell access
- Session management
- Process handling

#### **WebSocketHandler**
- Real-time data streaming
- Client connection management
- Event handling
- Notification system

## 🔍 Supported Formats

### Input Formats
- **Repositories**: Git repositories (HTTP, SSH)
- **Dockerfiles**: Standard Dockerfile format
- **Compose Files**: Docker Compose YAML format

### Output Formats
- **Metrics**: JSON format with timestamps
- **Logs**: Plain text with timestamps
- **Charts**: Chart.js data format

## 📈 Performance

### Optimization Features
- **TypeScript**: Type safety and performance
- **WebSocket**: Real-time updates without polling
- **Redis**: Efficient metrics storage
- **Process Management**: Proper signal handling
- **Memory Management**: Automatic cleanup

### Resource Usage
- **Memory**: ~100MB base memory
- **CPU**: Low CPU usage for monitoring
- **Network**: Efficient WebSocket communication
- **Storage**: Configurable metrics retention

## 🛡️ Security

### Security Features
- **TypeScript**: Type safety prevents runtime errors
- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **Input Validation**: Joi schema validation
- **Error Handling**: Secure error responses

### Best Practices
- Use environment variables for sensitive data
- Regular updates of dependencies
- Monitor logs for unusual activity
- Use HTTPS in production
- Implement rate limiting

## 🐛 Troubleshooting

### Common Issues

#### Docker Connection
```bash
# Check Docker daemon
docker version

# Check socket permissions
ls -la /var/run/docker.sock

# Test Docker API
curl --unix-socket /var/run/docker.sock http://localhost/version
```

#### Redis Connection
```bash
# Check Redis status
redis-cli ping

# Check Redis logs
docker logs advanced-manager-redis
```

#### Application Issues
```bash
# Check application logs
docker logs advanced-container-manager

# Check health status
curl http://localhost:5003/health

# Debug mode
DEBUG=true npm run dev
```

### Debug Mode
Enable debug mode for detailed logging:
```bash
DEBUG=true LOG_LEVEL=debug npm run dev
```

## 📚 API Reference

### TypeScript Types

#### Core Types
- `ContainerInfo`: Container information
- `SystemMetrics`: System metrics data
- `ContainerMetrics`: Container metrics data
- `ProjectInfo`: Project information
- `TerminalSession`: Terminal session data

#### API Types
- `ApiResponse`: Standard API response format
- `WebSocketMessage`: WebSocket message format
- `AppConfig`: Application configuration

### Service Classes

#### DockerService
- `getAllContainers()`: List all containers
- `getContainer(id)`: Get container details
- `startContainer(id)`: Start container
- `stopContainer(id)`: Stop container
- `restartContainer(id)`: Restart container

#### MetricsCollector
- `collectSystemMetrics()`: Collect system metrics
- `collectContainerMetrics(id)`: Collect container metrics
- `getSystemMetricsHistory()`: Get metrics history
- `getContainerMetricsHistory(id)`: Get container history

#### ProjectService
- `addProject()`: Add new project
- `getProjects()`: List all projects
- `buildProject(name)`: Build project
- `deployProject(name)`: Deploy project

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd AdvancedContainerManager

# Install dependencies
npm install

# Create development environment
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm test

# Run in development mode
npm run dev

# Build for production
npm run build
```

### Code Style
- Follow TypeScript best practices
- Use ESLint for code quality
- Add type hints for all functions
- Write tests for new features
- Update documentation

### Submitting Changes
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run tests and linting
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

- **Documentation**: Check this README and inline documentation
- **Issues**: Report bugs and feature requests on GitHub
- **Community**: Join our Discord server for discussions
- **Email**: support@advancedcontainermanager.com

## 🚀 Roadmap

### Upcoming Features
- [ ] User authentication and authorization
- [ ] Multi-host Docker management
- [ ] Kubernetes integration
- [ ] Container orchestration
- [ ] Backup and restore functionality
- [ ] Plugin system
- [ ] Mobile app
- [ ] API rate limiting
- [ ] Audit logging
- [ ] Custom themes

### Version History
- **v2.0.0** - Complete rewrite in Node.js/TypeScript
- **v1.3.0** - Advanced UI and real-time updates
- **v1.2.0** - Enhanced terminal and monitoring
- **v1.1.0** - Added project management
- **v1.0.0** - Initial release with core features

---

**Advanced Container Manager** - Professional container management with modern Node.js/TypeScript! 🐳✨
