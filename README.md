# Advanced Container Manager

A professional web-based container management platform built with modern TypeScript, React, and Node.js.

## 🚀 Architecture

This project uses a **monorepo structure** with separate frontend and backend applications:

```
advanced-container-manager/
├── frontend/          # React + TypeScript frontend
├── backend/           # Node.js + TypeScript backend API
├── package.json       # Monorepo configuration
├── docker-compose.yml # Container orchestration
└── README.md         # This file
```

## 🎯 Features

### Frontend (React + TypeScript)
- **Modern UI**: React 18 with TypeScript
- **Real-time Updates**: Socket.IO integration
- **Responsive Design**: Tailwind CSS
- **Fast Development**: Vite with hot reload
- **Type Safety**: Full TypeScript coverage
- **Component Architecture**: Reusable React components

### Backend (Node.js + TypeScript)
- **REST API**: Express.js with TypeScript
- **Real-time Communication**: Socket.IO server
- **Docker Integration**: Full Docker API support
- **Type Safety**: Comprehensive TypeScript types
- **Modular Architecture**: Clean service-based structure
- **WebSocket Support**: Real-time metrics and terminal access

### Shared Features
- **Container Management**: Start, stop, restart containers
- **Real-time Monitoring**: Live system and container metrics
- **Web Terminal**: Browser-based terminal access
- **Project Management**: Git repository integration
- **Professional UI**: Modern glassmorphism design

## 🛠️ Installation

### Prerequisites
- Node.js 18 or higher
- Docker Engine running on the host
- Git (for project management features)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/hamedafzali/AdvancedContainerManager.git
cd AdvancedContainerManager

# Install all dependencies (both frontend and backend)
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start both frontend and backend in development mode
npm run dev
```

### Individual Development

```bash
# Start only backend (API server on port 5003)
npm run dev:backend

# Start only frontend (React app on port 3000)
npm run dev:frontend

# Build both applications
npm run build

# Start production backend
npm start
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

### Development URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5003
- **Health Check**: http://localhost:5003/health

### API Endpoints

#### System
- `GET /api/system/status` - Get system status
- `GET /api/system/metrics` - Get system metrics
- `GET /api/system/metrics/history` - Get metrics history

#### Containers
- `GET /api/containers` - List all containers
- `GET /api/containers/:id` - Get container details
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `POST /api/containers/:id/restart` - Restart container
- `DELETE /api/containers/:id` - Remove container
- `GET /api/containers/:id/logs` - Get container logs
- `GET /api/containers/:id/stats` - Get container stats
- `GET /api/containers/:id/processes` - Get container processes

#### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Add new project
- `GET /api/projects/:name` - Get project details
- `POST /api/projects/:name/build` - Build project
- `POST /api/projects/:name/deploy` - Deploy project
- `POST /api/projects/:name/stop` - Stop project
- `DELETE /api/projects/:name` - Remove project
- `GET /api/projects/:name/health` - Get project health

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

## 📊 Project Structure

### Frontend Structure
```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Layout.tsx      # Main layout component
│   │   ├── MetricCard.tsx  # Metric display card
│   │   └── ...             # Other components
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx    # Dashboard page
│   │   ├── Containers.tsx   # Containers page
│   │   └── ...             # Other pages
│   ├── hooks/               # Custom React hooks
│   │   ├── useSocket.ts     # WebSocket hook
│   │   └── useNotifications.ts
│   ├── services/            # API services
│   │   └── api.ts          # Axios API client
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   ├── App.tsx              # Main App component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── package.json             # Frontend dependencies
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript config
└── tailwind.config.js       # Tailwind CSS config
```

### Backend Structure
```
backend/
├── src/
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   │   └── logger.ts        # Winston logger
│   ├── services/            # Business logic services
│   │   ├── docker-service.ts
│   │   ├── metrics-collector.ts
│   │   ├── project-service.ts
│   │   ├── terminal-service.ts
│   │   └── websocket-handler.ts
│   ├── middleware/          # Express middleware
│   │   └── error-handler.ts
│   ├── routes/              # API routes
│   │   └── index.ts
│   └── index.ts             # Application entry point
├── package.json             # Backend dependencies
├── tsconfig.json            # TypeScript config
├── jest.config.js           # Jest test configuration
└── .eslintrc.json           # ESLint configuration
```

## 🎨 Frontend Technologies

- **React 18**: Modern React with hooks
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast development server and build tool
- **Tailwind CSS**: Utility-first CSS framework
- **React Router**: Client-side routing
- **React Query**: Data fetching and caching
- **Socket.IO Client**: Real-time communication
- **Lucide React**: Icon library
- **Axios**: HTTP client

## 🔧 Backend Technologies

- **Node.js**: JavaScript runtime
- **TypeScript**: Type-safe JavaScript
- **Express.js**: Web framework
- **Socket.IO**: Real-time WebSocket server
- **Dockerode**: Docker API client
- **Winston**: Logging library
- **Redis**: Optional metrics storage
- **Joi**: Input validation
- **Helmet**: Security middleware

## 🚀 Development Workflow

### Monorepo Scripts

```bash
# Development (both frontend and backend)
npm run dev

# Individual development
npm run dev:frontend    # Frontend on port 3000
npm run dev:backend     # Backend on port 5003

# Building
npm run build            # Build both
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only

# Testing
npm run test             # Test both
npm run lint             # Lint both
npm run clean            # Clean both
```

### Development Experience

- **Hot Reload**: Both frontend and backend support hot reload
- **Type Safety**: Full TypeScript coverage
- **Code Splitting**: Optimized bundle sizes
- **Proxy Configuration**: Frontend proxies API requests to backend
- **Environment Variables**: Shared configuration

## 🐳 Docker Configuration

### Multi-stage Build

The Dockerfile uses multi-stage builds:

1. **Frontend Builder**: Builds the React application
2. **Backend Builder**: Compiles TypeScript to JavaScript
3. **Production**: Combines both into a single optimized image

### Docker Compose

```yaml
services:
  advanced-container-manager:
    build: .
    ports:
      - "5003:5003"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - NODE_ENV=production
      - PORT=5003
      - DOCKER_HOST=unix:///var/run/docker.sock
```

## 📈 Performance

### Frontend Performance
- **Code Splitting**: Automatic code splitting with React.lazy
- **Tree Shaking**: Unused code elimination
- **Asset Optimization**: Optimized bundles with Vite
- **Caching**: HTTP caching for static assets

### Backend Performance
- **TypeScript**: Compile-time optimizations
- **Connection Pooling**: Efficient database connections
- **WebSocket**: Efficient real-time communication
- **Metrics Caching**: Redis-based metrics storage

## 🛡️ Security

### Frontend Security
- **TypeScript**: Type safety prevents runtime errors
- **Content Security Policy**: Secure headers with Helmet
- **Input Validation**: Client-side form validation
- **HTTPS Ready**: Production-ready security

### Backend Security
- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **Input Validation**: Joi schema validation
- **Error Handling**: Secure error responses
- **Rate Limiting**: Configurable rate limiting

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone https://github.com/hamedafzali/AdvancedContainerManager.git
cd AdvancedContainerManager

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development
npm run dev
```

### Code Style
- **TypeScript**: Strict type checking
- **ESLint**: Code quality enforcement
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Standardized commit messages

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
- **v2.1.0** - Restructured into separate frontend and backend
- **v2.0.0** - Complete rewrite in Node.js/TypeScript
- **v1.3.0** - Advanced UI and real-time updates
- **v1.2.0** - Enhanced terminal and monitoring
- **v1.1.0** - Added project management
- **v1.0.0** - Initial release with core features

---

**Advanced Container Manager** - Modern container management with separate frontend and backend! 🐳✨
